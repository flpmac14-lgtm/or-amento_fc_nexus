"use client";

// PDF do programa de corte — pedido explícito do usuário: como no Excel, o nº
// do programa (Croqui de corte / Corte) vira link e o duplo clique abre o PDF
// da pasta de corte (J:\3 - Projetos\GR_PROJETO\Corte\PCP-Corte-2026,
// sincronizada pro app por scripts/sincronizar_pdfs_corte.py).
// Programa com mais de um PDF (ex.: o mesmo nº em MACs diferentes): abre
// uma janelinha pra escolher.

import { createContext, useContext, useEffect, useState } from "react";
import { abrirPdfCorte, listarPdfsCorte, type PdfPrograma } from "@/lib/api";

interface Contexto {
  pdfsDe: (programa: string) => PdfPrograma[];
  abrir: (programa: string) => void;
}

const ContextoPdfs = createContext<Contexto>({ pdfsDe: () => [], abrir: () => {} });

/** nº como está na planilha ("0939 " → "939"). */
function chave(programa: string): string {
  const n = programa.trim().replace(/^0+(?=\d)/, "");
  return /^\d+$/.test(n) ? n : programa.trim();
}

export function ProvedorPdfsCorte({ children }: { children: React.ReactNode }) {
  const [indice, setIndice] = useState<Record<string, PdfPrograma[]>>({});
  const [escolha, setEscolha] = useState<{ programa: string; pdfs: PdfPrograma[] } | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    listarPdfsCorte()
      .then((i) => ativo && setIndice(i))
      .catch(() => {}); // sem índice = números sem link (o resto da tela segue)
    return () => {
      ativo = false;
    };
  }, []);

  function pdfsDe(programa: string): PdfPrograma[] {
    return indice[chave(programa)] ?? [];
  }

  function abrirUm(pdf: PdfPrograma) {
    setErro("");
    abrirPdfCorte(pdf).catch((e: Error) => setErro(e.message));
  }

  function abrir(programa: string) {
    const pdfs = pdfsDe(programa);
    if (pdfs.length === 1) abrirUm(pdfs[0]);
    else if (pdfs.length > 1) setEscolha({ programa, pdfs });
  }

  return (
    <ContextoPdfs.Provider value={{ pdfsDe, abrir }}>
      {children}
      {erro && (
        <div
          className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-lg dark:border-red-800 dark:bg-red-950 dark:text-red-300"
          onClick={() => setErro("")}
        >
          {erro}
        </div>
      )}
      {escolha && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setEscolha(null)}>
          <div
            className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-sm font-bold text-stone-800 dark:text-slate-200">
              Programa {escolha.programa} — {escolha.pdfs.length} PDFs na pasta. Qual abrir?
            </p>
            <ul className="flex flex-col gap-1">
              {escolha.pdfs.map((p) => (
                <li key={p.nome}>
                  <button
                    type="button"
                    onClick={() => {
                      abrirUm(p);
                      setEscolha(null);
                    }}
                    className="w-full rounded-lg border border-stone-200 px-3 py-2 text-left text-sm hover:border-green-600 hover:bg-green-50 dark:border-slate-700 dark:hover:border-cyan-500 dark:hover:bg-slate-800"
                  >
                    <span className="font-mono font-semibold text-stone-900 dark:text-white">📄 {p.nome}</span>
                    <span className="block text-xs text-stone-500 dark:text-slate-400">
                      arquivo de {new Date(p.modificado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </ContextoPdfs.Provider>
  );
}

export function usePdfsCorte(): Contexto {
  return useContext(ContextoPdfs);
}

/** Nº do programa com cara de link quando tem PDF na pasta. */
export function NumeroPrograma({ programa, className = "" }: { programa: string; className?: string }) {
  const { pdfsDe } = usePdfsCorte();
  const n = pdfsDe(programa).length;
  if (!n) return <span className={className}>{programa}</span>;
  return (
    <span
      className={`text-blue-700 underline decoration-dotted underline-offset-2 dark:text-sky-400 ${className}`}
      title={`Duplo clique abre o PDF do programa${n > 1 ? ` (${n} arquivos)` : ""}`}
    >
      {programa}
      <span className="ml-0.5 no-underline">📄</span>
    </span>
  );
}
