"use client";

// Financeiro na Visão Geral — pedido do usuário: embaixo da Usinagem, SÓ pra
// conta flpmac14 (a página só monta este bloco pra ela, e /api/financeiro
// confere de novo no servidor — ver lib/financeiro.ts). Resumo do mês atual:
// faturamento x budget, Produção x Serviço, mês anterior, entrada de pedidos,
// custos e os últimos 6 meses. Detalhes na aba /financeiro.

import { useEffect, useRef, useState } from "react";
import { Bloco } from "@/components/VisaoGeralComum";
import { compacto, rotuloMes } from "@/components/FinanceiroGraficos";
import { ROTA_FINANCEIRO, buscarFinanceiro, type RespostaFinanceiro } from "@/lib/financeiro";

// O resumo do ERP só muda a cada 15 min (scripts/sincronizar_financeiro.py):
// não relê a cada atualização da Visão Geral (egress do Supabase).
const RELER_APOS_MS = 15 * 60 * 1000;

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function pct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")}%`;
}

function Mini({ rotulo, valor, sub, subClasse = "" }: { rotulo: string; valor: string; sub?: React.ReactNode; subClasse?: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 dark:border-slate-700/70 dark:bg-slate-800/50">
      <p className="truncate text-[10px] font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">{rotulo}</p>
      <p className="truncate text-base font-black text-stone-900 dark:text-white">{valor}</p>
      {sub && <p className={`truncate text-[11px] text-stone-500 dark:text-slate-400 ${subClasse}`}>{sub}</p>}
    </div>
  );
}

export default function VisaoGeralFinanceiro({ tick }: { tick: number }) {
  const [dados, setDados] = useState<RespostaFinanceiro | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const lidoEm = useRef(0);
  // "Montado" num ref à parte: se o React desmontar e montar de novo o efeito
  // (StrictMode), a resposta da 1ª busca ainda vale — senão ficava preso em
  // "atualizando…" (bug de 07/10).
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (lidoEm.current && Date.now() - lidoEm.current < RELER_APOS_MS) return;
    lidoEm.current = Date.now();
    // sem_notas: a lista de NFs (~190 KB) só é usada na aba Financeiro.
    buscarFinanceiro(true)
      .then((j) => {
        if (montado.current) {
          setDados(j);
          setErro("");
        }
      })
      .catch((e: Error) => {
        lidoEm.current = 0;
        if (montado.current) setErro(e.message);
      })
      .finally(() => montado.current && setCarregando(false));
  }, [tick]);

  return (
    <Bloco
      titulo="💼 Financeiro"
      carregando={carregando && !dados}
      erro={erro}
      className="relative overflow-hidden ring-1 ring-emerald-400/60 dark:ring-emerald-500/40"
      extra={
        <>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600 dark:bg-slate-800 dark:text-slate-300" title="Só a sua conta vê este bloco">
            🔒 só você
          </span>
          <a href={ROTA_FINANCEIRO} className="font-semibold text-green-700 dark:text-cyan-300 hover:underline">
            abrir
          </a>
        </>
      }
    >
      {/* Faixa de destaque no topo do quadro. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />
      {!dados?.resumo && !carregando && !erro && <p className="text-sm text-stone-500 dark:text-slate-400">Ainda não há resumo do ERP gravado.</p>}
      {dados?.resumo && <ConteudoFinanceiro dados={dados} />}
    </Bloco>
  );
}

/** O que o bloco mostra (separado do carregamento, pra dar pra testar com dados reais). */
export function ConteudoFinanceiro({ dados }: { dados: RespostaFinanceiro }) {
  const resumo = dados?.resumo ?? null;
  const budget = dados?.budget ?? { faturamento: {}, custos_pct: {} };
  const meses = resumo?.meses ?? [];
  const m0 = meses[meses.length - 1];
  const m1 = meses[meses.length - 2];
  const fat = (m?: string) => {
    const f = m ? resumo?.faturamento[m] : undefined;
    return f ? f.producao + f.servico : 0;
  };
  const custos = (m?: string) => Object.values((m && resumo?.custos[m]) || {}).reduce((t, v) => t + v, 0);

  const total = fat(m0);
  const meta = m0 ? budget.faturamento[m0] : undefined;
  const f0 = m0 ? resumo?.faturamento[m0] : undefined;
  const ultimos = meses.slice(-6);
  const maxBarra = Math.max(1, ...ultimos.map((m) => Math.max(fat(m), budget.faturamento[m] ?? 0)));
  const metaAnt = m1 ? budget.faturamento[m1] : undefined;

  if (!resumo || !m0) return null;
  return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
          {/* Faturamento do mês x budget */}
          <div className="shrink-0 rounded-lg bg-gradient-to-br from-emerald-50 to-cyan-50 p-2.5 dark:from-emerald-950/40 dark:to-cyan-950/30">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Faturamento {rotuloMes(m0)}</p>
              {meta ? (
                <p className={`text-xs font-black ${total >= meta ? "text-green-700 dark:text-green-400" : "text-stone-700 dark:text-slate-200"}`}>
                  {pct((total / meta) * 100)} da meta{total >= meta ? " ✔" : ""}
                </p>
              ) : null}
            </div>
            <p className="text-2xl font-black leading-tight text-stone-900 dark:text-white">{moeda(total)}</p>
            {meta ? (
              <div className="mt-1">
                <div className="h-2.5 overflow-hidden rounded-full bg-white/80 dark:bg-slate-800" title={`Meta ${moeda(meta)}`}>
                  <div
                    className={`h-full rounded-full ${total >= meta ? "bg-green-600" : "bg-gradient-to-r from-emerald-500 to-cyan-500"}`}
                    style={{ width: `${Math.min(100, (total / meta) * 100)}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-stone-600 dark:text-slate-400">
                  meta {moeda(meta)} · {total >= meta ? `passou ${moeda(total - meta)}` : `faltam ${moeda(meta - total)}`}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-stone-500 dark:text-slate-400">sem meta (budget) pro mês</p>
            )}
            <p className="mt-1 text-[11px] text-stone-700 dark:text-slate-300">
              <span className="font-semibold">Produção</span> {moeda(f0?.producao ?? 0)} · <span className="font-semibold">Serviço</span> {moeda(f0?.servico ?? 0)}
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-1.5">
            <Mini
              rotulo={`Fat. ${rotuloMes(m1 ?? "")}`}
              valor={compacto(fat(m1))}
              sub={metaAnt ? `${pct((fat(m1) / metaAnt) * 100)} da meta` : "mês anterior"}
              subClasse={metaAnt ? (fat(m1) >= metaAnt ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400") : ""}
            />
            <Mini rotulo="Pedidos no mês" valor={compacto(resumo.entrada_pedidos[m0] ?? 0)} sub={`ant. ${compacto(resumo.entrada_pedidos[m1 ?? ""] ?? 0)}`} />
            <Mini rotulo="Custos no mês" valor={compacto(custos(m0))} sub={total ? `${pct((custos(m0) / total) * 100)} do fat.` : "—"} />
          </div>

          {/* Últimos 6 meses: barra = faturamento, traço = meta */}
          <div className="flex min-h-[4.5rem] flex-1 flex-col rounded-lg border border-stone-200 px-2 py-1.5 dark:border-slate-700/70">
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">Últimos 6 meses · traço = meta</p>
            <div className="flex flex-1 items-end gap-1.5 pt-1">
              {ultimos.map((m) => {
                const v = fat(m);
                const mt = budget.faturamento[m];
                const atual = m === m0;
                return (
                  <div key={m} className="flex flex-1 flex-col items-center gap-0.5" title={`${rotuloMes(m)}: ${moeda(v)}${mt ? ` · meta ${moeda(mt)}` : ""}`}>
                    <span className="text-[9px] font-bold text-stone-700 dark:text-slate-300">{compacto(v)}</span>
                    <div className="relative flex h-12 w-full items-end">
                      {mt ? <div className="absolute inset-x-0 border-t-2 border-dashed border-stone-500 dark:border-slate-300" style={{ bottom: `${(mt / maxBarra) * 100}%` }} /> : null}
                      <div
                        className={`w-full rounded-t ${atual ? "bg-gradient-to-t from-emerald-600 to-cyan-500" : mt && v >= mt ? "bg-emerald-400 dark:bg-emerald-600" : "bg-stone-300 dark:bg-slate-600"}`}
                        style={{ height: `${Math.max(2, (v / maxBarra) * 100)}%` }}
                      />
                    </div>
                    <span className={`text-[9px] uppercase ${atual ? "font-bold text-stone-800 dark:text-slate-100" : "text-stone-500 dark:text-slate-400"}`}>{rotuloMes(m)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {dados?.gerado_em && (
            <p className="shrink-0 text-right text-[10px] text-stone-400 dark:text-slate-500">
              ERP lido {new Date(dados.gerado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </p>
          )}
        </div>
      
  );
}
