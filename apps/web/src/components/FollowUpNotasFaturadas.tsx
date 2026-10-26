"use client";

// Coluna "NF faturada" do Follow up — pedido do usuário (26/10/2026): as notas
// de saída que já faturaram o item, logo antes da Compra / Retorno. Vêm do
// Sectra pelo pedido do cliente + item (FN_NFSITENS.PEDCOMPRA/PEDCOMPRAITEM),
// os mesmos dados do relatório de coleta e do romaneio
// (/api/follow-up/notas-fiscais, migration 0054, ciclo de 15 min).

import { useEffect, useState } from "react";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import type { ItemFollowUp } from "@/lib/types";

export type NotasPorPo = Record<string, [string, string, number?][]>; // "4501690746-010" → [[NF, emissão, qtde], …]

// "4501690746-10" / "4501690746-010" → "4501690746-010" (mesma chave do ERP).
function chavePo(po: string): string {
  const s = po.replace(/\s+/g, "").toUpperCase();
  const m = /^(.*?)-0*(\d+)$/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(3, "0")}` : s;
}

export function useNotasFaturadas(): NotasPorPo {
  const [notas, setNotas] = useState<NotasPorPo>({});
  useEffect(() => {
    let ativo = true;
    fetch("/api/follow-up/notas-fiscais", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => ativo && j?.notas?.po && setNotas(j.notas.po as NotasPorPo))
      .catch(() => {}); // sem os dados a coluna só fica vazia
    return () => {
      ativo = false;
    };
  }, []);
  return notas;
}

export interface NotaFaturada {
  nf: string;
  d: string;
  q: number | null;
}

export function notasFaturadasDoItem(i: ItemFollowUp, notas: NotasPorPo): NotaFaturada[] {
  return (notas[chavePo(i.po)] ?? []).map(([nf, d, q]) => ({ nf, d, q: q ?? null }));
}

// Texto pra filtrar e ordenar (ordena pela emissão mais recente).
export function resumoNotasFaturadas(ns: NotaFaturada[]): string {
  if (!ns.length) return "";
  return `${ns[ns.length - 1].d} ${ns.map((n) => `NF ${n.nf} ${formatarDataBr(n.d)}`).join(" ")}`;
}

export function CelulaNotasFaturadas({ notas, qtd }: { notas: NotaFaturada[]; qtd: number | null }) {
  if (!notas.length) return <span className="text-xs text-stone-300 dark:text-slate-600">—</span>;
  const faturado = notas.every((n) => n.q !== null) ? notas.reduce((s, n) => s + (n.q ?? 0), 0) : null;
  const falta = faturado !== null && qtd ? qtd - faturado : 0;
  return (
    <span
      className="block whitespace-nowrap text-[11px] leading-tight"
      title={notas.map((n) => `NF ${n.nf} · ${formatarDataBr(n.d)}${n.q !== null ? ` · ${formatarNumero(n.q, 0)} pç` : ""}`).join("\n")}
    >
      {notas.map((n) => (
        <span key={`${n.nf}-${n.d}`} className="block font-mono text-blue-700 dark:text-sky-400">
          NF <span className="font-semibold">{n.nf}</span>{" "}
          <span className="text-stone-500 dark:text-slate-400">
            {formatarDataBr(n.d).slice(0, 5)}
            {notas.length > 1 && n.q !== null ? ` · ${formatarNumero(n.q, 0)} pç` : ""}
          </span>
        </span>
      ))}
      {falta > 0 && <span className="block text-amber-700 dark:text-amber-300">parcial · falta {formatarNumero(falta, 0)} pç</span>}
    </span>
  );
}
