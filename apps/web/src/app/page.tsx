"use client";

import { useState } from "react";
import FormularioUpload from "@/components/FormularioUpload";
import ResultadoOrcamento from "@/components/ResultadoOrcamento";
import { analisarPdf } from "@/lib/api";
import type { EstimativasOrcamento, RespostaOrcamentoDePdf } from "@/lib/types";

export default function Home() {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaOrcamentoDePdf | null>(null);

  async function handleAnalisar(arquivo: File, estimativas: EstimativasOrcamento) {
    setCarregando(true);
    setErro(null);
    setResultado(null);
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
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
        <header>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            FC Nexus — Orçamento Industrial I.A.
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Arraste um desenho técnico em PDF e receba a análise de fabricação e o
            orçamento calculado automaticamente.
          </p>
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
    </div>
  );
}
