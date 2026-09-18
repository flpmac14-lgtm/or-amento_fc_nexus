import ReactMarkdown from "react-markdown";

/**
 * Versão impressa do relatório técnico por IA — mesmo padrão de
 * RelatorioImpressao.tsx (fica `hidden` na tela, só aparece via
 * `print:block` quando o botão chama window.print()). Mantido fora da tela
 * normal porque é um documento de leitura longa, não uma UI interativa.
 */
export default function RelatorioTecnicoImpressao({ relatorio }: { relatorio: string }) {
  const geradoEm = new Date().toLocaleString("pt-BR");

  return (
    <div className="hidden print:block print:text-black">
      <header className="mb-6 border-b-2 border-black pb-3">
        <h1 className="text-lg font-bold">FC Nexus — Relatório Técnico Completo (IA)</h1>
        <p className="text-xs text-slate-600">
          Gerado em {geradoEm} · Estudo de apoio gerado por IA — peso/custo aqui é estimativa,
          não é o orçamento oficial (esse vem do motor de cálculo determinístico).
        </p>
      </header>
      <div className="prose prose-sm max-w-none prose-headings:text-black prose-p:text-black prose-li:text-black prose-strong:text-black prose-table:text-black prose-th:border prose-th:border-black prose-td:border prose-td:border-black">
        <ReactMarkdown>{relatorio}</ReactMarkdown>
      </div>
    </div>
  );
}
