"use client";

// Pintura — pedido do usuário (17/11/2026): aba principal do menu. Espelho do
// "J:\6 - PCP\PCP-Pintura\PCP-Pintura-Estoque.xlsx", atualizado a cada 15 min
// (a planilha continua sendo a fonte da verdade — aqui é só consulta).
// Abas: "Estoque" (tintas com componente A e B, lote e vencimento) e
// "Catálogo" (aba Tinta: dados técnicos de cada produto).

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell, { classeBotaoCabecalho } from "@/components/AppShell";
import { listarPintura } from "@/lib/api";
import { normalizarBusca } from "@/lib/followUp";
import { podeVerPintura, type AbaPintura, type RespostaPintura } from "@/lib/pintura";
import { repetirComAbaVisivel } from "@/lib/repetir";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import type { ColunaControleObras, ValorControleObras } from "@/lib/types";

type Linha = { linha: number; v: Record<string, ValorControleObras> };
type Situacao = "vencido" | "vence" | "ok" | "sem";
type FiltroCartao = "todos" | "com_estoque" | "zerados" | "vencidos" | "vencem";

const DIAS_ALERTA = 60;

// Cabeçalhos da planilha que não dizem nada sozinhos.
const ROTULOS: Record<string, string> = {
  b: "M2/GL (calc.)",
  cp: "CP (A)",
  cp_2: "CP (B)",
  m2_gl_2: "M2/GL (calc.)",
  fc: "FC",
};

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ehData(v: ValorControleObras): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

function dataBr(v: ValorControleObras): string {
  if (!ehData(v)) return v == null ? "" : String(v);
  const [a, m, d] = v.slice(0, 10).split("-");
  return d === "01" ? `${m}/${a}` : `${d}/${m}/${a}`; // vencimento de tinta costuma ser só mês/ano
}

function numero(v: ValorControleObras): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function texto(v: ValorControleObras): string {
  if (v == null) return "";
  if (ehData(v)) return dataBr(v);
  if (typeof v === "number") return v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  return String(v);
}

function situacao(venc: ValorControleObras, qt: number, hoje: string, limite: string): Situacao {
  if (!ehData(venc) || qt <= 0) return "sem";
  const d = venc.slice(0, 10);
  if (d < hoje) return "vencido";
  if (d <= limite) return "vence";
  return "ok";
}

// Fabricante: a planilha tem "Weg" e "weg", "Internat." e "International".
function fabricante(v: ValorControleObras): string {
  const s = String(v ?? "").trim();
  if (!s || s === "0") return "—";
  const n = normalizarBusca(s);
  if (n.startsWith("internat")) return "International";
  return s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1).toLocaleLowerCase("pt-BR");
}

const ESTILO_SITUACAO: Record<Situacao, string> = {
  vencido: "bg-red-600 text-white",
  vence: "bg-amber-400 text-amber-950",
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  sem: "text-stone-400 dark:text-slate-500",
};

function Venc({ v, s }: { v: ValorControleObras; s: Situacao }) {
  return ehData(v) ? (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${ESTILO_SITUACAO[s]}`}>{dataBr(v)}</span>
  ) : (
    <span className="text-stone-300 dark:text-slate-600">—</span>
  );
}

function Qt({ q, un }: { q: number; un: ValorControleObras }) {
  return (
    <span className={`tabular-nums ${q > 0 ? "font-bold text-stone-800 dark:text-slate-100" : "text-stone-400 dark:text-slate-500"}`}>
      {q.toLocaleString("pt-BR")} <span className="text-[11px] font-normal text-stone-500 dark:text-slate-400">{texto(un)}</span>
    </span>
  );
}

export default function PaginaPintura() {
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [dados, setDados] = useState<RespostaPintura | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<AbaPintura>("estoque");
  const [busca, setBusca] = useState("");
  const [fabr, setFabr] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string | null>(null);
  const [cartao, setCartao] = useState<FiltroCartao>("todos");
  const [aberto, setAberto] = useState<{ aba: AbaPintura; linha: Linha } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await listarPintura());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    let parar: (() => void) | undefined;
    let vivo = true;
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => {
        if (!vivo) return;
        const ok = podeVerPintura(data.user?.email);
        setPermitido(ok);
        if (!ok) return setCarregando(false);
        carregar();
        parar = repetirComAbaVisivel(carregar, 5 * 60 * 1000);
      });
    return () => {
      vivo = false;
      parar?.();
    };
  }, [carregar]);

  function trocarAba(nova: AbaPintura) {
    setAba(nova);
    setFabr(null);
    setTipo(null);
    setCartao("todos");
  }

  const colunas = useMemo(() => dados?.status?.colunas ?? { estoque: [], tinta: [] }, [dados]);

  const linhas = useMemo(() => {
    const conv = (a: AbaPintura): Linha[] =>
      (dados?.linhas[a] ?? []).map((l) => {
        const v: Record<string, ValorControleObras> = {};
        colunas[a].forEach((c, i) => {
          if (c.campo) v[c.campo] = l.valores[i] ?? null;
        });
        return { linha: l.linha, v };
      });
    return { estoque: conv("estoque"), tinta: conv("tinta") };
  }, [dados, colunas]);

  const hoje = hojeIso();
  const limite = somarDias(hoje, DIAS_ALERTA);

  // Situação de cada tinta do estoque: pior entre o componente A e o B.
  const estoque = useMemo(
    () =>
      linhas.estoque.map((l) => {
        const qa = numero(l.v.qt_a);
        const qb = numero(l.v.qt_b);
        const sa = situacao(l.v.venc_a, qa, hoje, limite);
        const sb = situacao(l.v.venc_b, qb, hoje, limite);
        const ordem: Situacao[] = ["vencido", "vence", "ok", "sem"];
        const pior = ordem.find((s) => s === sa || s === sb) ?? "sem";
        return { ...l, qa, qb, sa, sb, pior, fab: fabricante(l.v.fabr), tp: String(l.v.tipo ?? "").trim() || "—" };
      }),
    [linhas.estoque, hoje, limite],
  );

  const resumo = useMemo(
    () => ({
      todos: estoque.length,
      com_estoque: estoque.filter((e) => e.qa > 0 || e.qb > 0).length,
      zerados: estoque.filter((e) => e.qa <= 0 && e.qb <= 0).length,
      vencidos: estoque.filter((e) => e.pior === "vencido").length,
      vencem: estoque.filter((e) => e.pior === "vence").length,
    }),
    [estoque],
  );

  const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
  const casaBusca = (v: Record<string, ValorControleObras>) => {
    if (!termos.length) return true;
    const tudo = normalizarBusca(Object.values(v).map(texto).join(" "));
    return termos.every((t) => tudo.includes(t));
  };

  const estoqueFiltrado = estoque.filter(
    (e) =>
      (!fabr || e.fab === fabr) &&
      (!tipo || e.tp === tipo) &&
      (cartao === "todos" ||
        (cartao === "com_estoque" && (e.qa > 0 || e.qb > 0)) ||
        (cartao === "zerados" && e.qa <= 0 && e.qb <= 0) ||
        (cartao === "vencidos" && e.pior === "vencido") ||
        (cartao === "vencem" && e.pior === "vence")) &&
      casaBusca(e.v),
  );

  const catalogo = useMemo(
    () => linhas.tinta.map((l) => ({ ...l, fab: fabricante(l.v.fabricante), tp: String(l.v.tipo ?? "").trim() || "—" })),
    [linhas.tinta],
  );
  const catalogoFiltrado = catalogo.filter((c) => (!fabr || c.fab === fabr) && (!tipo || c.tp === tipo) && casaBusca(c.v));

  const base = aba === "estoque" ? estoque : catalogo;
  const contar = (chave: "fab" | "tp") => {
    const m = new Map<string, number>();
    for (const x of base) m.set(x[chave], (m.get(x[chave]) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const fabricantes = contar("fab");
  const tipos = contar("tp");

  const st = dados?.status;
  const hora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  const campo =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/20";
  const chip = (ativo: boolean) =>
    `whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
      ativo
        ? "border-blue-600 bg-blue-600 text-white dark:border-cyan-400 dark:bg-cyan-400 dark:text-slate-950"
        : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;
  const th = "sticky top-0 z-10 bg-stone-100 px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:bg-slate-800 dark:text-slate-400";
  const td = "px-2 py-1.5 align-top";

  if (permitido === false) {
    return (
      <AppShell titulo="Pintura">
        <p className="p-6 text-sm text-stone-600 dark:text-slate-400">Acesso restrito.</p>
      </AppShell>
    );
  }

  const cartoes: { chave: FiltroCartao; rotulo: string; valor: number; cor: string }[] = [
    { chave: "todos", rotulo: "Tintas cadastradas", valor: resumo.todos, cor: "text-stone-800 dark:text-slate-100" },
    { chave: "com_estoque", rotulo: "Com estoque", valor: resumo.com_estoque, cor: "text-emerald-600 dark:text-emerald-400" },
    { chave: "zerados", rotulo: "Zeradas", valor: resumo.zerados, cor: "text-stone-500 dark:text-slate-400" },
    { chave: "vencidos", rotulo: "Vencidas (com saldo)", valor: resumo.vencidos, cor: "text-red-600 dark:text-red-400" },
    { chave: "vencem", rotulo: `Vencem em ${DIAS_ALERTA} dias`, valor: resumo.vencem, cor: "text-amber-600 dark:text-amber-400" },
  ];

  return (
    <AppShell
      titulo="Pintura"
      subtitulo={
        <span title={st?.arquivo}>
          Planilha alterada {hora(st?.ultima_alteracao_em)} · conferida {hora(st?.ultima_verificacao_em)}
          {st?.ultimo_erro && <span className="text-red-500"> · erro na última leitura</span>}
        </span>
      }
      acoes={
        <button type="button" onClick={carregar} className={classeBotaoCabecalho} title="Atualizar">
          ⟳<span className="hidden sm:inline"> Atualizar</span>
        </button>
      }
    >
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="flex gap-1 border-b border-stone-200 dark:border-slate-800">
          {(
            [
              ["estoque", `Estoque (${estoque.length})`],
              ["tinta", `Catálogo de tintas (${catalogo.length})`],
            ] as const
          ).map(([v, r]) => (
            <button
              key={v}
              type="button"
              onClick={() => trocarAba(v)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
                aba === v
                  ? "border-blue-600 text-blue-700 dark:border-cyan-400 dark:text-cyan-300"
                  : "border-transparent text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {erro && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {erro}
          </div>
        )}
        {st?.ultimo_erro && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
            A última leitura da planilha falhou ({hora(st.ultimo_erro_em)}): {st.ultimo_erro}. Mostrando a última versão boa.
          </div>
        )}

        {aba === "estoque" && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {cartoes.map((c) => (
              <button
                key={c.chave}
                type="button"
                onClick={() => setCartao(cartao === c.chave ? "todos" : c.chave)}
                className={`rounded-xl border bg-white px-3 py-2 text-left shadow-sm transition hover:shadow-md dark:bg-slate-900 ${
                  cartao === c.chave && c.chave !== "todos"
                    ? "border-blue-500 ring-2 ring-blue-500/20 dark:border-cyan-400"
                    : "border-stone-200 dark:border-slate-800"
                }`}
              >
                <div className={`text-2xl font-extrabold tabular-nums ${c.cor}`}>{carregando ? "…" : c.valor}</div>
                <div className="text-xs text-stone-500 dark:text-slate-400">{c.rotulo}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="relative w-full sm:w-96">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto, cor, lote, local, MAC…"
              className={`${campo} pl-8`}
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400">⌕</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <span className="self-center pr-1 text-xs font-semibold text-stone-500 dark:text-slate-400">Fabricante:</span>
            <button type="button" className={chip(!fabr)} onClick={() => setFabr(null)}>
              Todos
            </button>
            {fabricantes.map(([f, n]) => (
              <button key={f} type="button" className={chip(fabr === f)} onClick={() => setFabr(fabr === f ? null : f)}>
                {f} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <span className="self-center pr-1 text-xs font-semibold text-stone-500 dark:text-slate-400">Tipo:</span>
            <button type="button" className={chip(!tipo)} onClick={() => setTipo(null)}>
              Todos
            </button>
            {tipos.map(([t, n]) => (
              <button key={t} type="button" className={chip(tipo === t)} onClick={() => setTipo(tipo === t ? null : t)}>
                {t} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[calc(100dvh-20rem)] min-h-[16rem] overflow-auto rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {aba === "estoque" ? (
            <table className="w-full min-w-[1100px] text-sm text-stone-700 dark:text-slate-300">
              <thead>
                <tr>
                  <th className={th}>IT</th>
                  <th className={th}>Fabr.</th>
                  <th className={th}>Produto</th>
                  <th className={th}>Cor</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Local</th>
                  <th className={`${th} border-l border-stone-200 dark:border-slate-700`}>Qt (A)</th>
                  <th className={th}>Lote (A)</th>
                  <th className={th}>Venc. (A)</th>
                  <th className={`${th} border-l border-stone-200 dark:border-slate-700`}>Qt (B)</th>
                  <th className={th}>Lote (B)</th>
                  <th className={th}>Venc. (B)</th>
                  <th className={`${th} border-l border-stone-200 dark:border-slate-700`}>MAC</th>
                </tr>
              </thead>
              <tbody>
                {estoqueFiltrado.map((e) => (
                  <tr
                    key={e.linha}
                    onClick={() => setAberto({ aba: "estoque", linha: e })}
                    className={`cursor-pointer border-t border-stone-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-800/60 ${
                      e.qa <= 0 && e.qb <= 0 ? "opacity-60" : ""
                    }`}
                  >
                    <td className={`${td} tabular-nums text-stone-400`}>{texto(e.v.it)}</td>
                    <td className={td}>{e.fab}</td>
                    <td className={`${td} font-semibold text-stone-800 dark:text-slate-100`}>{texto(e.v.produto_a)}</td>
                    <td className={td}>{texto(e.v.cor_a)}</td>
                    <td className={td}>{e.tp === "—" ? "" : e.tp}</td>
                    <td className={`${td} font-mono text-xs`}>{texto(e.v.local)}</td>
                    <td className={`${td} border-l border-stone-100 dark:border-slate-800`}>
                      <Qt q={e.qa} un={e.v.un_a} />
                    </td>
                    <td className={`${td} font-mono text-xs`}>{texto(e.v.lote)}</td>
                    <td className={td}>
                      <Venc v={e.v.venc_a} s={e.sa} />
                    </td>
                    <td className={`${td} border-l border-stone-100 dark:border-slate-800`}>
                      {e.v.qt_b == null && !e.v.produto_b ? <span className="text-stone-300 dark:text-slate-600">—</span> : <Qt q={e.qb} un={e.v.un_b} />}
                    </td>
                    <td className={`${td} font-mono text-xs`}>{texto(e.v.lote_b)}</td>
                    <td className={td}>
                      <Venc v={e.v.venc_b} s={e.sb} />
                    </td>
                    <td className={`${td} border-l border-stone-100 text-xs dark:border-slate-800`}>{texto(e.v.mac)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[1000px] text-sm text-stone-700 dark:text-slate-300">
              <thead>
                <tr>
                  <th className={th}>Fabricante</th>
                  <th className={th}>Produto</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Cor</th>
                  <th className={th}>Diluente</th>
                  <th className={th}>Diluição</th>
                  <th className={th}>Sól./Vol</th>
                  <th className={th}>Micras recom.</th>
                  <th className={th}>M2/GL</th>
                  <th className={th}>Composição</th>
                </tr>
              </thead>
              <tbody>
                {catalogoFiltrado.map((c) => (
                  <tr
                    key={c.linha}
                    onClick={() => setAberto({ aba: "tinta", linha: c })}
                    className="cursor-pointer border-t border-stone-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-800/60"
                  >
                    <td className={td}>{c.fab}</td>
                    <td className={`${td} font-semibold text-stone-800 dark:text-slate-100`}>{texto(c.v.produto_cpa)}</td>
                    <td className={td}>{c.tp === "—" ? "" : c.tp}</td>
                    <td className={td}>{texto(c.v.cor)}</td>
                    <td className={td}>{texto(c.v.diluente)}</td>
                    <td className={td}>{texto(c.v.diluicao)}</td>
                    <td className={`${td} tabular-nums`}>{texto(c.v.sol_vol)}</td>
                    <td className={`${td} tabular-nums`}>{texto(c.v.micras_recom)}</td>
                    <td className={`${td} tabular-nums`}>{texto(c.v.m2_gl)}</td>
                    <td className={`${td} max-w-[22rem] truncate text-xs text-stone-500 dark:text-slate-400`} title={texto(c.v.composicao)}>
                      {texto(c.v.composicao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!carregando && (aba === "estoque" ? estoqueFiltrado : catalogoFiltrado).length === 0 && (
            <p className="p-6 text-center text-sm text-stone-500 dark:text-slate-400">Nada encontrado com esses filtros.</p>
          )}
          {carregando && <p className="p-6 text-center text-sm text-stone-500 dark:text-slate-400">Carregando…</p>}
        </div>
        <p className="text-xs text-stone-500 dark:text-slate-400">
          {(aba === "estoque" ? estoqueFiltrado : catalogoFiltrado).length} de {base.length} · clique na linha pra ver todos os campos ·
          a planilha no J: continua sendo a fonte (atualiza aqui a cada 15 min)
        </p>
      </div>

      {aberto && (
        <Detalhe
          colunas={colunas[aberto.aba]}
          linha={aberto.linha}
          titulo={texto(aberto.aba === "estoque" ? aberto.linha.v.produto_a : aberto.linha.v.produto_cpa)}
          aoFechar={() => setAberto(null)}
        />
      )}
    </AppShell>
  );
}

function Detalhe({
  colunas,
  linha,
  titulo,
  aoFechar,
}: {
  colunas: ColunaControleObras[];
  linha: Linha;
  titulo: string;
  aoFechar: () => void;
}) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-700">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-stone-800 dark:text-slate-100">{titulo || "Tinta"}</h3>
            <p className="text-xs text-stone-500 dark:text-slate-400">Linha {linha.linha} da planilha</p>
          </div>
          <button type="button" onClick={aoFechar} className="rounded-md px-2 text-xl leading-none text-stone-400 hover:text-stone-700 dark:hover:text-white">
            ×
          </button>
        </div>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          {colunas
            .filter((c) => c.campo && linha.v[c.campo] != null && linha.v[c.campo] !== "")
            .map((c) => {
              const longo = String(linha.v[c.campo!]).length > 60;
              return (
                <div key={c.letra} className={`flex gap-2 border-b border-stone-100 py-1 dark:border-slate-800 ${longo ? "sm:col-span-2 flex-col gap-0.5" : ""}`}>
                  <dt className="w-32 shrink-0 text-xs font-semibold text-stone-500 dark:text-slate-400">
                    {ROTULOS[c.campo!] ?? c.cabecalho} <span className="font-normal opacity-50">{c.letra}</span>
                  </dt>
                  <dd className="text-stone-800 dark:text-slate-100">{texto(linha.v[c.campo!])}</dd>
                </div>
              );
            })}
        </dl>
      </div>
    </div>
  );
}
