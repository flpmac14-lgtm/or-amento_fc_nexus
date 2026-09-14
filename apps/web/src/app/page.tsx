"use client";

import { useState } from "react";
import FormularioUpload from "@/components/FormularioUpload";
import ResultadoOrcamento from "@/components/ResultadoOrcamento";
import RelatorioImpressao from "@/components/RelatorioImpressao";
import { analisarPdf, analisarTexto, baixarExcel } from "@/lib/api";
import type { EstimativasOrcamento, RespostaOrcamentoDePdf } from "@/lib/types";

export default function Home() {
  const [carregando, setCarregando] = useState(false);
  const [baixandoExcel, setBaixandoExcel] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaOrcamentoDePdf | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");

  async function handleAnalisar(arquivo: File, estimativas: EstimativasOrcamento) {
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setNomeArquivo(arquivo.name);
    try {
      const r = await analisarPdf(arquivo, estimativas);
      setResultado(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao analisar o PDF.");
    } finally {
      setCarregando(false);
    }
  }

  async function handleAnalisarTexto(texto: string, estimativas: EstimativasOrcamento) {
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setNomeArquivo("itens digitados manualmente");
    try {
      const r = await analisarTexto(texto, estimativas);
      setResultado(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao analisar o texto.");
    } finally {
      setCarregando(false);
    }
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
      <main className="print:hidden mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="flex items-start justify-between gap-4 border-b border-slate-800 pb-6">
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
            <div className="flex shrink-0 gap-2">
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
          carregando={carregando}
          onAnalisar={handleAnalisar}
          onAnalisarTexto={handleAnalisarTexto}
        />

        {erro && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}

        {resultado && <ResultadoOrcamento resultado={resultado} />}

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
