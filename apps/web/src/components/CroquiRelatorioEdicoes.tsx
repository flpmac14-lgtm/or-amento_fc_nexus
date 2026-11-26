"use client";

// Relatório das últimas edições do João e do Honório na Croqui de corte —
// pedido do usuário (26/11/2026), só a conta flpmac14 tira. A Croqui guarda
// só a ÚLTIMA edição de cada linha (editado_em / editado_por): se outra pessoa
// mexeu depois, a linha passa a contar pra ela.

import { useMemo, useState } from "react";
import type { ItemCroquiCorte } from "@/lib/types";

const PROJETISTAS: { login: string; nome: string }[] = [
  { login: "joao", nome: "João" },
  { login: "honorio", nome: "Honório" },
];

const classeCampo =
  "rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";

function diaIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function nomeDe(login: string | null): string {
  return PROJETISTAS.find((p) => p.login === login)?.nome ?? login ?? "";
}

function escapar(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function CroquiRelatorioEdicoes({ itens, fechar }: { itens: ItemCroquiCorte[]; fechar: () => void }) {
  const hoje = new Date();
  const [de, setDe] = useState(diaIso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6)));
  const [ate, setAte] = useState(diaIso(hoje));
  const [quem, setQuem] = useState<string>("");

  function atalho(dias: number) {
    const h = new Date();
    setDe(diaIso(new Date(h.getFullYear(), h.getMonth(), h.getDate() - (dias - 1))));
    setAte(diaIso(h));
  }

  const linhas = useMemo(() => {
    const ini = de ? new Date(`${de}T00:00:00`).getTime() : -Infinity;
    const fim = ate ? new Date(`${ate}T23:59:59.999`).getTime() : Infinity;
    const logins = quem ? [quem] : PROJETISTAS.map((p) => p.login);
    return itens
      .filter((i) => i.editado_em && i.editado_por && logins.includes(i.editado_por))
      .filter((i) => {
        const t = new Date(i.editado_em as string).getTime();
        return t >= ini && t <= fim;
      })
      .sort((a, b) => (b.editado_em as string).localeCompare(a.editado_em as string));
  }, [itens, de, ate, quem]);

  const totais = PROJETISTAS.map((p) => ({
    ...p,
    total: linhas.filter((i) => i.editado_por === p.login).length,
    feitos: linhas.filter((i) => i.editado_por === p.login && i.status === "Feito").length,
  }));

  const periodo = `${de ? de.split("-").reverse().join("/") : "início"} a ${ate ? ate.split("-").reverse().join("/") : "hoje"}`;

  function imprimir() {
    const corpo = linhas
      .map(
        (i) => `<tr><td>${dataHora(i.editado_em as string)}</td><td>${escapar(nomeDe(i.editado_por))}</td><td>${escapar(i.pedido)}</td>
<td>${escapar(i.mac)}</td><td>${escapar(i.descricao)}</td><td>${escapar(i.desenho)}</td><td>${escapar(i.status)}</td>
<td>${escapar(i.n_programa)}</td><td>${escapar(i.observacao)}</td></tr>`,
      )
      .join("");
    const resumo = totais
      .filter((t) => !quem || t.login === quem)
      .map((t) => `<b>${t.nome}:</b> ${t.total} edição(ões), ${t.feitos} em Feito`)
      .join(" &nbsp;·&nbsp; ");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Edições Croqui de corte ${periodo}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;margin:16px}h1{font-size:16px;margin:0 0 4px}
p{margin:2px 0 10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:3px 5px;text-align:left;vertical-align:top}
th{background:#1E3A5F;color:#fff}tr:nth-child(even) td{background:#f3f4f6}@page{size:A4 landscape;margin:10mm}</style></head><body>
<h1>Croqui de corte — últimas edições (João e Honório)</h1>
<p>Período: ${periodo} &nbsp;·&nbsp; ${resumo}</p>
<table><thead><tr><th>Data/hora</th><th>Quem</th><th>Pedido</th><th>Mac</th><th>Descrição</th><th>Desenho</th><th>Status</th><th>Nº programa</th><th>Observação</th></tr></thead>
<tbody>${corpo || '<tr><td colspan="9">Nenhuma edição no período.</td></tr>'}</tbody></table>
<p style="margin-top:8px;color:#666">Gerado em ${dataHora(new Date().toISOString())} — FC Nexus. Conta a última edição de cada linha.</p>
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  async function excel() {
    const XLSX = await import("xlsx");
    const dados = linhas.map((i) => ({
      "Data/hora": new Date(i.editado_em as string),
      Quem: nomeDe(i.editado_por),
      Pedido: i.pedido,
      Mac: i.mac ?? "",
      Descrição: i.descricao ?? "",
      Desenho: i.desenho ?? "",
      Status: i.status ?? "",
      "Nº programa": i.n_programa ?? "",
      Observação: i.observacao ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(dados, { cellDates: true, dateNF: "dd/mm/yyyy hh:mm" });
    ws["!cols"] = [18, 10, 22, 13, 40, 18, 14, 14, 40].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Edições");
    XLSX.writeFile(wb, `Edicoes croqui ${de || "inicio"} a ${ate || "hoje"}.xlsx`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={fechar}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl bg-white dark:bg-slate-900 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-slate-700 px-4 py-3">
          <h2 className="text-base font-semibold text-stone-900 dark:text-slate-100">Relatório de edições — João e Honório</h2>
          <button type="button" onClick={fechar} className="text-xl leading-none text-stone-500 hover:text-stone-800 dark:text-slate-400" aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="flex flex-col text-xs text-stone-600 dark:text-slate-400">
            De
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={classeCampo} />
          </label>
          <label className="flex flex-col text-xs text-stone-600 dark:text-slate-400">
            Até
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={classeCampo} />
          </label>
          <label className="flex flex-col text-xs text-stone-600 dark:text-slate-400">
            Projetista
            <select value={quem} onChange={(e) => setQuem(e.target.value)} className={classeCampo}>
              <option value="">Os dois</option>
              {PROJETISTAS.map((p) => (
                <option key={p.login} value={p.login}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-1">
            {[
              { r: "Hoje", d: 1 },
              { r: "7 dias", d: 7 },
              { r: "30 dias", d: 30 },
            ].map((a) => (
              <button
                key={a.r}
                type="button"
                onClick={() => atalho(a.d)}
                className="rounded-lg border border-stone-300 dark:border-slate-700 px-2.5 py-1.5 text-sm text-stone-700 dark:text-slate-300 hover:border-green-600 dark:hover:border-cyan-500"
              >
                {a.r}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={imprimir}
              className="rounded-lg bg-green-600 dark:bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 dark:hover:bg-cyan-500"
            >
              Imprimir / PDF
            </button>
            <button
              type="button"
              onClick={excel}
              className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-sm font-semibold text-stone-700 dark:text-slate-200 hover:border-green-600 dark:hover:border-cyan-500"
            >
              Excel
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 px-4 pb-3">
          {totais
            .filter((t) => !quem || t.login === quem)
            .map((t) => (
              <div key={t.login} className="rounded-lg border border-stone-200 dark:border-slate-700 px-3 py-2 text-sm text-stone-700 dark:text-slate-300">
                <strong className="text-stone-900 dark:text-slate-100">{t.nome}</strong>: {t.total} edição(ões) · {t.feitos} em Feito
              </div>
            ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-stone-100 dark:bg-slate-800 text-left text-xs text-stone-600 dark:text-slate-300">
              <tr>
                {["Data/hora", "Quem", "Pedido", "Mac", "Descrição", "Status", "Nº programa", "Observação"].map((h) => (
                  <th key={h} className="px-2 py-1.5 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((i) => (
                <tr key={i.id} className="border-b border-stone-100 dark:border-slate-800 text-stone-800 dark:text-slate-200">
                  <td className="whitespace-nowrap px-2 py-1">{dataHora(i.editado_em as string)}</td>
                  <td className="px-2 py-1">{nomeDe(i.editado_por)}</td>
                  <td className="whitespace-nowrap px-2 py-1 font-mono text-xs">{i.pedido}</td>
                  <td className="whitespace-nowrap px-2 py-1">{i.mac}</td>
                  <td className="max-w-[16rem] truncate px-2 py-1" title={i.descricao ?? ""}>
                    {i.descricao}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1">{i.status}</td>
                  <td className="px-2 py-1">{i.n_programa}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1" title={i.observacao ?? ""}>
                    {i.observacao}
                  </td>
                </tr>
              ))}
              {!linhas.length && (
                <tr>
                  <td colSpan={8} className="px-2 py-6 text-center text-stone-500 dark:text-slate-400">
                    Nenhuma edição do João ou do Honório nesse período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-stone-500 dark:text-slate-400">
            A Croqui guarda só a última edição de cada linha — se outra pessoa mexeu depois, a linha conta pra ela.
          </p>
        </div>
      </div>
    </div>
  );
}
