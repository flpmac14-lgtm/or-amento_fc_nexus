"use client";

// Recebimento — tela organizada pra Qualidade (pedido do usuário, 12/11/2026:
// "coloca essa planilha para a carol em destaque, bem organizada, com o filtro
// geral fácil de encontrar os produtos e os últimos que deram entrada").
// Mesmos dados do espelho da aba GERAL (A:X) do CONTROLE DE RECEBIMENTO E
// ESTOQUE (app/recebimento_estoque.py, sync de 15 min). Só leitura.
// - Busca única no topo: várias palavras = todas precisam aparecer (ex.: "chapa 63,5 a36").
// - Ordenada pela DT RECEB.: entrada mais recente em cima, descendo pras mais antigas
//   (pedido de 13/11/2026). Linha sem data válida fica junto da linha de cima na planilha.
// - Atalhos de período (hoje / 7 / 30 dias) e por tipo de material (1ª palavra da DESCRICAO:
//   CHAPA, TINTA, BARRA, ARAME… — a coluna "abc" não serve, é texto solto).
// - Clique na linha = todas as colunas A:X daquele recebimento.
// - "Planilha completa" = a tabela antiga com todas as colunas e filtro por coluna.

import { useEffect, useMemo, useState } from "react";
import ControleObras, { CONFIG_RECEBIMENTO } from "@/components/ControleObras";
import { listarRecebimento } from "@/lib/api";
import { useLimparComF4 } from "@/lib/atalhoLimpar";
import { normalizarBusca } from "@/lib/followUp";
import { repetirComAbaVisivel } from "@/lib/repetir";
import type { RespostaControleObras, ValorControleObras } from "@/lib/types";

const RECARREGAR_A_CADA_MS = 5 * 60 * 1000;
const POR_PAGINA = 100;
const DIA_MS = 24 * 3600 * 1000;

type Periodo = "todos" | "hoje" | "7" | "30";
const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todas" },
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
];

// Campos usados (nomes gerados pelo sync a partir do cabeçalho da linha 1).
const CAMPOS_BUSCA = [
  "nri", "nri_2", "coluna1", "sectra", "desc_sectra", "c_cpb", "descricao", "abc", "fornecedor",
  "coluna3", "cq", "oc", "nesting_pantografo", "descricao_2",
];

/** DT RECEB. vem como ISO (aaaa-mm-dd) ou texto digitado (dd/mm/aa) — às vezes com erro de digitação. */
function dataDe(v: ValorControleObras): Date | null {
  if (typeof v !== "string") return null;
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mes = Number(m[2]);
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  return new Date(ano, mes - 1, d);
}

function textoData(v: ValorControleObras): string {
  const d = dataDe(v);
  if (d) return d.toLocaleDateString("pt-BR");
  return v == null ? "" : String(v);
}

function texto(v: ValorControleObras): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  return String(v).trim();
}

/** Tipo de material = 1ª palavra da descrição ("CHAPA #63,5 A36" → CHAPA). */
function tipoDe(desc: string): string {
  const p = desc.toUpperCase().trim().split(/[^A-ZÇÃÕÁÉÍÓÚÂÊÔ]+/)[0] ?? "";
  return p.length >= 3 ? p : "";
}

type Linha = {
  linha: number;
  valores: ValorControleObras[];
  data: Date | null;
  tipo: string;
  busca: string; // texto normalizado dos campos de busca
};

export default function RecebimentoEstoque({ telaCheia = false }: { telaCheia?: boolean }) {
  const [dados, setDados] = useState<RespostaControleObras | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [tipo, setTipo] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [pagina, setPagina] = useState(0);
  const [aberta, setAberta] = useState<Linha | null>(null);
  const [completa, setCompleta] = useState(false);
  const [agora, setAgora] = useState(0);

  useEffect(() => {
    let ativo = true;
    function buscar() {
      listarRecebimento()
        .then((r) => {
          if (!ativo) return;
          setDados(r);
          setAgora(Date.now());
          setErro("");
        })
        .catch((e: Error) => ativo && setErro(e.message))
        .finally(() => ativo && setCarregando(false));
    }
    buscar();
    const parar = repetirComAbaVisivel(buscar, RECARREGAR_A_CADA_MS);
    return () => {
      ativo = false;
      parar();
    };
  }, []);

  const colunas = useMemo(() => dados?.status?.colunas ?? [], [dados]);
  const idx = useMemo(() => {
    const m: Record<string, number> = {};
    colunas.forEach((c, i) => {
      if (c.campo) m[c.campo] = i;
    });
    return m;
  }, [colunas]);
  const val = (l: { valores: ValorControleObras[] }, campo: string) =>
    idx[campo] === undefined ? null : l.valores[idx[campo]];

  // Só linhas com dado (a planilha tem ~50 mil linhas formatadas), da data mais recente pra mais antiga.
  const linhas = useMemo<Linha[]>(() => {
    const iBusca = CAMPOS_BUSCA.map((c) => idx[c]).filter((i) => i !== undefined);
    const iDesc = idx.descricao;
    const iNri = idx.nri_2;
    const base = (dados?.linhas ?? [])
      .filter((l) => (iDesc !== undefined && l.valores[iDesc]) || (iNri !== undefined && l.valores[iNri]))
      .map((l) => ({
        linha: l.linha,
        valores: l.valores,
        data: idx.dt_receb === undefined ? null : dataDe(l.valores[idx.dt_receb]),
        tipo: iDesc === undefined ? "" : tipoDe(texto(l.valores[iDesc])),
        busca: normalizarBusca(iBusca.map((i) => texto(l.valores[i])).join(" ")),
      }))
      .sort((a, b) => a.linha - b.linha);
    // Ordem: data de entrada mais recente em cima. Linha sem data válida (vazia,
    // digitada errada ou no futuro) herda a data da linha de cima na planilha,
    // pra não ir parar no fim nem no topo.
    const limite = agora ? agora + DIA_MS : Infinity;
    let anterior = 0;
    const chave = new Map<number, number>();
    for (const l of base) {
      const t = l.data?.getTime();
      if (t !== undefined && t <= limite) anterior = t;
      chave.set(l.linha, anterior);
    }
    return base.sort((a, b) => (chave.get(b.linha)! - chave.get(a.linha)!) || b.linha - a.linha);
  }, [dados, idx, agora]);

  const hoje = useMemo(() => {
    const d = agora ? new Date(agora) : new Date(0);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }, [agora]);

  const contagem = useMemo(() => {
    let h = 0;
    let s = 0;
    let t = 0;
    for (const l of linhas) {
      if (!l.data) continue;
      const dt = l.data.getTime();
      if (dt > hoje + DIA_MS) continue; // data digitada no futuro (erro): não conta
      if (dt >= hoje) h++;
      if (dt >= hoje - 6 * DIA_MS) s++;
      if (dt >= hoje - 29 * DIA_MS) t++;
    }
    return { hoje: h, semana: s, mes: t };
  }, [linhas, hoje]);

  // Tipos de material mais comuns (CHAPA, TINTA, BARRA, ARAME…) e fornecedores.
  const tipos = useMemo(() => {
    const n: Record<string, number> = {};
    for (const l of linhas) if (l.tipo) n[l.tipo] = (n[l.tipo] ?? 0) + 1;
    return Object.entries(n)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([t]) => t);
  }, [linhas]);
  const fornecedores = useMemo(() => {
    const s = new Set<string>();
    for (const l of linhas) {
      const f = texto(val(l, "fornecedor")).toUpperCase();
      if (f) s.add(f);
    }
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, idx]);

  const filtradas = useMemo(() => {
    const palavras = normalizarBusca(busca).split(/\s+/).filter(Boolean);
    const desde =
      periodo === "hoje" ? hoje : periodo === "7" ? hoje - 6 * DIA_MS : periodo === "30" ? hoje - 29 * DIA_MS : null;
    return linhas.filter((l) => {
      if (desde !== null && (!l.data || l.data.getTime() < desde || l.data.getTime() > hoje + DIA_MS)) return false;
      if (tipo && l.tipo !== tipo) return false;
      if (fornecedor && texto(val(l, "fornecedor")).toUpperCase() !== fornecedor) return false;
      return palavras.every((p) => l.busca.includes(p));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, busca, periodo, tipo, fornecedor, hoje, idx]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);
  const temFiltro = !!(busca || periodo !== "todos" || tipo || fornecedor);
  const ultima = linhas.find((l) => l.data && l.data.getTime() <= hoje + DIA_MS);

  function limpar() {
    setBusca("");
    setPeriodo("todos");
    setTipo("");
    setFornecedor("");
    setPagina(0);
  }
  useLimparComF4("recebimento", limpar);

  if (completa) {
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setCompleta(false)}
          className="self-start rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:border-green-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-cyan-500"
        >
          ‹ Voltar pra visão organizada
        </button>
        <ControleObras telaCheia={telaCheia} config={CONFIG_RECEBIMENTO} />
      </div>
    );
  }

  const status = dados?.status ?? null;
  const chip = (ativo: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
      ativo
        ? "border-green-600 bg-green-600 text-white dark:border-cyan-400 dark:bg-cyan-500 dark:text-slate-950"
        : "border-stone-300 bg-white text-stone-700 hover:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-500"
    }`;

  return (
    <div className="flex flex-col gap-3">
      {/* Cabeçalho + busca em destaque */}
      <section className="rounded-xl border border-green-600/30 bg-gradient-to-br from-green-50 to-white p-4 dark:border-cyan-500/30 dark:from-cyan-950/40 dark:to-slate-900/40">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-white">Recebimento de materiais</h2>
            <p className="text-xs text-stone-500 dark:text-slate-400">
              Controle de recebimento e estoque (aba GERAL) · atualiza sozinho a cada 15 min
              {status?.ultima_alteracao_em && ` · última mudança na planilha: ${new Date(status.ultima_alteracao_em).toLocaleString("pt-BR")}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCompleta(true)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-600 hover:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-500"
            title="Todas as colunas A:X com filtro por coluna"
          >
            Planilha completa (A:X)
          </button>
        </div>

        <div className="relative mt-3">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-stone-400">⌕</span>
          <input
            type="search"
            autoFocus
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="Buscar produto, NRI, MAC, fornecedor, NF, certificado/lote, OC, código Sectra…"
            className="w-full rounded-xl border-2 border-stone-300 bg-white py-3 pl-10 pr-28 text-base text-stone-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/15 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:border-cyan-400 dark:focus:ring-cyan-400/15"
          />
          {temFiltro && (
            <button
              type="button"
              onClick={limpar}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-red-600 dark:text-slate-400 dark:hover:bg-slate-800"
              title="Limpar tudo (F4)"
            >
              Limpar <kbd className="font-mono text-[10px]">F4</kbd>
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-stone-500 dark:text-slate-500">
          Dica: digite várias palavras pra afinar — ex.: <i>chapa 63,5 a36</i> ou <i>arame sandsteel</i>.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-stone-500 dark:text-slate-400">Entrada:</span>
          {PERIODOS.map((p) => (
            <button
              key={p.valor}
              type="button"
              onClick={() => {
                setPeriodo(p.valor);
                setPagina(0);
              }}
              className={chip(periodo === p.valor)}
            >
              {p.rotulo}
              {p.valor === "hoje" && ` (${contagem.hoje})`}
              {p.valor === "7" && ` (${contagem.semana})`}
              {p.valor === "30" && ` (${contagem.mes})`}
            </button>
          ))}
          <select
            value={fornecedor}
            onChange={(e) => {
              setFornecedor(e.target.value);
              setPagina(0);
            }}
            className="ml-auto rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs text-stone-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        {tipos.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-stone-500 dark:text-slate-400">Material:</span>
            <button type="button" onClick={() => setTipo("")} className={chip(!tipo)}>
              Todos
            </button>
            {tipos.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTipo(tipo === t ? "" : t);
                  setPagina(0);
                }}
                className={chip(tipo === t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Indicadores */}
      <div className={`${telaCheia ? "hidden" : "grid"} grid-cols-2 gap-3 lg:grid-cols-4`}>
        {[
          { rotulo: "Entradas hoje", valor: contagem.hoje, acao: () => setPeriodo("hoje") },
          { rotulo: "Últimos 7 dias", valor: contagem.semana, acao: () => setPeriodo("7") },
          { rotulo: "Últimos 30 dias", valor: contagem.mes, acao: () => setPeriodo("30") },
        ].map((c) => (
          <button
            key={c.rotulo}
            type="button"
            onClick={() => {
              c.acao();
              setPagina(0);
            }}
            className="rounded-lg border border-stone-200 bg-white p-3 text-left hover:border-green-600/50 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-cyan-500/50"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">{c.rotulo}</p>
            <p className="font-mono text-2xl font-bold text-green-700 dark:text-cyan-300">{c.valor}</p>
          </button>
        ))}
        <div className="rounded-lg border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">Última entrada</p>
          <p className="truncate font-mono text-lg font-bold text-stone-900 dark:text-white">
            {ultima ? textoData(val(ultima, "dt_receb")) : "—"}
          </p>
          <p className="truncate text-[11px] text-stone-500 dark:text-slate-500">
            {ultima ? `${texto(val(ultima, "nri_2"))} · ${texto(val(ultima, "descricao"))}` : ""}
          </p>
        </div>
      </div>

      {(erro || status?.ultimo_erro) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {erro || `A última leitura da planilha falhou: ${status?.ultimo_erro}. Os dados abaixo são da última leitura boa.`}
        </div>
      )}

      {/* Tabela */}
      <div
        className={`${telaCheia ? "max-h-[calc(100vh-9.5rem)]" : "max-h-[70vh]"} overflow-auto rounded-lg border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900/40`}
      >
        <table className="w-full min-w-[960px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-stone-100 text-left text-[11px] uppercase tracking-wide text-stone-600 dark:bg-slate-900 dark:text-slate-400">
            <tr>
              {["Entrada", "NRI", "MAC / destino", "Produto", "Qtd", "Fornecedor", "NF", "Certificado / lote", "OC"].map((h) => (
                <th key={h} className="whitespace-nowrap border-b border-stone-200 px-2 py-2 font-semibold dark:border-slate-800">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const recente = l.data && l.data.getTime() >= hoje - 6 * DIA_MS && l.data.getTime() <= hoje + DIA_MS;
              const desc = texto(val(l, "descricao")) || texto(val(l, "desc_sectra"));
              const sectra = texto(val(l, "sectra"));
              return (
                <tr
                  key={l.linha}
                  onClick={() => setAberta(l)}
                  className="cursor-pointer text-stone-800 hover:bg-green-50 dark:text-slate-200 dark:hover:bg-cyan-950/30"
                >
                  <td className="whitespace-nowrap border-b border-stone-100 px-2 py-1.5 font-mono text-xs dark:border-slate-800/80">
                    {textoData(val(l, "dt_receb"))}
                    {recente && (
                      <span className="ml-1.5 rounded bg-green-600 px-1 py-px text-[9px] font-bold uppercase text-white dark:bg-cyan-500 dark:text-slate-950">
                        novo
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-stone-100 px-2 py-1.5 font-mono text-xs font-semibold dark:border-slate-800/80">
                    {texto(val(l, "nri_2"))}
                  </td>
                  <td className="max-w-[10rem] truncate border-b border-stone-100 px-2 py-1.5 text-xs dark:border-slate-800/80">
                    {texto(val(l, "coluna1"))}
                  </td>
                  <td className="max-w-[26rem] border-b border-stone-100 px-2 py-1.5 dark:border-slate-800/80" title={desc}>
                    <span className="block truncate text-sm">{desc}</span>
                    {sectra && <span className="font-mono text-[10px] text-stone-500 dark:text-slate-500">Sectra {sectra}</span>}
                  </td>
                  <td className="whitespace-nowrap border-b border-stone-100 px-2 py-1.5 text-right font-mono text-xs dark:border-slate-800/80">
                    {texto(val(l, "qtd"))} <span className="text-stone-500">{texto(val(l, "coluna2"))}</span>
                  </td>
                  <td className="max-w-[10rem] truncate border-b border-stone-100 px-2 py-1.5 text-xs dark:border-slate-800/80">
                    {texto(val(l, "fornecedor"))}
                  </td>
                  <td className="whitespace-nowrap border-b border-stone-100 px-2 py-1.5 font-mono text-xs dark:border-slate-800/80">
                    {texto(val(l, "coluna3"))}
                  </td>
                  <td className="max-w-[14rem] truncate border-b border-stone-100 px-2 py-1.5 text-xs dark:border-slate-800/80" title={texto(val(l, "cq"))}>
                    {texto(val(l, "cq"))}
                  </td>
                  <td className="whitespace-nowrap border-b border-stone-100 px-2 py-1.5 font-mono text-xs dark:border-slate-800/80">
                    {texto(val(l, "oc"))}
                  </td>
                </tr>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-stone-500 dark:text-slate-500">
                  {carregando
                    ? "Carregando… (o servidor pode levar até 1 minuto para acordar)"
                    : !status
                      ? "Ainda não houve sincronização da planilha."
                      : "Nada encontrado com esses filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600 dark:text-slate-400">
        <span>
          {filtradas.length === 0
            ? "0 recebimentos"
            : `${paginaAtual * POR_PAGINA + 1}–${Math.min((paginaAtual + 1) * POR_PAGINA, filtradas.length)} de ${filtradas.length.toLocaleString("pt-BR")} recebimentos`}
          {temFiltro && ` (de ${linhas.length.toLocaleString("pt-BR")})`}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPagina(Math.max(0, paginaAtual - 1))}
            disabled={paginaAtual === 0}
            className="rounded border border-stone-300 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
          >
            ‹ Anterior
          </button>
          <span>
            {paginaAtual + 1} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina(Math.min(totalPaginas - 1, paginaAtual + 1))}
            disabled={paginaAtual >= totalPaginas - 1}
            className="rounded border border-stone-300 px-2 py-1 disabled:opacity-40 dark:border-slate-700"
          >
            Próxima ›
          </button>
        </div>
      </div>

      {/* Detalhe: todas as colunas A:X do recebimento */}
      {aberta && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setAberta(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-full w-full max-w-2xl flex-col rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-start justify-between gap-3 border-b border-stone-200 p-4 dark:border-slate-800">
              <div className="min-w-0">
                <p className="font-mono text-xs text-stone-500 dark:text-slate-400">
                  {texto(val(aberta, "nri_2"))} · linha {aberta.linha} da planilha
                </p>
                <h3 className="font-bold text-stone-900 dark:text-white">
                  {texto(val(aberta, "descricao")) || texto(val(aberta, "desc_sectra"))}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAberta(null)}
                className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-600 hover:border-red-400 dark:border-slate-700 dark:text-slate-300"
              >
                Fechar
              </button>
            </div>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 overflow-auto p-4 sm:grid-cols-2">
              {colunas.map((c, i) => {
                const v = c.campo === "dt_receb" ? textoData(aberta.valores[i]) : texto(aberta.valores[i]);
                if (!v) return null;
                return (
                  <div key={c.letra}>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">
                      {c.cabecalho || c.letra} <span className="font-mono normal-case text-stone-400">({c.letra})</span>
                    </dt>
                    <dd className="break-words text-sm text-stone-900 dark:text-slate-100">{v}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
