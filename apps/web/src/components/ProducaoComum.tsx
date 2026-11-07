"use client";

// Peças visuais comuns da aba Ordens de produção, do totem e da impressão da OP
// (pedido do usuário, 07/11/2026). Regras e tipos: lib/producao.ts.

import { useEffect, useState } from "react";
import {
  COR_PRIORIDADE,
  COR_STATUS_ETAPA,
  COR_STATUS_OP,
  ROTULO_PRIORIDADE,
  ROTULO_STATUS_ETAPA,
  ROTULO_STATUS_OP,
  barrasCode39,
  diasParaPrazo,
  fmtData,
  type StatusEtapa,
  type StatusOP,
} from "@/lib/producao";

export async function api<T = Record<string, unknown>>(url: string, corpo?: unknown): Promise<T> {
  const r = await fetch(url, corpo === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  let j: Record<string, unknown> = {};
  try {
    j = await r.json();
  } catch {
    // resposta sem JSON
  }
  if (!r.ok) throw new Error((j.erro as string) ?? `Erro ${r.status}`);
  return j as T;
}

export function urlFoto(sha: string | null | undefined): string | null {
  return sha ? `/api/follow-up/almoxarifado/imagem?sha=${sha}` : null;
}

export function SeloStatusOP({ status, grande = false }: { status: StatusOP; grande?: boolean }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full font-semibold ring-1 ring-inset ${grande ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]"} ${COR_STATUS_OP[status]}`}>
      {ROTULO_STATUS_OP[status]}
    </span>
  );
}

export function SeloStatusEtapa({ status }: { status: StatusEtapa }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${COR_STATUS_ETAPA[status]}`}>
      {status === "andamento" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {ROTULO_STATUS_ETAPA[status]}
    </span>
  );
}

export function SeloPrioridade({ p }: { p: 1 | 2 | 3 }) {
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${COR_PRIORIDADE[p]}`}>{ROTULO_PRIORIDADE[p]}</span>;
}

/** Prazo com os dias que faltam (vermelho = atrasado, âmbar = até 3 dias). */
export function Prazo({ prazo, encerrada = false }: { prazo: string | null; encerrada?: boolean }) {
  const d = diasParaPrazo(prazo);
  if (d === null) return <span className="text-stone-400">sem prazo</span>;
  const cor = encerrada ? "text-stone-500" : d < 0 ? "text-red-600 dark:text-red-400 font-semibold" : d <= 3 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-stone-600 dark:text-slate-300";
  return (
    <span className={`whitespace-nowrap ${cor}`}>
      {fmtData(prazo)}
      {!encerrada && <span className="ml-1 text-[11px]">({d < 0 ? `${-d}d atraso` : d === 0 ? "hoje" : `${d}d`})</span>}
    </span>
  );
}

/** Barra de etapas: um quadradinho por etapa, na cor do status. */
export function BarraEtapas({ status, titulos }: { status: StatusEtapa[]; titulos?: string[] }) {
  const cor: Record<StatusEtapa, string> = {
    pendente: "bg-stone-200 dark:bg-slate-700",
    andamento: "bg-sky-500 animate-pulse",
    pausada: "bg-amber-400",
    concluida: "bg-emerald-500",
  };
  return (
    <div className="flex gap-0.5">
      {status.map((s, i) => (
        <span key={i} title={titulos?.[i]} className={`h-2.5 min-w-[10px] flex-1 rounded-sm ${cor[s]}`} />
      ))}
    </div>
  );
}

/** Código de barras Code 39 em SVG (mesmo tipo do Sectra). */
export function CodigoBarras({ valor, altura = 34, modulo = 1.2, comTexto = true }: { valor: string; altura?: number; modulo?: number; comTexto?: boolean }) {
  const { barras, largura } = barrasCode39(valor);
  const w = largura * modulo;
  return (
    <svg viewBox={`0 0 ${w} ${altura + (comTexto ? 11 : 0)}`} width={w} height={altura + (comTexto ? 11 : 0)} className="block">
      <rect width={w} height={altura + (comTexto ? 11 : 0)} fill="#fff" />
      {barras.map(([x, l], i) => (
        <rect key={i} x={x * modulo} y={0} width={l * modulo} height={altura} fill="#000" />
      ))}
      {comTexto && (
        <text x={w / 2} y={altura + 9} textAnchor="middle" fontSize="9" fontFamily="monospace" fill="#000">
          {valor}
        </text>
      )}
    </svg>
  );
}

/** Relógio que atualiza sozinho (força re-render a cada `ms`). */
export function useAgora(ms = 30000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return agora;
}

export const classeBotao =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:border-green-600/60 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-500/60 dark:hover:bg-slate-800";
export const classeBotaoPrimario =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-green-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500";
export const classeBotaoPerigo =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-500/10";
export const classeCampo =
  "w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-800 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-500 dark:focus:ring-cyan-500/20";
export const classeCartao = "rounded-xl border border-stone-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";
