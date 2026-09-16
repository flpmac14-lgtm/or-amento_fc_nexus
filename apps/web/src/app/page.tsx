"use client";

import { useState } from "react";
import FormularioUpload, { type ModoFormulario } from "@/components/FormularioUpload";
import ResultadoOrcamento from "@/components/ResultadoOrcamento";
import RelatorioImpressao from "@/components/RelatorioImpressao";
import { analisarPdf, baixarExcel, recalcularOrcamento, salvarOrcamento } from "@/lib/api";
import {
  ESTADO_CALCULO_MANUAL_INICIAL,
  type EstadoCalculoManual,
  type EstimativasOrcamento,
  type OrcamentoSalvoCompleto,
  type OrigemOrcamentoSalvo,
  type RespostaOrcamentoDePdf,
} from "@/lib/types";

function nomeSugerido(r: RespostaOrcamentoDePdf, fallback: string): string {
  const cliente = r.extracao.identificacao.cliente.valor;
  const numeroDesenho = r.extracao.identificacao.numero_desenho.valor;
  const partes = [cliente, numeroDesenho].filter((v): v is string => Boolean(v));
  return partes.length ? partes.join(" — ") : fallback;
}

export default function Home() {
  const [modo, setModo] = useState<ModoFormulario>("arquivo");
  const [carregando, setCarregando] = useState(false);
  const [baixandoExcel, setBaixandoExcel] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaOrcamentoDePdf | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");

  // Estado editável do cálculo manual, controlado aqui pra "Salvar
  // orçamento"/"Orçamentos salvos" conseguirem ler e restaurar (ver
  // components/CalculoManual.tsx e lib/types.ts::EstadoCalculoManual).
  const [estadoManual, setEstadoManual] = useState<EstadoCalculoManual>(ESTADO_CALCULO_MANUAL_INICIAL);
  const [origemAtual, setOrigemAtual] = useState<OrigemOrcamentoSalvo | null>(null);
  const [orcamentoSalvoId, setOrcamentoSalvoId] = useState<string | null>(null);
  const [nomeOrcamento, setNomeOrcamento] = useState("");

  async function handleAnalisar(arquivo: File, estimativas: EstimativasOrcamento) {
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setNomeArquivo(arquivo.name);
    try {
      const r = await analisarPdf(arquivo, estimativas);
      setResultado(r);
      setOrigemAtual("pdf");
      setNomeOrcamento((atual) => atual || nomeSugerido(r, arquivo.name));
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
    setNomeOrcamento((atual) => atual || nomeSugerido(r, nomeArquivoDescricao));
  }

  function handleErroManual(mensagem: string) {
    setErro(mensagem);
  }

  function handleEstadoManualChange(atualizacao: Partial<EstadoCalculoManual>) {
    setEstadoManual((atual) => ({ ...atual, ...atualizacao }));
  }

  function handleAbrirSalvo(salvo: OrcamentoSalvoCompleto) {
    setErro(null);
    setResultado(salvo.resultado);
    setNomeArquivo(salvo.nome);
    setNomeOrcamento(salvo.nome);
    setOrcamentoSalvoId(salvo.id);
    setOrigemAtual(salvo.origem);
    if (salvo.origem === "manual" && salvo.estado_manual) {
      setEstadoManual(salvo.estado_manual);
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
    setModo("arquivo");
  }

  async function handleSalvarOrcamento() {
    if (!resultado || !origemAtual) return;
    setSalvando(true);
    setErro(null);
    try {
      const nome = nomeOrcamento.trim() || "Orçamento sem nome";
      const r = await salvarOrcamento({
        id: orcamentoSalvoId ?? undefined,
        nome,
        origem: origemAtual,
        resultado,
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

  // Ajuste manual de uma linha do "Custo por processo" — pedido explícito do
  // usuário: a fórmula de cada processo fica fixa, só o(s) parâmetro(s) que
  // alimentam ela (R$/kg, R$/h etc.) são editáveis. As chaves recebidas aqui
  // já são os mesmos campos de nível raiz que `entrada` usa (igual
  // `corte_valor_kg`) — ver app/orcamento.py::PARAMS_ESCALARES_SOBRESCREVIVEIS
  // e resolver_params.
  async function handleEditarLinhaCusto(overrides: Record<string, number>) {
    if (!resultado) return;
    const entradaAtualizada = { ...resultado.entrada, ...overrides };
    const novoOrcamento = await recalcularOrcamento(entradaAtualizada);
    setResultado({
      ...resultado,
      orcamento: novoOrcamento,
      entrada: entradaAtualizada,
      parametros: novoOrcamento.parametros ?? resultado.parametros,
    });
  }

  async function handleBaixarExcel() {
    if (!resultado) return;
    setBaixandoExcel(true);
    setErro(null);
    try {
      await baixarExcel(resultado.entrada);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao gerar o Excel.");
    } finally {
      setBaixandoExcel(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <main className="print:hidden mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-col gap-4 border-b border-slate-800 pb-6">
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
          {resultado && (
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
                onClick={handleSalvarOrcamento}
                disabled={salvando}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvando ? "Salvando…" : orcamentoSalvoId ? "Atualizar orçamento" : "Salvar orçamento"}
              </button>
              <button
                type="button"
                onClick={handleNovoOrcamento}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:bg-slate-800"
              >
                Novo orçamento
              </button>
              <button
                type="button"
                onClick={() => window.print()}
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
            </div>
          )}
        </header>

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
        />

        {erro && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        {resultado && (
          <ResultadoOrcamento resultado={resultado} onEditarLinhaCusto={handleEditarLinhaCusto} />
        )}

        <footer className="mt-8 text-xs text-slate-500">
          A IA não calcula peso, custo, hora ou preço — só estrutura o que o desenho
          contém. Todo cálculo é feito pelo motor determinístico
          (<code>services/calc_engine</code>).
        </footer>
      </main>

      {resultado && <RelatorioImpressao resultado={resultado} nomeArquivo={nomeArquivo} />}
    </div>
  );
}
