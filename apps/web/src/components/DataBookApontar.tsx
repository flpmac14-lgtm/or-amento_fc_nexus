"use client";

// Apontamento do Data book por etapa — pedido do usuário (17/10/2026): igual à
// Usinagem/Pintura (botões grandes, um toque, pelo celular e no computador).
// Cada etapa tem ▶ Início, ⏸ Pausar (21/10/2026 — volta com ▶ Retomar, o tempo
// parado não conta no ⏱) e ✔ Finalizado, e o histórico vai se montando:
// Relatório de caldeiraria, de usinagem, de solda, de pintura, Rastreabilidade,
// Montando book e Fim de book. Rastreabilidade / Montando book / Fim de book
// continuam mexendo no ST.BOOK como antes (app/databook_etapas.py) — nada do
// que já estava apontado se perde (aparece como situação da etapa).

import { useEffect, useMemo, useState } from "react";
import {
  apontarEtapaDatabook,
  desfazerEtapaDatabook,
  editarEtapaDatabook,
  historicoDatabook,
  historicoEtapasDatabook,
  urlImagemFollowUp,
  type AcaoEtapaDatabook,
  type ApontamentoEtapaDatabook,
} from "@/lib/api";
import { quando } from "@/components/ApontamentoComum";
import DataBookHistorico from "@/components/DataBookHistorico";
import { EMAIL_FINANCEIRO } from "@/lib/financeiro";
import { normalizarBusca } from "@/lib/followUp";
import { minutosUteis } from "@/lib/jornada";
import { duracao } from "@/lib/painel";
import type { EtapaDatabook, ItemDatabook } from "@/lib/types";

export const ETAPAS: { chave: string; nome: string; curto: string; icone: string }[] = [
  { chave: "rel_caldeiraria", nome: "Relatório de caldeiraria", curto: "CAL", icone: "🔩" },
  { chave: "rel_usinagem", nome: "Relatório de usinagem", curto: "USI", icone: "⚙️" },
  { chave: "rel_solda", nome: "Relatório de solda", curto: "SOL", icone: "🔥" },
  { chave: "rel_pintura", nome: "Relatório de pintura", curto: "PIN", icone: "🎨" },
  { chave: "rastreabilidade", nome: "Rastreabilidade", curto: "RAS", icone: "🔎" },
  { chave: "montando_book", nome: "Montando book", curto: "MON", icone: "📚" },
  { chave: "fim_book", nome: "Fim de book", curto: "FIM", icone: "🏁" },
];
const NOME_ETAPA = new Map(ETAPAS.map((e) => [e.chave, e]));

const SUGESTOES = [
  "Aguardando relatório do setor",
  "Falta certificado de material",
  "Falta assinatura",
  "Aguardando cliente",
  "Revisão solicitada",
  "Enviado por e-mail",
];

const MAX_CARTOES = 60;
type Filtro = "ativos" | "andamento" | "encerrados" | "todos";
type Situacao = "nada" | "andamento" | "pausado" | "feito";

function situacao(e: EtapaDatabook | undefined): Situacao {
  if (!e) return "nada";
  if (e.fim_em) return "feito";
  if (e.pausado_em) return "pausado";
  return e.inicio_em ? "andamento" : "nada";
}

const COR_SITUACAO: Record<Situacao, string> = {
  nada: "bg-stone-200 text-stone-500 dark:bg-slate-800 dark:text-slate-500",
  andamento: "bg-amber-400 text-stone-900",
  pausado: "bg-sky-500 text-white",
  feito: "bg-green-600 text-white",
};

const ROTULO_SITUACAO: Record<Situacao, string> = {
  nada: "NÃO INICIADO",
  andamento: "EM ANDAMENTO",
  pausado: "PAUSADO",
  feito: "FINALIZADO",
};

const TEXTO_ACAO: Record<AcaoEtapaDatabook, string> = { inicio: "▶ início", pausa: "⏸ pausa", fim: "✔ finalizado" };

// ⏱ da etapa (horário de trabalho) sem o tempo pausado — pedido do usuário (21/10/2026).
function tempoEtapa(e: EtapaDatabook): number {
  const fim = e.fim_em ?? new Date();
  const parado = (e.pausas ?? []).reduce((s, [p, r]) => s + minutosUteis(p, r ?? fim), 0);
  return Math.max(0, minutosUteis(e.inicio_em!, fim) - parado);
}

function textoBusca(i: ItemDatabook): string {
  return normalizarBusca([i.po, i.mac, i.desenho, i.descricao, i.cliente, i.nf, i.st_book].filter(Boolean).join(" "));
}

function Foto({ item, classe }: { item: ItemDatabook; classe: string }) {
  if (!item.foto)
    return (
      <div className={`flex items-center justify-center bg-stone-100 text-xs text-stone-400 dark:bg-slate-800 dark:text-slate-500 ${classe}`}>
        sem foto
      </div>
    );
  // eslint-disable-next-line @next/next/no-img-element -- mídia do calc_engine, mesmo padrão do Follow up
  return <img src={urlImagemFollowUp(item.foto)} alt={item.desenho ?? item.po} loading="lazy" className={`bg-white object-contain ${classe}`} />;
}

/** Faixa com as 7 etapas (cinza = não começou, amarelo = em andamento, verde = finalizado). */
export function FaixaEtapas({ item, grande = false }: { item: ItemDatabook; grande?: boolean }) {
  return (
    <span className="flex gap-0.5">
      {ETAPAS.map((e) => {
        const s = situacao(item.etapas?.[e.chave]);
        return (
          <span
            key={e.chave}
            title={`${e.nome}: ${ROTULO_SITUACAO[s].toLowerCase()}`}
            className={`rounded px-1 font-mono font-bold ${grande ? "text-xs" : "text-[10px]"} ${COR_SITUACAO[s]}`}
          >
            {e.curto}
          </span>
        );
      })}
    </span>
  );
}

// "2026-10-17T10:20" (campo datetime-local, hora deste aparelho) a partir do ISO.
function paraLocal(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type Edicao = { id: number; em: string; obs: string };

function emAndamento(i: ItemDatabook): boolean {
  return Object.values(i.etapas ?? {}).some((e) => e.inicio_em && !e.fim_em);
}

type LinhaHist =
  | { tipo: "etapa"; em: string; a: ApontamentoEtapaDatabook }
  | { tipo: "status"; em: string; campo: string; de: string | null; para: string | null; por: string | null; desfeito: boolean };

export default function DataBookApontar({
  itens,
  usuario,
  onItem,
}: {
  itens: ItemDatabook[];
  usuario: string | null;
  onItem: (item: ItemDatabook) => void; // item atualizado (mantém a foto que já estava)
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null); // "etapa:acao"
  const [confirmar, setConfirmar] = useState<string | null>(null); // 1º toque no ✔ Fim de book / 🗑
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [hist, setHist] = useState<LinhaHist[] | null>(null);
  const [versaoHist, setVersaoHist] = useState(0);
  const [editando, setEditando] = useState<Edicao | null>(null);
  const [tela, setTela] = useState<"pedidos" | "historico">("pedidos");

  // Pedido do usuário (17/10/2026): cada um só edita/exclui o que ELE apontou;
  // o admin (flpmac14) mexe em qualquer um. O servidor confere de novo.
  const ehAdmin = (usuario ?? "").toLowerCase() === EMAIL_FINANCEIRO;
  const podeMexer = (por: string | null) => !!usuario && (ehAdmin || usuario.toLowerCase() === (por ?? "").toLowerCase());

  const aberto = abertoId ? (itens.find((i) => i.id === abertoId) ?? null) : null;

  const contagem = useMemo(
    () => ({
      ativos: itens.filter((i) => i.st === "A").length,
      andamento: itens.filter(emAndamento).length,
      encerrados: itens.filter((i) => i.st === "E").length,
      todos: itens.length,
    }),
    [itens],
  );

  const lista = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return itens
      .filter((i) =>
        filtro === "ativos" ? i.st === "A" : filtro === "andamento" ? emAndamento(i) : filtro === "encerrados" ? i.st === "E" : true,
      )
      .filter((i) => !termo || textoBusca(i).includes(termo))
      .sort((a, b) => Number(emAndamento(b)) - Number(emAndamento(a)) || a.po.localeCompare(b.po, "pt-BR", { numeric: true }));
  }, [itens, busca, filtro]);

  // Histórico do pedido aberto: etapas + trocas de ST.BOOK/falta/obs. (mais recente primeiro).
  useEffect(() => {
    if (!abertoId) return;
    let ativo = true;
    Promise.all([historicoEtapasDatabook(abertoId).catch(() => []), historicoDatabook(abertoId).catch(() => [])]).then(([etapas, status]) => {
      if (!ativo) return;
      const linhas: LinhaHist[] = [
        ...etapas.map((a) => ({ tipo: "etapa" as const, em: a.em, a })),
        ...status.map((s) => ({ tipo: "status" as const, ...s })),
      ];
      setHist(linhas.sort((x, y) => y.em.localeCompare(x.em)));
    });
    return () => {
      ativo = false;
    };
  }, [abertoId, versaoHist]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  function abrir(id: string) {
    setAbertoId(id);
    setHist(null);
    setObs("");
    setConfirmar(null);
    setEditando(null);
  }

  async function apontar(etapa: string, acao: AcaoEtapaDatabook) {
    if (!aberto) return;
    const chave = `${etapa}:${acao}`;
    // Fim de book = ST.BOOK PRONTO: pede um segundo toque pra confirmar.
    if (etapa === "fim_book" && acao === "fim" && confirmar !== chave) {
      setConfirmar(chave);
      return;
    }
    setConfirmar(null);
    setSalvando(chave);
    try {
      const item = await apontarEtapaDatabook(aberto.id, etapa, acao, obs.trim() || null, usuario);
      onItem(item);
      setObs("");
      setVersaoHist((v) => v + 1);
      const nome = NOME_ETAPA.get(etapa)?.nome ?? etapa;
      const retomou = acao === "inicio" && !!aberto.etapas?.[etapa]?.pausado_em;
      setAviso({
        ok: true,
        texto: `✔ ${nome}: ${retomou ? "retomado" : acao === "inicio" ? "início" : acao === "pausa" ? "pausado" : "finalizado"}`,
      });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setSalvando(null);
    }
  }

  async function desfazer(id: number) {
    const chave = `desfazer:${id}`;
    if (confirmar !== chave) {
      setConfirmar(chave);
      return;
    }
    setConfirmar(null);
    try {
      onItem(await desfazerEtapaDatabook(id, usuario));
      setVersaoHist((v) => v + 1);
      setAviso({ ok: true, texto: "🗑 Apontamento excluído" });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    }
  }

  async function salvarEdicao() {
    if (!editando) return;
    const data = new Date(editando.em);
    if (isNaN(data.getTime())) return setAviso({ ok: false, texto: "Data/hora inválida." });
    setSalvando(`editar:${editando.id}`);
    try {
      onItem(await editarEtapaDatabook(editando.id, data.toISOString(), editando.obs.trim() || null, usuario));
      setEditando(null);
      setVersaoHist((v) => v + 1);
      setAviso({ ok: true, texto: "✏️ Apontamento corrigido" });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setSalvando(null);
    }
  }

  // ✏️ / 🗑 de um apontamento — só aparece pra quem apontou e pro admin.
  // (Funções que devolvem JSX, não componentes: o campo em edição não perde o foco.)
  function acoes(id: number | null | undefined, por: string | null, em: string, obsAtual: string | null) {
    if (!id || !podeMexer(por)) return null;
    return (
      <span className="ml-1 inline-flex gap-1 align-middle">
        <button
          type="button"
          onClick={() => setEditando({ id, em: paraLocal(em), obs: obsAtual ?? "" })}
          title="Editar data/hora e observação"
          className="rounded border border-stone-300 px-1.5 text-[11px] font-bold text-stone-600 hover:border-green-600 dark:border-slate-600 dark:text-slate-300"
        >
          ✏️ Editar
        </button>
        <button
          type="button"
          onClick={() => desfazer(id)}
          title="Apontou errado? Exclui este apontamento"
          className={`rounded border px-1.5 text-[11px] font-bold ${
            confirmar === `desfazer:${id}`
              ? "border-red-700 bg-red-600 text-white"
              : "border-stone-300 text-stone-600 hover:border-red-500 hover:text-red-600 dark:border-slate-600 dark:text-slate-300"
          }`}
        >
          {confirmar === `desfazer:${id}` ? "Excluir? toque de novo" : "🗑 Excluir"}
        </button>
      </span>
    );
  }

  function editor(id: number | null | undefined) {
    if (!editando || !id || editando.id !== id) return null;
    return (
      <span className="mt-1 flex flex-col gap-1.5 rounded-lg border-2 border-green-600 bg-green-50 p-2 text-left dark:border-cyan-500 dark:bg-slate-950">
        <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-stone-700 dark:text-slate-300">
          Data e hora
          <input
            type="datetime-local"
            value={editando.em}
            max={paraLocal(new Date().toISOString())}
            onChange={(e) => setEditando({ ...editando, em: e.target.value })}
            className="h-10 rounded-lg border-2 border-stone-300 bg-white px-2 text-sm text-stone-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-semibold text-stone-700 dark:text-slate-300">
          Observação
          <input
            value={editando.obs}
            maxLength={500}
            onChange={(e) => setEditando({ ...editando, obs: e.target.value })}
            className="h-10 rounded-lg border-2 border-stone-300 bg-white px-2 text-sm text-stone-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <span className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={salvarEdicao}
            disabled={salvando !== null}
            className="h-10 rounded-lg bg-green-600 text-sm font-bold text-white disabled:opacity-60"
          >
            {salvando === `editar:${id}` ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => setEditando(null)}
            className="h-10 rounded-lg border-2 border-stone-300 text-sm font-bold text-stone-700 dark:border-slate-600 dark:text-slate-300"
          >
            Cancelar
          </button>
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {aviso && (
        <div
          className={`fixed inset-x-4 top-4 z-[80] mx-auto max-w-md rounded-xl border-2 p-3 text-center text-lg font-bold shadow-lg ${
            aviso.ok
              ? "border-green-600 bg-green-50 text-green-700 dark:bg-green-950/95 dark:text-green-300"
              : "border-red-600 bg-red-50 text-red-700 dark:bg-red-950/95 dark:text-red-300"
          }`}
        >
          {aviso.texto}
        </div>
      )}

      {/* Pedido do usuário (17/10/2026): histórico pra todos, igual à Usinagem. */}
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-stone-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900/40">
        {(
          [
            ["pedidos", "📋 Pedidos"],
            ["historico", "🕘 Histórico"],
          ] as const
        ).map(([t, r]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTela(t)}
            className={`h-12 rounded-lg text-base font-bold ${
              tela === t ? "bg-green-600 text-white dark:bg-cyan-500 dark:text-slate-950" : "text-stone-600 dark:text-slate-300"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {tela === "historico" ? (
        <DataBookHistorico itens={itens} etapas={ETAPAS} versao={versaoHist} abrir={abrir} />
      ) : (
      <>
      <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:p-4">
        <div className="flex gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            type="search"
            autoComplete="off"
            placeholder="🔍 PO, MAC, desenho, cliente…"
            className="h-14 min-w-0 flex-1 rounded-xl border-2 border-stone-300 bg-white px-4 text-lg text-stone-900 outline-none focus:border-green-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
              className="h-14 w-14 shrink-0 rounded-xl border-2 border-stone-300 text-2xl text-stone-600 dark:border-slate-600 dark:text-slate-300"
            >
              ✕
            </button>
          )}
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ["ativos", `Ativos (${contagem.ativos})`],
              ["andamento", `▶ Em andamento (${contagem.andamento})`],
              ["encerrados", `Encerrados (${contagem.encerrados})`],
              ["todos", `Todos (${contagem.todos})`],
            ] as [Filtro, string][]
          ).map(([f, rotulo]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold ${
                filtro === f
                  ? "border-green-600 bg-green-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                  : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-slate-400">
          Etapas:
          <span className={`rounded px-1.5 font-bold ${COR_SITUACAO.nada}`}>não iniciada</span>
          <span className={`rounded px-1.5 font-bold ${COR_SITUACAO.andamento}`}>em andamento</span>
          <span className={`rounded px-1.5 font-bold ${COR_SITUACAO.feito}`}>finalizada</span>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {lista.slice(0, MAX_CARTOES).map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => abrir(i.id)}
            className="flex gap-3 rounded-xl border-2 border-stone-200 bg-white p-2 text-left hover:border-green-600 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-500"
          >
            <Foto item={i} classe="h-24 w-24 shrink-0 rounded-lg" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-mono text-lg font-bold text-stone-900 dark:text-white">PO {i.po}</span>
              <span className="line-clamp-2 text-sm leading-snug text-stone-700 dark:text-slate-300">{i.descricao ?? "—"}</span>
              <span className="truncate text-xs text-stone-500 dark:text-slate-400">
                {i.cliente ?? "—"} · {i.mac ?? "—"} · {i.desenho ?? "—"}
              </span>
              <span className="mt-auto flex flex-col gap-1 pt-1">
                <FaixaEtapas item={i} />
                {i.st_book && <span className="text-[11px] font-semibold text-stone-600 dark:text-slate-400">ST.BOOK: {i.st_book}</span>}
              </span>
            </span>
          </button>
        ))}
      </div>
      {lista.length > MAX_CARTOES && (
        <p className="text-center text-sm text-stone-500 dark:text-slate-400">
          Mostrando {MAX_CARTOES} de {lista.length} — pesquise acima para achar o pedido.
        </p>
      )}
      {lista.length === 0 && <p className="py-10 text-center text-stone-500 dark:text-slate-400">Nenhum pedido encontrado.</p>}
      </>
      )}

      {aberto && (
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setAbertoId(null)}>
          <div
            className="flex h-full w-full flex-col overflow-y-auto bg-stone-50 dark:bg-slate-950 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start gap-3">
                <Foto item={aberto} classe="h-20 w-20 shrink-0 rounded-lg border border-stone-200 dark:border-slate-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-2xl font-extrabold leading-tight text-stone-900 dark:text-white">PO {aberto.po}</p>
                  <p className="line-clamp-2 text-sm text-stone-700 dark:text-slate-300">{aberto.descricao}</p>
                  <p className="text-xs text-stone-500 dark:text-slate-400">
                    {aberto.cliente ?? "—"} · {aberto.mac ?? "—"} · {aberto.desenho ?? "—"} · ST {aberto.st ?? "—"}
                    {aberto.st_book && <> · ST.BOOK <strong>{aberto.st_book}</strong></>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAbertoId(null)}
                  aria-label="Fechar"
                  className="h-12 w-12 shrink-0 rounded-xl border-2 border-stone-300 text-xl font-semibold text-stone-700 dark:border-slate-600 dark:text-slate-200"
                >
                  ✕
                </button>
              </div>
              <div className="mt-2">
                <FaixaEtapas item={aberto} grande />
              </div>
            </div>

            <div className="flex flex-col gap-3 p-3 sm:p-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">Observação (opcional) — vai junto do próximo toque</span>
                <input
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  maxLength={500}
                  placeholder="Ex.: falta assinatura do inspetor"
                  className="h-12 rounded-xl border-2 border-stone-300 bg-white px-3 text-base text-stone-900 outline-none focus:border-green-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
                />
              </label>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setObs(s)}
                    className="shrink-0 rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-700 dark:border-slate-600 dark:text-slate-300"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {ETAPAS.map((et) => {
                  const e = aberto.etapas?.[et.chave];
                  const s = situacao(e);
                  const fimConfirmar = confirmar === `${et.chave}:fim`;
                  return (
                    <div
                      key={et.chave}
                      className={`flex flex-col gap-2 rounded-2xl border-2 bg-white p-3 dark:bg-slate-900 ${
                        s === "feito"
                          ? "border-green-500"
                          : s === "andamento"
                            ? "border-amber-400"
                            : s === "pausado"
                              ? "border-sky-500"
                              : "border-stone-200 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-lg font-extrabold leading-tight text-stone-900 dark:text-white">
                          {et.icone} {et.nome}
                        </p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_SITUACAO[s]}`}>{ROTULO_SITUACAO[s]}</span>
                      </div>
                      <p className="min-h-[2.5rem] text-xs leading-snug text-stone-600 dark:text-slate-400">
                        {e?.inicio_em && (
                          <span className="block py-0.5">
                            ▶ Início {quando(e.inicio_em)}
                            {e.inicio_por && ` · ${e.inicio_por}`}
                            {acoes(e.inicio_id, e.inicio_por, e.inicio_em, e.obs)}
                            {editor(e.inicio_id)}
                          </span>
                        )}
                        {e?.pausado_em && (
                          <span className="block py-0.5 font-semibold text-sky-700 dark:text-sky-300">
                            ⏸ Pausado {quando(e.pausado_em)}
                            {e.pausado_por && ` · ${e.pausado_por}`}
                            {acoes(e.pausado_id ?? null, e.pausado_por ?? null, e.pausado_em, e.obs)}
                            {editor(e.pausado_id ?? null)}
                          </span>
                        )}
                        {e?.fim_em && (
                          <span className="block py-0.5">
                            ✔ Finalizado {quando(e.fim_em)}
                            {e.fim_por && ` · ${e.fim_por}`}
                            {acoes(e.fim_id, e.fim_por, e.fim_em, e.obs)}
                            {editor(e.fim_id)}
                          </span>
                        )}
                        {e?.inicio_em && (
                          <span className="block font-semibold text-stone-800 dark:text-slate-200">
                            ⏱ {duracao(tempoEtapa(e))}
                            {!e.fim_em && (e.pausado_em ? " (pausado)" : " até agora")}
                            {(e.pausas?.length ?? 0) > 0 && (
                              <span className="font-normal text-stone-500 dark:text-slate-400"> · {e.pausas!.length} pausa(s) descontada(s)</span>
                            )}
                          </span>
                        )}
                        {e?.obs && <span className="block italic">“{e.obs}”</span>}
                        {!e && "Ainda não apontado."}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => apontar(et.chave, "inicio")}
                          disabled={salvando !== null || s === "andamento"}
                          className={`flex min-h-14 items-center justify-center gap-1 rounded-xl border-4 px-1 text-sm font-extrabold active:scale-[0.97] disabled:opacity-60 sm:text-base ${
                            s === "andamento"
                              ? "border-amber-500 bg-amber-400 text-stone-900"
                              : "border-amber-400 bg-white text-amber-700 dark:bg-slate-900 dark:text-amber-300"
                          }`}
                        >
                          {salvando === `${et.chave}:inicio`
                            ? "Salvando…"
                            : s === "feito"
                              ? "↻ RECOMEÇAR"
                              : s === "pausado"
                                ? "▶ RETOMAR"
                                : "▶ INÍCIO"}
                        </button>
                        <button
                          type="button"
                          onClick={() => apontar(et.chave, "pausa")}
                          disabled={salvando !== null || s !== "andamento"}
                          className={`flex min-h-14 items-center justify-center gap-1 rounded-xl border-4 px-1 text-sm font-extrabold active:scale-[0.97] disabled:opacity-40 sm:text-base ${
                            s === "pausado"
                              ? "border-sky-600 bg-sky-500 text-white"
                              : "border-sky-500 bg-white text-sky-700 dark:bg-slate-900 dark:text-sky-300"
                          }`}
                        >
                          {salvando === `${et.chave}:pausa` ? "Salvando…" : s === "pausado" ? "⏸ PAUSADO" : "⏸ PAUSAR"}
                        </button>
                        <button
                          type="button"
                          onClick={() => apontar(et.chave, "fim")}
                          disabled={salvando !== null || s === "feito"}
                          className={`flex min-h-14 items-center justify-center gap-1 rounded-xl border-4 px-1 text-sm font-extrabold active:scale-[0.97] disabled:opacity-60 sm:text-base ${
                            fimConfirmar
                              ? "border-red-700 bg-red-600 text-white"
                              : s === "feito"
                                ? "border-green-700 bg-green-600 text-white"
                                : "border-green-600 bg-white text-green-700 dark:bg-slate-900 dark:text-green-400"
                          }`}
                        >
                          {salvando === `${et.chave}:fim` ? "Salvando…" : fimConfirmar ? "Book PRONTO? Toque de novo" : "✔ FINALIZADO"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="mb-2 text-base font-extrabold text-stone-900 dark:text-white">🕘 Histórico do pedido</p>
                {hist === null ? (
                  <p className="text-sm text-stone-500">Carregando…</p>
                ) : hist.length === 0 ? (
                  <p className="text-sm text-stone-500">Nada apontado ainda.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-stone-100 dark:divide-slate-800">
                    {hist.map((h) =>
                      h.tipo === "etapa" ? (
                        <li key={`e${h.a.id}`} className={`flex flex-wrap items-start gap-2 py-1.5 text-sm ${h.a.desfeito ? "opacity-50 line-through" : ""}`}>
                          <span className="w-24 shrink-0 text-xs text-stone-500 dark:text-slate-400">{quando(h.em)}</span>
                          <span className="min-w-0 flex-1 text-stone-800 dark:text-slate-200">
                            {NOME_ETAPA.get(h.a.etapa)?.icone} <strong>{NOME_ETAPA.get(h.a.etapa)?.nome ?? h.a.etapa}</strong>:{" "}
                            {TEXTO_ACAO[h.a.acao]}
                            {h.a.por && <span className="text-stone-500"> · {h.a.por}</span>}
                            {h.a.observacao && <span className="block text-xs italic text-stone-500">“{h.a.observacao}”</span>}
                          </span>
                          {!h.a.desfeito && (
                            <span className="w-full text-right sm:w-auto sm:shrink-0">
                              {acoes(h.a.id, h.a.por, h.a.em, h.a.observacao)}
                              {editor(h.a.id)}
                            </span>
                          )}
                        </li>
                      ) : (
                        <li key={`s${h.em}${h.campo}`} className={`flex items-start gap-2 py-1.5 text-sm ${h.desfeito ? "opacity-50 line-through" : ""}`}>
                          <span className="w-24 shrink-0 text-xs text-stone-500 dark:text-slate-400">{quando(h.em)}</span>
                          <span className="min-w-0 flex-1 text-stone-700 dark:text-slate-300">
                            {h.campo === "st_book" ? "ST.BOOK" : h.campo === "falta" ? "Falta p/ finalizar" : h.campo === "observacao" ? "Obs." : h.campo}:{" "}
                            {h.para || "(apagado)"}
                            {h.por && <span className="text-stone-500"> · {h.por}</span>}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
