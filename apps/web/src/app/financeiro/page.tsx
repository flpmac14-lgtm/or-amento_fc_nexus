"use client";

// Financeiro — pedido explícito do usuário: os números do DashboardIndustrial
// (faturamento, custos e despesas, entrada de pedidos, NFs faturadas e o
// budget) dentro do app, SÓ pra conta flpmac14 (proxy.ts bloqueia a página;
// /api/financeiro confere de novo antes de mandar os dados).
// Fonte: resumo do ERP gravado a cada 15 min por
// services/calc_engine/scripts/sincronizar_financeiro.py.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import FinanceiroBudget from "@/components/FinanceiroBudget";
import FinanceiroNotas from "@/components/FinanceiroNotas";
import { GraficoBarras, SERIE_PEDIDOS, SERIE_PRODUCAO, SERIE_SERVICO, rotuloMes } from "@/components/FinanceiroGraficos";
import type { BudgetFinanceiro, RespostaFinanceiro } from "@/lib/financeiro";

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function Variacao({ atual, anterior, menorMelhor = false }: { atual: number; anterior: number; menorMelhor?: boolean }) {
  if (!anterior) return <span className="text-stone-400 dark:text-slate-500">sem base de comparação</span>;
  const d = ((atual - anterior) / anterior) * 100;
  const bom = menorMelhor ? d <= 0 : d >= 0;
  return (
    <span className={bom ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
      {d >= 0 ? "▲ +" : "▼ "}
      {d.toFixed(1).replace(".", ",")}% vs mês anterior
    </span>
  );
}

function Secao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700 dark:text-slate-300">{titulo}</h2>
      {sub && <p className="mb-3 text-xs text-stone-500 dark:text-slate-400">{sub}</p>}
      {children}
    </section>
  );
}

export default function PaginaFinanceiro() {
  const [dados, setDados] = useState<RespostaFinanceiro | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const buscar = useCallback(() => {
    fetch("/api/financeiro", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
        setDados(j);
        setErro("");
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    buscar();
    const id = setInterval(buscar, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [buscar]);

  function carregar() {
    setCarregando(true);
    buscar();
  }

  const resumo = dados?.resumo ?? null;
  const budget = dados?.budget ?? { faturamento: {}, custos_pct: {} };

  const fat = useCallback((m: string | undefined) => {
    const f = m ? resumo?.faturamento[m] : undefined;
    return f ? f.producao + f.servico : 0;
  }, [resumo]);

  function salvouBudget(b: BudgetFinanceiro) {
    setDados((d) => (d ? { ...d, budget: b } : d));
  }

  const meses = resumo?.meses ?? [];
  const n = meses.length;
  const [m0, m1, m2, m3] = [meses[n - 1], meses[n - 2], meses[n - 3], meses[n - 4]]; // atual, anterior, retrasado, 4º

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-slate-950">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 bg-white py-2 pl-16 pr-4 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-xl font-bold text-stone-900 dark:text-white">
          FC Nexus <span className="text-green-600 dark:text-cyan-400">·</span> Financeiro
        </h1>
        <span className="text-sm text-stone-500 dark:text-slate-400">
          {dados?.gerado_em
            ? `ERP lido às ${new Date(dados.gerado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · atualiza a cada 15 min`
            : carregando
              ? "carregando…"
              : ""}
        </span>
        <button
          type="button"
          onClick={carregar}
          className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800 hover:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-400"
        >
          ⟳ Atualizar
        </button>
        <div className="flex gap-2 lg:ml-auto">
          <Link href="/visao-geral" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Visão Geral
          </Link>
          <Link href="/" className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Orçamentos
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-4 p-4">
        {erro && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{erro}</div>
        )}
        {!resumo && !carregando && !erro && (
          <p className="py-10 text-center text-stone-500 dark:text-slate-400">Ainda não há resumo do ERP gravado.</p>
        )}

        {resumo && (
          <>
            {/* Faturamento: 3 meses mais recentes */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {[
                [m0, m1],
                [m1, m2],
                [m2, m3],
              ].map(([m, ant]) => {
                const f = resumo.faturamento[m];
                const meta = budget.faturamento[m];
                const total = fat(m);
                return (
                  <div key={m} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                      Faturamento {rotuloMes(m)}
                      {m === m0 && " (mês atual)"}
                    </p>
                    <p className="text-2xl font-black text-stone-900 dark:text-white">{moeda(total)}</p>
                    <p className="text-sm text-stone-600 dark:text-slate-400">
                      Produção {moeda(f?.producao ?? 0)} · Serviço {moeda(f?.servico ?? 0)}
                    </p>
                    {meta ? (
                      <p className="text-sm font-semibold text-stone-700 dark:text-slate-300">
                        Budget {moeda(meta)} · {((total / meta) * 100).toFixed(1).replace(".", ",")}%
                        {total >= meta ? " ✔" : ""}
                      </p>
                    ) : null}
                    <p className="text-xs">
                      <Variacao atual={total} anterior={fat(ant)} />
                    </p>
                  </div>
                );
              })}
            </div>

            <Secao titulo="Evolução do faturamento" sub="Últimos 13 meses · Produção + Serviço empilhados · linha tracejada = budget · passe o mouse nas barras">
              <GraficoBarras
                meses={meses}
                series={[SERIE_PRODUCAO, SERIE_SERVICO]}
                valores={(m) => [resumo.faturamento[m]?.producao ?? 0, resumo.faturamento[m]?.servico ?? 0]}
                meta={(m) => budget.faturamento[m]}
              />
            </Secao>

            <Secao titulo="Custos e despesas" sub="Três meses recentes · % sobre o faturamento do mês · budget do mês atual calculado sobre o faturamento realizado">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {resumo.grupos.map((g) => {
                  const v = (m: string | undefined) => (m ? (resumo.custos[m]?.[g] ?? 0) : 0);
                  const pctBud = budget.custos_pct[g]?.[m0];
                  const orcado = pctBud ? (pctBud * fat(m0)) / 100 : 0;
                  return (
                    <div key={g} className="rounded-lg border border-stone-200 p-3 dark:border-slate-700">
                      <p className="mb-2 text-xs font-bold uppercase text-stone-700 dark:text-slate-300">{g}</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          [m2, m3],
                          [m1, m2],
                          [m0, m1],
                        ].map(([m, ant]) => (
                          <div key={m}>
                            <p className="text-[11px] text-stone-500 dark:text-slate-400">{rotuloMes(m)}</p>
                            <p className="text-sm font-bold text-stone-900 dark:text-white">{moeda(v(m))}</p>
                            <p className="text-[11px] text-stone-500 dark:text-slate-400">
                              {fat(m) ? `${((v(m) / fat(m)) * 100).toFixed(1).replace(".", ",")}% fat.` : "—"}
                            </p>
                            <p className="text-[11px]">
                              <Variacao atual={v(m)} anterior={v(ant)} menorMelhor />
                            </p>
                          </div>
                        ))}
                      </div>
                      {pctBud ? (
                        <p className="mt-2 border-t border-stone-200 pt-1 text-[11px] text-stone-600 dark:border-slate-700 dark:text-slate-400">
                          Orçado {pctBud.toLocaleString("pt-BR")}% = {moeda(orcado)} ·{" "}
                          {orcado ? (
                            <span className={v(m0) <= orcado ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                              executado {Math.round((v(m0) / orcado) * 100)}% do orçado
                            </span>
                          ) : (
                            "sem faturamento no mês"
                          )}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Secao>

            <Secao titulo="Entrada de pedidos" sub="Últimos 13 meses, pela data do pedido">
              <GraficoBarras meses={meses} series={[SERIE_PEDIDOS]} valores={(m) => [resumo.entrada_pedidos[m] ?? 0]} altura={200} />
            </Secao>

            <FinanceiroNotas notas={resumo.notas ?? []} />

            <FinanceiroBudget budget={budget} grupos={resumo.grupos} salvou={salvouBudget} />
          </>
        )}
      </main>
    </div>
  );
}
