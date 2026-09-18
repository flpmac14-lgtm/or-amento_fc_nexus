"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { gerarRelatorioTecnico } from "@/lib/api";

interface Props {
  arquivo: File | null;
  // Controlado pelo pai (page.tsx) — sobrevive a "Salvar orçamento" e a
  // reabrir um orçamento salvo (onde não tem mais o File original, só o
  // texto que ficou salvo).
  relatorio: string | null;
  onRelatorioChange: (relatorio: string | null) => void;
  // Imprimir mora em page.tsx (window.print() de um único documento de
  // impressão por vez, pra não imprimir o orçamento e este relatório juntos).
  onImprimir: () => void;
}

// Estudo técnico completo por IA (geometria, BOM, peso estimado, solda,
// usinagem, pintura, análise crítica) — pedido explícito do usuário.
// SÓ INFORMATIVO: o peso/custo aqui é estimativa da IA, nunca o valor do
// orçamento (esse continua vindo do motor de cálculo determinístico a
// partir dos itens confirmados no cálculo manual). Por isso fica separado
// do fluxo de "Analisar desenho", num painel à parte.
export default function RelatorioTecnicoIA({ arquivo, relatorio, onRelatorioChange, onImprimir }: Props) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleGerar() {
    if (!arquivo) return;
    setGerando(true);
    setErro(null);
    onRelatorioChange(null);
    try {
      const texto = await gerarRelatorioTecnico(arquivo);
      onRelatorioChange(texto);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao gerar o relatório.");
    } finally {
      setGerando(false);
    }
  }

  if (!arquivo && !relatorio) return null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-slate-200">Relatório técnico completo (IA)</p>
          <p className="text-xs text-slate-500">
            Estudo detalhado de geometria, materiais, fabricação, solda e pintura — só leitura de
            apoio. Peso/custo aqui é estimativa da IA, o orçamento oficial continua vindo do
            cálculo determinístico. Pode levar 1–3 minutos.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {arquivo && (
            <button
              type="button"
              onClick={handleGerar}
              disabled={gerando}
              className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {gerando
                ? "Gerando… (1–3 min)"
                : relatorio
                  ? "Gerar de novo"
                  : "Gerar relatório técnico"}
            </button>
          )}
          {relatorio && (
            <button
              type="button"
              onClick={onImprimir}
              className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-cyan-500/50 hover:bg-slate-800"
            >
              PDF
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="mt-3 rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {erro}
        </div>
      )}

      {relatorio && (
        <div className="prose prose-invert prose-sm mt-4 max-w-none rounded-lg border border-slate-800 bg-slate-950 p-4 prose-headings:text-cyan-300 prose-table:text-slate-200 prose-th:border prose-th:border-slate-700 prose-td:border prose-td:border-slate-700">
          <ReactMarkdown>{relatorio}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
