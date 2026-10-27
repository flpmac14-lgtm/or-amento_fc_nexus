"use client";

// Canal de Escuta — pedido do usuário (26/10/2026): os relatos anônimos do
// formulário do site (macfab.com.br/canal-de-escuta) com a mensagem completa,
// um relatório (totais por assunto, setor, frequência…) e a tratativa do RH
// (status + observação). Só o flpmac14 (dados: app/api/canal-escuta).
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  ASSUNTOS,
  FREQUENCIAS,
  SETORES,
  STATUS_RELATO,
  semDetalheOutro,
  type RelatoCanalEscuta,
  type StatusRelato,
} from "@/lib/canalEscuta";
import { podeVerFinanceiro } from "@/lib/financeiro";
import { formatarDataBr } from "@/lib/format";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

const COR_STATUS: Record<StatusRelato, string> = {
  Novo: "bg-red-600 text-white",
  "Em análise": "bg-amber-500 text-stone-900",
  Concluído: "bg-green-600 text-white",
  Arquivado: "bg-stone-400 text-white dark:bg-slate-600",
};

const CAMPO =
  "rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200";
const CARTAO = "rounded-xl border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/60";

function Selo({ status }: { status: StatusRelato }) {
  return <span className={`whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-bold uppercase ${COR_STATUS[status]}`}>{status}</span>;
}

function contar(valores: string[]) {
  const m = new Map<string, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Barras({ titulo, pares }: { titulo: string; pares: [string, number][] }) {
  const max = Math.max(1, ...pares.map((p) => p[1]));
  return (
    <section className={CARTAO}>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">{titulo}</h3>
      {pares.length === 0 && <p className="text-sm text-stone-400">Sem dados</p>}
      <div className="flex flex-col gap-2">
        {pares.map(([rotulo, n]) => (
          <div key={rotulo} className="grid grid-cols-[minmax(0,10rem)_1fr_2rem] items-center gap-2 text-sm">
            <span className="truncate text-stone-700 dark:text-slate-300" title={rotulo}>
              {rotulo}
            </span>
            <span className="h-3 overflow-hidden rounded bg-stone-100 dark:bg-slate-800">
              <span className="block h-full rounded bg-green-600 dark:bg-cyan-500" style={{ width: `${(n / max) * 100}%` }} />
            </span>
            <span className="text-right font-mono font-bold text-stone-900 dark:text-white">{n}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Bloco({ titulo, texto }: { titulo: string; texto: string | null }) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">{titulo}</p>
      <p className="whitespace-pre-wrap break-words rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
        {texto || "—"}
      </p>
    </div>
  );
}

// Planilha pro Excel (CSV com ; e BOM, que o Excel em português abre direto).
function exportarCsv(relatos: RelatoCanalEscuta[]) {
  const cab = ["Nº", "Data", "Setor", "Assunto", "Frequência", "Impacta", "O que relatou", "Onde / situação", "Sugestão", "Status", "Observações do RH"];
  const celula = (v: unknown) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // não vira fórmula no Excel
    return `"${s.replace(/"/g, '""')}"`;
  };
  const linhas = relatos.map((r) =>
    [r.numero, formatarDataBr(r.data), r.setor, r.assuntos.join("; "), r.frequencia, r.impactos.join("; "), r.relato, r.onde, r.sugestao, r.status, r.observacoes_rh]
      .map(celula)
      .join(";"),
  );
  const blob = new Blob(["﻿" + [cab.map(celula).join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `canal-de-escuta-${new Date().toLocaleDateString("en-CA")}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PaginaCanalEscuta() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [relatos, setRelatos] = useState<RelatoCanalEscuta[] | null>(null);
  const [erro, setErro] = useState("");
  const [aba, setAba] = useState<"relatos" | "relatorio">("relatos");
  const [filtro, setFiltro] = useState({ de: "", ate: "", status: "", setor: "", assunto: "", busca: "" });
  const [aberto, setAberto] = useState<RelatoCanalEscuta | null>(null);
  const [edicao, setEdicao] = useState<{ status: StatusRelato; obs: string }>({ status: "Novo", obs: "" });
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => setAdmin(podeVerFinanceiro(data.user?.email)));
  }, []);

  function carregar() {
    fetch("/api/canal-escuta", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
        setRelatos(j.relatos);
        setErro("");
      })
      .catch((e: Error) => setErro(e.message));
  }

  useEffect(() => {
    if (admin) carregar();
  }, [admin]);

  // Período vale pra tudo (cartões e relatório); os outros filtros, só pra lista.
  const doPeriodo = useMemo(
    () => (relatos ?? []).filter((r) => (!filtro.de || r.data >= filtro.de) && (!filtro.ate || r.data <= filtro.ate)),
    [relatos, filtro.de, filtro.ate],
  );
  const lista = useMemo(() => {
    const busca = filtro.busca.trim().toLowerCase();
    return doPeriodo.filter(
      (r) =>
        (!filtro.status || r.status === filtro.status) &&
        (!filtro.setor || (r.setor ?? "").startsWith(filtro.setor)) &&
        (!filtro.assunto || r.assuntos.some((a) => semDetalheOutro(a) === filtro.assunto)) &&
        (!busca || [r.relato, r.onde, r.sugestao, r.observacoes_rh].some((t) => (t ?? "").toLowerCase().includes(busca))),
    );
  }, [doPeriodo, filtro]);
  const porStatus = useMemo(() => Object.fromEntries(STATUS_RELATO.map((s) => [s, doPeriodo.filter((r) => r.status === s).length])), [doPeriodo]);

  function abrir(r: RelatoCanalEscuta) {
    setAberto(r);
    // Abrir um relato novo já sugere "Em análise" (só grava ao Salvar).
    setEdicao({ status: r.status === "Novo" ? "Em análise" : r.status, obs: r.observacoes_rh ?? "" });
  }

  async function salvar() {
    if (!aberto) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/canal-escuta", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero: aberto.numero, status: edicao.status, observacoes_rh: edicao.obs }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
      setRelatos((atual) => (atual ?? []).map((x) => (x.numero === j.relato.numero ? j.relato : x)));
      setAberto(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const filtroCampo = (campo: keyof typeof filtro) => ({
    value: filtro[campo],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFiltro((f) => ({ ...f, [campo]: e.target.value })),
  });

  return (
    <AppShell
      titulo="Canal de Escuta"
      subtitulo="Relatos anônimos dos colaboradores"
      acoes={
        admin &&
        relatos && (
          <button
            type="button"
            onClick={() => exportarCsv(lista)}
            className="rounded-lg bg-green-700 px-3 py-1.5 text-sm font-bold text-white hover:bg-green-600 dark:bg-cyan-600 dark:hover:bg-cyan-500"
          >
            Exportar Excel
          </button>
        )
      }
    >
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:px-6">
        {admin === false && <p className="rounded-lg bg-red-50 p-4 text-red-700">Esta tela é só para o administrador.</p>}
        {admin && (
          <>
            <p className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Conteúdo sigiloso. Os relatos são anônimos: não guardamos IP, e-mail nem horário do envio, só a data.
            </p>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(
                [
                  ["Relatos no período", doPeriodo.length, "border-l-stone-400"],
                  ["Novos (não lidos)", porStatus["Novo"], "border-l-red-500"],
                  ["Em análise", porStatus["Em análise"], "border-l-amber-500"],
                  ["Concluídos", porStatus["Concluído"], "border-l-green-600"],
                ] as const
              ).map(([rotulo, n, cor]) => (
                <div key={rotulo} className={`rounded-xl border border-l-8 border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/60 ${cor}`}>
                  <p className="font-mono text-3xl font-extrabold text-stone-900 dark:text-white">{relatos ? n : "–"}</p>
                  <p className="text-xs text-stone-500 dark:text-slate-400">{rotulo}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-stone-500 dark:text-slate-400">
                De <input type="date" className={CAMPO} {...filtroCampo("de")} />
              </label>
              <label className="flex items-center gap-1 text-xs text-stone-500 dark:text-slate-400">
                até <input type="date" className={CAMPO} {...filtroCampo("ate")} />
              </label>
              {aba === "relatos" && (
                <>
                  <select className={CAMPO} {...filtroCampo("status")}>
                    <option value="">Todos os status</option>
                    {STATUS_RELATO.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <select className={CAMPO} {...filtroCampo("setor")}>
                    <option value="">Todos os setores</option>
                    {SETORES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <select className={CAMPO} {...filtroCampo("assunto")}>
                    <option value="">Todos os assuntos</option>
                    {ASSUNTOS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <input type="search" placeholder="Buscar no texto…" className={`${CAMPO} min-w-0 flex-1 sm:max-w-xs`} {...filtroCampo("busca")} />
                </>
              )}
              <button
                type="button"
                onClick={carregar}
                className="ml-auto rounded-full border-2 border-stone-300 px-3 py-1 text-sm font-semibold text-stone-700 dark:border-slate-600 dark:text-slate-300"
              >
                ↻ Atualizar
              </button>
            </div>

            <div className="flex gap-1 border-b-2 border-stone-200 dark:border-slate-800">
              {(
                [
                  ["relatos", "Relatos"],
                  ["relatorio", "Relatório"],
                ] as const
              ).map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAba(v)}
                  className={`-mb-0.5 border-b-4 px-4 py-2 text-sm font-bold ${
                    aba === v ? "border-green-600 text-stone-900 dark:border-cyan-500 dark:text-white" : "border-transparent text-stone-500 dark:text-slate-400"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
            {!relatos && !erro && <p className="py-10 text-center text-stone-500">Carregando…</p>}

            {relatos && aba === "relatos" && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold text-stone-700 dark:text-slate-300">{lista.length} relato(s)</p>
                {lista.length === 0 && <p className="py-8 text-center text-stone-500">Nenhum relato.</p>}
                {lista.map((r) => (
                  <button
                    key={r.numero}
                    type="button"
                    onClick={() => abrir(r)}
                    className={`flex flex-col gap-1 rounded-lg border bg-white px-3 py-2 text-left hover:border-green-600 dark:bg-slate-900/50 dark:hover:border-cyan-500 ${
                      r.status === "Novo" ? "border-red-300 dark:border-red-900" : "border-stone-200 dark:border-slate-800"
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-mono text-xs text-stone-500 dark:text-slate-400">nº {r.numero}</span>
                      <span className="font-mono text-xs font-semibold text-stone-700 dark:text-slate-300">{formatarDataBr(r.data)}</span>
                      <Selo status={r.status} />
                      <span className="font-bold text-stone-900 dark:text-white">{r.setor}</span>
                      <span className="text-stone-600 dark:text-slate-300">{r.assuntos.join(" · ")}</span>
                      {r.frequencia && <span className="text-xs text-stone-500 dark:text-slate-400">({r.frequencia})</span>}
                    </span>
                    <span className={`line-clamp-2 text-sm text-stone-600 dark:text-slate-400 ${r.status === "Novo" ? "font-semibold" : ""}`}>{r.relato}</span>
                  </button>
                ))}
              </div>
            )}

            {relatos && aba === "relatorio" && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Barras titulo="Por assunto" pares={contar(doPeriodo.flatMap((r) => r.assuntos.map(semDetalheOutro)))} />
                <Barras titulo="Por setor" pares={contar(doPeriodo.map((r) => semDetalheOutro(r.setor ?? "Prefiro não informar")))} />
                <Barras titulo="Por frequência" pares={FREQUENCIAS.map((f) => [f, doPeriodo.filter((r) => r.frequencia === f).length])} />
                <Barras titulo="O que impacta" pares={contar(doPeriodo.flatMap((r) => r.impactos.map(semDetalheOutro)))} />
                <Barras
                  titulo="Por mês"
                  pares={contar(doPeriodo.map((r) => r.data.slice(0, 7)))
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([m, n]) => [m.split("-").reverse().join("/"), n])}
                />
                <Barras titulo="Por status" pares={STATUS_RELATO.map((s) => [s, porStatus[s]])} />
              </div>
            )}
          </>
        )}
      </main>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={() => setAberto(null)}>
          <div
            className="flex max-h-[92vh] w-full max-w-3xl flex-col gap-3 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-white">Relato nº {aberto.numero}</h2>
              <button type="button" onClick={() => setAberto(null)} className="text-2xl leading-none text-stone-400 hover:text-stone-700" aria-label="Fechar">
                ×
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {(
                [
                  ["Data", formatarDataBr(aberto.data)],
                  ["Setor", aberto.setor],
                  ["Frequência", aberto.frequencia],
                  ["Assunto", aberto.assuntos.join("; ")],
                  ["Impacta", aberto.impactos.join("; ")],
                ] as const
              ).map(([t, v]) => (
                <div key={t}>
                  <dt className="text-[11px] uppercase tracking-wide text-stone-500 dark:text-slate-400">{t}</dt>
                  <dd className="font-semibold text-stone-900 dark:text-slate-100">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <Bloco titulo="O que relatou" texto={aberto.relato} />
            <Bloco titulo="Onde / em que situação" texto={aberto.onde} />
            <Bloco titulo="Sugestão de melhoria" texto={aberto.sugestao} />

            <div className="mt-1 flex flex-col gap-3 border-t border-stone-200 pt-3 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">Status</span>
                {STATUS_RELATO.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEdicao((e) => ({ ...e, status: s }))}
                    className={`rounded-full border-2 px-3 py-1 text-sm font-bold ${
                      edicao.status === s ? "border-transparent " + COR_STATUS[s] : "border-stone-300 text-stone-600 dark:border-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">Observações do RH</span>
                <textarea
                  rows={4}
                  value={edicao.obs}
                  onChange={(e) => setEdicao((x) => ({ ...x, obs: e.target.value }))}
                  placeholder="Tratativa, encaminhamentos, retorno dado…"
                  className={CAMPO}
                />
              </label>
              {aberto.atualizado_em && (
                <p className="text-xs text-stone-500 dark:text-slate-400">
                  Última alteração: {new Date(aberto.atualizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAberto(null)} className="rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 dark:border-slate-600 dark:text-slate-300">
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={salvar}
                  className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-600 disabled:opacity-60 dark:bg-cyan-600 dark:hover:bg-cyan-500"
                >
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
