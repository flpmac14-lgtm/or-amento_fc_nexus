"use client";

import { useEffect, useState } from "react";
import { analisarBom, buscarCatalogoGeometria, buscarCatalogoProcessosTerceirizados, buscarMateriais } from "@/lib/api";
import { formatarMoeda, formatarNumero } from "@/lib/format";
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
import type {
  CatalogoGeometria,
  CatalogoProcessosTerceirizados,
  EstadoCalculoManual,
  EstimativasOrcamento,
  ItemCalculado,
  ItemComercial,
  ItemContingenciamento,
  MaterialCatalogo,
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
};

export default function CalculoManual({ estado, onEstadoChange, onResultado, onErro }: Props) {
  const {
    itens, itensComerciais, insumosPintura, operacoesUsinagem, servicosTerceiros, tratamentoTermico,
    contingenciamento, cenarioComercial, corteValorKg, posicaoNum, itemNum,
  } = estado;

  const [catalogo, setCatalogo] = useState<CatalogoGeometria | null>(null);
  const [materiais, setMateriais] = useState<MaterialCatalogo[]>([]);
  const [catalogoProcessos, setCatalogoProcessos] = useState<CatalogoProcessosTerceirizados>(CATALOGO_PROCESSOS_VAZIO);
  const [tipoAberto, setTipoAberto] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);

  useEffect(() => {
    buscarCatalogoGeometria()
      .then(setCatalogo)
      .catch((e) => onErro(e instanceof Error ? e.message : "Erro ao carregar os tipos de geometria."));
    buscarMateriais()
      .then(setMateriais)
      .catch((e) => onErro(e instanceof Error ? e.message : "Erro ao carregar a biblioteca de materiais."));
    buscarCatalogoProcessosTerceirizados()
      .then(setCatalogoProcessos)
      .catch(() => setCatalogoProcessos(CATALOGO_PROCESSOS_VAZIO));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function adicionarItem(item: Omit<ItemCalculado, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ itens: [...itens, { ...item, posicao }] });
  }

  function removerItem(indice: number) {
    onEstadoChange({ itens: itens.filter((_, i) => i !== indice) });
  }

  function adicionarItemComercial(item: Omit<ItemComercial, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ itensComerciais: [...itensComerciais, { ...item, posicao }] });
  }

  function removerItemComercial(indice: number) {
    onEstadoChange({ itensComerciais: itensComerciais.filter((_, i) => i !== indice) });
  }

  function adicionarInsumoPintura(item: Omit<ItemComercial, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ insumosPintura: [...insumosPintura, { ...item, posicao }] });
  }

  function removerInsumoPintura(indice: number) {
    onEstadoChange({ insumosPintura: insumosPintura.filter((_, i) => i !== indice) });
  }

  function adicionarOperacaoUsinagem(item: Omit<OperacaoUsinagem, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ operacoesUsinagem: [...operacoesUsinagem, { ...item, posicao }] });
  }

  function removerOperacaoUsinagem(indice: number) {
    onEstadoChange({ operacoesUsinagem: operacoesUsinagem.filter((_, i) => i !== indice) });
  }

  function adicionarServicoTerceiro(item: Omit<ServicoPorPeso, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ servicosTerceiros: [...servicosTerceiros, { ...item, posicao }] });
  }

  function removerServicoTerceiro(indice: number) {
    onEstadoChange({ servicosTerceiros: servicosTerceiros.filter((_, i) => i !== indice) });
  }

  function adicionarTratamentoTermico(item: Omit<ServicoPorPeso, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ tratamentoTermico: [...tratamentoTermico, { ...item, posicao }] });
  }

  function removerTratamentoTermico(indice: number) {
    onEstadoChange({ tratamentoTermico: tratamentoTermico.filter((_, i) => i !== indice) });
  }

  function adicionarContingenciamento(item: Omit<ItemContingenciamento, "posicao">) {
    const posicao = `Posição ${posicaoNum} - Item ${itemNum}`;
    onEstadoChange({ contingenciamento: [...contingenciamento, { ...item, posicao }] });
  }

  function removerContingenciamento(indice: number) {
    onEstadoChange({ contingenciamento: contingenciamento.filter((_, i) => i !== indice) });
  }

  async function calcularOrcamento() {
    const totalItens =
      itens.length + itensComerciais.length + insumosPintura.length + operacoesUsinagem.length +
      servicosTerceiros.length + tratamentoTermico.length + contingenciamento.length;
    if (totalItens === 0) return;
    setAnalisando(true);
    try {
      const r = await analisarBom(
        itens, itensComerciais, insumosPintura, operacoesUsinagem, servicosTerceiros, tratamentoTermico,
        contingenciamento,
        {
          cenario_comercial: cenarioComercial,
          usar_historico_horas: false,
          corte_valor_kg: Number(corteValorKg.replace(",", ".")) || undefined,
        },
      );
      onResultado(r, `cálculo manual (${totalItens} ${totalItens === 1 ? "item" : "itens"})`);
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Erro ao calcular o orçamento.");
    } finally {
      setAnalisando(false);
    }
  }

  const pesoTotal = itens.reduce((soma, i) => soma + i.peso_kg, 0);
  const custoComercialTotal = itensComerciais.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoPinturaTotal = insumosPintura.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoUsinagemTotal = operacoesUsinagem.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoServicosTotal = servicosTerceiros.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoTratamentoTotal = tratamentoTermico.reduce((soma, i) => soma + i.custoTotal, 0);
  const custoContingenciaTotal = contingenciamento.reduce((soma, i) => soma + i.custoTotal, 0);

  interface LinhaExibicao {
    chave: string;
    posicao: string;
    descricao: string;
    detalhe: string;
    custoTotal?: number;
    remover: () => void;
  }

  const linhasExibicao: LinhaExibicao[] = [
    ...itens.map((item, i): LinhaExibicao => ({
      chave: `g-${i}`,
      posicao: item.posicao,
      descricao: item.descricao || item.tipoRotulo,
      detalhe: `${formatarNumero(item.peso_kg, 2)} kg`,
      custoTotal: item.custoTotal,
      remover: () => removerItem(i),
    })),
    ...itensComerciais.map((item, i): LinhaExibicao => ({
      chave: `c-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.quantidade, 0)} × ${formatarMoeda(item.preco_unitario)}`,
      custoTotal: item.custoTotal,
      remover: () => removerItemComercial(i),
    })),
    ...insumosPintura.map((item, i): LinhaExibicao => ({
      chave: `p-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.quantidade, 2)} L × ${formatarMoeda(item.preco_unitario)}`,
      custoTotal: item.custoTotal,
      remover: () => removerInsumoPintura(i),
    })),
    ...operacoesUsinagem.map((item, i): LinhaExibicao => ({
      chave: `u-${i}`,
      posicao: item.posicao,
      descricao: item.maquina,
      detalhe: `${formatarNumero(item.horas, 2)} h × ${formatarMoeda(item.valorHora)}`,
      custoTotal: item.custoTotal,
      remover: () => removerOperacaoUsinagem(i),
    })),
    ...servicosTerceiros.map((item, i): LinhaExibicao => ({
      chave: `s-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.pesoKg, 2)} kg × ${formatarMoeda(item.valorKg)}`,
      custoTotal: item.custoTotal,
      remover: () => removerServicoTerceiro(i),
    })),
    ...tratamentoTermico.map((item, i): LinhaExibicao => ({
      chave: `t-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.pesoKg, 2)} kg × ${formatarMoeda(item.valorKg)}`,
      custoTotal: item.custoTotal,
      remover: () => removerTratamentoTermico(i),
    })),
    ...contingenciamento.map((item, i): LinhaExibicao => ({
      chave: `q-${i}`,
      posicao: item.posicao,
      descricao: item.descricao,
      detalhe: `${formatarNumero(item.quantidade, 0)} × ${formatarMoeda(item.valorUnitario)}`,
      custoTotal: item.custoTotal,
      remover: () => removerContingenciamento(i),
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
    return <p className="text-sm text-slate-500">Carregando tipos de geometria…</p>;
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
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-sm text-slate-400">
          Escolha o tipo de peça, informe as medidas e adicione à posição/item do orçamento — um
          orçamento pode ter várias posições, cada uma com várias peças.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {Object.entries(catalogoComPesoDireto).map(([tipo, def]) => (
            <button
              key={tipo}
              type="button"
              onClick={() => abrirCartao(tipo)}
              className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-xs font-medium transition-colors ${
                tipoAberto === tipo
                  ? "border-cyan-400 bg-cyan-500/15 text-cyan-300"
                  : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <GeometriaIcone tipo={tipo} className="h-10 w-10 text-current opacity-90" />
              {def.rotulo}
            </button>
          ))}
        </div>
      </div>

      {tipoAberto === "perfil" && (
        <CartaoPerfilLaminado materiais={materiais} onAdicionar={adicionarItem} {...posicaoProps} />
      )}

      {tipoAberto === "cantoneira" && (
        <CartaoCantoneira materiais={materiais} onAdicionar={adicionarItem} {...posicaoProps} />
      )}

      {tipoAberto === "tubo_redondo" && (
        <CartaoTuboRedondo materiais={materiais} onAdicionar={adicionarItem} {...posicaoProps} />
      )}

      {tipoAberto === TIPO_PESO_DIRETO && (
        <CartaoPesoDireto materiais={materiais} onAdicionar={adicionarItem} {...posicaoProps} />
      )}

      {tipoAberto && !TIPOS_COM_CARTAO_PROPRIO.has(tipoAberto) && (
        <CartaoGeometriaPadrao
          key={tipoAberto}
          tipo={tipoAberto}
          def={catalogo[tipoAberto]}
          materiais={materiais}
          onAdicionar={adicionarItem}
          {...posicaoProps}
        />
      )}

      <div className="border-t border-slate-800 pt-6">
        <CartaoItemComercial onAdicionar={adicionarItemComercial} {...posicaoProps} />
      </div>

      <CartaoInsumoPintura onAdicionar={adicionarInsumoPintura} {...posicaoProps} />

      <CartaoUsinagem catalogo={catalogoProcessos.usinagem} onAdicionar={adicionarOperacaoUsinagem} {...posicaoProps} />

      <CartaoServicoPorPeso
        titulo="Serviços de terceiros (outsourcing)"
        descricaoCard="Conformação pesada (dobra/calandra), rebordeamento de tampos, balanceamento etc. — cobrado por peso da peça."
        catalogo={catalogoProcessos.servicos_terceiros}
        onAdicionar={adicionarServicoTerceiro}
        {...posicaoProps}
      />

      <CartaoServicoPorPeso
        titulo="Tratamento térmico (outsourcing)"
        descricaoCard="Alívio de tensões/normalização, têmpera/revenimento, cementação/nitretação etc. — cobrado por peso da peça."
        catalogo={catalogoProcessos.tratamento_termico}
        onAdicionar={adicionarTratamentoTermico}
        {...posicaoProps}
      />

      <CartaoContingenciamento onAdicionar={adicionarContingenciamento} {...posicaoProps} />

      {linhasExibicao.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="mb-3 font-semibold text-white">
            Itens calculados — {formatarNumero(pesoTotal, 2)} kg de matéria-prima
            {totaisExtras.length > 0 && ` · ${totaisExtras.join(" · ")}`}
          </h3>
          <div className="flex flex-col gap-3">
            {itensPorPosicao.map((grupo) => (
              <div key={grupo.posicao}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cyan-400">
                  {grupo.posicao}
                </p>
                <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
                  {grupo.linhas.map((linha) => (
                    <li key={linha.chave} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="text-slate-300">{linha.descricao}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono text-slate-100">
                          {linha.detalhe}
                          {linha.custoTotal !== undefined && (
                            <span className="ml-2 text-cyan-300">{formatarMoeda(linha.custoTotal)}</span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={linha.remover}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          remover
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-400">Cenário comercial</span>
              <select
                value={cenarioComercial}
                onChange={(e) => onEstadoChange({ cenarioComercial: e.target.value as EstimativasOrcamento["cenario_comercial"] })}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="venda_fabricacao">Venda de fabricação</option>
                <option value="industrializacao">Industrialização</option>
                <option value="servico">Serviço</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-400">Insumos de corte (R$/kg)</span>
              <input
                type="text"
                inputMode="decimal"
                value={corteValorKg}
                onChange={(e) => onEstadoChange({ corteValorKg: e.target.value })}
                title="Custo médio de oxicorte/plasma/laser — multiplica o peso líquido total dos itens"
                className="w-28 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            </label>
            <button
              type="button"
              onClick={calcularOrcamento}
              disabled={analisando}
              className="ml-auto rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
            >
              {analisando ? "Calculando orçamento…" : "Calcular orçamento"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
