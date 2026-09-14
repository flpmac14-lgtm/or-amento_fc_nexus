"use client";

import { useState } from "react";
import FormularioUpload from "@/components/FormularioUpload";
import ResultadoOrcamento from "@/components/ResultadoOrcamento";
import RelatorioImpressao from "@/components/RelatorioImpressao";
import { analisarPdf } from "@/lib/api";
import type { EstimativasOrcamento, RespostaOrcamentoDePdf } from "@/lib/types";

export default function Home() {
  const [carregando, setCarregando] = useState(false);
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

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <main className="print:hidden mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              FC Nexus — Orçamento Industrial I.A.
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Arraste um desenho técnico em PDF e receba a análise de fabricação e o
              orçamento calculado automaticamente.
            </p>
          </div>
          {resultado && (
            <button
              type="button"
              onClick={() => window.print()}
              className="shrink-0 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Gerar relatório
            </button>
          )}
        </header>

        <FormularioUpload carregando={carregando} onAnalisar={handleAnalisar} />

        {erro && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
            {erro}
          </div>
        )}

        {resultado && <ResultadoOrcamento resultado={resultado} />}

        <footer className="mt-8 text-xs text-zinc-400">
          A IA não calcula peso, custo, hora ou preço — só estrutura o que o desenho
          contém. Todo cálculo é feito pelo motor determinístico
          (<code>services/calc_engine</code>).
        </footer>
      </main>

      {resultado && <RelatorioImpressao resultado={resultado} nomeArquivo={nomeArquivo} />}
    </div>
  );
}
