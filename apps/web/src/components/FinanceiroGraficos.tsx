"use client";

// Gráficos da aba Financeiro (SVG próprio, como a Visão Geral — sem
// biblioteca). Cores validadas pro daltonismo e contraste (claro e escuro):
// Produção verde/ciano, Serviço violeta; budget = linha tracejada neutra.

import { useState } from "react";

export function rotuloMes(m: string): string {
  return `${m.slice(5, 7)}/${m.slice(2, 4)}`;
}

export function compacto(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(".", ",")} mi`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)} mil`;
  return `${Math.round(v)}`;
}

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

interface Serie {
  nome: string;
  classe: string; // fill (Tailwind) da série
  legenda: string; // bg (Tailwind) do quadradinho da legenda
}

// Barras empilhadas por mês (+ linha de meta opcional) com dica ao passar o mouse.
export function GraficoBarras({
  meses,
  series,
  valores,
  meta,
  altura = 240,
  selecionado,
  selecionar,
}: {
  meses: string[];
  series: Serie[];
  valores: (mes: string) => number[]; // um valor por série
  meta?: (mes: string) => number | undefined;
  altura?: number;
  selecionado?: string; // mês destacado (filtro da página)
  selecionar?: (mes: string) => void; // clique na barra
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 720;
  const topo = 22;
  const base = altura - 22;
  const totais = meses.map((m) => valores(m).reduce((a, b) => a + b, 0));
  const metas = meses.map((m) => meta?.(m));
  const max = Math.max(1, ...totais, ...metas.map((x) => x ?? 0)) * 1.08;
  const passo = L / meses.length;
  const larg = Math.min(38, passo * 0.62);
  const y = (v: number) => base - (v / max) * (base - topo);
  const grade = [0.25, 0.5, 0.75, 1].map((f) => (max / 1.08) * f);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${altura}`} className="h-auto w-full" role="img" aria-label="Gráfico de barras por mês">
        {grade.map((g) => (
          <g key={g}>
            <line x1={0} x2={L} y1={y(g)} y2={y(g)} className="stroke-stone-200 dark:stroke-slate-800" strokeWidth={1} />
            <text x={2} y={y(g) - 3} className="fill-stone-400 text-[10px] dark:fill-slate-500">
              {compacto(g)}
            </text>
          </g>
        ))}
        {meses.map((m, i) => {
          const cx = passo * i + passo / 2;
          let acumulado = 0;
          const vs = valores(m);
          return (
            <g
              key={m}
              onMouseEnter={() => setFoco(i)}
              onMouseLeave={() => setFoco(null)}
              onClick={() => selecionar?.(m)}
              className={selecionar ? "cursor-pointer" : undefined}
            >
              <rect
                x={passo * i}
                y={0}
                width={passo}
                height={altura}
                className={
                  m === selecionado
                    ? "fill-green-50 dark:fill-cyan-950/50"
                    : foco === i
                      ? "fill-stone-100 dark:fill-slate-800/60"
                      : "fill-transparent"
                }
              />
              {vs.map((v, k) => {
                if (v <= 0) return null;
                const y0 = y(acumulado);
                acumulado += v;
                const y1 = y(acumulado);
                const ultimo = vs.slice(k + 1).every((x) => x <= 0);
                // 2px de folga entre segmentos; ponta arredondada só no topo
                return (
                  <rect
                    key={k}
                    x={cx - larg / 2}
                    y={y1}
                    width={larg}
                    height={Math.max(0, y0 - y1 - (ultimo ? 0 : 2))}
                    rx={ultimo ? 4 : 0}
                    className={series[k].classe}
                  />
                );
              })}
              {totais[i] > 0 && (
                <text x={cx} y={y(totais[i]) - 5} textAnchor="middle" className="fill-stone-700 text-[10px] font-semibold dark:fill-slate-300">
                  {compacto(totais[i])}
                </text>
              )}
              <text
                x={cx}
                y={altura - 6}
                textAnchor="middle"
                className={m === selecionado ? "fill-stone-900 text-[10px] font-bold dark:fill-white" : "fill-stone-500 text-[10px] dark:fill-slate-400"}
              >
                {rotuloMes(m)}
              </text>
            </g>
          );
        })}
        {meta && (
          <polyline
            fill="none"
            strokeDasharray="5 4"
            strokeWidth={2}
            className="stroke-stone-500 dark:stroke-slate-400"
            points={metas
              .map((v, i) => (v ? `${passo * i + passo / 2},${y(v)}` : null))
              .filter(Boolean)
              .join(" ")}
            pointerEvents="none"
          />
        )}
      </svg>
      {foco !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[11rem] rounded-lg border border-stone-200 bg-white p-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900"
          style={{ left: `${Math.min(78, Math.max(0, ((foco + 0.5) / meses.length) * 100 - 10))}%` }}
        >
          <p className="mb-1 font-bold text-stone-900 dark:text-white">{rotuloMes(meses[foco])}</p>
          {series.map((s, k) => (
            <p key={s.nome} className="flex items-center justify-between gap-3 text-stone-700 dark:text-slate-300">
              <span className="flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-sm ${s.legenda}`} />
                {s.nome}
              </span>
              <span className="font-semibold">{moeda(valores(meses[foco])[k])}</span>
            </p>
          ))}
          {series.length > 1 && (
            <p className="mt-1 flex justify-between border-t border-stone-200 pt-1 font-bold text-stone-900 dark:border-slate-700 dark:text-white">
              <span>Total</span>
              <span>{moeda(totais[foco])}</span>
            </p>
          )}
          {metas[foco] ? (
            <p className="flex justify-between text-stone-500 dark:text-slate-400">
              <span>Budget</span>
              <span>
                {moeda(metas[foco]!)} ({Math.round((totais[foco] / metas[foco]!) * 100)}%)
              </span>
            </p>
          ) : null}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-stone-600 dark:text-slate-400">
        {series.length > 1 &&
          series.map((s) => (
            <span key={s.nome} className="flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.legenda}`} />
              {s.nome}
            </span>
          ))}
        {meta && (
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-dashed border-stone-500 dark:border-slate-400" />
            Budget
          </span>
        )}
      </div>
    </div>
  );
}

export const SERIE_PRODUCAO: Serie = {
  nome: "Produção",
  classe: "fill-green-600 dark:fill-cyan-600",
  legenda: "bg-green-600 dark:bg-cyan-600",
};
export const SERIE_SERVICO: Serie = {
  nome: "Serviço",
  classe: "fill-violet-600 dark:fill-violet-500",
  legenda: "bg-violet-600 dark:bg-violet-500",
};
export const SERIE_PEDIDOS: Serie = {
  nome: "Entrada de pedidos",
  classe: "fill-green-600 dark:fill-cyan-600",
  legenda: "bg-green-600 dark:bg-cyan-600",
};
