"use client";

// Apontamento por setor no Follow up (hoje: Usinagem) — pedido explícito do
// usuário: o líder do setor (saymon) usa PELO CELULAR. Mesmo padrão da aba
// Corte (botões grandes, cartões, um toque), mas por pedido do Follow up:
//   busca geral (desenho, MAC, PO, prazo...) → toca no pedido (com foto) →
//   aba "Apontar" (botões + operador + observação + Salvar) ou "Informações".
// Também a pedido do usuário:
//   - PAUSADO: o operador parou pra começar outra coisa (ao marcar Usinando,
//     o que ele estava usinando é pausado automaticamente, se deixar marcado);
//   - Serviço interno Macfab: usinagem pra uso próprio, sem pedido no Follow up;
//   - "Mesmo desenho": outros pedidos ativos com o mesmo desenho podem ser
//     apontados junto (soma a quantidade).
// Aba "Histórico" (components/ApontamentoHistorico.tsx): o que cada operador
// está fazendo agora + linha do tempo.
// Os dados do pedido são os do Follow up (nada novo); o apontamento grava
// histórico + Registro diário do item (app/apontamentos_setor.py).

import { useEffect, useMemo, useState } from "react";
import { Foto, FotoServico, chaveApontamento, quando, type Alvo } from "@/components/ApontamentoComum";
import ApontamentoHistorico from "@/components/ApontamentoHistorico";
import { SeloPrazo } from "@/components/FollowUpDetalhe";
import {
  apontarItem,
  apontarServico,
  buscarApontamentos,
  buscarHistoricoApontamento,
  criarServicoInterno,
  listarFollowUp,
  urlImagemFollowUp,
  type Apontamento,
  type DadosApontamento,
  type ServicoInterno,
  type StatusApontamento,
} from "@/lib/api";
import type { ConfigSetor, OpcaoApontamento } from "@/lib/apontamento";
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

// Desenho comparável ("ABC-123 rev.1 " e "abc-123 REV.1" são o mesmo).
function chaveDesenho(d: string | null): string {
  return normalizarBusca(d ?? "").replace(/\s+/g, "");
}

// Primeiro o que está em andamento / com falta / pausado, depois o resto; finalizados no fim.
function peso(s: StatusApontamento | undefined): number {
  return s === "em_andamento" ? 0 : s === "falta_material" ? 1 : s === "pausado" ? 2 : s === "finalizado" ? 4 : 3;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">{rotulo}</p>
      <div className="mt-0.5 break-words text-lg font-semibold text-stone-900 dark:text-white">{children ?? "—"}</div>
    </div>
  );
}

function SeloAtual({ a, opcao }: { a: Apontamento | undefined; opcao: Map<StatusApontamento, OpcaoApontamento> }) {
  const o = a ? opcao.get(a.status) : undefined;
  if (!o || !a) return null;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${o.selo}`}>
      {o.icone} {o.rotulo}
      {a.operador ? ` · ${a.operador}` : ""} · {quando(a.em)}
    </span>
  );
}

export default function ApontamentoSetor({ config }: { config: ConfigSetor }) {
  const [itens, setItens] = useState<ItemFollowUp[]>([]);
  const [servicos, setServicos] = useState<ServicoInterno[]>([]);
  const [atuais, setAtuais] = useState<Record<string, Apontamento>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [usuario, setUsuario] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [alvo, setAlvo] = useState<Alvo | null>(null);
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
  const [outros, setOutros] = useState<Set<string>>(new Set()); // pedidos do mesmo desenho apontados junto
  const [pausarOutros, setPausarOutros] = useState(true);
  const [novaDescricao, setNovaDescricao] = useState("");
  const [novaQtd, setNovaQtd] = useState("");

  const opcao = useMemo(() => new Map(config.opcoes.map((o) => [o.status, o])), [config]);

  useEffect(() => {
    let ativo = true;
    function buscar() {
      Promise.all([listarFollowUp(), buscarApontamentos(config.setor)])
        .then(([f, a]) => {
          if (!ativo) return;
          setItens(f.itens.filter((i) => i.presente_na_ultima_importacao));
          setAtuais(a.atuais);
          setServicos(a.servicos ?? []);
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

  const alvoId = alvo && alvo.tipo !== "novo" ? alvo.id : null;
  const alvoServico = alvo?.tipo === "servico";

  // Histórico do pedido/serviço aberto (aba Informações).
  useEffect(() => {
    if (!alvoId) return;
    let ativo = true;
    buscarHistoricoApontamento(config.setor, alvoId, alvoServico)
      .then((h) => ativo && setHistorico(h))
      .catch(() => ativo && setHistorico([]));
    return () => {
      ativo = false;
    };
  }, [alvoId, alvoServico, config.setor]);

  const textos = useMemo(() => new Map(itens.map((i) => [i.id, textoBusca(i)])), [itens]);
  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);

  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todos: itens.length + servicos.length, em_andamento: 0, pausado: 0, finalizado: 0, falta_material: 0 };
    for (const id of [...itens.map((i) => i.id), ...servicos.map((s) => s.id)]) {
      const a = atuais[id];
      if (a) c[a.status]++;
    }
    return c;
  }, [itens, servicos, atuais]);

  const termos = useMemo(() => normalizarBusca(busca).split(" ").filter(Boolean), [busca]);

  const lista = useMemo(() => {
    return itens
      .filter((i) => (filtro === "todos" ? true : atuais[i.id]?.status === filtro))
      .filter((i) => termos.every((t) => textos.get(i.id)!.includes(t)))
      .sort(
        (a, b) =>
          peso(atuais[a.id]?.status) - peso(atuais[b.id]?.status) ||
          (a.prazo_contratual ?? "9999").localeCompare(b.prazo_contratual ?? "9999"),
      );
  }, [itens, atuais, termos, filtro, textos]);

  const listaServicos = useMemo(() => {
    return servicos
      .filter((s) => (filtro === "todos" ? true : atuais[s.id]?.status === filtro))
      .filter((s) => termos.every((t) => normalizarBusca(`${s.descricao} interno macfab`).includes(t)))
      .sort((a, b) => peso(atuais[a.id]?.status) - peso(atuais[b.id]?.status));
  }, [servicos, atuais, termos, filtro]);

  const aberto = alvo?.tipo === "pedido" ? (porId.get(alvo.id) ?? null) : null;
  const servicoAberto = alvo?.tipo === "servico" ? (servicos.find((s) => s.id === alvo.id) ?? null) : null;
  const novo = alvo?.tipo === "novo";
  const chaveAberta = aberto?.id ?? servicoAberto?.id ?? null;
  const atualAberto = chaveAberta ? atuais[chaveAberta] : undefined;

  // Outros pedidos ativos com o mesmo desenho (pedido do usuário: apontar junto).
  const mesmoDesenho = useMemo(() => {
    const d = chaveDesenho(aberto?.desenho ?? null);
    if (!aberto || !d) return [];
    return itens
      .filter((i) => i.id !== aberto.id && chaveDesenho(i.desenho) === d)
      .sort((a, b) => (a.prazo_contratual ?? "9999").localeCompare(b.prazo_contratual ?? "9999"));
  }, [aberto, itens]);

  const totalPecas =
    (aberto?.quantidade ?? 0) + mesmoDesenho.filter((i) => outros.has(i.id)).reduce((s, i) => s + (i.quantidade ?? 0), 0);

  // O que o operador escolhido já está usinando (vai pausar ao marcar Usinando).
  const usinandoAgora =
    escolha !== "em_andamento" || !operador
      ? []
      : Object.values(atuais).filter((a) => {
          const k = chaveApontamento(a);
          return a.status === "em_andamento" && a.operador === operador && k !== chaveAberta && !outros.has(k);
        });

  function nomeAlvo(a: Apontamento): string {
    if (a.servico_id) return `🔧 ${a.servico ?? "serviço interno"}`;
    const i = a.item_id ? porId.get(a.item_id) : undefined;
    return i ? (i.desenho ?? `PO ${i.po}`) : "pedido";
  }

  function abrir(novoAlvo: Alvo) {
    setAlvo(novoAlvo);
    setAba("apontar");
    setEscolha(null);
    // Quem já estava no pedido vem marcado (ex.: o mesmo operador dá o Fim de usinagem).
    setOperador(novoAlvo.tipo === "novo" ? null : (atuais[novoAlvo.id]?.operador ?? null));
    setObs("");
    setHistorico(null);
    setOutros(new Set());
    setPausarOutros(true);
    setNovaDescricao("");
    setNovaQtd("");
  }

  function fechar() {
    setAlvo(null);
  }

  function alternarOutro(id: string) {
    setOutros((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const qtdNova = novaQtd.trim() ? Number(novaQtd) : null;
  const qtdInvalida = qtdNova !== null && (!Number.isInteger(qtdNova) || qtdNova <= 0);
  const falta = !escolha
    ? "Escolha uma opção acima"
    : !operador
      ? "Escolha o operador"
      : novo && !novaDescricao.trim()
        ? "Escreva o que está sendo feito"
        : novo && qtdInvalida
          ? "Quantidade inválida"
          : "";

  async function salvar() {
    if (!alvo || !escolha || !operador || falta) return;
    setSalvando(true);
    setErro("");
    const dados: DadosApontamento = {
      status: escolha,
      operador,
      observacao: obs,
      por: usuario,
      pausar_outros: escolha === "em_andamento" && pausarOutros,
    };
    try {
      let linhas: Apontamento[];
      let nome: string;
      if (alvo.tipo === "novo") {
        const r = await criarServicoInterno(config.setor, novaDescricao.trim(), qtdNova, dados);
        setServicos((s) => [r.servico, ...s]);
        linhas = r.apontamentos;
        nome = `🔧 ${r.servico.descricao}`;
      } else if (alvo.tipo === "servico") {
        linhas = await apontarServico(config.setor, alvo.id, dados);
        nome = `🔧 ${servicoAberto?.descricao ?? "serviço interno"}`;
      } else {
        const juntos = mesmoDesenho.filter((i) => outros.has(i.id)).map((i) => i.id);
        linhas = await apontarItem(config.setor, alvo.id, dados, juntos);
        nome = (aberto?.desenho ?? aberto?.po ?? "") + (juntos.length ? ` + ${juntos.length} pedido(s) · ${formatarNumero(totalPecas, 0)} pç` : "");
      }
      setAtuais((m) => {
        const n = { ...m };
        for (const l of linhas) n[chaveApontamento(l)] = l;
        return n;
      });
      setVersao((v) => v + 1);
      const pausados = linhas.filter((l) => l.status === "pausado" && escolha !== "pausado").length;
      setSalvo(
        `✔ Salvo: ${opcao.get(escolha)?.rotulo} (${operador}) — ${nome}` + (pausados ? ` · ${pausados} pausado(s)` : ""),
      );
      setTimeout(() => setSalvo(""), 5000);
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

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      {salvo && (
        <div className="sticky top-16 z-20 rounded-xl border-2 border-green-600 bg-green-50 p-3 text-center text-lg font-bold text-green-700 shadow-lg dark:bg-green-950/90 dark:text-green-300">
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
        <button
          type="button"
          onClick={() => abrir({ tipo: "novo" })}
          className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-violet-500 text-lg font-bold text-violet-700 active:scale-[0.98] dark:border-violet-400 dark:text-violet-300"
        >
          🔧 + Serviço interno Macfab
          <span className="text-sm font-medium opacity-80">(uso próprio)</span>
        </button>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{erro}</div>
      )}

      {listaServicos.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {listaServicos.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => abrir({ tipo: "servico", id: s.id })}
              className="flex gap-3 rounded-xl border-2 border-violet-300 bg-white p-2 text-left hover:border-violet-600 active:scale-[0.98] dark:border-violet-800 dark:bg-slate-900"
            >
              <FotoServico classe="h-24 w-24 shrink-0 rounded-lg" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="line-clamp-2 text-lg font-bold leading-snug text-stone-900 dark:text-white">{s.descricao}</span>
                <span className="truncate text-xs text-stone-500 dark:text-slate-400">
                  Serviço interno Macfab{s.quantidade ? ` · ${formatarNumero(s.quantidade, 0)} pç` : ""} · criado {quando(s.em)}
                </span>
                <span className="mt-auto flex flex-wrap items-center gap-1 pt-0.5">
                  <SeloAtual a={atuais[s.id]} opcao={opcao} />
                </span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {lista.slice(0, MAX_CARTOES).map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => abrir({ tipo: "pedido", id: i.id })}
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
                <SeloAtual a={atuais[i.id]} opcao={opcao} />
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
      {lista.length === 0 && listaServicos.length === 0 && (
        <p className="py-10 text-center text-stone-500 dark:text-slate-400">
          {carregando ? "Carregando… (o servidor pode levar até 1 minuto para acordar)" : "Nenhum pedido encontrado."}
        </p>
      )}
      </>
      )}

      {(aberto || servicoAberto || novo) && (
        <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4" onClick={fechar}>
          <div
            className="flex h-full w-full flex-col overflow-y-auto bg-stone-50 dark:bg-slate-950 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start gap-3">
                {aberto ? (
                  <Foto item={aberto} classe="h-20 w-20 shrink-0 rounded-lg border border-stone-200 dark:border-slate-700" />
                ) : (
                  <FotoServico classe="h-20 w-20 shrink-0 rounded-lg" />
                )}
                <div className="min-w-0 flex-1">
                  {aberto ? (
                    <>
                      <p className="truncate font-mono text-2xl font-extrabold leading-tight text-stone-900 dark:text-white">{aberto.desenho ?? aberto.po}</p>
                      <p className="line-clamp-2 text-sm text-stone-700 dark:text-slate-300">{aberto.descricao}</p>
                      <p className="text-xs text-stone-500 dark:text-slate-400">
                        {aberto.mac ?? "—"} · {formatarNumero(aberto.quantidade ?? 0, 0)} pç · PO {aberto.po}
                      </p>
                    </>
                  ) : servicoAberto ? (
                    <>
                      <p className="line-clamp-2 text-2xl font-extrabold leading-tight text-stone-900 dark:text-white">{servicoAberto.descricao}</p>
                      <p className="text-xs text-stone-500 dark:text-slate-400">
                        Serviço interno Macfab (uso próprio)
                        {servicoAberto.quantidade ? ` · ${formatarNumero(servicoAberto.quantidade, 0)} pç` : ""}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-extrabold leading-tight text-stone-900 dark:text-white">Novo serviço interno</p>
                      <p className="text-sm text-stone-600 dark:text-slate-400">Usinagem pra uso da Macfab: manutenção, ferramental, dispositivos…</p>
                    </>
                  )}
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
              {!novo && (
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
              )}
            </div>

            {aba === "apontar" || novo ? (
              <div className="flex flex-col gap-3 p-4">
                {novo && (
                  <div className="flex flex-col gap-2 rounded-xl border-2 border-violet-300 bg-white p-3 dark:border-violet-800 dark:bg-slate-900">
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">O que está sendo feito?</span>
                      <input
                        value={novaDescricao}
                        onChange={(e) => setNovaDescricao(e.target.value)}
                        maxLength={200}
                        placeholder="Ex.: Eixo da calandra, bucha da prensa…"
                        className="h-14 rounded-xl border-2 border-stone-300 bg-white px-3 text-lg text-stone-900 outline-none focus:border-violet-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">Quantidade de peças (opcional)</span>
                      <input
                        value={novaQtd}
                        onChange={(e) => setNovaQtd(e.target.value.replace(/\D/g, ""))}
                        inputMode="numeric"
                        placeholder="Ex.: 2"
                        className="h-14 w-40 rounded-xl border-2 border-stone-300 bg-white px-3 text-lg text-stone-900 outline-none focus:border-violet-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                      />
                    </label>
                  </div>
                )}
                {atualAberto && (
                  <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700 dark:bg-slate-900 dark:text-slate-300">
                    Situação atual: <strong>{opcao.get(atualAberto.status)?.rotulo}</strong>
                    {atualAberto.operador && <> · <strong>{atualAberto.operador}</strong></>} · {quando(atualAberto.em)}
                    {atualAberto.observacao && <span className="block text-stone-500 dark:text-slate-400">“{atualAberto.observacao}”</span>}
                  </p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  {config.opcoes.map((o) => {
                    const ligado = escolha === o.status;
                    return (
                      <button
                        key={o.status}
                        type="button"
                        onClick={() => setEscolha(o.status)}
                        aria-pressed={ligado}
                        className={`flex min-h-20 items-center justify-center gap-2 rounded-2xl border-4 px-2 py-3 text-xl font-extrabold leading-tight transition active:scale-[0.97] sm:text-2xl ${
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

                {aberto && mesmoDesenho.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-stone-800 dark:text-amber-100">
                        📐 Mesmo desenho em mais {mesmoDesenho.length} pedido(s) ativo(s) — apontar junto?
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setOutros(outros.size === mesmoDesenho.length ? new Set() : new Set(mesmoDesenho.map((i) => i.id)))
                        }
                        className="shrink-0 rounded-lg border-2 border-amber-500 px-2 py-1 text-xs font-bold text-amber-800 dark:text-amber-200"
                      >
                        {outros.size === mesmoDesenho.length ? "Desmarcar" : "Marcar todos"}
                      </button>
                    </div>
                    {mesmoDesenho.map((i) => {
                      const marcado = outros.has(i.id);
                      return (
                        <button
                          key={i.id}
                          type="button"
                          onClick={() => alternarOutro(i.id)}
                          aria-pressed={marcado}
                          className={`flex items-center gap-2 rounded-xl border-2 p-2 text-left active:scale-[0.98] ${
                            marcado
                              ? "border-green-600 bg-green-50 dark:border-cyan-500 dark:bg-cyan-950/40"
                              : "border-stone-300 bg-white dark:border-slate-600 dark:bg-slate-900"
                          }`}
                        >
                          <span className="text-2xl">{marcado ? "☑" : "☐"}</span>
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="text-base font-bold text-stone-900 dark:text-white">
                              {formatarNumero(i.quantidade ?? 0, 0)} pç · PO {i.po}
                            </span>
                            <span className="truncate text-xs text-stone-500 dark:text-slate-400">{i.mac ?? "—"}</span>
                            <span className="mt-0.5 flex flex-wrap items-center gap-1">
                              <SeloPrazo prazo={i.prazo_contratual} compacto />
                              <SeloAtual a={atuais[i.id]} opcao={opcao} />
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <p className="text-center text-base font-extrabold text-stone-900 dark:text-white">
                      Total apontado: {formatarNumero(totalPecas, 0)} pç ({outros.size + 1} pedido{outros.size ? "s" : ""})
                    </p>
                  </div>
                )}

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

                {usinandoAgora.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPausarOutros((p) => !p)}
                    aria-pressed={pausarOutros}
                    className={`flex items-start gap-2 rounded-xl border-2 p-3 text-left ${
                      pausarOutros
                        ? "border-sky-600 bg-sky-50 dark:border-sky-500 dark:bg-sky-950/40"
                        : "border-stone-300 bg-white dark:border-slate-600 dark:bg-slate-900"
                    }`}
                  >
                    <span className="text-2xl">{pausarOutros ? "☑" : "☐"}</span>
                    <span className="text-sm text-stone-800 dark:text-slate-200">
                      <strong>{operador}</strong> está usinando: <strong>{usinandoAgora.map(nomeAlvo).join(", ")}</strong>.
                      <span className="block font-bold text-sky-700 dark:text-sky-300">⏸ Pausar automaticamente ao salvar</span>
                    </span>
                  </button>
                )}

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

                {erro && (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{erro}</div>
                )}
                <button
                  type="button"
                  disabled={!!falta || salvando}
                  onClick={salvar}
                  className="sticky bottom-3 h-16 w-full rounded-2xl bg-green-700 text-2xl font-extrabold text-white shadow-lg active:scale-[0.98] disabled:opacity-50 dark:bg-cyan-600"
                >
                  {salvando ? "Salvando…" : falta || (outros.size ? `💾 Salvar (${outros.size + 1} pedidos)` : "💾 Salvar")}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 p-4">
                {aberto && (
                  <>
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
                  </>
                )}
                {servicoAberto && (
                  <div className="grid grid-cols-2 gap-2">
                    <Campo rotulo="Quantidade">{servicoAberto.quantidade === null ? null : formatarNumero(servicoAberto.quantidade, 0)}</Campo>
                    <Campo rotulo="Criado">
                      {quando(servicoAberto.em)}
                      {servicoAberto.por ? ` · ${servicoAberto.por}` : ""}
                    </Campo>
                  </div>
                )}
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
