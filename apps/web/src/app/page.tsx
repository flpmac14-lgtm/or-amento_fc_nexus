"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import FormularioUpload, { type ModoFormulario } from "@/components/FormularioUpload";
import ResultadoOrcamento from "@/components/ResultadoOrcamento";
import RelatorioImpressao from "@/components/RelatorioImpressao";
import PainelIdentificacaoCliente from "@/components/PainelIdentificacaoCliente";
import {
  analisarBom,
  analisarPdf,
  baixarExcel,
  recalcularOrcamento,
  salvarOrcamento,
  type ItemEstruturadoIA,
} from "@/lib/api";
import { converterParaPesoDireto, renumerarItensPorPosicao } from "@/lib/itensCalculados";
import {
  ESTADO_CALCULO_MANUAL_INICIAL,
  IDENTIFICACAO_CLIENTE_INICIAL,
  type EstadoCalculoManual,
  type EstimativasOrcamento,
  type IdentificacaoCliente,
  type OrcamentoSalvoCompleto,
  type OrigemOrcamentoSalvo,
  type RespostaOrcamentoDePdf,
} from "@/lib/types";

function nomeSugerido(
  r: RespostaOrcamentoDePdf,
  identificacaoCliente: IdentificacaoCliente,
  fallback: string,
): string {
  const cliente = identificacaoCliente.nomeCliente.trim() || r.extracao.identificacao.cliente.valor;
  const numeroDesenho = r.extracao.identificacao.numero_desenho.valor;
  const partes = [cliente, numeroDesenho].filter((v): v is string => Boolean(v));
  return partes.length ? partes.join(" — ") : fallback;
}

// Pedido explícito do usuário: se ele não digitou um nome, salvar como
// "Orçamento" + a data em vez de "Orçamento sem nome".
function nomeOrcamentoPadrao(): string {
  const hoje = new Date().toLocaleDateString("pt-BR");
  return `Orçamento ${hoje}`;
}

export default function Home() {
  const router = useRouter();
  const [modo, setModo] = useState<ModoFormulario>("arquivo");
  const [carregando, setCarregando] = useState(false);
  const [baixandoExcel, setBaixandoExcel] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Aviso da inserção automática da BOM da IA no Cálculo manual (ver
  // handleItensEstruturadosGerados) — separado de `erro` pra não parecer
  // uma falha quando é só um resumo do que foi inserido/ignorado.
  const [avisoBom, setAvisoBom] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaOrcamentoDePdf | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");

  // Estado editável do cálculo manual, controlado aqui pra "Salvar
  // orçamento"/"Orçamentos salvos" conseguirem ler e restaurar (ver
  // components/CalculoManual.tsx e lib/types.ts::EstadoCalculoManual).
  const [estadoManual, setEstadoManual] = useState<EstadoCalculoManual>(ESTADO_CALCULO_MANUAL_INICIAL);
  // Identificação do cliente (CNPJ/nome/endereço/revisão/condição de
  // pagamento/pedido) — pedido explícito do usuário: painel sempre
  // visível no topo da página, preenchido manualmente (CNPJ automatiza
  // nome+endereço), independente do fluxo (PDF/texto/manual) escolhido
  // logo abaixo. Persiste junto do orçamento salvo via
  // resultado.identificacao_cliente (ver handleSalvarOrcamento/handleAbrirSalvo).
  const [identificacaoCliente, setIdentificacaoCliente] = useState<IdentificacaoCliente>(
    IDENTIFICACAO_CLIENTE_INICIAL,
  );
  const [origemAtual, setOrigemAtual] = useState<OrigemOrcamentoSalvo | null>(null);
  const [orcamentoSalvoId, setOrcamentoSalvoId] = useState<string | null>(null);
  const [nomeOrcamento, setNomeOrcamento] = useState("");
  const [alvoImpressao, setAlvoImpressao] = useState<"orcamento" | null>(null);

  useEffect(() => {
    if (!alvoImpressao) return;
    window.print();
    setAlvoImpressao(null);
  }, [alvoImpressao]);

  async function handleSair() {
    const supabase = criarClienteSupabaseNavegador();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function handleAnalisar(arquivo: File, estimativas: EstimativasOrcamento) {
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setNomeArquivo(arquivo.name);
    try {
      const r = await analisarPdf(arquivo, estimativas);
      setResultado(r);
      setOrigemAtual("pdf");
      setNomeOrcamento((atual) => atual || nomeSugerido(r, identificacaoCliente, arquivo.name));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao analisar o PDF.");
    } finally {
      setCarregando(false);
    }
  }

  function handleResultadoManual(r: RespostaOrcamentoDePdf, nomeArquivoDescricao: string) {
    setErro(null);
    setNomeArquivo(nomeArquivoDescricao);
    setResultado(r);
    setOrigemAtual("manual");
    setNomeOrcamento((atual) => atual || nomeSugerido(r, identificacaoCliente, nomeArquivoDescricao));
  }

  function handleErroManual(mensagem: string) {
    setErro(mensagem);
  }

  function handleEstadoManualChange(atualizacao: Partial<EstadoCalculoManual>) {
    setEstadoManual((atual) => ({ ...atual, ...atualizacao }));
  }

  function handleIdentificacaoClienteChange(atualizacao: Partial<IdentificacaoCliente>) {
    setIdentificacaoCliente((atual) => ({ ...atual, ...atualizacao }));
  }

  function handleAbrirSalvo(salvo: OrcamentoSalvoCompleto) {
    setErro(null);
    setResultado(salvo.resultado);
    setNomeArquivo(salvo.nome);
    setNomeOrcamento(salvo.nome);
    setOrcamentoSalvoId(salvo.id);
    setOrigemAtual(salvo.origem);
    // Mesma lógica de mesclar com o inicial (orçamentos salvos antes desse
    // campo existir não têm `identificacao_cliente`).
    setIdentificacaoCliente({
      ...IDENTIFICACAO_CLIENTE_INICIAL,
      ...salvo.resultado.identificacao_cliente,
    });
    if (salvo.origem === "manual" && salvo.estado_manual) {
      // Mescla com o estado inicial em vez de usar salvo.estado_manual puro:
      // orçamentos salvos antes de um campo novo ser adicionado (ex:
      // ndtItens) não têm essa chave, e o restante do código assume que ela
      // sempre existe (ex: `ndtItens.length`) — sem isso, abrir um
      // orçamento salvo antigo quebrava com "Cannot read properties of
      // undefined (reading 'length')".
      setEstadoManual({ ...ESTADO_CALCULO_MANUAL_INICIAL, ...salvo.estado_manual });
      setModo("manual");
    } else {
      setModo("arquivo");
    }
  }

  function handleNovoOrcamento() {
    setResultado(null);
    setErro(null);
    setNomeArquivo("");
    setNomeOrcamento("");
    setOrcamentoSalvoId(null);
    setOrigemAtual(null);
    setEstadoManual(ESTADO_CALCULO_MANUAL_INICIAL);
    setIdentificacaoCliente(IDENTIFICACAO_CLIENTE_INICIAL);
    setModo("arquivo");
  }

  async function handleSalvarOrcamento() {
    if (!resultado || !origemAtual) return;
    setSalvando(true);
    setErro(null);
    try {
      const nome = nomeOrcamento.trim() || nomeOrcamentoPadrao();
      const r = await salvarOrcamento({
        id: orcamentoSalvoId ?? undefined,
        nome,
        origem: origemAtual,
        resultado: { ...resultado, identificacao_cliente: identificacaoCliente },
        estado_manual: origemAtual === "manual" ? estadoManual : null,
      });
      setOrcamentoSalvoId(r.id);
      setNomeOrcamento(nome);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao salvar o orçamento.");
    } finally {
      setSalvando(false);
    }
  }

  // Chamado pelo painel de extração da lista de materiais assim que a IA
  // termina — pega a BOM
  // que a IA extraiu e já insere tudo no Cálculo manual como cartões "Peso
  // direto" (pedido explícito do usuário: usa o peso extraído do
  // desenho/estimado pela IA direto, sem recalcular pela geometria — isso
  // continua disponível à parte via Excel pra quem quiser conferir depois),
  // ordenado pela POS do desenho e com "Item" sequencial. `itens` vem como
  // `[]` no início de cada geração, o que só limpa o aviso.
  async function handleItensEstruturadosGerados(itens: ItemEstruturadoIA[]) {
    if (itens.length === 0) {
      setAvisoBom(null);
      return;
    }
    const { itens: calculados, ignorados } = await converterParaPesoDireto(itens);
    if (calculados.length === 0) {
      setAvisoBom(
        `Lista de materiais da IA: nenhum item pôde ser inserido (${ignorados.length} sem peso estimado) — adicione manualmente no Cálculo manual.`,
      );
      return;
    }
    const { itens: renumerados, proximoItemNum } = renumerarItensPorPosicao(calculados, estadoManual.itemNum);
    const novosItens = [...estadoManual.itens, ...renumerados];
    handleEstadoManualChange({ itens: novosItens, itemNum: proximoItemNum });

    const partes = [
      `${calculados.length} item(ns) inserido(s) no Cálculo manual como "Peso direto"`,
      ignorados.length > 0 && `${ignorados.length} sem peso estimado — adicione manualmente`,
    ].filter(Boolean);
    setAvisoBom(`Lista de materiais da IA: ${partes.join(", ")}.`);

    // Calcula o orçamento na hora com a lista já atualizada — sem isso o
    // botão "Salvar orçamento" ficava bloqueado até o usuário abrir a aba
    // "Cálculo manual" (só lá o auto-cálculo de CalculoManual.tsx dispara,
    // porque o componente só existe montado nessa aba — bug relatado pelo
    // usuário: "o botão de salvar está com bloqueio").
    try {
      const r = await analisarBom(
        novosItens,
        estadoManual.itensComerciais,
        estadoManual.insumosPintura,
        estadoManual.operacoesUsinagem,
        estadoManual.servicosTerceiros,
        estadoManual.tratamentoTermico,
        estadoManual.contingenciamento,
        estadoManual.ndtItens,
        estadoManual.engenhariaItens,
        {
          cenario_comercial: estadoManual.cenarioComercial,
          usar_historico_horas: false,
          corte_valor_kg: Number(estadoManual.corteValorKg.replace(",", ".")) || undefined,
          peso_liquido_kg: pesoLiquidoManualAtivo ?? undefined,
        },
      );
      handleResultadoManual(r, `cálculo manual (${novosItens.length} ${novosItens.length === 1 ? "item" : "itens"})`);
    } catch (e) {
      setErro(
        e instanceof Error
          ? `Itens inseridos, mas falhou ao calcular o orçamento: ${e.message}`
          : "Itens inseridos, mas falhou ao calcular o orçamento.",
      );
    }
  }

  // Ajuste manual de uma linha do "Custo por processo" — pedido explícito do
  // usuário: a fórmula de cada processo fica fixa, só o(s) parâmetro(s) que
  // alimentam ela (R$/kg, R$/h etc.) são editáveis. As chaves recebidas aqui
  // já são os mesmos campos de nível raiz que `entrada` usa (igual
  // `corte_valor_kg`) — ver app/orcamento.py::PARAMS_ESCALARES_SOBRESCREVIVEIS
  // e resolver_params.
  async function handleEditarLinhaCusto(overrides: Record<string, number | null>) {
    if (!resultado) return;
    const entradaAtualizada = { ...resultado.entrada, ...overrides };
    const novoOrcamento = await recalcularOrcamento(entradaAtualizada);
    const resultadoAtualizado: RespostaOrcamentoDePdf = {
      ...resultado,
      orcamento: novoOrcamento,
      entrada: entradaAtualizada,
      parametros: novoOrcamento.parametros ?? resultado.parametros,
    };
    setResultado(resultadoAtualizado);

    // Pedido explícito do usuário: TODA edição (parâmetro do "Custo por
    // processo", peso bruto/líquido manual etc.) salva automaticamente —
    // mesmo a primeira vez, sem precisar ter clicado em "Salvar orçamento"
    // antes. Cria o registro se ainda não existir, atualiza se já existir.
    if (origemAtual) {
      try {
        const nome = nomeOrcamento.trim() || nomeOrcamentoPadrao();
        const r = await salvarOrcamento({
          id: orcamentoSalvoId ?? undefined,
          nome,
          origem: origemAtual,
          resultado: { ...resultadoAtualizado, identificacao_cliente: identificacaoCliente },
          estado_manual: origemAtual === "manual" ? estadoManual : null,
        });
        setOrcamentoSalvoId(r.id);
        setNomeOrcamento(nome);
      } catch (e) {
        setErro(
          e instanceof Error
            ? `Cálculo atualizado, mas falhou ao salvar no orçamento: ${e.message}`
            : "Cálculo atualizado, mas falhou ao salvar a alteração no orçamento.",
        );
      }
    }
  }

  async function handleBaixarExcel() {
    if (!resultado) return;
    setBaixandoExcel(true);
    setErro(null);
    try {
      await baixarExcel({
        ...resultado.entrada,
        identificacao_cliente: {
          cnpj: identificacaoCliente.cnpj,
          nome: identificacaoCliente.nomeCliente,
          endereco: identificacaoCliente.endereco,
          revisao: identificacaoCliente.revisao,
          condicao_pagamento: identificacaoCliente.condicaoPagamento,
          pedido: identificacaoCliente.pedido,
        },
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao gerar o Excel.");
    } finally {
      setBaixandoExcel(false);
    }
  }

  // Bug relatado pelo usuário: aplicar o peso líquido manual (PainelPesoBase)
  // e depois interagir com o Cálculo manual (adicionar/editar item) fazia o
  // auto-cálculo voltar pro peso bruto sozinho, porque ele recalcula do zero
  // sem saber desse override. Repassa o valor líquido atualmente aplicado
  // (se houver) pro Cálculo manual reenviar em toda chamada — ver
  // CalculoManual.tsx::pesoLiquidoManualAtivo e app/adapter.py.
  const pesoLiquidoManualAtivo =
    resultado &&
    typeof resultado.entrada.peso_bruto_calculado_kg === "number" &&
    typeof resultado.entrada.peso_liquido_kg === "number" &&
    Math.abs(resultado.entrada.peso_liquido_kg - resultado.entrada.peso_bruto_calculado_kg) > 0.005
      ? resultado.entrada.peso_liquido_kg
      : null;

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="print:hidden mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        {/* Sticky: fica visível no canto superior mesmo rolando a página —
            pedido explícito do usuário pra não precisar voltar ao topo toda
            vez que salvar depois de editar uma linha de custo. */}
        <header className="sticky top-0 z-20 -mx-6 flex flex-col gap-4 border-b border-slate-800 bg-slate-950/95 px-6 pb-6 pt-6 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-400">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 19V5a1 1 0 0 1 1-1h9l6 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" strokeLinejoin="round" />
                  <path d="M14 4v5a1 1 0 0 0 1 1h5" strokeLinejoin="round" />
                  <path d="M8 13h8M8 16.5h5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">
                  FC Nexus <span className="text-cyan-400">—</span> Orçamento Industrial I.A.
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Arraste um desenho técnico em PDF e receba a análise de fabricação e o
                  orçamento calculado automaticamente.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {/* Pedido explícito do usuário: sempre visível em qualquer aba,
                  pra poder salvar a qualquer momento durante a edição — antes
                  só aparecia depois de um resultado calculado. Fica desabilitado
                  até existir algo pra salvar (ver handleSalvarOrcamento). */}
              <button
                type="button"
                onClick={() => handleSalvarOrcamento()}
                disabled={salvando || !resultado || !origemAtual}
                className="rounded-lg bg-cyan-500 px-6 py-3 text-base font-bold text-slate-950 shadow-[0_0_25px_-6px_rgba(34,211,238,0.7)] transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvando ? "Salvando…" : "Salvar orçamento"}
              </button>
              <button
                type="button"
                onClick={handleSair}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-cyan-500/50 hover:bg-slate-800"
              >
                Sair
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={nomeOrcamento}
              onChange={(e) => setNomeOrcamento(e.target.value)}
              placeholder="nome do orçamento"
              className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500 sm:flex-none sm:w-56"
            />
            <button
              type="button"
              onClick={handleNovoOrcamento}
              className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:bg-slate-800"
            >
              Novo orçamento
            </button>
            {resultado && (
              <>
                <button
                  type="button"
                  onClick={() => setAlvoImpressao("orcamento")}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:bg-slate-800"
                >
                  Relatório (PDF)
                </button>
                <button
                  type="button"
                  onClick={handleBaixarExcel}
                  disabled={baixandoExcel}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {baixandoExcel ? "Gerando…" : "Excel (editável)"}
                </button>
              </>
            )}
          </div>
        </header>

        {/* Pedido explícito do usuário: sempre visível, antes do
            cabeçalho de "Enviar desenho (PDF) / Cálculo manual" — CNPJ
            automatiza nome/endereço, o resto é digitado à mão por
            enquanto (uma etapa futura vai jogar dados extraídos do
            desenho direto aqui pra revisão em Cálculo manual). */}
        <PainelIdentificacaoCliente
          valor={identificacaoCliente}
          onChange={handleIdentificacaoClienteChange}
        />

        <FormularioUpload
          modo={modo}
          setModo={setModo}
          carregando={carregando}
          onAnalisar={handleAnalisar}
          onResultadoManual={handleResultadoManual}
          onErroManual={handleErroManual}
          estadoManual={estadoManual}
          onEstadoManualChange={handleEstadoManualChange}
          onAbrirSalvo={handleAbrirSalvo}
          pesoLiquidoManualAtivo={pesoLiquidoManualAtivo}
          onItensEstruturadosChange={handleItensEstruturadosGerados}
        />

        {erro && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        {avisoBom && (
          <div className="rounded-lg border border-cyan-800 bg-cyan-950/30 p-4 text-sm text-cyan-300">
            {avisoBom}
          </div>
        )}

        {resultado && (
          <ResultadoOrcamento resultado={resultado} onEditarLinhaCusto={handleEditarLinhaCusto} />
        )}

        <footer className="mt-8 text-xs text-slate-500">
          A IA não calcula custo, hora ou preço — todo cálculo comercial é feito pelo motor
          determinístico (<code>services/calc_engine</code>). O peso da lista de materiais
          inserida automaticamente como &quot;Peso direto&quot; vem extraído/estimado pela IA a
          partir do desenho — confira e ajuste manualmente antes de fechar o orçamento.
        </footer>
      </main>

      {alvoImpressao === "orcamento" && resultado && (
        <RelatorioImpressao
          resultado={resultado}
          nomeArquivo={nomeArquivo}
          identificacaoCliente={identificacaoCliente}
        />
      )}
    </div>
  );
}
