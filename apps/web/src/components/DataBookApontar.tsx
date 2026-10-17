"use client";

// Apontamento do Data book por etapa — pedido do usuário (17/10/2026): igual à
// Usinagem/Pintura (botões grandes, um toque, pelo celular e no computador).
// Cada etapa tem ▶ Início e ✔ Finalizado e o histórico vai se montando:
// Relatório de caldeiraria, de usinagem, de solda, de pintura, Rastreabilidade,
// Montando book e Fim de book. Rastreabilidade / Montando book / Fim de book
// continuam mexendo no ST.BOOK como antes (app/databook_etapas.py) — nada do
// que já estava apontado se perde (aparece como situação da etapa).

import { useEffect, useMemo, useState } from "react";
import {
  apontarEtapaDatabook,
  desfazerEtapaDatabook,
  historicoDatabook,
  historicoEtapasDatabook,
  urlImagemFollowUp,
  type ApontamentoEtapaDatabook,
} from "@/lib/api";
import { quando } from "@/components/ApontamentoComum";
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
type Situacao = "nada" | "andamento" | "feito";

function situacao(e: EtapaDatabook | undefined): Situacao {
  if (!e) return "nada";
  if (e.fim_em) return "feito";
  return e.inicio_em ? "andamento" : "nada";
}

const COR_SITUACAO: Record<Situacao, string> = {
  nada: "bg-stone-200 text-stone-500 dark:bg-slate-800 dark:text-slate-500",
  andamento: "bg-amber-400 text-stone-900",
  feito: "bg-green-600 text-white",
};

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
            title={`${e.nome}: ${s === "feito" ? "finalizado" : s === "andamento" ? "em andamento" : "não iniciado"}`}
            className={`rounded px-1 font-mono font-bold ${grande ? "text-xs" : "text-[10px]"} ${COR_SITUACAO[s]}`}
          >
            {e.curto}
          </span>
        );
      })}
    </span>
  );
}

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
  }

  async function apontar(etapa: string, acao: "inicio" | "fim") {
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
      setAviso({ ok: true, texto: `✔ ${nome}: ${acao === "inicio" ? "início" : "finalizado"} salvo` });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    } finally {
      setSalvando(null);
    }
  }

  async function desfazer(a: ApontamentoEtapaDatabook) {
    const chave = `desfazer:${a.id}`;
    if (confirmar !== chave) {
      setConfirmar(chave);
      return;
    }
    setConfirmar(null);
    try {
      onItem(await desfazerEtapaDatabook(a.id));
      setVersaoHist((v) => v + 1);
      setAviso({ ok: true, texto: "🗑 Apontamento desfeito" });
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
    }
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
                        s === "feito" ? "border-green-500" : s === "andamento" ? "border-amber-400" : "border-stone-200 dark:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-lg font-extrabold leading-tight text-stone-900 dark:text-white">
                          {et.icone} {et.nome}
                        </p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${COR_SITUACAO[s]}`}>
                          {s === "feito" ? "FINALIZADO" : s === "andamento" ? "EM ANDAMENTO" : "NÃO INICIADO"}
                        </span>
                      </div>
                      <p className="min-h-[2.5rem] text-xs leading-snug text-stone-600 dark:text-slate-400">
                        {e?.inicio_em && (
                          <span className="block">
                            ▶ Início {quando(e.inicio_em)}
                            {e.inicio_por && ` · ${e.inicio_por}`}
                          </span>
                        )}
                        {e?.fim_em && (
                          <span className="block">
                            ✔ Finalizado {quando(e.fim_em)}
                            {e.fim_por && ` · ${e.fim_por}`}
                          </span>
                        )}
                        {e?.inicio_em && (
                          <span className="block font-semibold text-stone-800 dark:text-slate-200">
                            ⏱ {duracao(minutosUteis(e.inicio_em, e.fim_em ?? new Date()))}
                            {!e.fim_em && " até agora"}
                          </span>
                        )}
                        {e?.obs && <span className="block italic">“{e.obs}”</span>}
                        {!e && "Ainda não apontado."}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => apontar(et.chave, "inicio")}
                          disabled={salvando !== null || s === "andamento"}
                          className={`flex min-h-14 items-center justify-center gap-1 rounded-xl border-4 px-2 text-base font-extrabold active:scale-[0.97] disabled:opacity-60 ${
                            s === "andamento"
                              ? "border-amber-500 bg-amber-400 text-stone-900"
                              : "border-amber-400 bg-white text-amber-700 dark:bg-slate-900 dark:text-amber-300"
                          }`}
                        >
                          {salvando === `${et.chave}:inicio` ? "Salvando…" : s === "feito" ? "↻ RECOMEÇAR" : "▶ INÍCIO"}
                        </button>
                        <button
                          type="button"
                          onClick={() => apontar(et.chave, "fim")}
                          disabled={salvando !== null || s === "feito"}
                          className={`flex min-h-14 items-center justify-center gap-1 rounded-xl border-4 px-2 text-base font-extrabold active:scale-[0.97] disabled:opacity-60 ${
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
                        <li key={`e${h.a.id}`} className={`flex items-start gap-2 py-1.5 text-sm ${h.a.desfeito ? "opacity-50 line-through" : ""}`}>
                          <span className="w-24 shrink-0 text-xs text-stone-500 dark:text-slate-400">{quando(h.em)}</span>
                          <span className="min-w-0 flex-1 text-stone-800 dark:text-slate-200">
                            {NOME_ETAPA.get(h.a.etapa)?.icone} <strong>{NOME_ETAPA.get(h.a.etapa)?.nome ?? h.a.etapa}</strong>:{" "}
                            {h.a.acao === "inicio" ? "▶ início" : "✔ finalizado"}
                            {h.a.por && <span className="text-stone-500"> · {h.a.por}</span>}
                            {h.a.observacao && <span className="block text-xs italic text-stone-500">“{h.a.observacao}”</span>}
                          </span>
                          {!h.a.desfeito && (
                            <button
                              type="button"
                              onClick={() => desfazer(h.a)}
                              title="Apontado errado? Desfaz este toque (o ST.BOOK não volta — use o 🗑 do ST.BOOK na planilha)"
                              className={`shrink-0 rounded px-1.5 text-xs font-bold ${
                                confirmar === `desfazer:${h.a.id}` ? "bg-red-600 text-white" : "text-stone-400 hover:text-red-600"
                              }`}
                            >
                              {confirmar === `desfazer:${h.a.id}` ? "Desfazer?" : "🗑"}
                            </button>
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
