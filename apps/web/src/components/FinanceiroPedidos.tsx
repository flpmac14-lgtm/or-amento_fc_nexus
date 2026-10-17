"use client";

// Aba Financeiro → Pedidos — pedido do usuário (17/10/2026): os pedidos de
// venda do ERP desde 2024, um item por linha, com a consulta SQL que ele passou
// (pedido, obra, PO do cliente, status do item, material, valor, previsão e
// semana de entrega, cliente). Busca só quando a aba abre (/api/financeiro/pedidos).

import { useEffect, useMemo, useState } from "react";
import { moeda } from "@/components/FinanceiroPainel";
import { normalizarBusca } from "@/lib/followUp";

interface Linha {
  pedido: string | null;
  obra: string | null;
  obra_desc: string | null;
  pedido_cliente: string | null;
  status: string | null;
  material: string | null;
  descricao: string | null;
  qtde: number;
  valor: number;
  entrega: string | null; // AAAA-MM-DD
  ano_semana: string | null;
  cliente: string | null;
}

const STATUS = ["EM ABERTO", "LIBERADO", "EM PRODUCAO", "FATURADO", "CANCELADO"] as const;
const ROTULO: Record<string, string> = {
  "EM ABERTO": "Em aberto",
  LIBERADO: "Liberado",
  "EM PRODUCAO": "Em produção",
  FATURADO: "Faturado",
  CANCELADO: "Cancelado",
};
const COR: Record<string, string> = {
  "EM ABERTO": "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  LIBERADO: "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
  "EM PRODUCAO": "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200",
  FATURADO: "bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200",
  CANCELADO: "bg-red-100 text-red-800 line-through dark:bg-red-950/60 dark:text-red-300",
};
// Filtro rápido: "Carteira" = o que ainda não foi faturado nem cancelado.
type Filtro = "carteira" | "todos" | (typeof STATUS)[number];
const PAGINA = 200;

function diaBr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function FinanceiroPedidos() {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("carteira");
  const [cliente, setCliente] = useState("");
  const [limite, setLimite] = useState(PAGINA);

  useEffect(() => {
    let ativo = true;
    fetch("/api/financeiro/pedidos", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro ?? `Falha ao carregar os pedidos (${r.status}).`);
        return j as { pedidos: { colunas: (keyof Linha)[]; linhas: unknown[][] } | null; gerado_em: string | null };
      })
      .then((j) => {
        if (!ativo) return;
        const cols = j.pedidos?.colunas ?? [];
        setLinhas((j.pedidos?.linhas ?? []).map((l) => Object.fromEntries(cols.map((c, i) => [c, l[i]])) as unknown as Linha));
        setGeradoEm(j.gerado_em);
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  const clientes = useMemo(() => [...new Set((linhas ?? []).map((l) => l.cliente ?? "—"))].sort(), [linhas]);
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of linhas ?? []) m.set(l.status ?? "", (m.get(l.status ?? "") ?? 0) + 1);
    return m;
  }, [linhas]);

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca.trim());
    return (linhas ?? []).filter((l) => {
      if (filtro === "carteira" ? l.status === "FATURADO" || l.status === "CANCELADO" : filtro !== "todos" && l.status !== filtro) return false;
      if (cliente && (l.cliente ?? "—") !== cliente) return false;
      if (!termo) return true;
      return normalizarBusca(
        [l.pedido, l.obra, l.obra_desc, l.pedido_cliente, l.material, l.descricao, l.cliente, l.ano_semana].filter(Boolean).join(" "),
      ).includes(termo);
    });
  }, [linhas, busca, filtro, cliente]);

  const totais = useMemo(
    () => ({
      valor: filtradas.filter((l) => l.status !== "CANCELADO").reduce((s, l) => s + l.valor, 0),
      pedidos: new Set(filtradas.map((l) => l.pedido)).size,
    }),
    [filtradas],
  );

  if (erro) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>;
  if (!linhas) return <p className="py-10 text-center text-stone-500 dark:text-slate-400">Carregando pedidos…</p>;
  if (!linhas.length)
    return (
      <p className="py-10 text-center text-stone-500 dark:text-slate-400">
        Os pedidos ainda não chegaram do ERP — aparecem na próxima atualização (até 15 min).
      </p>
    );

  const hoje = hojeIso();
  const carteira = linhas.filter((l) => l.status !== "FATURADO" && l.status !== "CANCELADO").length;
  const chip = (ativo: boolean) =>
    `shrink-0 rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${
      ativo
        ? "border-green-700 bg-green-700 text-white dark:border-cyan-500 dark:bg-cyan-600"
        : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
    }`;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase text-stone-500 dark:text-slate-400">Valor (filtro)</p>
          <p className="text-xl font-black text-stone-900 dark:text-white">{moeda(totais.valor)}</p>
          <p className="text-xs text-stone-500 dark:text-slate-400">sem os cancelados</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase text-stone-500 dark:text-slate-400">Pedidos / itens</p>
          <p className="text-xl font-black text-stone-900 dark:text-white">
            {totais.pedidos} <span className="text-base font-semibold text-stone-500">/ {filtradas.length}</span>
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:col-span-1">
          <p className="text-xs font-semibold uppercase text-stone-500 dark:text-slate-400">Atualizado do ERP</p>
          <p className="text-sm font-semibold text-stone-800 dark:text-slate-200">
            {geradoEm ? new Date(geradoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
          </p>
          <p className="text-xs text-stone-500 dark:text-slate-400">pedidos desde 01/01/2024 · atualiza a cada 15 min</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap gap-2">
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setLimite(PAGINA);
            }}
            type="search"
            placeholder="🔍 Pedido, obra, PO do cliente, material, descrição, semana (W2643)…"
            className="h-11 min-w-[14rem] flex-1 rounded-lg border-2 border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-green-700 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-500"
          />
          <select
            value={cliente}
            onChange={(e) => {
              setCliente(e.target.value);
              setLimite(PAGINA);
            }}
            className="h-11 rounded-lg border-2 border-stone-300 bg-white px-2 text-sm text-stone-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setFiltro("carteira")} className={chip(filtro === "carteira")} title="Ainda não faturado nem cancelado">
            Carteira ({carteira})
          </button>
          {STATUS.map((s) => (
            <button key={s} type="button" onClick={() => setFiltro(s)} className={chip(filtro === s)}>
              {ROTULO[s]} ({contagem.get(s) ?? 0})
            </button>
          ))}
          <button type="button" onClick={() => setFiltro("todos")} className={chip(filtro === "todos")}>
            Todos ({linhas.length})
          </button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-stone-100 text-left text-xs uppercase text-stone-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              {["Pedido", "Obra", "Obra desc.", "PO cliente", "Status", "Material", "Desc. material", "Qtde", "Valor total", "Prev. entrega", "Ano-sem", "Cliente"].map(
                (c) => (
                  <th key={c} className={`whitespace-nowrap px-2 py-2 ${c === "Qtde" || c === "Valor total" ? "text-right" : ""}`}>
                    {c}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, limite).map((l, i) => {
              const atrasado = l.entrega && l.entrega < hoje && l.status !== "FATURADO" && l.status !== "CANCELADO";
              return (
                <tr key={`${l.pedido}-${l.material}-${i}`} className="border-t border-stone-100 odd:bg-stone-50/60 dark:border-slate-800 dark:odd:bg-slate-800/30">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono font-semibold">{l.pedido}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono">{l.obra ?? "—"}</td>
                  <td className="max-w-[14rem] truncate px-2 py-1.5" title={l.obra_desc ?? ""}>
                    {l.obra_desc ?? ""}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono">{l.pedido_cliente ?? "—"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${COR[l.status ?? ""] ?? "bg-stone-100"}`}>{ROTULO[l.status ?? ""] ?? l.status}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{l.material ?? ""}</td>
                  <td className="max-w-[20rem] truncate px-2 py-1.5" title={l.descricao ?? ""}>
                    {l.descricao ?? ""}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{l.qtde.toLocaleString("pt-BR")}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono">{moeda(l.valor)}</td>
                  <td className={`whitespace-nowrap px-2 py-1.5 ${atrasado ? "font-bold text-red-600 dark:text-red-400" : ""}`} title={atrasado ? "Previsão vencida e ainda não faturado" : undefined}>
                    {diaBr(l.entrega)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{l.ano_semana ?? ""}</td>
                  <td className="max-w-[12rem] truncate px-2 py-1.5" title={l.cliente ?? ""}>
                    {l.cliente ?? ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtradas.length === 0 && <p className="py-8 text-center text-stone-500 dark:text-slate-400">Nenhum pedido com esses filtros.</p>}
      </div>
      {filtradas.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((n) => n + PAGINA)}
          className="mx-auto rounded-lg border border-stone-300 px-4 py-2 text-sm text-stone-700 dark:border-slate-600 dark:text-slate-300"
        >
          Mostrar mais ({filtradas.length - limite} restantes)
        </button>
      )}
    </div>
  );
}
