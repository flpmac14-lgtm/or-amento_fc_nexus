"use client";

// Corte a laser recente na Visão Geral (pedido do usuário: "painel bonito do
// histórico de corte"). Fonte: as marcações do operador na aba Corte —
// GET /painel/corte (app/painel.py::corte_recente). Rende dois blocos lado a
// lado (uma busca só): o laser agora e os "Cortados" por operador.

import { Bloco, Numero, Vazio, useBloco } from "@/components/VisaoGeralComum";
import { ddmm, duracao, horaMinuto, linkObra, type OperadorCorte, type ProgramaCorte, type RespostaCorte } from "@/lib/painel";
import { minutosUteis } from "@/lib/jornada";
import { MAQUINAS, infoMaquina } from "@/lib/maquinaCorte";
import type { ContagemCorte } from "@/lib/painel";

// Pedido do usuário: separar Laser (4 algarismos) e Oxicorte (3) — a máquina
// vem do servidor (o operador pode trocar na aba Corte).
function subContagem(c: ContagemCorte): string {
  return `⚡ ${c.laser.programas} · 🔥 ${c.oxicorte.programas} · ${c.pecas.toLocaleString("pt-BR")} peças`;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "02/10" no fuso de quem está vendo (o servidor manda o horário em UTC). */
function diaLocal(v: string | Date): string {
  return new Date(v).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Só a jornada da fábrica (lib/jornada.ts), não relógio corrido.
function minutosDesde(iso: string | null): number | null {
  return iso ? minutosUteis(iso) : null;
}

function Obras({ obras }: { obras: string[] }) {
  if (obras.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {obras.slice(0, 3).map((o) => (
        <a
          key={o}
          href={linkObra(o)}
          target="_blank"
          rel="noreferrer"
          className="rounded bg-stone-100 dark:bg-slate-800 px-1.5 text-[11px] font-semibold text-stone-700 dark:text-slate-300 hover:underline"
        >
          {o}
        </a>
      ))}
      {obras.length > 3 && <span className="text-[11px] text-stone-500">+{obras.length - 3}</span>}
    </span>
  );
}

function EmCorte({ p, falta }: { p: ProgramaCorte; falta?: boolean }) {
  const min = minutosDesde(falta ? p.falta_material_em : p.cortando_em);
  return (
    <div
      className={`flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg border px-2 py-1 ${
        falta ? "border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-950/30" : "border-green-300 bg-green-50 dark:border-cyan-500/40 dark:bg-cyan-950/30"
      }`}
    >
      <span className="relative flex h-3 w-3 shrink-0">
        {!falta && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60 dark:bg-cyan-400" />}
        <span className={`relative inline-flex h-3 w-3 rounded-full ${falta ? "bg-red-500" : "bg-green-500 dark:bg-cyan-400"}`} />
      </span>
      <span className="text-base font-black text-stone-900 dark:text-white" title={infoMaquina(p.maquina).rotulo}>
        {infoMaquina(p.maquina).icone} {p.programa}
      </span>
      <Obras obras={p.obras} />
      <span className="ml-auto whitespace-nowrap text-right text-xs leading-tight text-stone-600 dark:text-slate-300">
        <span className="font-semibold">{falta ? "falta material" : p.cortando_por ?? "—"}</span>
        <br />
        {falta ? `desde ${horaMinuto(p.falta_material_em!)}` : `há ${duracao(min)}`}
      </span>
    </div>
  );
}

/** Cartão de um operador no bloco "Cortados" — mesmo formato do Projeto. */
function CartaoOperador({ o }: { o: OperadorCorte }) {
  const max = Math.max(1, ...o.por_dia.map((d) => d.programas));
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-stone-50 dark:bg-slate-800/50 p-2">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-black text-white dark:bg-cyan-500 dark:text-slate-950">
          {o.operador.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-base font-black text-stone-900 dark:text-white">{o.operador}</p>
          <p className="truncate text-[11px] text-stone-500 dark:text-slate-400">
            {o.minutos_hoje > 0 ? `${duracao(o.minutos_hoje)} cortando hoje` : "nada finalizado hoje"}
          </p>
        </div>
        <div className="text-right leading-tight">
          <p className="text-2xl font-black text-stone-900 dark:text-white">{o.hoje}</p>
          <p className="text-[10px] uppercase text-stone-500 dark:text-slate-400">hoje · {o.semana} sem.</p>
        </div>
        <div className="flex h-9 items-end gap-0.5" title="Programas finalizados por dia (7 dias)">
          {o.por_dia.map((d, i) => {
            const [a, m, dia] = d.data.split("-").map(Number);
            return (
              <div
                key={d.data}
                title={`${DIAS[new Date(a, m - 1, dia).getDay()]} ${ddmm(d.data)}: ${d.programas}`}
                className={`w-2 rounded-t ${i === o.por_dia.length - 1 ? "bg-green-600 dark:bg-cyan-400" : "bg-green-300 dark:bg-cyan-800"}`}
                style={{ height: `${Math.max(2, (d.programas / max) * 36)}px` }}
              />
            );
          })}
        </div>
      </div>

      <ul className="flex flex-col">
        {o.recentes.map((p) => (
          <li key={p.programa} className="flex items-center gap-1.5 border-t border-stone-200/70 dark:border-slate-700/60 py-0.5 text-xs">
            <span className="text-green-600 dark:text-cyan-400">✓</span>
            <span className="w-16 shrink-0 font-bold text-stone-900 dark:text-white" title={infoMaquina(p.maquina).rotulo}>
              {infoMaquina(p.maquina).icone} {p.programa}
            </span>
            <Obras obras={p.obras} />
            <span className="min-w-0 flex-1 truncate text-stone-600 dark:text-slate-300" title={p.mps.join(", ")}>
              {p.mps.join(", ")}
              {p.pecas ? ` · ${p.pecas} pç` : ""}
            </span>
            <span className="shrink-0 text-right text-stone-500 dark:text-slate-400" title="horário do Finalizado · tempo desde o Cortando">
              {diaLocal(p.finalizado_em!) === diaLocal(new Date()) ? "" : `${diaLocal(p.finalizado_em!)} `}
              {horaMinuto(p.finalizado_em!)}
              {p.minutos !== null && <span className="font-semibold text-stone-700 dark:text-slate-200"> · {duracao(p.minutos)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function VisaoGeralCorte({ tick }: { tick: number }) {
  const { dados, erro, carregando } = useBloco<RespostaCorte>("corte", {}, tick);
  const maxDia = Math.max(1, ...(dados?.por_dia ?? []).map((d) => d.programas));
  return (
    <>
    <Bloco
      titulo="✂️ Corte — ⚡ Laser · 🔥 Oxicorte"
      carregando={carregando}
      erro={erro}
      extra={
        <a href="/follow-up" className="font-semibold text-green-700 dark:text-cyan-300 hover:underline">
          abrir Corte
        </a>
      }
    >
      {dados && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
          <div className="grid shrink-0 grid-cols-[1fr_1fr_1.3fr] gap-2">
            <Numero rotulo="Hoje" valor={dados.hoje.programas} sub={subContagem(dados.hoje)} />
            <Numero rotulo="Semana" valor={dados.semana.programas} sub={subContagem(dados.semana)} />
            <div className="flex flex-col rounded-lg bg-stone-50 dark:bg-slate-800/60 px-3 py-1.5" title="Programas finalizados por dia">
              <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">Últimos 7 dias</p>
              <div className="flex flex-1 items-end gap-1 pt-1">
                {dados.por_dia.map((d, i) => {
                  const hoje = i === dados.por_dia.length - 1;
                  const [a, m, dia] = d.data.split("-").map(Number);
                  return (
                    <div key={d.data} className="flex flex-1 flex-col items-center gap-0.5" title={`${ddmm(d.data)}: ${d.laser} Laser · ${d.oxicorte} Oxicorte`}>
                      <span className="text-[10px] font-bold text-stone-700 dark:text-slate-300">{d.programas || ""}</span>
                      {/* Empilhada: Oxicorte em cima, Laser embaixo. */}
                      <div className={`flex w-full flex-col overflow-hidden rounded-t ${hoje ? "" : "opacity-60"}`}>
                        {d.programas === 0 && <div className="h-0.5 bg-stone-300 dark:bg-slate-700" />}
                        {[...MAQUINAS].reverse().map((m) => (
                          <div key={m.maquina} className={m.barra} style={{ height: `${(d[m.maquina] / maxDia) * 26}px` }} />
                        ))}
                      </div>
                      <span className="text-[9px] uppercase text-stone-500 dark:text-slate-400">{DIAS[new Date(a, m - 1, dia).getDay()]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-1.5">
            {dados.cortando.length === 0 && dados.falta_material.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-300 dark:border-slate-700 px-2 py-1.5 text-sm text-stone-500 dark:text-slate-400">
                Nenhum programa em corte agora.
              </p>
            ) : (
              MAQUINAS.map((m) => {
                const cortando = dados.cortando.filter((p) => p.maquina === m.maquina);
                const falta = dados.falta_material.filter((p) => p.maquina === m.maquina);
                return (
                  <div key={m.maquina} className="flex w-full flex-wrap items-center gap-1.5">
                    <span className={`w-24 shrink-0 text-xs font-black uppercase ${m.titulo}`}>
                      {m.icone} {m.rotulo}
                    </span>
                    {cortando.length === 0 && falta.length === 0 ? (
                      <span className="text-xs text-stone-500 dark:text-slate-400">nada em corte agora</span>
                    ) : (
                      <>
                        {cortando.map((p) => <EmCorte key={p.programa} p={p} />)}
                        {falta.map((p) => <EmCorte key={`f${p.programa}`} p={p} falta />)}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

        </div>
      )}
    </Bloco>
    <Bloco titulo="✅ Cortados — últimos" carregando={carregando} erro={erro} extra={<span className="text-stone-500 dark:text-slate-400">por operador</span>}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pr-1">
        {dados && dados.operadores.length === 0 && <Vazio>Nenhum programa finalizado ainda.</Vazio>}
        {dados?.operadores.map((o) => <CartaoOperador key={o.operador} o={o} />)}
      </div>
    </Bloco>
    </>
  );
}
