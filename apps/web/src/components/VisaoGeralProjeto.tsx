"use client";

// Projeto na Visão Geral (pedido do usuário: "o que o João e o Honório estão
// apontando"): o que cada projetista marcou na Croqui de corte —
// GET /painel/projeto (app/painel.py::projeto). Rende dois blocos lado a lado
// (uma busca só), como o Corte: o que cada um está fazendo agora e os apontamentos.

import { Bloco, Numero, Vazio, useBloco } from "@/components/VisaoGeralComum";
import { minutosUteis } from "@/lib/jornada";
import { ddmm, duracao, horaMinuto, linkObra, type Projetista, type RespostaProjeto } from "@/lib/painel";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const COR_STATUS: Record<string, string> = {
  Feito: "text-green-700 dark:text-green-400",
  "Sem Corte": "text-stone-500 dark:text-slate-400",
  Estoque: "text-sky-700 dark:text-sky-300",
};

function diaLocal(v: string | Date): string {
  return new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Cartao({ p }: { p: Projetista }) {
  const max = Math.max(1, ...p.por_dia.map((d) => d.n));
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-stone-50 dark:bg-slate-800/50 p-2">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-black text-white dark:bg-cyan-500 dark:text-slate-950">
          {p.projetista.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-base font-black text-stone-900 dark:text-white">{p.projetista}</p>
          <p className="truncate text-[11px] text-stone-500 dark:text-slate-400">
            {p.fazendo.length > 0 ? (
              <span className="font-semibold text-amber-700 dark:text-amber-300">fazendo {p.fazendo.length} pedido(s)</span>
            ) : (
              "nada em “Fazendo”"
            )}
          </p>
        </div>
        <div className="text-right leading-tight" title={Object.entries(p.hoje_por_status).map(([s, n]) => `${s}: ${n}`).join("\n")}>
          <p className="text-2xl font-black text-stone-900 dark:text-white">{p.hoje}</p>
          <p className="text-[10px] uppercase text-stone-500 dark:text-slate-400">hoje · {p.semana} sem.</p>
        </div>
        <div className="flex h-9 items-end gap-0.5" title="Pedidos apontados por dia (7 dias)">
          {p.por_dia.map((d, i) => {
            const [a, m, dia] = d.data.split("-").map(Number);
            return (
              <div
                key={d.data}
                title={`${DIAS[new Date(a, m - 1, dia).getDay()]} ${ddmm(d.data)}: ${d.n}`}
                className={`w-2 rounded-t ${i === p.por_dia.length - 1 ? "bg-green-600 dark:bg-cyan-400" : "bg-green-300 dark:bg-cyan-800"}`}
                style={{ height: `${Math.max(2, (d.n / max) * 36)}px` }}
              />
            );
          })}
        </div>
      </div>

      <ul className="flex flex-col">
        {p.recentes.length === 0 && <Vazio>Nenhum apontamento ainda.</Vazio>}
        {p.recentes.map((g) => (
          <li key={g.obra + g.em} className="flex items-center gap-1.5 border-t border-stone-200/70 dark:border-slate-700/60 py-0.5 text-xs">
            <a href={linkObra(g.obra)} target="_blank" rel="noreferrer" className="w-14 shrink-0 font-bold text-stone-900 dark:text-white hover:underline">
              {g.obra}
            </a>
            <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-slate-300" title={`${g.descricao ?? ""}\nProgramas: ${g.programas.join(", ") || "—"}`}>
              {g.descricao ?? "—"}
            </span>
            <span className="shrink-0">
              {Object.entries(g.status).map(([s, n]) => (
                <span key={s} className={`ml-1 font-semibold ${COR_STATUS[s] ?? ""}`}>
                  {n} {s.toLowerCase()}
                </span>
              ))}
            </span>
            <span className="w-16 shrink-0 text-right text-stone-500 dark:text-slate-400">
              {diaLocal(g.em) === diaLocal(new Date()) ? horaMinuto(g.em) : diaLocal(g.em)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function hoje(v: string): boolean {
  return diaLocal(v) === diaLocal(new Date());
}

/** "há 25 min" se começou hoje, senão "desde 02/10 14:30". */
function desde(v: string | null): string {
  if (!v) return "";
  if (!hoje(v)) return `desde ${diaLocal(v)} ${horaMinuto(v)}`;
  return `há ${duracao(minutosUteis(v))}`; // só a jornada (lib/jornada.ts)
}

/** Linha de um projetista no bloco "agora": o que está em "Fazendo". */
function Agora({ p }: { p: Projetista }) {
  const ativo = p.fazendo.length > 0;
  return (
    <div
      className={`flex flex-col gap-1 rounded-lg border px-2 py-1.5 ${
        ativo ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30" : "border-stone-200 dark:border-slate-700"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-3 w-3 shrink-0">
          {ativo && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-60" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${ativo ? "bg-amber-500" : "bg-stone-300 dark:bg-slate-600"}`} />
        </span>
        <span className="text-base font-black text-stone-900 dark:text-white">{p.projetista}</span>
        <span className="ml-auto text-xs text-stone-500 dark:text-slate-400">
          {ativo ? `fazendo ${p.fazendo.length} pedido(s)` : "nada em “Fazendo”"}
        </span>
      </div>
      {p.fazendo.map((f) => (
        <div key={f.pedido} className="flex items-center gap-1.5 text-xs">
          <a href={linkObra(f.obra)} target="_blank" rel="noreferrer" className="rounded bg-white dark:bg-slate-800 px-1.5 text-[11px] font-semibold text-stone-700 dark:text-slate-300 hover:underline">
            {f.obra}
          </a>
          <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-slate-300" title={`${f.descricao ?? ""}
Pedido ${f.pedido}${f.programa ? ` · programa ${f.programa}` : ""}`}>
            {f.descricao ?? f.pedido}
          </span>
          <span className="shrink-0 font-semibold text-amber-800 dark:text-amber-200">{desde(f.desde)}</span>
        </div>
      ))}
    </div>
  );
}

export default function VisaoGeralProjeto({ tick }: { tick: number }) {
  const { dados, erro, carregando } = useBloco<RespostaProjeto>("projeto", {}, tick);
  const ps = dados?.projetistas ?? [];
  const totalHoje = ps.reduce((t, p) => t + p.hoje, 0);
  const totalSemana = ps.reduce((t, p) => t + p.semana, 0);
  const porDia = (ps[0]?.por_dia ?? []).map((d, i) => ({ data: d.data, n: ps.reduce((t, p) => t + (p.por_dia[i]?.n ?? 0), 0) }));
  const maxDia = Math.max(1, ...porDia.map((d) => d.n));
  return (
    <>
      <Bloco titulo="📐 Projeto — agora" carregando={carregando} erro={erro} extra={<span className="text-stone-500 dark:text-slate-400">Croqui de corte</span>}>
        {dados && (
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
            <div className="grid shrink-0 grid-cols-[1fr_1fr_1.3fr] gap-2">
              <Numero rotulo="Hoje" valor={totalHoje} sub="pedidos apontados" />
              <Numero rotulo="Semana" valor={totalSemana} sub="pedidos apontados" />
              <div className="flex flex-col rounded-lg bg-stone-50 dark:bg-slate-800/60 px-3 py-1.5" title="Pedidos apontados por dia">
                <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">Últimos 7 dias</p>
                <div className="flex flex-1 items-end gap-1 pt-1">
                  {porDia.map((d, i) => {
                    const [a, m, dia] = d.data.split("-").map(Number);
                    return (
                      <div key={d.data} className="flex flex-1 flex-col items-center gap-0.5" title={`${ddmm(d.data)}: ${d.n} pedido(s)`}>
                        <span className="text-[10px] font-bold text-stone-700 dark:text-slate-300">{d.n || ""}</span>
                        <div
                          className={`w-full rounded-t ${i === porDia.length - 1 ? "bg-green-600 dark:bg-cyan-400" : "bg-green-300 dark:bg-cyan-800"}`}
                          style={{ height: `${Math.max(2, (d.n / maxDia) * 26)}px` }}
                        />
                        <span className="text-[9px] uppercase text-stone-500 dark:text-slate-400">{DIAS[new Date(a, m - 1, dia).getDay()]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {ps.length === 0 && <Vazio>Nenhum projetista apontado na Croqui.</Vazio>}
            {ps.map((p) => <Agora key={p.projetista} p={p} />)}
          </div>
        )}
      </Bloco>
      <Bloco titulo="📐 Projeto — apontamentos" carregando={carregando} erro={erro} extra={<span className="text-stone-500 dark:text-slate-400">por projetista</span>}>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
          {dados && ps.length === 0 && <Vazio>Nenhum projetista apontado na Croqui.</Vazio>}
          {ps.map((p) => <Cartao key={p.projetista} p={p} />)}
        </div>
      </Bloco>
    </>
  );
}
