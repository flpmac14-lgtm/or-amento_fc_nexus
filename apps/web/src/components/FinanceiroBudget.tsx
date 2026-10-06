"use client";

// Budget da aba Financeiro (veio do data/budget.json do DashboardIndustrial):
// meta de faturamento (R$) e % de custo de cada grupo sobre o faturamento,
// por mês — 12 meses pra trás + atual + 12 pra frente. Salva em
// financeiro_budget via PUT /api/financeiro (só flpmac14).

import { useState } from "react";
import { rotuloMes } from "@/components/FinanceiroGraficos";
import type { BudgetFinanceiro } from "@/lib/financeiro";

function mesesBudget(): string[] {
  const h = new Date();
  const saida: string[] = [];
  for (let i = -12; i <= 12; i++) {
    const d = new Date(h.getFullYear(), h.getMonth() + i, 1);
    saida.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return saida;
}

function abreviar(g: string): string {
  return g
    .replace("DESPESAS FIXAS", "Desp. fixas")
    .replace("CUSTOS DE FABRICAÇÃO", "C. fabric.")
    .replace("SERVIÇOS TERCEIRIZADOS", "Serv. terc.")
    .replace("PATRIMÔNIO", "Patrimônio")
    .replace("PESSOAL", "Pessoal")
    .replace("IMPOSTOS", "Impostos");
}

export default function FinanceiroBudget({
  budget,
  grupos,
  salvou,
}: {
  budget: BudgetFinanceiro;
  grupos: string[];
  salvou: (b: BudgetFinanceiro) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<BudgetFinanceiro>(budget);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  // Texto digitado nos % (pra "28," não virar "28" no meio da digitação).
  const [texto, setTexto] = useState<Record<string, string>>({});
  const meses = mesesBudget();
  const atual = meses[12];

  function abrir() {
    setRascunho(structuredClone(budget));
    setTexto({});
    setMsg("");
    setAberto((a) => !a);
  }

  function setFat(m: string, v: string) {
    setRascunho((b) => ({ ...b, faturamento: { ...b.faturamento, [m]: Number(v) || 0 } }));
  }

  function setPct(g: string, m: string, v: string) {
    setTexto((t) => ({ ...t, [`${g}|${m}`]: v }));
    setRascunho((b) => ({ ...b, custos_pct: { ...b.custos_pct, [g]: { ...(b.custos_pct[g] ?? {}), [m]: Number(v.replace(",", ".")) || 0 } } }));
  }

  async function salvar() {
    setSalvando(true);
    setMsg("");
    try {
      const r = await fetch("/api/financeiro", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rascunho),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
      salvou(j.budget);
      setMsg("✔ Budget salvo");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const campo =
    "w-full rounded border border-stone-300 bg-white px-1.5 py-0.5 text-right text-xs text-stone-900 outline-none focus:border-green-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-500";

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <button type="button" onClick={abrir} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-bold uppercase tracking-wide text-stone-700 dark:text-slate-300">📊 Budget (orçamento)</span>
        <span className="text-xs text-stone-500 dark:text-slate-400">{aberto ? "fechar ▲" : "editar ▼"}</span>
      </button>
      {aberto && (
        <div className="mt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-xs">
              <thead>
                <tr className="text-left text-stone-500 dark:text-slate-400">
                  <th className="py-1 pr-2">Mês</th>
                  <th className="pr-2">Faturamento (R$)</th>
                  {grupos.map((g) => (
                    <th key={g} className="pr-2">
                      {abreviar(g)} %
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meses.map((m) => (
                  <tr key={m} className={m === atual ? "bg-green-50 dark:bg-cyan-950/30" : ""}>
                    <td className="py-0.5 pr-2 font-semibold text-stone-700 dark:text-slate-300">{rotuloMes(m)}</td>
                    <td className="w-36 pr-2">
                      <input
                        inputMode="numeric"
                        className={campo}
                        value={rascunho.faturamento[m] ? String(rascunho.faturamento[m]) : ""}
                        onChange={(e) => setFat(m, e.target.value.replace(/\D/g, ""))}
                        placeholder="0"
                      />
                    </td>
                    {grupos.map((g) => (
                      <td key={g} className="w-24 pr-2">
                        <input
                          inputMode="decimal"
                          className={campo}
                          value={texto[`${g}|${m}`] ?? (rascunho.custos_pct[g]?.[m] ? String(rascunho.custos_pct[g][m]).replace(".", ",") : "")}
                          onChange={(e) => setPct(g, m, e.target.value.replace(/[^\d,.]/g, ""))}
                          placeholder="0"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950"
            >
              {salvando ? "Salvando…" : "💾 Salvar budget"}
            </button>
            {msg && <span className="text-sm text-stone-600 dark:text-slate-300">{msg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
