"use client";

// Aba Histórico do apontamento por setor (pedido do usuário: o líder da
// Usinagem ver o que cada operador está fazendo). Em cima, quem está usinando
// o quê agora; embaixo, a linha do tempo dos apontamentos, por dia, com
// filtro de período e de operador. Tocar abre o pedido (mesmo painel da aba
// Pedidos). GET /apontamentos/<setor>/historico (app/apontamentos_setor.py).

import { useEffect, useMemo, useState } from "react";
import { Foto, quando } from "@/components/ApontamentoComum";
import { buscarHistoricoSetor, type Apontamento } from "@/lib/api";
import type { ConfigSetor } from "@/lib/apontamento";
import type { ItemFollowUp } from "@/lib/types";

const PERIODOS = [
  { dias: 1, rotulo: "Hoje" },
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
] as const;

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

export default function ApontamentoHistorico({
  config,
  itens,
  atuais,
  operadores,
  versao,
  abrir,
}: {
  config: ConfigSetor;
  itens: ItemFollowUp[];
  atuais: Record<string, Apontamento>;
  operadores: string[];
  versao: number; // muda a cada apontamento salvo → recarrega
  abrir: (i: ItemFollowUp) => void;
}) {
  const [dias, setDias] = useState<number>(1);
  const [filtroOp, setFiltroOp] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Apontamento[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    // "Hoje" busca 2 dias e filtra pela data local (o servidor conta 24h corridas).
    buscarHistoricoSetor(config.setor, dias === 1 ? 2 : dias)
      .then((h) => {
        if (!ativo) return;
        const hoje = new Date().toDateString();
        setLinhas(dias === 1 ? h.filter((l) => new Date(l.em).toDateString() === hoje) : h);
        setErro("");
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [config.setor, dias, versao]);

  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const opcao = useMemo(() => new Map(config.opcoes.map((o) => [o.status, o])), [config]);

  // Agora: pedidos cujo último apontamento é "em andamento", por operador.
  const agora = useMemo(() => {
    const m = new Map<string, Apontamento[]>();
    for (const a of Object.values(atuais)) {
      if (a.status !== "em_andamento" || !a.operador) continue;
      m.set(a.operador, [...(m.get(a.operador) ?? []), a]);
    }
    return m;
  }, [atuais]);
  const faltando = useMemo(() => Object.values(atuais).filter((a) => a.status === "falta_material").length, [atuais]);

  const grupos = useMemo(() => {
    const g: { titulo: string; linhas: Apontamento[] }[] = [];
    for (const l of linhas ?? []) {
      if (filtroOp && l.operador !== filtroOp) continue;
      const t = diaTitulo(l.em);
      if (g.at(-1)?.titulo !== t) g.push({ titulo: t, linhas: [] });
      g.at(-1)!.linhas.push(l);
    }
    return g;
  }, [linhas, filtroOp]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
        <p className="mb-2 text-sm font-bold text-stone-700 dark:text-slate-300">Agora na {config.nome}</p>
        <div className="flex flex-col gap-1.5">
          {operadores.map((op) => {
            const lista = agora.get(op) ?? [];
            return (
              <div key={op} className="flex items-start gap-2 rounded-lg bg-stone-50 px-2 py-1.5 dark:bg-slate-800/50">
                <span className="w-24 shrink-0 py-1 text-base font-bold text-stone-900 dark:text-white">{op}</span>
                {lista.length === 0 ? (
                  <span className="py-1 text-sm text-stone-400 dark:text-slate-500">nada usinando</span>
                ) : (
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {lista.map((a) => {
                      const i = porId.get(a.item_id);
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => i && abrir(i)}
                          className="truncate rounded bg-amber-400 px-2 py-1 text-left text-sm font-semibold text-stone-900 active:scale-[0.98]"
                        >
                          ▶ {i ? (i.desenho ?? i.po) : "pedido"} · desde {quando(a.em)}
                        </button>
                      );
                    })}
                  </span>
                )}
              </div>
            );
          })}
          {faltando > 0 && <p className="mt-1 text-sm font-semibold text-red-600 dark:text-red-400">⚠ {faltando} pedido(s) com falta de material</p>}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {PERIODOS.map((p) => (
          <button key={p.dias} type="button" onClick={() => setDias(p.dias)} className={classeChip(dias === p.dias)}>
            {p.rotulo}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => setFiltroOp(null)} className={classeChip(filtroOp === null)}>
          Todos
        </button>
        {operadores.map((op) => (
          <button key={op} type="button" onClick={() => setFiltroOp(op)} className={classeChip(filtroOp === op)}>
            {op}
          </button>
        ))}
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{erro}</div>
      )}
      {linhas === null && !erro && <p className="py-6 text-center text-stone-500 dark:text-slate-400">Carregando…</p>}
      {linhas !== null && grupos.length === 0 && (
        <p className="py-6 text-center text-stone-500 dark:text-slate-400">Nenhum apontamento nesse período.</p>
      )}

      {grupos.map((g) => (
        <div key={g.titulo} className="flex flex-col gap-2">
          <p className="text-sm font-bold capitalize text-stone-600 dark:text-slate-400">
            {g.titulo} · {g.linhas.length}
          </p>
          {g.linhas.map((l) => {
            const i = porId.get(l.item_id);
            const o = opcao.get(l.status);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => i && abrir(i)}
                className="flex gap-3 rounded-xl border-2 border-stone-200 bg-white p-2 text-left active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900"
              >
                {i ? <Foto item={i} classe="h-16 w-16 shrink-0 rounded-lg" /> : <div className="h-16 w-16 shrink-0" />}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-base font-bold text-stone-900 dark:text-white">
                      {new Date(l.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${o?.selo ?? ""}`}>
                      {o?.icone} {o?.rotulo}
                    </span>
                    <span className="text-sm font-bold text-stone-800 dark:text-slate-200">{l.operador ?? "—"}</span>
                  </span>
                  <span className="truncate text-sm font-semibold text-stone-800 dark:text-slate-200">
                    {i ? `${i.desenho ?? i.po} · ${i.descricao ?? ""}` : "pedido fora do Follow up"}
                  </span>
                  {l.observacao && <span className="text-sm text-stone-600 dark:text-slate-400">“{l.observacao}”</span>}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
