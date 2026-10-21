"use client";

// 🕘 Histórico do Data book pra todos — pedido do usuário (17/10/2026), igual à
// aba Histórico da Usinagem: em cima, o que cada um está fazendo agora (etapas
// com início e sem fim); embaixo, a linha do tempo de tudo o que foi apontado
// (etapas + ST.BOOK / falta / obs.), por dia, com filtro de período e pessoa.
// Tocar abre o pedido. GET /databook/historico-geral (app/databook_etapas.py).

import { useEffect, useMemo, useState } from "react";
import { quando } from "@/components/ApontamentoComum";
import { listarHistoricoGeralDatabook, type EventoHistoricoDatabook } from "@/lib/api";
import { minutosUteis } from "@/lib/jornada";
import { duracao } from "@/lib/painel";
import type { ItemDatabook } from "@/lib/types";

const PERIODOS = [
  { dias: 1, rotulo: "Hoje" },
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
] as const;

const NOME_CAMPO: Record<string, string> = {
  st_book: "ST.BOOK",
  st_book_excluido: "🗑 ST.BOOK excluído",
  falta: "Falta p/ finalizar",
  observacao: "Obs.",
};

function diaTitulo(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === new Date(hoje.getTime() - 86400000).toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

function classeChip(ativo: boolean): string {
  return `shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold ${
    ativo
      ? "border-green-600 bg-green-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
      : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
  }`;
}

const nome = (p: string | null) => {
  const s = (p ?? "").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
};

export default function DataBookHistorico({
  itens,
  etapas,
  versao,
  abrir,
}: {
  itens: ItemDatabook[];
  etapas: { chave: string; nome: string; icone: string }[];
  versao: number; // muda a cada apontamento salvo → recarrega
  abrir: (id: string) => void;
}) {
  const [dias, setDias] = useState<number>(1);
  const [pessoa, setPessoa] = useState<string | null>(null);
  const [eventos, setEventos] = useState<EventoHistoricoDatabook[] | null>(null);
  const [erro, setErro] = useState("");
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const etapa = useMemo(() => new Map(etapas.map((e) => [e.chave, e])), [etapas]);

  useEffect(() => {
    let ativo = true;
    listarHistoricoGeralDatabook(dias)
      .then((ev) => {
        if (!ativo) return;
        setEventos(ev);
        setErro("");
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [dias, versao]);

  // Agora: etapas com início e sem fim (e não pausadas), por quem iniciou.
  const fazendo = useMemo(() => {
    const m = new Map<string, { item: ItemDatabook; etapa: string; desde: string }[]>();
    for (const i of itens)
      for (const [chave, e] of Object.entries(i.etapas ?? {}))
        if (e.inicio_em && !e.fim_em && !e.pausado_em) {
          const p = nome(e.inicio_por);
          m.set(p, [...(m.get(p) ?? []), { item: i, etapa: chave, desde: e.inicio_em }]);
        }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [itens]);

  const pessoas = useMemo(() => [...new Set((eventos ?? []).map((e) => nome(e.por)))].sort(), [eventos]);
  const filtrados = useMemo(() => (eventos ?? []).filter((e) => !pessoa || nome(e.por) === pessoa), [eventos, pessoa]);
  const porDia = useMemo(() => {
    const m = new Map<string, EventoHistoricoDatabook[]>();
    for (const e of filtrados) {
      const d = new Date(e.em).toDateString();
      m.set(d, [...(m.get(d) ?? []), e]);
    }
    return [...m.values()];
  }, [filtrados]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/20">
        <p className="mb-2 text-base font-extrabold text-amber-800 dark:text-amber-300">▶ Em andamento agora</p>
        {fazendo.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-slate-400">Nenhuma etapa em andamento.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fazendo.map(([p, lista]) => (
              <div key={p} className="rounded-xl border border-amber-300 bg-white p-2 dark:border-amber-800 dark:bg-slate-900">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-extrabold text-stone-900 dark:text-white">{p}</span>
                  <span className="text-xs text-stone-500 dark:text-slate-400">{lista.length} em andamento</span>
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {lista.slice(0, 8).map(({ item, etapa: ch, desde }) => (
                    <li key={`${item.id}-${ch}`}>
                      <button
                        type="button"
                        onClick={() => abrir(item.id)}
                        className="flex w-full items-baseline justify-between gap-2 rounded px-1 text-left text-sm hover:bg-amber-100 dark:hover:bg-amber-900/30"
                      >
                        <span className="min-w-0 truncate">
                          {etapa.get(ch)?.icone} <span className="font-mono font-semibold">{item.po}</span>{" "}
                          <span className="text-stone-500 dark:text-slate-400">{etapa.get(ch)?.nome ?? ch}</span>
                        </span>
                        <span className="shrink-0 font-mono text-xs text-stone-500 dark:text-slate-400">
                          {duracao(minutosUteis(desde, new Date()))}
                        </span>
                      </button>
                    </li>
                  ))}
                  {lista.length > 8 && <li className="px-1 text-xs text-stone-500">+ {lista.length - 8}…</li>}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PERIODOS.map((p) => (
            <button key={p.dias} type="button" onClick={() => setDias(p.dias)} className={classeChip(dias === p.dias)}>
              {p.rotulo}
            </button>
          ))}
        </div>
        {pessoas.length > 1 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setPessoa(null)} className={classeChip(pessoa === null)}>
              Todos
            </button>
            {pessoas.map((p) => (
              <button key={p} type="button" onClick={() => setPessoa(pessoa === p ? null : p)} className={classeChip(pessoa === p)}>
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>}
      {eventos === null ? (
        <p className="py-8 text-center text-stone-500">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <p className="py-8 text-center text-stone-500 dark:text-slate-400">Nada apontado neste período.</p>
      ) : (
        porDia.map((lista) => (
          <div key={lista[0].em} className="rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <p className="border-b border-stone-200 px-3 py-2 text-sm font-extrabold capitalize text-stone-800 dark:border-slate-800 dark:text-slate-200">
              {diaTitulo(lista[0].em)} <span className="font-normal normal-case text-stone-500">· {lista.length} apontamento(s)</span>
            </p>
            <ul className="divide-y divide-stone-100 dark:divide-slate-800">
              {lista.map((e) => {
                const item = porId.get(e.item_id);
                const et = e.tipo === "etapa" ? etapa.get(e.etapa) : undefined;
                return (
                  <li key={`${e.tipo}${e.id}`}>
                    <button
                      type="button"
                      onClick={() => item && abrir(item.id)}
                      className={`flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-stone-50 dark:hover:bg-slate-800/60 ${
                        e.desfeito ? "opacity-50 line-through" : ""
                      }`}
                    >
                      <span className="w-12 shrink-0 font-mono text-xs text-stone-500 dark:text-slate-400">
                        {new Date(e.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-stone-900 dark:text-white">
                          <strong>{nome(e.por)}</strong> ·{" "}
                          {e.tipo === "etapa" ? (
                            <>
                              {et?.icone} {et?.nome ?? e.etapa}:{" "}
                              <span
                                className={
                                  e.acao === "fim"
                                    ? "font-bold text-green-700 dark:text-green-400"
                                    : e.acao === "pausa"
                                      ? "font-bold text-sky-700 dark:text-sky-300"
                                      : "font-bold text-amber-700 dark:text-amber-300"
                                }
                              >
                                {e.acao === "inicio" ? "▶ início" : e.acao === "pausa" ? "⏸ pausa" : "✔ finalizado"}
                              </span>
                            </>
                          ) : (
                            <>
                              {NOME_CAMPO[e.campo] ?? e.campo}: <strong>{e.para || "(apagado)"}</strong>
                            </>
                          )}
                        </span>
                        <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                          PO {item?.po ?? "—"} · {item?.cliente ?? "—"} · {item?.descricao ?? ""}
                        </span>
                        {e.tipo === "etapa" && e.observacao && <span className="block text-xs italic text-stone-500">“{e.observacao}”</span>}
                      </span>
                      <span className="hidden shrink-0 text-xs text-stone-400 sm:block">{quando(e.em)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
