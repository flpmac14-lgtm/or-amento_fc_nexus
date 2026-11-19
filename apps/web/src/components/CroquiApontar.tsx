"use client";

// Croqui de corte — modo "Apontar" (pedido do usuário, 19/11/2026): mesmo
// processo da planilha (Status → Dt.Fazendo / Dt.Pausado / Dt.Feito, Nº do
// programa, Projetista), mas pensado pro João e o Honório apontarem rápido:
//  • cada peça é um cartão com os botões do próximo passo (▶ Começar,
//    ⏸ Pausar, ✓ Terminar);
//  • marca várias peças e aponta todas de uma vez (barra embaixo);
//  • "iguais" = mesmo desenho E mesma posição, só as ativas (em aberto): ao
//    apontar uma peça o app pergunta "esse desenho/posição tem estas outras,
//    quer fazer todas?" (pedido do usuário: otimização, um programa cortando
//    várias); o atalho 🔗 no cartão também mostra e seleciona todas;
//  • agrupar por desenho / posição / MP;
//  • quem aponta e está sem projetista vira o projetista da linha.
// Grava pelo mesmo /croqui-corte/itens/lote da planilha (app/croqui_corte.py).

import { useMemo, useState } from "react";
import { COR_STATUS, fotosDe, tempoMin, type FotosRef } from "@/lib/croquiCorte";
import { normalizarBusca } from "@/lib/followUp";
import { duracao } from "@/lib/painel";
import { formatarNumero } from "@/lib/format";
import { urlImagemFollowUp } from "@/lib/api";
import type { ImagemFollowUp, ItemCroquiCorte } from "@/lib/types";

type Alteracoes = Record<string, string | null>;
type Passo = "Fazendo" | "Pausado" | "Feito";
type Aba = "afazer" | "fazendo" | "pausado" | "feito" | "todos";
type Chave = "dp" | "desenho" | "pos" | "mp";

// Status que encerram a peça (não entram nos "iguais" nem no "A fazer").
const FECHADOS = new Set(["Feito", "Sem Corte", "Estoque", "Terceirizado", "Corte Manual"]);
const PASSOS = new Set(["Fazendo", "Pausado", "Feito"]);
const LIMITE = 150;

const ROTULO_CHAVE: Record<Chave, { curto: string; longo: string }> = {
  dp: { curto: "desenho e posição", longo: "mesmo desenho e posição" },
  desenho: { curto: "desenho", longo: "mesmo desenho" },
  pos: { curto: "posição", longo: "mesma posição" },
  mp: { curto: "MP", longo: "mesmo MP" },
};

function valorChave(i: ItemCroquiCorte, c: Chave): string {
  if (c === "dp") {
    const d = valorChave(i, "desenho");
    const p = valorChave(i, "pos");
    return d && p ? `${d} · POS ${p}` : "";
  }
  const v = c === "desenho" ? i.desenho : c === "pos" ? i.pos : i.mp;
  return (v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function naAba(i: ItemCroquiCorte, aba: Aba): boolean {
  if (aba === "todos") return true;
  if (aba === "fazendo") return i.status === "Fazendo";
  if (aba === "pausado") return i.status === "Pausado";
  if (aba === "feito") return i.status === "Feito";
  return !i.status || i.status === "Aguardando revisão";
}

function Selo({ status }: { status: string | null }) {
  if (!status) return <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-500 dark:bg-slate-800 dark:text-slate-400">A fazer</span>;
  const cor = COR_STATUS[status];
  return (
    <span
      className="rounded-full border border-black/10 px-2 py-0.5 text-[11px] font-bold text-stone-900"
      style={{ backgroundColor: cor ? `color-mix(in srgb, ${cor} 60%, white)` : "#e7e5e4" }}
    >
      {status}
    </span>
  );
}

export default function CroquiApontar({
  itens,
  opcoesStatus,
  opcoesProjetista,
  fotos,
  editadoPor,
  aplicar,
  abrirGaleria,
}: {
  itens: ItemCroquiCorte[];
  opcoesStatus: string[];
  opcoesProjetista: string[];
  fotos: FotosRef | null;
  editadoPor: string | null;
  aplicar: (ids: string[], alteracoes: Alteracoes, rotulo: string) => Promise<void>;
  abrirGaleria: (imagens: ImagemFollowUp[], titulo: string) => void;
}) {
  const [aba, setAba] = useState<Aba>("afazer");
  const [busca, setBusca] = useState("");
  const [agrupar, setAgrupar] = useState<Chave | "">("");
  const [foco, setFoco] = useState<{ chave: Chave; valor: string } | null>(null);
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [limite, setLimite] = useState(LIMITE);
  const [enviando, setEnviando] = useState(false);
  const [terminar, setTerminar] = useState<{ ids: string[]; programa: string } | null>(null);
  const [programaLote, setProgramaLote] = useState("");
  const [pergunta, setPergunta] = useState<{ base: ItemCroquiCorte; status: Passo; outros: ItemCroquiCorte[]; marcados: Set<string> } | null>(null);

  // Login → nome da lista (joao → João): quem aponta vira o projetista se a linha estiver sem.
  const meuNome = useMemo(() => {
    const l = normalizarBusca(editadoPor ?? "");
    return opcoesProjetista.find((p) => normalizarBusca(p) === l) ?? null;
  }, [editadoPor, opcoesProjetista]);

  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);

  // Iguais: só entre as peças em aberto.
  const grupos = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const i of itens) {
      if (i.status && FECHADOS.has(i.status)) continue;
      const v = valorChave(i, "dp");
      if (v) g.set(v, [...(g.get(v) ?? []), i.id]);
    }
    return g;
  }, [itens]);

  const contagem = useMemo(() => {
    const c: Record<Aba, number> = { afazer: 0, fazendo: 0, pausado: 0, feito: 0, todos: itens.length };
    for (const i of itens) for (const a of ["afazer", "fazendo", "pausado", "feito"] as Aba[]) if (naAba(i, a)) c[a]++;
    return c;
  }, [itens]);

  const lista = useMemo(() => {
    const termo = normalizarBusca(busca);
    const l = itens.filter((i) => {
      if (foco) {
        if (valorChave(i, foco.chave) !== foco.valor) return false;
      } else if (!naAba(i, aba)) return false;
      if (termo) {
        const alvo = normalizarBusca([i.pedido, i.mac, i.descricao, i.desenho, i.mp, i.pos, i.n_programa, i.observacao].filter(Boolean).join(" "));
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
    // Fazendo primeiro, depois Pausado, depois o resto (ordem do Pedido).
    const peso = (i: ItemCroquiCorte) => (i.status === "Fazendo" ? 0 : i.status === "Pausado" ? 1 : !i.status ? 2 : 3);
    l.sort((a, b) => peso(a) - peso(b) || a.pedido.localeCompare(b.pedido, "pt-BR", { numeric: true }));
    return l;
  }, [itens, aba, busca, foco]);

  const blocos = useMemo(() => {
    const visiveis = lista.slice(0, limite);
    if (!agrupar) return [{ chave: "", itens: visiveis }];
    const m = new Map<string, ItemCroquiCorte[]>();
    for (const i of visiveis) {
      const v = valorChave(i, agrupar) || "(sem)";
      m.set(v, [...(m.get(v) ?? []), i]);
    }
    // Grupos com mais peças primeiro: é onde está a otimização.
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])).map(([chave, itens]) => ({ chave, itens }));
  }, [lista, limite, agrupar]);

  const selecionados = [...selecao].map((id) => porId.get(id)).filter((i): i is ItemCroquiCorte => !!i);

  function alternar(ids: string[], marcar?: boolean) {
    setSelecao((s) => {
      const n = new Set(s);
      const todos = ids.every((id) => n.has(id));
      for (const id of ids) {
        if (marcar ?? !todos) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  }

  function focarIguais(valor: string) {
    setFoco({ chave: "dp", valor });
    setBusca("");
    setLimite(LIMITE);
    alternar(grupos.get(valor) ?? [], true);
  }

  // Apontar uma peça: se o mesmo desenho + posição tem outras ativas que podem
  // receber esse passo, pergunta antes se quer fazer todas.
  function apontarUma(i: ItemCroquiCorte, status: Passo) {
    const chave = valorChave(i, "dp");
    const outros = (chave ? grupos.get(chave) ?? [] : [])
      .filter((id) => id !== i.id)
      .map((id) => porId.get(id))
      .filter((o): o is ItemCroquiCorte => !!o)
      .filter((o) => (status === "Fazendo" ? o.status !== "Fazendo" : status === "Pausado" ? o.status === "Fazendo" : true));
    if (outros.length) {
      setPergunta({ base: i, status, outros, marcados: new Set(outros.map((o) => o.id)) });
      return;
    }
    seguir([i.id], status);
  }

  function seguir(ids: string[], status: Passo) {
    if (status === "Feito") pedirTerminar(ids);
    else void apontar(ids, { status }, status);
  }

  // Aponta: quem estiver sem projetista recebe o nome de quem apontou.
  async function apontar(ids: string[], alteracoes: Alteracoes, rotulo: string) {
    if (!ids.length || enviando) return;
    setEnviando(true);
    try {
      const semProj = meuNome && !("projetista" in alteracoes) ? ids.filter((id) => !porId.get(id)?.projetista) : [];
      const comProj = ids.filter((id) => !semProj.includes(id));
      if (semProj.length) await aplicar(semProj, { ...alteracoes, projetista: meuNome }, rotulo);
      if (comProj.length) await aplicar(comProj, alteracoes, rotulo);
      setSelecao((s) => {
        const n = new Set(s);
        for (const id of ids) n.delete(id);
        return n;
      });
    } catch {
      // o aviso de erro já aparece em cima (aplicar)
    } finally {
      setEnviando(false);
    }
  }

  function pedirTerminar(ids: string[]) {
    const progs = [...new Set(ids.map((id) => porId.get(id)?.n_programa ?? "").filter(Boolean))];
    setTerminar({ ids, programa: progs.length === 1 ? progs[0] : "" });
  }

  async function confirmarTerminar() {
    if (!terminar) return;
    const alt: Alteracoes = { status: "Feito" };
    if (terminar.programa.trim()) alt.n_programa = terminar.programa.trim();
    const { ids } = terminar;
    setTerminar(null);
    await apontar(ids, alt, "Feito");
  }

  const outros = opcoesStatus.filter((s) => !PASSOS.has(s));
  const botao = "rounded-lg px-3 py-2 text-sm font-bold shadow-sm transition-colors disabled:opacity-50";
  const btnComecar = `${botao} bg-amber-400 text-stone-900 hover:bg-amber-300`;
  const btnPausar = `${botao} bg-orange-500 text-white hover:bg-orange-400`;
  const btnTerminar = `${botao} bg-green-600 text-white hover:bg-green-500`;

  function acoes(i: ItemCroquiCorte) {
    if (i.status === "Fazendo")
      return (
        <>
          <button type="button" disabled={enviando} onClick={() => apontarUma(i, "Pausado")} className={btnPausar}>
            ⏸ Pausar
          </button>
          <button type="button" disabled={enviando} onClick={() => apontarUma(i, "Feito")} className={btnTerminar}>
            ✓ Terminar
          </button>
        </>
      );
    if (i.status === "Feito") return null;
    return (
      <button type="button" disabled={enviando} onClick={() => apontarUma(i, "Fazendo")} className={btnComecar}>
        ▶ {i.status === "Pausado" ? "Retomar" : "Começar"}
      </button>
    );
  }

  function cartao(i: ItemCroquiCorte) {
    const marcado = selecao.has(i.id);
    const imagens = fotosDe(fotos, i);
    const tempo = tempoMin(i);
    const chaveDp = valorChave(i, "dp");
    const nIguais = chaveDp && !foco ? (grupos.get(chaveDp)?.length ?? 0) : 0;
    const iguais = nIguais > 1 ? [{ v: chaveDp, n: nIguais }] : [];
    return (
      <li
        key={i.id}
        className={`flex gap-3 rounded-xl border p-3 transition-colors ${
          marcado
            ? "border-green-600 bg-green-50 ring-2 ring-green-600/30 dark:border-cyan-400 dark:bg-cyan-500/10 dark:ring-cyan-400/30"
            : i.status === "Fazendo"
              ? "border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5"
              : "border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900/60"
        }`}
      >
        <label className="flex shrink-0 cursor-pointer items-start pt-1" title="Selecionar pra apontar junto com outras">
          <input type="checkbox" checked={marcado} onChange={() => alternar([i.id])} className="h-5 w-5 accent-green-600" />
        </label>
        {imagens.length > 0 ? (
          <button
            type="button"
            onClick={() => abrirGaleria(imagens, `${i.pedido} — ${i.descricao ?? ""}`)}
            className="relative hidden h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-white sm:block dark:border-slate-700"
            title="Ver imagem"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine */}
            <img src={urlImagemFollowUp(imagens[0].sha256)} alt="" loading="lazy" className="h-full w-full object-contain" />
          </button>
        ) : (
          <div className="hidden h-16 w-20 shrink-0 rounded-lg bg-stone-100 sm:block dark:bg-slate-800" />
        )}
        <div className="min-w-0 flex-1" onClick={() => alternar([i.id])}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-stone-900 dark:text-white">{i.pedido}</span>
            <Selo status={i.status} />
            {i.mac && <span className="font-mono text-xs text-stone-500 dark:text-slate-400">{i.mac}</span>}
            {i.projetista && <span className="text-xs text-stone-500 dark:text-slate-400">· {i.projetista}</span>}
          </div>
          <p className="mt-0.5 truncate text-sm text-stone-700 dark:text-slate-300" title={i.descricao ?? ""}>
            {i.descricao ?? "—"}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-600 dark:text-slate-400">
            {i.desenho && (
              <span>
                Desenho <strong className="font-mono text-stone-800 dark:text-slate-200">{i.desenho}</strong>
              </span>
            )}
            {i.pos && (
              <span>
                Pos <strong className="font-mono text-stone-800 dark:text-slate-200">{i.pos}</strong>
              </span>
            )}
            {i.mp && (
              <span>
                MP <strong className="text-stone-800 dark:text-slate-200">{i.mp}</strong>
                {i.l ? ` · L ${i.l}` : ""}
              </span>
            )}
            {i.qtt !== null && (
              <span>
                Qtd <strong className="font-mono text-stone-800 dark:text-slate-200">{formatarNumero(i.qtt, Number.isInteger(i.qtt) ? 0 : 2)}</strong> {i.un ?? ""}
              </span>
            )}
            {i.n_programa && (
              <span>
                Programa <strong className="font-mono text-stone-800 dark:text-slate-200">{i.n_programa}</strong>
              </span>
            )}
            {tempo !== null && (
              <span className={i.status === "Fazendo" ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>⏱ {duracao(tempo)}</span>
            )}
          </div>
          {iguais.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
              {iguais.map((x) => (
                <button
                  key={x.v}
                  type="button"
                  onClick={() => focarIguais(x.v)}
                  title={`Mostrar e selecionar as ${x.n} peças ativas com o mesmo desenho e posição (${x.v})`}
                  className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200"
                >
                  🔗 {x.n} ativas com mesmo desenho e posição
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-center gap-1.5 sm:flex-row sm:items-center">{acoes(i)}</div>
      </li>
    );
  }

  const ABAS: { v: Aba; r: string }[] = [
    { v: "afazer", r: "A fazer" },
    { v: "fazendo", r: "Fazendo" },
    { v: "pausado", r: "Pausado" },
    { v: "feito", r: "Feito" },
    { v: "todos", r: "Todos" },
  ];
  const idsLista = lista.slice(0, limite).map((i) => i.id);
  const algumFazendo = selecionados.some((i) => i.status === "Fazendo");

  return (
    <div className="flex flex-col gap-3 pb-28">
      {/* Passo a passo */}
      <ol className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-700 sm:grid-cols-3 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
        <li>
          <strong className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-800 text-[11px] text-white dark:bg-cyan-500 dark:text-slate-950">1</strong>
          Ache a peça (busca ou abas). Pra várias, marque o <strong>☐</strong>.
        </li>
        <li>
          <strong className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-800 text-[11px] text-white dark:bg-cyan-500 dark:text-slate-950">2</strong>
          <span className="rounded bg-violet-100 px-1 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">🔗 iguais</span> seleciona de uma vez as
          peças ativas do mesmo desenho e posição — e ao apontar uma, o app pergunta se quer fazer as outras.
        </li>
        <li>
          <strong className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-stone-800 text-[11px] text-white dark:bg-cyan-500 dark:text-slate-950">3</strong>
          Toque <strong>▶ Começar</strong>, <strong>⏸ Pausar</strong> ou <strong>✓ Terminar</strong> — a hora grava sozinha.
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-x-auto rounded-lg border border-stone-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
          {ABAS.map((a) => (
            <button
              key={a.v}
              type="button"
              onClick={() => {
                setAba(a.v);
                setFoco(null);
                setLimite(LIMITE);
              }}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                aba === a.v && !foco
                  ? "bg-stone-800 text-white dark:bg-cyan-500 dark:text-slate-950"
                  : "text-stone-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {a.r} <span className="ml-0.5 font-mono text-xs opacity-70">{contagem[a.v]}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setLimite(LIMITE);
          }}
          placeholder="Buscar pedido, MAC, desenho, pos, MP, programa…"
          className="min-w-[14rem] flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500"
        />
        <label className="flex items-center gap-1.5 text-sm text-stone-600 dark:text-slate-400">
          Agrupar
          <select
            value={agrupar}
            onChange={(e) => setAgrupar(e.target.value as Chave | "")}
            className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Não agrupar</option>
            <option value="dp">Por desenho + posição</option>
            <option value="desenho">Por desenho</option>
            <option value="pos">Por posição</option>
            <option value="mp">Por MP (chapa)</option>
          </select>
        </label>
      </div>

      {foco && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-900 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-100">
          🔗 Peças com {ROTULO_CHAVE[foco.chave].longo}: <strong className="font-mono">{foco.valor}</strong> — as em aberto já estão
          selecionadas; agora é só apontar embaixo.
          <button
            type="button"
            onClick={() => setFoco(null)}
            className="ml-auto rounded-lg border border-violet-400 px-2 py-0.5 text-xs font-semibold hover:bg-violet-100 dark:hover:bg-violet-900"
          >
            ✕ Voltar à lista
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-slate-400">
        <button type="button" onClick={() => alternar(idsLista)} className="font-semibold text-green-700 hover:underline dark:text-cyan-300">
          {idsLista.length && idsLista.every((id) => selecao.has(id)) ? "Desmarcar" : "Marcar"} as {idsLista.length} da tela
        </button>
        <span>
          {lista.length} peça(s){lista.length > limite ? ` · mostrando ${limite}` : ""}
        </span>
      </div>

      {blocos.map((b) => (
        <section key={b.chave || "todos"} className="flex flex-col gap-2">
          {agrupar && (
            <div className="flex items-center gap-2 border-b border-stone-200 pb-1 pt-2 dark:border-slate-800">
              <input
                type="checkbox"
                checked={b.itens.every((i) => selecao.has(i.id))}
                onChange={() => alternar(b.itens.map((i) => i.id))}
                className="h-4 w-4 accent-green-600"
                title="Selecionar o grupo todo"
              />
              <h4 className="text-sm font-semibold text-stone-800 dark:text-slate-100">
                {ROTULO_CHAVE[agrupar].curto[0].toUpperCase() + ROTULO_CHAVE[agrupar].curto.slice(1)}{" "}
                <span className="font-mono">{b.chave}</span>
              </h4>
              <span className="rounded-full bg-stone-200 px-2 text-xs font-semibold text-stone-700 dark:bg-slate-700 dark:text-slate-200">{b.itens.length}</span>
            </div>
          )}
          <ul className="flex flex-col gap-2">{b.itens.map(cartao)}</ul>
        </section>
      ))}

      {lista.length === 0 && <p className="py-10 text-center text-sm text-stone-500 dark:text-slate-400">Nenhuma peça aqui.</p>}
      {lista.length > limite && (
        <button type="button" onClick={() => setLimite((l) => l + LIMITE)} className="self-center rounded-lg border border-stone-300 px-4 py-2 text-sm dark:border-slate-700">
          Mostrar mais {Math.min(LIMITE, lista.length - limite)}
        </button>
      )}

      {/* Barra do lote */}
      {selecionados.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-green-600 bg-white/95 px-3 py-2.5 shadow-2xl backdrop-blur dark:border-cyan-400 dark:bg-slate-900/95 lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-stone-900 dark:text-white">
              {selecionados.length} peça(s) selecionada(s)
            </span>
            <button
              type="button"
              disabled={enviando}
              onClick={() => apontar([...selecao], { status: "Fazendo" }, "Fazendo")}
              className={btnComecar}
            >
              ▶ Começar todas
            </button>
            {algumFazendo && (
              <button type="button" disabled={enviando} onClick={() => apontar([...selecao], { status: "Pausado" }, "Pausado")} className={btnPausar}>
                ⏸ Pausar
              </button>
            )}
            <button type="button" disabled={enviando} onClick={() => pedirTerminar([...selecao])} className={btnTerminar}>
              ✓ Terminar todas
            </button>
            <span className="flex items-center gap-1">
              <input
                value={programaLote}
                onChange={(e) => setProgramaLote(e.target.value)}
                placeholder="Nº programa"
                className="w-28 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                title="Mesmo programa pra todas as selecionadas (otimização). Vários: 380, 381"
              />
              <button
                type="button"
                disabled={enviando || !programaLote.trim()}
                onClick={() => {
                  apontar([...selecao], { n_programa: programaLote.trim() }, "Nº do programa").then(() => setProgramaLote(""));
                }}
                className="rounded-lg border border-stone-300 px-2 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Gravar
              </button>
            </span>
            {outros.length > 0 && (
              <select
                value=""
                disabled={enviando}
                onChange={(e) => e.target.value && apontar([...selecao], { status: e.target.value }, e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">Outro status…</option>
                {outros.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => setSelecao(new Set())} className="ml-auto text-sm text-stone-500 hover:text-red-600 dark:text-slate-400">
              ✕ Limpar seleção
            </button>
          </div>
        </div>
      )}

      {/* Mesmo desenho + posição: fazer as outras ativas também? */}
      {pergunta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setPergunta(null)}>
          <div
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-stone-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <h3 className="text-base font-bold text-stone-900 dark:text-white">🔗 Tem outras iguais ativas</h3>
            <p className="mt-1 text-sm text-stone-700 dark:text-slate-300">
              O desenho <strong className="font-mono">{pergunta.base.desenho}</strong>, posição{" "}
              <strong className="font-mono">{pergunta.base.pos}</strong> tem mais <strong>{pergunta.outros.length}</strong> peça(s)
              ativa(s). Deseja <strong>{pergunta.status === "Fazendo" ? "começar" : pergunta.status === "Pausado" ? "pausar" : "terminar"}</strong>{" "}
              todas junto com o <span className="font-mono">{pergunta.base.pedido}</span>?
            </p>
            <ul className="mt-3 flex min-h-0 flex-col gap-1 overflow-y-auto rounded-lg border border-stone-200 p-1 dark:border-slate-800">
              {pergunta.outros.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-stone-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={pergunta.marcados.has(o.id)}
                      onChange={() =>
                        setPergunta((p) => {
                          if (!p) return p;
                          const m = new Set(p.marcados);
                          if (m.has(o.id)) m.delete(o.id);
                          else m.add(o.id);
                          return { ...p, marcados: m };
                        })
                      }
                      className="h-4 w-4 accent-green-600"
                    />
                    <span className="font-mono font-semibold text-stone-900 dark:text-white">{o.pedido}</span>
                    <span className="font-mono text-xs text-stone-500 dark:text-slate-400">{o.mac}</span>
                    {o.qtt !== null && (
                      <span className="text-xs text-stone-500 dark:text-slate-400">
                        · {formatarNumero(o.qtt, Number.isInteger(o.qtt) ? 0 : 2)} {o.un ?? ""}
                      </span>
                    )}
                    <span className="ml-auto">
                      <Selo status={o.status} />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  const p = pergunta;
                  setPergunta(null);
                  seguir([p.base.id], p.status);
                }}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-slate-700 dark:text-slate-300"
              >
                Só esta
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = pergunta;
                  setPergunta(null);
                  seguir([p.base.id, ...p.marcados], p.status);
                }}
                className={pergunta.status === "Fazendo" ? btnComecar : pergunta.status === "Pausado" ? btnPausar : btnTerminar}
              >
                Sim, todas ({pergunta.marcados.size + 1})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terminar: pergunta o Nº do programa (o mesmo pra todas = otimização) */}
      {terminar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={() => setTerminar(null)}>
          <div
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <h3 className="text-base font-bold text-stone-900 dark:text-white">
              ✓ Terminar {terminar.ids.length > 1 ? `${terminar.ids.length} peças` : terminar.ids.map((id) => porId.get(id)?.pedido).join("")}
            </h3>
            <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">
              Grava <strong>Feito</strong> com a hora de agora. Se saiu num programa, informe o número (vale pra todas).
            </p>
            <label className="mt-3 flex flex-col gap-1 text-xs font-semibold text-stone-700 dark:text-slate-300">
              Nº do programa (opcional)
              <input
                autoFocus
                value={terminar.programa}
                onChange={(e) => setTerminar((t) => (t ? { ...t, programa: e.target.value } : t))}
                onKeyDown={(e) => e.key === "Enter" && confirmarTerminar()}
                placeholder="ex.: 1416  ou  380, 381"
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-normal text-stone-900 outline-none focus:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setTerminar(null)} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:text-slate-300">
                Cancelar
              </button>
              <button type="button" onClick={confirmarTerminar} className={btnTerminar}>
                ✓ Terminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
