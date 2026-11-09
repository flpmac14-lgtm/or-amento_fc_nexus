"use client";

// Tarefas — Kanban pessoal (pedido do usuário, 09/11/2026): "+" adiciona a
// tarefa e os cartões são arrastados entre A fazer / Em andamento / Concluído.
// No celular (sem arrastar) cada cartão tem ◀ ▶ pra trocar de coluna.
// Só o flpmac14 (lib/tarefas.ts); quem grava é /api/tarefas.

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell, { classeBotaoCabecalho } from "@/components/AppShell";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import {
  COLUNAS_TAREFA,
  PRIORIDADES_TAREFA,
  podeVerTarefas,
  type ColunaTarefa,
  type PrioridadeTarefa,
  type Tarefa,
} from "@/lib/tarefas";

type Rascunho = {
  id?: string;
  titulo: string;
  descricao: string;
  prioridade: PrioridadeTarefa;
  prazo: string;
  coluna: ColunaTarefa;
};

const ESTILO_COLUNA: Record<ColunaTarefa, { ponto: string; faixa: string; contador: string }> = {
  a_fazer: {
    ponto: "bg-slate-400",
    faixa: "border-t-slate-400",
    contador: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  },
  em_andamento: {
    ponto: "bg-blue-500",
    faixa: "border-t-blue-500",
    contador: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  },
  concluido: {
    ponto: "bg-emerald-500",
    faixa: "border-t-emerald-500",
    contador: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  },
};

const ESTILO_PRIORIDADE: Record<PrioridadeTarefa, { barra: string; etiqueta: string }> = {
  alta: { barra: "bg-red-500", etiqueta: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  media: { barra: "bg-amber-400", etiqueta: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  baixa: { barra: "bg-sky-400", etiqueta: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
};

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}${a === String(new Date().getFullYear()) ? "" : `/${a.slice(2)}`}`;
}

async function chamar<T>(metodo: string, corpo?: unknown, query = ""): Promise<T> {
  const r = await fetch(`/api/tarefas${query}`, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
  return j as T;
}

export default function PaginaTarefas() {
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ coluna: ColunaTarefa; indice: number } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { tarefas } = await chamar<{ tarefas: Tarefa[] }>("GET");
      setTarefas(tarefas);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => {
        const ok = podeVerTarefas(data.user?.email);
        setPermitido(ok);
        if (ok) carregar();
        else setCarregando(false);
      });
  }, [carregar]);

  const termo = busca.trim().toLowerCase();
  const porColuna = useMemo(() => {
    const m: Record<ColunaTarefa, Tarefa[]> = { a_fazer: [], em_andamento: [], concluido: [] };
    for (const t of [...tarefas].sort((a, b) => a.ordem - b.ordem)) {
      if (termo && !`${t.titulo} ${t.descricao ?? ""}`.toLowerCase().includes(termo)) continue;
      m[t.coluna].push(t);
    }
    return m;
  }, [tarefas, termo]);

  const hoje = hojeIso();
  const atrasadas = tarefas.filter((t) => t.coluna !== "concluido" && t.prazo && t.prazo < hoje).length;

  /** Ordem pra ficar na posição `indice` da coluna (entre os vizinhos). */
  function ordemNaPosicao(coluna: ColunaTarefa, indice: number, ignorar?: string): number {
    const lista = tarefas.filter((t) => t.coluna === coluna && t.id !== ignorar).sort((a, b) => a.ordem - b.ordem);
    if (!lista.length) return 1000;
    if (indice <= 0) return lista[0].ordem - 1000;
    if (indice >= lista.length) return lista[lista.length - 1].ordem + 1000;
    return (lista[indice - 1].ordem + lista[indice].ordem) / 2;
  }

  async function mover(id: string, coluna: ColunaTarefa, indice: number) {
    const antes = tarefas;
    const atual = antes.find((t) => t.id === id);
    if (!atual) return;
    const ordem = ordemNaPosicao(coluna, indice, id);
    const mudancas: Partial<Tarefa> = { ordem };
    if (coluna !== atual.coluna) {
      mudancas.coluna = coluna;
      mudancas.concluido_em = coluna === "concluido" ? new Date().toISOString() : null;
    }
    setTarefas((ts) => ts.map((t) => (t.id === id ? { ...t, ...mudancas } : t)));
    try {
      await chamar("PATCH", { id, ordem, ...(mudancas.coluna ? { coluna } : {}) });
    } catch (e) {
      setTarefas(antes);
      setErro((e as Error).message);
    }
  }

  function novaTarefa(coluna: ColunaTarefa = "a_fazer") {
    setRascunho({ titulo: "", descricao: "", prioridade: "media", prazo: "", coluna });
  }

  function editar(t: Tarefa) {
    setRascunho({
      id: t.id,
      titulo: t.titulo,
      descricao: t.descricao ?? "",
      prioridade: t.prioridade,
      prazo: t.prazo ?? "",
      coluna: t.coluna,
    });
  }

  async function salvar() {
    if (!rascunho || !rascunho.titulo.trim()) return;
    setSalvando(true);
    try {
      const base = {
        titulo: rascunho.titulo,
        descricao: rascunho.descricao,
        prioridade: rascunho.prioridade,
        prazo: rascunho.prazo || null,
      };
      if (rascunho.id) {
        const atual = tarefas.find((t) => t.id === rascunho.id);
        const trocouColuna = atual && atual.coluna !== rascunho.coluna;
        const { tarefa } = await chamar<{ tarefa: Tarefa }>("PATCH", {
          id: rascunho.id,
          ...base,
          ...(trocouColuna
            ? { coluna: rascunho.coluna, ordem: ordemNaPosicao(rascunho.coluna, Infinity, rascunho.id) }
            : {}),
        });
        setTarefas((ts) => ts.map((t) => (t.id === tarefa.id ? tarefa : t)));
      } else {
        const { tarefa } = await chamar<{ tarefa: Tarefa }>("POST", {
          ...base,
          coluna: rascunho.coluna,
          ordem: ordemNaPosicao(rascunho.coluna, Infinity),
        });
        setTarefas((ts) => [...ts, tarefa]);
      }
      setRascunho(null);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    const antes = tarefas;
    setTarefas((ts) => ts.filter((t) => t.id !== id));
    setRascunho(null);
    try {
      await chamar("DELETE", undefined, `?id=${encodeURIComponent(id)}`);
    } catch (e) {
      setTarefas(antes);
      setErro((e as Error).message);
    }
  }

  function aoArrastarSobre(e: React.DragEvent, coluna: ColunaTarefa) {
    if (!arrastando) return;
    e.preventDefault();
    const cartoes = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-cartao]")).filter(
      (el) => el.dataset.cartao !== arrastando,
    );
    let indice = cartoes.length;
    for (let i = 0; i < cartoes.length; i++) {
      const r = cartoes[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        indice = i;
        break;
      }
    }
    if (alvo?.coluna !== coluna || alvo.indice !== indice) setAlvo({ coluna, indice });
  }

  function soltar(e: React.DragEvent, coluna: ColunaTarefa) {
    e.preventDefault();
    if (arrastando && alvo) {
      // O índice é entre os cartões visíveis; traduz pra posição na coluna toda (vale com busca ativa).
      const visiveis = porColuna[coluna].filter((t) => t.id !== arrastando);
      const ref = visiveis[alvo.indice];
      const todos = tarefas.filter((t) => t.coluna === coluna && t.id !== arrastando).sort((a, b) => a.ordem - b.ordem);
      const indiceReal = ref ? todos.findIndex((t) => t.id === ref.id) : todos.length;
      mover(arrastando, coluna, indiceReal);
    }
    setArrastando(null);
    setAlvo(null);
  }

  const campo =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/20";

  if (permitido === false) {
    return (
      <AppShell titulo="Tarefas">
        <p className="p-6 text-sm text-stone-600 dark:text-slate-400">Acesso restrito.</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      titulo="Tarefas"
      subtitulo={
        <span>
          {tarefas.filter((t) => t.coluna !== "concluido").length} em aberto
          {atrasadas > 0 && <span className="text-red-500"> · {atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</span>}
        </span>
      }
      acoes={
        <>
          <button type="button" onClick={carregar} className={classeBotaoCabecalho} title="Atualizar">
            ⟳<span className="hidden sm:inline"> Atualizar</span>
          </button>
          <button
            type="button"
            onClick={() => novaTarefa()}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-green-500 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
          >
            ＋<span className="hidden sm:inline"> Nova tarefa</span>
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar tarefa…"
              className={`${campo} pl-8`}
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400">⌕</span>
          </div>
          <span className="text-xs text-stone-500 dark:text-slate-400">
            Arraste os cartões entre as colunas · clique pra editar
          </span>
        </div>

        {erro && (
          <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {erro}
            <button type="button" onClick={() => setErro(null)} className="ml-3 font-bold">
              ×
            </button>
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))]">
          {COLUNAS_TAREFA.map((col, ci) => {
            const lista = porColuna[col.valor];
            const estilo = ESTILO_COLUNA[col.valor];
            const ativa = alvo?.coluna === col.valor;
            return (
              <section
                key={col.valor}
                onDragOver={(e) => aoArrastarSobre(e, col.valor)}
                onDrop={(e) => soltar(e, col.valor)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setAlvo(null);
                }}
                className={`flex min-h-[16rem] flex-col rounded-xl border border-t-4 bg-stone-50 transition-colors md:min-h-[calc(100dvh-12rem)] dark:bg-slate-900/50 ${estilo.faixa} ${
                  ativa ? "border-blue-300 bg-blue-50/60 dark:border-cyan-500/40 dark:bg-cyan-500/5" : "border-stone-200 dark:border-slate-800"
                }`}
              >
                <header className="flex items-center gap-2 px-3 py-2.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${estilo.ponto}`} />
                  <h2 className="text-sm font-bold text-stone-800 dark:text-slate-100">{col.rotulo}</h2>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${estilo.contador}`}>{lista.length}</span>
                  <button
                    type="button"
                    onClick={() => novaTarefa(col.valor)}
                    title={`Adicionar em ${col.rotulo}`}
                    className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none text-stone-500 hover:bg-stone-200 hover:text-stone-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    +
                  </button>
                </header>

                <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
                  {carregando && !tarefas.length && (
                    <div className="h-16 animate-pulse rounded-lg bg-stone-200 dark:bg-slate-800" />
                  )}
                  {lista.map((t, i) => {
                    const atrasada = t.coluna !== "concluido" && !!t.prazo && t.prazo < hoje;
                    const venceHoje = t.coluna !== "concluido" && t.prazo === hoje;
                    const pri = ESTILO_PRIORIDADE[t.prioridade];
                    return (
                      <div key={t.id}>
                        {ativa && alvo.indice === i && arrastando !== t.id && (
                          <div className="mb-2 h-1 rounded-full bg-blue-500 dark:bg-cyan-400" />
                        )}
                        <article
                          data-cartao={t.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", t.id);
                            setArrastando(t.id);
                          }}
                          onDragEnd={() => {
                            setArrastando(null);
                            setAlvo(null);
                          }}
                          onClick={() => editar(t)}
                          className={`group relative cursor-grab overflow-hidden rounded-lg border border-stone-200 bg-white py-2.5 pl-4 pr-3 shadow-sm transition hover:-translate-y-px hover:shadow-md active:cursor-grabbing dark:border-slate-700 dark:bg-slate-800 ${
                            arrastando === t.id ? "opacity-40" : ""
                          }`}
                        >
                          <span className={`absolute inset-y-0 left-0 w-1 ${pri.barra}`} />
                          <p
                            className={`text-sm font-semibold leading-snug break-words ${
                              t.coluna === "concluido"
                                ? "text-stone-400 line-through dark:text-slate-500"
                                : "text-stone-800 dark:text-slate-100"
                            }`}
                          >
                            {t.titulo}
                          </p>
                          {t.descricao && (
                            <p className="mt-1 line-clamp-2 text-xs text-stone-500 break-words dark:text-slate-400">{t.descricao}</p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className={`rounded px-1.5 py-0.5 font-semibold ${pri.etiqueta}`}>
                              {PRIORIDADES_TAREFA.find((p) => p.valor === t.prioridade)?.rotulo}
                            </span>
                            {t.prazo && (
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${
                                  atrasada
                                    ? "bg-red-500 text-white"
                                    : venceHoje
                                      ? "bg-amber-500 text-white"
                                      : "bg-stone-100 text-stone-600 dark:bg-slate-700 dark:text-slate-300"
                                }`}
                              >
                                📅 {atrasada ? "Atrasada · " : venceHoje ? "Hoje · " : ""}
                                {dataCurta(t.prazo)}
                              </span>
                            )}
                            {t.coluna === "concluido" && t.concluido_em && (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                ✓ {new Date(t.concluido_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                              </span>
                            )}
                            {/* Trocar de coluna sem arrastar (celular) */}
                            <span className="ml-auto flex gap-1 md:opacity-0 md:group-hover:opacity-100">
                              {ci > 0 && (
                                <button
                                  type="button"
                                  title={`Mover para ${COLUNAS_TAREFA[ci - 1].rotulo}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    mover(t.id, COLUNAS_TAREFA[ci - 1].valor, Infinity);
                                  }}
                                  className="rounded px-1.5 py-0.5 text-stone-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-700"
                                >
                                  ◀
                                </button>
                              )}
                              {ci < COLUNAS_TAREFA.length - 1 && (
                                <button
                                  type="button"
                                  title={`Mover para ${COLUNAS_TAREFA[ci + 1].rotulo}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    mover(t.id, COLUNAS_TAREFA[ci + 1].valor, Infinity);
                                  }}
                                  className="rounded px-1.5 py-0.5 text-stone-500 hover:bg-stone-200 dark:text-slate-400 dark:hover:bg-slate-700"
                                >
                                  ▶
                                </button>
                              )}
                            </span>
                          </div>
                        </article>
                      </div>
                    );
                  })}
                  {ativa && alvo.indice >= lista.filter((t) => t.id !== arrastando).length && (
                    <div className="h-1 rounded-full bg-blue-500 dark:bg-cyan-400" />
                  )}
                  {!carregando && !lista.length && !ativa && (
                    <button
                      type="button"
                      onClick={() => novaTarefa(col.valor)}
                      className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-stone-200 py-6 text-xs text-stone-400 hover:border-stone-300 hover:text-stone-600 dark:border-slate-800 dark:text-slate-500 dark:hover:border-slate-700 dark:hover:text-slate-300"
                    >
                      {termo ? "Nada encontrado" : "+ Adicionar tarefa"}
                    </button>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {rascunho && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setRascunho(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
            onKeyDown={(e) => e.key === "Escape" && setRascunho(null)}
            className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-700"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-bold text-stone-800 dark:text-slate-100">
                {rascunho.id ? "Editar tarefa" : "Nova tarefa"}
              </h3>
              <button
                type="button"
                onClick={() => setRascunho(null)}
                className="rounded-md px-2 text-xl leading-none text-stone-400 hover:text-stone-700 dark:hover:text-white"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-slate-400">
                Título
                <input
                  autoFocus
                  value={rascunho.titulo}
                  onChange={(e) => setRascunho({ ...rascunho, titulo: e.target.value })}
                  placeholder="O que precisa ser feito?"
                  maxLength={300}
                  className={campo}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-slate-400">
                Descrição
                <textarea
                  value={rascunho.descricao}
                  onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
                  rows={4}
                  placeholder="Detalhes, links, observações… (opcional)"
                  className={`${campo} resize-y`}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-slate-400">
                  Prazo
                  <input
                    type="date"
                    value={rascunho.prazo}
                    onChange={(e) => setRascunho({ ...rascunho, prazo: e.target.value })}
                    className={campo}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-slate-400">
                  Coluna
                  <select
                    value={rascunho.coluna}
                    onChange={(e) => setRascunho({ ...rascunho, coluna: e.target.value as ColunaTarefa })}
                    className={campo}
                  >
                    {COLUNAS_TAREFA.map((c) => (
                      <option key={c.valor} value={c.valor}>
                        {c.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-slate-400">
                Prioridade
                <div className="grid grid-cols-3 gap-2">
                  {PRIORIDADES_TAREFA.map((p) => (
                    <button
                      key={p.valor}
                      type="button"
                      onClick={() => setRascunho({ ...rascunho, prioridade: p.valor })}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm font-semibold transition ${
                        rascunho.prioridade === p.valor
                          ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-cyan-400 dark:bg-cyan-400/10 dark:text-cyan-200"
                          : "border-stone-300 text-stone-600 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${ESTILO_PRIORIDADE[p.valor].barra}`} />
                      {p.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-2">
              {rascunho.id && (
                <button
                  type="button"
                  onClick={() => excluir(rascunho.id!)}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                >
                  Excluir
                </button>
              )}
              <button
                type="button"
                onClick={() => setRascunho(null)}
                className="ml-auto rounded-lg px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando || !rascunho.titulo.trim()}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
              >
                {salvando ? "Salvando…" : rascunho.id ? "Salvar" : "Adicionar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
