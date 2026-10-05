"use client";

// Apontamento por setor no Follow up (hoje: Usinagem) — pedido explícito do
// usuário: o líder do setor (saymon) usa PELO CELULAR. Mesmo padrão da aba
// Corte (botões grandes, cartões, um toque), mas por pedido do Follow up:
//   busca geral (desenho, MAC, PO, prazo...) → toca no pedido (com foto) →
//   aba "Apontar" (3 botões + operador + observação + Salvar) ou "Informações".
// Aba "Histórico" (components/ApontamentoHistorico.tsx): o que cada operador
// está fazendo agora + linha do tempo.
// Os dados do pedido são os do Follow up (nada novo); o apontamento grava
// histórico + Registro diário do item (app/apontamentos_setor.py).

import { useEffect, useMemo, useState } from "react";
import { Foto, quando } from "@/components/ApontamentoComum";
import ApontamentoHistorico from "@/components/ApontamentoHistorico";
import { SeloPrazo } from "@/components/FollowUpDetalhe";
import {
  apontarItem,
  buscarApontamentos,
  buscarHistoricoApontamento,
  listarFollowUp,
  urlImagemFollowUp,
  type Apontamento,
  type StatusApontamento,
} from "@/lib/api";
import type { ConfigSetor } from "@/lib/apontamento";
import { normalizarBusca } from "@/lib/busca";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import type { ItemFollowUp } from "@/lib/types";

const RECARREGAR_A_CADA_MS = 3 * 60 * 1000;
const MAX_CARTOES = 60; // sem busca, mostra os primeiros (a busca acha o resto)

type Filtro = "todos" | StatusApontamento;

function textoBusca(i: ItemFollowUp): string {
  return normalizarBusca(
    [i.po, i.mac, i.desenho, i.descricao, i.cliente, i.nf, i.prazo_contratual && formatarDataBr(i.prazo_contratual)]
      .filter(Boolean)
      .join(" "),
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">{rotulo}</p>
      <div className="mt-0.5 break-words text-lg font-semibold text-stone-900 dark:text-white">{children ?? "—"}</div>
    </div>
  );
}

export default function ApontamentoSetor({ config }: { config: ConfigSetor }) {
  const [itens, setItens] = useState<ItemFollowUp[]>([]);
  const [atuais, setAtuais] = useState<Record<string, Apontamento>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [usuario, setUsuario] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abertoId, setAbertoId] = useState<string | null>(null);
  const [aba, setAba] = useState<"apontar" | "info">("apontar");
  const [escolha, setEscolha] = useState<StatusApontamento | null>(null);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState("");
  const [historico, setHistorico] = useState<Apontamento[] | null>(null);
  const [operadores, setOperadores] = useState<string[]>([]);
  const [operador, setOperador] = useState<string | null>(null);
  const [tela, setTela] = useState<"pedidos" | "historico">("pedidos");
  const [versao, setVersao] = useState(0); // muda a cada salvar → Histórico recarrega

  const opcao = useMemo(() => new Map(config.opcoes.map((o) => [o.status, o])), [config]);

  useEffect(() => {
    let ativo = true;
    function buscar() {
      Promise.all([listarFollowUp(), buscarApontamentos(config.setor)])
        .then(([f, a]) => {
          if (!ativo) return;
          setItens(f.itens.filter((i) => i.presente_na_ultima_importacao));
          setAtuais(a.atuais);
          setOperadores(a.operadores);
          setErro("");
        })
        .catch((e: Error) => ativo && setErro(e.message))
        .finally(() => ativo && setCarregando(false));
    }
    buscar();
    const id = setInterval(buscar, RECARREGAR_A_CADA_MS);
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => ativo && data.user?.email && setUsuario(emailParaLogin(data.user.email)));
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [config.setor]);

  // Histórico do pedido aberto (aba Informações).
  useEffect(() => {
    if (!abertoId) return;
    let ativo = true;
    buscarHistoricoApontamento(config.setor, abertoId)
      .then((h) => ativo && setHistorico(h))
      .catch(() => ativo && setHistorico([]));
    return () => {
      ativo = false;
    };
  }, [abertoId, config.setor]);

  const textos = useMemo(() => new Map(itens.map((i) => [i.id, textoBusca(i)])), [itens]);

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todos: itens.length, em_andamento: 0, finalizado: 0, falta_material: 0 };
    for (const i of itens) {
      const a = atuais[i.id];
      if (a) c[a.status]++;
    }
    return c;
  }, [itens, atuais]);

  const lista = useMemo(() => {
    const termos = normalizarBusca(busca).split(" ").filter(Boolean);
    // Primeiro o que está em andamento / com falta, depois pelo prazo mais próximo; finalizados no fim.
    const peso = (i: ItemFollowUp) => {
      const s = atuais[i.id]?.status;
      return s === "em_andamento" ? 0 : s === "falta_material" ? 1 : s === "finalizado" ? 3 : 2;
    };
    return itens
      .filter((i) => (filtro === "todos" ? true : atuais[i.id]?.status === filtro))
      .filter((i) => termos.every((t) => textos.get(i.id)!.includes(t)))
      .sort((a, b) => peso(a) - peso(b) || (a.prazo_contratual ?? "9999").localeCompare(b.prazo_contratual ?? "9999"));
  }, [itens, atuais, busca, filtro, textos]);

  const aberto = abertoId ? (itens.find((i) => i.id === abertoId) ?? null) : null;

  function abrir(i: ItemFollowUp) {
    setAbertoId(i.id);
    setAba("apontar");
    setEscolha(null);
    // Quem já estava no pedido vem marcado (ex.: o mesmo operador dá o Fim de usinagem).
    setOperador(atuais[i.id]?.operador ?? null);
    setObs("");
    setHistorico(null);
  }

  function fechar() {
    setAbertoId(null);
  }

  async function salvar() {
    if (!aberto || !escolha || !operador) return;
    setSalvando(true);
    setErro("");
    try {
      const a = await apontarItem(config.setor, aberto.id, escolha, operador, obs, usuario);
      setAtuais((m) => ({ ...m, [aberto.id]: a }));
      setVersao((v) => v + 1);
      setSalvo(`✔ Salvo: ${opcao.get(escolha)?.rotulo} (${operador}) — ${aberto.desenho ?? aberto.po}`);
      setTimeout(() => setSalvo(""), 4000);
      fechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  function sugerir(s: string) {
    setObs((o) => (o.trim() ? `${o.trim()}; ${s}` : s));
  }

  const atualAberto = aberto ? atuais[aberto.id] : undefined;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      {salvo && (
        <div className="sticky top-2 z-20 rounded-xl border-2 border-green-600 bg-green-50 p-3 text-center text-lg font-bold text-green-700 shadow-lg dark:bg-green-950/90 dark:text-green-300">
          {salvo}
        </div>
      )}

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
        <ApontamentoHistorico
          config={config}
          itens={itens}
          atuais={atuais}
          operadores={operadores}
          versao={versao}
          abrir={abrir}
        />
      ) : (
      <>
      <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:p-4">
        <div className="flex gap-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            type="search"
            autoComplete="off"
            placeholder="🔍 Desenho, MAC, PO, prazo…"
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
              ["todos", `Todos (${contagem.todos})`],
              ...config.opcoes.map((o) => [o.status, `${o.rotulo.charAt(0)}${o.rotulo.slice(1).toLowerCase()} (${contagem[o.status]})`]),
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
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{erro}</div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {lista.slice(0, MAX_CARTOES).map((i) => {
          const a = atuais[i.id];
          const o = a ? opcao.get(a.status) : undefined;
          return (
            <button
              key={i.id}
              type="button"
              onClick={() => abrir(i)}
              className="flex gap-3 rounded-xl border-2 border-stone-200 bg-white p-2 text-left hover:border-green-600 active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-500"
            >
              <Foto item={i} classe="h-24 w-24 shrink-0 rounded-lg" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-mono text-lg font-bold text-stone-900 dark:text-white">{i.desenho ?? i.po}</span>
                <span className="line-clamp-2 text-sm leading-snug text-stone-700 dark:text-slate-300">{i.descricao ?? "—"}</span>
                <span className="truncate text-xs text-stone-500 dark:text-slate-400">
                  {i.mac ?? "—"} · {formatarNumero(i.quantidade ?? 0, 0)} pç · PO {i.po}
                </span>
                <span className="mt-auto flex flex-wrap items-center gap-1 pt-0.5">
                  <SeloPrazo prazo={i.prazo_contratual} compacto />
                  {o && a && (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${o.selo}`}>
                      {o.icone} {o.rotulo}
                      {a.operador ? ` · ${a.operador}` : ""} · {quando(a.em)}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {lista.length > MAX_CARTOES && (
        <p className="text-center text-sm text-stone-500 dark:text-slate-400">
          Mostrando {MAX_CARTOES} de {lista.length} — pesquise acima para achar o pedido.
        </p>
      )}
      {lista.length === 0 && (
        <p className="py-10 text-center text-stone-500 dark:text-slate-400">
          {carregando ? "Carregando… (o servidor pode levar até 1 minuto para acordar)" : "Nenhum pedido encontrado."}
        </p>
      )}
      </>
      )}

      {aberto && (
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4" onClick={fechar}>
          <div
            className="flex h-full w-full flex-col overflow-y-auto bg-stone-50 dark:bg-slate-950 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start gap-3">
                <Foto item={aberto} classe="h-20 w-20 shrink-0 rounded-lg border border-stone-200 dark:border-slate-700" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-2xl font-extrabold leading-tight text-stone-900 dark:text-white">{aberto.desenho ?? aberto.po}</p>
                  <p className="line-clamp-2 text-sm text-stone-700 dark:text-slate-300">{aberto.descricao}</p>
                  <p className="text-xs text-stone-500 dark:text-slate-400">
                    {aberto.mac ?? "—"} · {formatarNumero(aberto.quantidade ?? 0, 0)} pç · PO {aberto.po}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fechar}
                  aria-label="Fechar"
                  className="h-12 w-12 shrink-0 rounded-xl border-2 border-stone-300 text-xl font-semibold text-stone-700 dark:border-slate-600 dark:text-slate-200"
                >
                  ✕
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-stone-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
                {(
                  [
                    ["apontar", "✍️ Apontar"],
                    ["info", "ℹ️ Informações"],
                  ] as const
                ).map(([t, r]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAba(t)}
                    className={`h-12 rounded-lg text-base font-bold ${
                      aba === t ? "bg-green-600 text-white dark:bg-cyan-500 dark:text-slate-950" : "text-stone-600 dark:text-slate-300"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {aba === "apontar" ? (
              <div className="flex flex-col gap-3 p-4">
                {atualAberto && (
                  <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700 dark:bg-slate-900 dark:text-slate-300">
                    Situação atual: <strong>{opcao.get(atualAberto.status)?.rotulo}</strong>
                    {atualAberto.operador && <> · <strong>{atualAberto.operador}</strong></>} · {quando(atualAberto.em)}
                    {atualAberto.observacao && <span className="block text-stone-500 dark:text-slate-400">“{atualAberto.observacao}”</span>}
                  </p>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {config.opcoes.map((o) => {
                    const ligado = escolha === o.status;
                    return (
                      <button
                        key={o.status}
                        type="button"
                        onClick={() => setEscolha(o.status)}
                        aria-pressed={ligado}
                        className={`flex min-h-20 items-center justify-center gap-2 rounded-2xl border-4 px-3 py-3 text-2xl font-extrabold transition active:scale-[0.97] ${
                          ligado ? o.ligado : `bg-white dark:bg-slate-900 ${o.desligado}`
                        }`}
                      >
                        <span>{ligado ? "☑" : "☐"}</span>
                        <span>
                          {o.icone} {o.rotulo}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">Quem está operando?</span>
                  <div className="grid grid-cols-3 gap-2">
                    {operadores.map((op) => (
                      <button
                        key={op}
                        type="button"
                        onClick={() => setOperador(op)}
                        aria-pressed={operador === op}
                        className={`h-14 rounded-xl border-2 text-lg font-bold active:scale-[0.97] ${
                          operador === op
                            ? "border-green-700 bg-green-600 text-white dark:border-cyan-400 dark:bg-cyan-600"
                            : "border-stone-300 bg-white text-stone-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">Adicionar registro/observação (opcional)</span>
                  <textarea
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Ex.: Aguardando ferramenta"
                    className="rounded-xl border-2 border-stone-300 bg-white p-3 text-lg text-stone-900 outline-none focus:border-green-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  {config.sugestoes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => sugerir(s)}
                      className="rounded-full border-2 border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 active:scale-[0.97] dark:border-slate-600 dark:text-slate-300"
                    >
                      + {s}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={!escolha || !operador || salvando}
                  onClick={salvar}
                  className="sticky bottom-3 h-16 w-full rounded-2xl bg-green-700 text-2xl font-extrabold text-white shadow-lg active:scale-[0.98] disabled:opacity-50 dark:bg-cyan-600"
                >
                  {salvando ? "Salvando…" : !escolha ? "Escolha uma opção acima" : !operador ? "Escolha o operador" : "💾 Salvar"}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-4">
                {aberto.imagens.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {aberto.imagens.map((img) => (
                      <a key={img.id} href={urlImagemFollowUp(img.sha256)} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- mídia do calc_engine */}
                        <img
                          src={urlImagemFollowUp(img.sha256)}
                          alt={aberto.desenho ?? aberto.po}
                          className="h-48 max-w-[85vw] rounded-xl border border-stone-200 bg-white object-contain dark:border-slate-700"
                        />
                      </a>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Desenho">{aberto.desenho}</Campo>
                  <Campo rotulo="PO">{aberto.po}</Campo>
                  <Campo rotulo="MAC">{aberto.mac}</Campo>
                  <Campo rotulo="Quantidade">{aberto.quantidade === null ? null : formatarNumero(aberto.quantidade, 0)}</Campo>
                  <Campo rotulo="Prazo contratual">
                    <SeloPrazo prazo={aberto.prazo_contratual} />
                  </Campo>
                  <Campo rotulo="Cliente">{aberto.cliente}</Campo>
                </div>
                <Campo rotulo="Descrição">{aberto.descricao}</Campo>
                <div className="grid grid-cols-2 gap-2">
                  <Campo rotulo="Status no Follow up">{aberto.status}</Campo>
                  <Campo rotulo="Coleta">{aberto.coleta}</Campo>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Etapas</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {(["eng", "cor", "mon", "sol", "usi", "dob", "jat", "pin"] as const).map((e) => (
                      <div key={e} className="rounded-lg bg-stone-100 py-1.5 dark:bg-slate-800">
                        <p className="text-[11px] font-bold uppercase text-stone-500 dark:text-slate-400">{e}</p>
                        <p className="text-base font-bold text-stone-900 dark:text-white">{aberto[e] === null ? "—" : `${formatarNumero(aberto[e]!, 0)}%`}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Histórico da {config.nome}</p>
                  {historico === null && <p className="text-sm text-stone-500">Carregando…</p>}
                  {historico?.length === 0 && <p className="text-sm text-stone-500 dark:text-slate-400">Nenhum apontamento ainda.</p>}
                  <ul className="flex flex-col">
                    {historico?.map((h) => {
                      const o = opcao.get(h.status);
                      return (
                        <li key={h.id} className="border-t border-stone-100 py-2 first:border-t-0 dark:border-slate-800">
                          <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${o?.selo ?? ""}`}>
                            {o?.icone} {o?.rotulo}
                          </span>
                          <span className="ml-2 text-sm text-stone-600 dark:text-slate-400">
                            <strong className="text-stone-800 dark:text-slate-200">{h.operador ?? "—"}</strong> ·{new Date(h.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                          {h.observacao && <p className="mt-0.5 text-sm text-stone-800 dark:text-slate-200">{h.observacao}</p>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
