"use client";

import { useEffect, useRef, useState } from "react";
import { buscarCatalogoProcessosTerceirizados, importarExcelRelatorioTecnico } from "@/lib/api";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { renumerarItensPorPosicao } from "@/lib/itensCalculados";
import { useAutoCalculoOrcamento } from "@/lib/useAutoCalculoOrcamento";
import { useCatalogoGeometria } from "@/lib/useCatalogoGeometria";
import GeometriaIcone from "@/components/icones/GeometriaIcone";
import CartaoPerfilLaminado from "@/components/CartaoPerfilLaminado";
import CartaoCantoneira from "@/components/CartaoCantoneira";
import CartaoTuboRedondo from "@/components/CartaoTuboRedondo";
import CartaoGeometriaPadrao from "@/components/CartaoGeometriaPadrao";
import CartaoPesoDireto from "@/components/CartaoPesoDireto";
import CartaoItemComercial from "@/components/CartaoItemComercial";
import CartaoInsumoPintura from "@/components/CartaoInsumoPintura";
import CartaoUsinagem from "@/components/CartaoUsinagem";
import CartaoServicoPorPeso from "@/components/CartaoServicoPorPeso";
import CartaoContingenciamento from "@/components/CartaoContingenciamento";
import CartaoEngenhariaIndustrial from "@/components/CartaoEngenhariaIndustrial";
import type {
  CatalogoGeometria,
  CatalogoProcessosTerceirizados,
  EstadoCalculoManual,
  EstimativasOrcamento,
  ItemCalculado,
  ItemComercial,
  ItemContingenciamento,
  OperacaoUsinagem,
  RespostaOrcamentoDePdf,
  ServicoPorPeso,
} from "@/lib/types";

interface Props {
  // Controlado pelo pai (page.tsx) — assim "Salvar orçamento" consegue ler
  // esse estado e "Orçamentos salvos" consegue restaurá-lo pra continuar
  // editando de onde parou (ver lib/types.ts::EstadoCalculoManual).
  estado: EstadoCalculoManual;
  onEstadoChange: (atualizacao: Partial<EstadoCalculoManual>) => void;
  onResultado: (resultado: RespostaOrcamentoDePdf, nomeArquivo: string) => void;
  onErro: (mensagem: string) => void;
  // Peso líquido manual aplicado via PainelPesoBase (null = peso bruto
  // calculado) — precisa ir em toda chamada de analisarBom daqui, senão o
  // auto-cálculo (ao adicionar/editar qualquer item) recalcula do zero e
  // perde o override, voltando pro peso bruto sem o usuário pedir (bug
  // relatado pelo usuário).
  pesoLiquidoManualAtivo: number | null;
}

// Cartões com fluxo próprio (catálogo pesquisável, unidades, etc.) — os
// demais tipos de TIPOS_GEOMETRIA caem no cartão genérico padronizado.
const TIPOS_COM_CARTAO_PROPRIO = new Set(["perfil", "cantoneira", "tubo_redondo", "peso_direto"]);

// "Peso direto" não calcula geometria nenhuma (por isso não vem do catálogo
// do backend, GET /geometria/tipos) — é só mais um botão no mesmo grid,
// pro caso de peça com peso já calculado fora do sistema.
const TIPO_PESO_DIRETO = "peso_direto";

const CATALOGO_PROCESSOS_VAZIO: CatalogoProcessosTerceirizados = {
  usinagem: [],
  servicos_terceiros: [],
  tratamento_termico: [],
  ensaios_nao_destrutivos: [],
};

// Item "puxado de volta" pro formulário pelo botão "editar" — `tipo` roteia
// pro cartão certo (ver cada `valorInicial={...}` abaixo); `id` muda a cada
// clique em "editar" pra disparar o efeito de restauração em cada cartão
// mesmo editando o mesmo item duas vezes seguidas.
interface EdicaoAtual {
  id: number;
  tipo: string;
  dados: unknown;
}

function restaurarPosicaoItem(posicao: string): { posicaoNum: number; itemNum: number } | null {
  const m = /Posição (\d+) - Item (\d+)/.exec(posicao);
  return m ? { posicaoNum: Number(m[1]), itemNum: Number(m[2]) } : null;
}

export default function CalculoManual({
  estado, onEstadoChange, onResultado, onErro, pesoLiquidoManualAtivo,
}: Props) {
  const {
    itens, itensComerciais, insumosPintura, operacoesUsinagem, servicosTerceiros, tratamentoTermico,
    contingenciamento, ndtItens, engenhariaItens,
    cenarioComercial, corteValorKg, posicaoNum, itemNum, acrescimoPercentualPadrao,
  } = estado;

  const { catalogo, materiais } = useCatalogoGeometria(onErro);
  const [catalogoProcessos, setCatalogoProcessos] = useState<CatalogoProcessosTerceirizados>(CATALOGO_PROCESSOS_VAZIO);
  const [tipoAberto, setTipoAberto] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<EdicaoAtual | null>(null);
  const proximoIdEdicao = useRef(1);
  // Importação da planilha do relatório técnico por IA (ver
  // RelatorioTecnicoIA.tsx > "Excel (BOM editável)" e
  // app/relatorio_excel.py::calcular_itens_da_planilha) — peso sempre vem
  // recalculado pelo backend, nunca lido direto da planilha.
  const [importandoExcel, setImportandoExcel] = useState(false);
  const [itensIgnoradosImportacao, setItensIgnoradosImportacao] = useState<
    { posicao: string; descricao: string; motivo: string }[]
  >([]);
  const inputExcelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buscarCatalogoProcessosTerceirizados()
      .then(setCatalogoProcessos)
      .catch(() => setCatalogoProcessos(CATALOGO_PROCESSOS_VAZIO));
  }, []);

  function abrirCartao(tipo: string) {
    setTipoAberto(tipo);
  }

  function setPosicaoNum(n: number) {
    onEstadoChange({ posicaoNum: n });
  }

  function setItemNum(n: number) {
    onEstadoChange({ itemNum: n });
  }

  // Puxa o item de volta pro formulário certo pra editar: tira ele da
  // lista (a edição "completa" quando o usuário adicionar de novo),
  // reabre o cartão de origem já preenchido e restaura a posição/item.
  function iniciarEdicao(tipo: string, dados: { posicao: string }) {
    const posicaoRestaurada = restaurarPosicaoItem(dados.posicao);
    if (posicaoRestaurada) onEstadoChange(posicaoRestaurada);
    setEdicao({ id: proximoIdEdicao.current++, tipo, dados });
  }

  function adicionarItem(item: Omit<ItemCalculado, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ itens: [...itens, { ...item, posicao }] });
  }

  function removerItem(indice: number) {
    onEstadoChange({ itens: itens.filter((_, i) => i !== indice) });
  }

  // Aplica o % de acréscimo em TODOS os itens que têm preço de referência
  // (precoKgReferencia) — pedido explícito do usuário, costume da empresa
  // é 160%. Recalcula sempre a partir da referência original (nunca do
  // preço já com acréscimo), pra não compor o aumento a cada clique.
  // Itens com preço 100% manual (sem referência) não são tocados — não há
  // "referência" pra somar percentual em cima.
  function aplicarAcrescimoATodos() {
    const percentual = Number(acrescimoPercentualPadrao.replace(",", ".")) || 0;
    const itensAtualizados = itens.map((item) => {
      if (item.precoKgReferencia == null) return item;
      const novoPrecoKg = item.precoKgReferencia * (1 + percentual / 100);
      const pesoBase = item.pesoParaCompraKg ?? item.peso_kg;
      return {
        ...item,
        preco_kg: novoPrecoKg,
        acrescimoPercentual: percentual,
        custoTotal: pesoBase * novoPrecoKg,
      };
    });
    onEstadoChange({ itens: itensAtualizados });
  }

  // Cada item importado entra ordenado pela POS do desenho (crescente),
  // com "Item" sequencial — mesma regra da inserção automática do
  // relatório técnico por IA (ver lib/itensCalculados.ts).
  async function handleImportarExcel(arquivo: File) {
    setImportandoExcel(true);
    setItensIgnoradosImportacao([]);
    try {
      const { itens: itensImportados, itensIgnorados } = await importarExcelRelatorioTecnico(arquivo);
      const { itens: novos, proximoItemNum } = renumerarItensPorPosicao(itensImportados, itemNum);
      onEstadoChange({ itens: [...itens, ...novos], itemNum: proximoItemNum });
      setItensIgnoradosImportacao(itensIgnorados);
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Erro desconhecido ao importar a planilha.");
    } finally {
      setImportandoExcel(false);
    }
  }

  function editarItem(indice: number) {
    const item = itens[indice];
    onEstadoChange({ itens: itens.filter((_, i) => i !== indice) });
    setTipoAberto(item.tipo);
    iniciarEdicao(item.tipo, item);
  }

  function adicionarItemComercial(item: Omit<ItemComercial, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ itensComerciais: [...itensComerciais, { ...item, posicao }] });
  }

  function removerItemComercial(indice: number) {
    onEstadoChange({ itensComerciais: itensComerciais.filter((_, i) => i !== indice) });
  }

  function editarItemComercial(indice: number) {
    const item = itensComerciais[indice];
    onEstadoChange({ itensComerciais: itensComerciais.filter((_, i) => i !== indice) });
    iniciarEdicao("item_comercial", item);
  }

  function adicionarInsumoPintura(item: Omit<ItemComercial, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ insumosPintura: [...insumosPintura, { ...item, posicao }] });
  }

  function removerInsumoPintura(indice: number) {
    onEstadoChange({ insumosPintura: insumosPintura.filter((_, i) => i !== indice) });
  }

  function editarInsumoPintura(indice: number) {
    const item = insumosPintura[indice];
    onEstadoChange({ insumosPintura: insumosPintura.filter((_, i) => i !== indice) });
    iniciarEdicao("insumo_pintura", item);
  }

  function adicionarOperacaoUsinagem(item: Omit<OperacaoUsinagem, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ operacoesUsinagem: [...operacoesUsinagem, { ...item, posicao }] });
  }

  function removerOperacaoUsinagem(indice: number) {
    onEstadoChange({ operacoesUsinagem: operacoesUsinagem.filter((_, i) => i !== indice) });
  }

  function editarOperacaoUsinagem(indice: number) {
    const item = operacoesUsinagem[indice];
    onEstadoChange({ operacoesUsinagem: operacoesUsinagem.filter((_, i) => i !== indice) });
    iniciarEdicao("usinagem", item);
  }

  function adicionarServicoTerceiro(item: Omit<ServicoPorPeso, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ servicosTerceiros: [...servicosTerceiros, { ...item, posicao }] });
  }

  function removerServicoTerceiro(indice: number) {
    onEstadoChange({ servicosTerceiros: servicosTerceiros.filter((_, i) => i !== indice) });
  }

  function editarServicoTerceiro(indice: number) {
    const item = servicosTerceiros[indice];
    onEstadoChange({ servicosTerceiros: servicosTerceiros.filter((_, i) => i !== indice) });
    iniciarEdicao("servicos_terceiros", item);
  }

  function adicionarTratamentoTermico(item: Omit<ServicoPorPeso, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ tratamentoTermico: [...tratamentoTermico, { ...item, posicao }] });
  }

  function removerTratamentoTermico(indice: number) {
    onEstadoChange({ tratamentoTermico: tratamentoTermico.filter((_, i) => i !== indice) });
  }

  function editarTratamentoTermico(indice: number) {
    const item = tratamentoTermico[indice];
    onEstadoChange({ tratamentoTermico: tratamentoTermico.filter((_, i) => i !== indice) });
    iniciarEdicao("tratamento_termico", item);
  }

  function adicionarContingenciamento(item: Omit<ItemContingenciamento, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ contingenciamento: [...contingenciamento, { ...item, posicao }] });
  }

  function removerContingenciamento(indice: number) {
    onEstadoChange({ contingenciamento: contingenciamento.filter((_, i) => i !== indice) });
  }

  function editarContingenciamento(indice: number) {
    const item = contingenciamento[indice];
    onEstadoChange({ contingenciamento: contingenciamento.filter((_, i) => i !== indice) });
    iniciarEdicao("contingenciamento", item);
  }

  function adicionarNdtItem(item: Omit<ServicoPorPeso, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ ndtItens: [...ndtItens, { ...item, posicao }] });
  }

  function removerNdtItem(indice: number) {
    onEstadoChange({ ndtItens: ndtItens.filter((_, i) => i !== indice) });
  }

  function editarNdtItem(indice: number) {
    const item = ndtItens[indice];
    onEstadoChange({ ndtItens: ndtItens.filter((_, i) => i !== indice) });
    iniciarEdicao("ndt_itens", item);
  }

  function adicionarEngenhariaItem(item: Omit<ItemContingenciamento, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ engenhariaItens: [...engenhariaItens, { ...item, posicao }] });
  }

  function removerEngenhariaItem(indice: number) {
    onEstadoChange({ engenhariaItens: engenhariaItens.filter((_, i) => i !== indice) });
  }

  function editarEngenhariaItem(indice: number) {
    const item = engenhariaItens[indice];
    onEstadoChange({ engenhariaItens: engenhariaItens.filter((_, i) => i !== indice) });
    iniciarEdicao("engenharia_itens", item);
  }

  // Auto-recálculo compartilhado com PainelItensOrcamento (aba "Itens do
  // orçamento" em tela cheia) — ver lib/useAutoCalculoOrcamento.ts.
  const { calcularOrcamento, analisando, totalItens } = useAutoCalculoOrcamento({
    estado, onResultado, onErro, pesoLiquidoManualAtivo,
  });

  const pesoTotal = itens.reduce((soma, i) => soma + i.peso_kg, 0);
  const custoComercialTotal = itensComerciais.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoPinturaTotal = insumosPintura.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoUsinagemTotal = operacoesUsinagem.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoServicosTotal = servicosTerceiros.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoTratamentoTotal = tratamentoTermico.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoContingenciaTotal = contingenciamento.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoNdtTotal = ndtItens.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoEngenhariaTotal = engenhariaItens.reduce((soma, i) => soma + i.custoTotal, 0);

  interface LinhaExibicao {
    chave: string;
    posicao: string;
    descricao: string;
    detalhe: string;
    custoTotal?: number;
    editar: () => void;
    remover: () => void;
  }

  const linhasExibicao: LinhaExibicao[] = [
    ...itens.map((item, i): LinhaExibicao => ({
      chave: `g-${i}`,
      posicao: item.posicao,
      descricao: item.descricao || item.tipoRotulo,
      detalhe: `${formatarNumero(item.peso_kg, 2)} kg`,
      custoTotal: item.custoTotal,
      editar: () => editarItem(i),
      remover: () => removerItem(i),
    })),
    ...itensComerciais.map((item, i): LinhaExibicao => ({
      chave: `c-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.quantidade, 0)} × ${formatarMoeda(item.preco_unitario)}`,
      custoTotal: item.custoTotal,
      editar: () => editarItemComercial(i),
      remover: () => removerItemComercial(i),
    })),
    ...insumosPintura.map((item, i): LinhaExibicao => ({
      chave: `p-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.quantidade, 2)} L × ${formatarMoeda(item.preco_unitario)}`,
      custoTotal: item.custoTotal,
      editar: () => editarInsumoPintura(i),
      remover: () => removerInsumoPintura(i),
    })),
    ...operacoesUsinagem.map((item, i): LinhaExibicao => ({
      chave: `u-${i}`,
      posicao: item.posicao,
      descricao: item.maquina,
      detalhe: `${formatarNumero(item.horas, 2)} h × ${formatarMoeda(item.valorHora)}`,
      custoTotal: item.custoTotal,
      editar: () => editarOperacaoUsinagem(i),
      remover: () => removerOperacaoUsinagem(i),
    })),
    ...servicosTerceiros.map((item, i): LinhaExibicao => ({
      chave: `s-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.pesoKg, 2)} kg × ${formatarMoeda(item.valorKg)}`,
      custoTotal: item.custoTotal,
      editar: () => editarServicoTerceiro(i),
      remover: () => removerServicoTerceiro(i),
    })),
    ...tratamentoTermico.map((item, i): LinhaExibicao => ({
      chave: `t-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.pesoKg, 2)} kg × ${formatarMoeda(item.valorKg)}`,
      custoTotal: item.custoTotal,
      editar: () => editarTratamentoTermico(i),
      remover: () => removerTratamentoTermico(i),
    })),
    ...contingenciamento.map((item, i): LinhaExibicao => ({
      chave: `q-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.quantidade, 0)} × ${formatarMoeda(item.valorUnitario)}`,
      custoTotal: item.custoTotal,
      editar: () => editarContingenciamento(i),
      remover: () => removerContingenciamento(i),
    })),
    ...ndtItens.map((item, i): LinhaExibicao => ({
      chave: `n-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.pesoKg, 2)} kg × ${formatarMoeda(item.valorKg)}`,
      custoTotal: item.custoTotal,
      editar: () => editarNdtItem(i),
      remover: () => removerNdtItem(i),
    })),
    ...engenhariaItens.map((item, i): LinhaExibicao => ({
      chave: `e-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.quantidade, 0)} × ${formatarMoeda(item.valorUnitario)}`,
      custoTotal: item.custoTotal,
      editar: () => editarEngenhariaItem(i),
      remover: () => removerEngenhariaItem(i),
    })),
  ];

  const gruposPorPosicao = new Map<string, LinhaExibicao[]>();
  for (const linha of linhasExibicao) {
    const lista = gruposPorPosicao.get(linha.posicao) ?? [];
    lista.push(linha);
    gruposPorPosicao.set(linha.posicao, lista);
  }
  const itensPorPosicao = Array.from(gruposPorPosicao.entries())
    .map(([posicao, linhas]) => ({ posicao, linhas }))
    .sort((a, b) => a.posicao.localeCompare(b.posicao, "pt-BR", { numeric: true }));

  if (!catalogo) {
    return <p className="text-sm text-stone-500 dark:text-slate-500">Carregando tipos de geometria…</p>;
  }

  const posicaoProps = { posicaoNum, itemNum, setPosicaoNum, setItemNum };

  // Botão extra fixo no mesmo grid dos tipos de geometria — não vem do
  // catálogo do backend porque não calcula geometria nenhuma (ver
  // TIPO_PESO_DIRETO acima).
  const catalogoComPesoDireto: CatalogoGeometria = {
    ...catalogo,
    [TIPO_PESO_DIRETO]: { rotulo: "Peso direto (peça já calculada)", campos: [] },
  };

  const totaisExtras = [
    custoComercialTotal > 0 && `${formatarMoeda(custoComercialTotal)} em itens comerciais`,
    custoPinturaTotal > 0 && `${formatarMoeda(custoPinturaTotal)} em insumos de pintura`,
    custoUsinagemTotal > 0 && `${formatarMoeda(custoUsinagemTotal)} em usinagem`,
    custoServicosTotal > 0 && `${formatarMoeda(custoServicosTotal)} em serviços de terceiros`,
    custoTratamentoTotal > 0 && `${formatarMoeda(custoTratamentoTotal)} em tratamento térmico`,
    custoContingenciaTotal > 0 && `${formatarMoeda(custoContingenciaTotal)} em contingência`,
    custoNdtTotal > 0 && `${formatarMoeda(custoNdtTotal)} em ensaios não destrutivos`,
    custoEngenhariaTotal > 0 && `${formatarMoeda(custoEngenhariaTotal)} em engenharia industrial`,
  ].filter(Boolean);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
      {/* Coluna esquerda — onde o orçamentista vai adicionando as peças/itens */}
      <div className="flex min-w-0 flex-col gap-6">
        <div>
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
            Peças (geometria)
          </h2>
          <p className="mb-3 text-sm text-stone-600 dark:text-slate-400">
            Escolha o tipo de peça, informe as medidas e adicione à posição/item do orçamento — um
            orçamento pode ter várias posições, cada uma com várias peças.
          </p>

          {/* Pedido explícito do usuário: acréscimo percentual sobre o
              preço/kg de referência (costume da empresa é 160%) — editável
              por item nos cartões abaixo, ou aplicado de uma vez em todos
              os itens já adicionados que têm preço de referência. */}
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-green-600/30 dark:border-cyan-500/30 bg-white dark:bg-slate-900/40 p-3 text-xs">
            <span className="text-stone-600 dark:text-slate-400">
              Acréscimo padrão sobre preço de referência (ex.: R$ 5,97/kg + 160% = R$ 15,52/kg) —
              vale pros próximos itens de matéria-prima; ajuste em cada cartão se precisar de um
              valor diferente.
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={acrescimoPercentualPadrao}
                onChange={(e) => onEstadoChange({ acrescimoPercentualPadrao: e.target.value })}
                className="w-16 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
              />
              <span className="text-stone-600 dark:text-slate-400">%</span>
              <button
                type="button"
                onClick={aplicarAcrescimoATodos}
                title="Recalcula o preço/kg de todos os itens que têm preço de referência, a partir do valor original"
                className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 font-medium text-stone-800 dark:text-slate-200 transition-colors hover:border-green-600/50 dark:hover:border-cyan-500/50 hover:bg-stone-100 dark:hover:bg-slate-800"
              >
                Aplicar a todos
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {Object.entries(catalogoComPesoDireto).map(([tipo, def]) => (
              <button
                key={tipo}
                type="button"
                onClick={() => abrirCartao(tipo)}
                className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-xs font-medium transition-colors ${
                  tipoAberto === tipo
                    ? "border-green-500 dark:border-cyan-400 bg-green-600/15 dark:bg-cyan-500/15 text-green-700 dark:text-cyan-300"
                    : "border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 text-stone-700 dark:text-slate-300 hover:border-stone-300 dark:hover:border-slate-700 hover:bg-white dark:hover:bg-slate-900"
                }`}
              >
                <GeometriaIcone tipo={tipo} className="h-10 w-10 text-current opacity-90" />
                {def.rotulo}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={inputExcelRef}
              type="file"
              accept=".xlsx,.xlsm"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                if (arquivo) handleImportarExcel(arquivo);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => inputExcelRef.current?.click()}
              disabled={importandoExcel}
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-medium text-stone-700 dark:text-slate-300 transition-colors hover:border-green-600/50 dark:hover:border-cyan-500/50 hover:bg-stone-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importandoExcel ? "Importando…" : "Importar Excel (BOM da IA)"}
            </button>
          </div>
          {itensIgnoradosImportacao.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
              <p className="mb-1 font-medium">
                {itensIgnoradosImportacao.length} item(ns) da planilha não entraram — revise e adicione à mão:
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                {itensIgnoradosImportacao.map((item, i) => (
                  <li key={i}>
                    {item.posicao} — {item.descricao || "(sem descrição)"}: {item.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {tipoAberto === "perfil" && (
          <CartaoPerfilLaminado
            materiais={materiais}
            onAdicionar={adicionarItem}
            valorInicial={edicao?.tipo === "perfil" ? { id: edicao.id, dados: edicao.dados as ItemCalculado } : null}
            {...posicaoProps}
          />
        )}

        {tipoAberto === "cantoneira" && (
          <CartaoCantoneira
            materiais={materiais}
            onAdicionar={adicionarItem}
            valorInicial={edicao?.tipo === "cantoneira" ? { id: edicao.id, dados: edicao.dados as ItemCalculado } : null}
            {...posicaoProps}
          />
        )}

        {tipoAberto === "tubo_redondo" && (
          <CartaoTuboRedondo
            materiais={materiais}
            onAdicionar={adicionarItem}
            valorInicial={edicao?.tipo === "tubo_redondo" ? { id: edicao.id, dados: edicao.dados as ItemCalculado } : null}
            {...posicaoProps}
          />
        )}

        {tipoAberto === TIPO_PESO_DIRETO && (
          <CartaoPesoDireto
            materiais={materiais}
            onAdicionar={adicionarItem}
            valorInicial={edicao?.tipo === TIPO_PESO_DIRETO ? { id: edicao.id, dados: edicao.dados as ItemCalculado } : null}
            acrescimoPadrao={acrescimoPercentualPadrao}
            {...posicaoProps}
          />
        )}

        {tipoAberto && !TIPOS_COM_CARTAO_PROPRIO.has(tipoAberto) && (
          <CartaoGeometriaPadrao
            key={tipoAberto}
            tipo={tipoAberto}
            def={catalogo[tipoAberto]}
            materiais={materiais}
            onAdicionar={adicionarItem}
            valorInicial={edicao?.tipo === tipoAberto ? { id: edicao.id, dados: edicao.dados as ItemCalculado } : null}
            acrescimoPadrao={acrescimoPercentualPadrao}
            {...posicaoProps}
          />
        )}

        <div className="flex flex-col gap-6 border-t border-stone-200 dark:border-slate-800 pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
            Itens comerciais, insumos e serviços
          </h2>

          <CartaoItemComercial
            onAdicionar={adicionarItemComercial}
            valorInicial={edicao?.tipo === "item_comercial" ? { id: edicao.id, dados: edicao.dados as ItemComercial } : null}
            {...posicaoProps}
          />

          <CartaoInsumoPintura
            onAdicionar={adicionarInsumoPintura}
            valorInicial={edicao?.tipo === "insumo_pintura" ? { id: edicao.id, dados: edicao.dados as ItemComercial } : null}
            {...posicaoProps}
          />

          <CartaoUsinagem
            catalogo={catalogoProcessos.usinagem}
            onAdicionar={adicionarOperacaoUsinagem}
            valorInicial={edicao?.tipo === "usinagem" ? { id: edicao.id, dados: edicao.dados as OperacaoUsinagem } : null}
            {...posicaoProps}
          />

          <CartaoServicoPorPeso
            titulo="Serviços de terceiros (outsourcing)"
            descricaoCard="Conformação pesada (dobra/calandra), rebordeamento de tampos, balanceamento etc. — cobrado por peso da peça."
            catalogo={catalogoProcessos.servicos_terceiros}
            onAdicionar={adicionarServicoTerceiro}
            valorInicial={edicao?.tipo === "servicos_terceiros" ? { id: edicao.id, dados: edicao.dados as ServicoPorPeso } : null}
            {...posicaoProps}
          />

          <CartaoServicoPorPeso
            titulo="Tratamento térmico (outsourcing)"
            descricaoCard="Alívio de tensões/normalização, têmpera/revenimento, cementação/nitretação etc. — cobrado por peso da peça."
            catalogo={catalogoProcessos.tratamento_termico}
            onAdicionar={adicionarTratamentoTermico}
            valorInicial={edicao?.tipo === "tratamento_termico" ? { id: edicao.id, dados: edicao.dados as ServicoPorPeso } : null}
            {...posicaoProps}
          />

          <CartaoContingenciamento
            onAdicionar={adicionarContingenciamento}
            valorInicial={edicao?.tipo === "contingenciamento" ? { id: edicao.id, dados: edicao.dados as ItemContingenciamento } : null}
            {...posicaoProps}
          />

          <CartaoServicoPorPeso
            titulo="Ensaios não destrutivos"
            descricaoCard="LP (líquido penetrante) ou ultrassom — escolha um dos dois ou descreva outro tipo de ensaio. Cobrado por peso: kg × R$/kg (mesma mecânica dos serviços de terceiros)."
            catalogo={catalogoProcessos.ensaios_nao_destrutivos}
            onAdicionar={adicionarNdtItem}
            valorInicial={edicao?.tipo === "ndt_itens" ? { id: edicao.id, dados: edicao.dados as ServicoPorPeso } : null}
            {...posicaoProps}
          />

          <CartaoEngenhariaIndustrial
            onAdicionar={adicionarEngenhariaItem}
            valorInicial={edicao?.tipo === "engenharia_itens" ? { id: edicao.id, dados: edicao.dados as ItemContingenciamento } : null}
            {...posicaoProps}
          />
        </div>
      </div>

      {/* Coluna direita — congelada (sticky), pra acompanhar o que já foi
          adicionado sem precisar rolar até o fim da tela. Cresce com o
          orçamento, mas a lista de itens rola por dentro (o resumo/botão
          de calcular ficam sempre visíveis) quando tem muito item. */}
      <div className="flex flex-col gap-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)]">
        <div>
          <h3 className="font-semibold text-stone-900 dark:text-white">Itens do orçamento</h3>
          <p className="mt-1 text-xs text-stone-600 dark:text-slate-400">
            {formatarNumero(pesoTotal, 2)} kg de matéria-prima
            {totaisExtras.length > 0 && (
              <>
                {" · "}
                {totaisExtras.join(" · ")}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
          {itensPorPosicao.length === 0 ? (
            <p className="py-8 text-center text-sm text-stone-500 dark:text-slate-500">
              Nenhum item adicionado ainda — use os cartões ao lado.
            </p>
          ) : (
            itensPorPosicao.map((grupo) => (
              <div key={grupo.posicao}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-cyan-400">
                  {grupo.posicao}
                </p>
                <ul className="divide-y divide-slate-800 rounded-md border border-stone-200 dark:border-slate-800">
                  {grupo.linhas.map((linha) => (
                    <li key={linha.chave} className="flex flex-col gap-1 px-3 py-2 text-sm">
                      <span className="text-stone-700 dark:text-slate-300">{linha.descricao}</span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-stone-900 dark:text-slate-100">
                          {linha.detalhe}
                          {linha.custoTotal !== undefined && (
                            <span className="ml-2 text-green-700 dark:text-cyan-300">{formatarMoeda(linha.custoTotal)}</span>
                          )}
                        </span>
                        <span className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={linha.editar}
                            className="text-xs text-green-600 dark:text-cyan-400 hover:text-green-700 dark:hover:text-cyan-300"
                          >
                            editar
                          </button>
                          <button
                            type="button"
                            onClick={linha.remover}
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                          >
                            remover
                          </button>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-stone-200 dark:border-slate-800 pt-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-stone-600 dark:text-slate-400">Cenário comercial</span>
            <select
              value={cenarioComercial}
              onChange={(e) => onEstadoChange({ cenarioComercial: e.target.value as EstimativasOrcamento["cenario_comercial"] })}
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            >
              <option value="venda_fabricacao">Venda de fabricação</option>
              <option value="industrializacao">Industrialização</option>
              <option value="servico">Serviço</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-stone-600 dark:text-slate-400">Insumos de corte (R$/kg)</span>
            <input
              type="text"
              inputMode="decimal"
              value={corteValorKg}
              onChange={(e) => onEstadoChange({ corteValorKg: e.target.value })}
              title="Custo médio de oxicorte/plasma/laser — multiplica o peso líquido total dos itens"
              className="w-full rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          </label>
          <button
            type="button"
            onClick={calcularOrcamento}
            disabled={analisando || totalItens === 0}
            className="w-full rounded-md bg-green-600 dark:bg-cyan-500 px-4 py-2 font-medium text-white dark:text-slate-950 transition-colors hover:bg-green-500 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {analisando ? "Calculando orçamento…" : "Recalcular agora"}
          </button>
          {totalItens > 0 && (
            <p className="text-center text-xs text-stone-500 dark:text-slate-500">
              O orçamento recalcula sozinho a cada item adicionado — esse botão só força na hora.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
