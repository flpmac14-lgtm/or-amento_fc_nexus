"use client";

// Aba Financeiro → Entrada de pedidos — pedido do usuário (29/10/2026), pra ele
// e pra luana: os pedidos de venda lançados no Sectra e quantos por dia (data
// do pedido, VE_PEDIDO.DTPEDIDO). Mesmos dados da aba Pedidos
// (/api/financeiro/pedidos, coluna data_pedido); clicar no dia abre os itens.
// Conta por ITEM de pedido, não por pedido (pedido do usuário, 29/10/2026).

import { useEffect, useMemo, useState } from "react";
import { moeda } from "@/components/FinanceiroPainel";
import { AVISO_SEM_RESPOSTA, atualizarPedidosSectra } from "@/lib/atualizarSectra";
import { normalizarBusca } from "@/lib/followUp";

interface Linha {
  pedido: string | null;
  obra: string | null;
  obra_desc: string | null;
  pedido_cliente: string | null;
  status: string | null;
  descricao: string | null;
  qtde: number;
  valor: number;
  cliente: string | null;
  data_pedido: string | null; // AAAA-MM-DD
}


const PERIODOS = [
  [7, "7 dias"],
  [30, "30 dias"],
  [90, "90 dias"],
] as const;
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function diaBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function semana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return DIAS_SEMANA[new Date(a, m - 1, d).getDay()];
}

export default function FinanceiroEntradaPedidos() {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [dias, setDias] = useState<number>(30);
  const [cliente, setCliente] = useState("");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState("");

  function carregar(): Promise<void> {
    return fetch("/api/financeiro/pedidos", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro ?? `Falha ao carregar (${r.status}).`);
        return j as { pedidos: { colunas: string[]; linhas: unknown[][] } | null; gerado_em: string | null; atendido_em: string | null };
      })
      .then((j) => {
        const cols = j.pedidos?.colunas ?? [];
        setLinhas((j.pedidos?.linhas ?? []).map((l) => Object.fromEntries(cols.map((c, i) => [c, l[i]])) as unknown as Linha));
        setGeradoEm([j.gerado_em, j.atendido_em].filter((x): x is string => !!x).sort((a, b) => Date.parse(a) - Date.parse(b)).pop() ?? null);
        setErro("");
      })
      .catch((e: Error) => setErro(e.message));
  }

  useEffect(() => {
    Promise.resolve().then(carregar);
  }, []);

  async function atualizarAgora() {
    try {
      if (await atualizarPedidosSectra(setAtualizando)) await carregar();
      else setErro(AVISO_SEM_RESPOSTA);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAtualizando("");
    }
  }

  const semData = linhas !== null && linhas.length > 0 && linhas.every((l) => !l.data_pedido);
  const clientes = useMemo(() => [...new Set((linhas ?? []).map((l) => l.cliente ?? "—"))].sort(), [linhas]);

  // Dia → itens lançados (cada linha de pedido de venda é um item).
  const porDia = useMemo(() => {
    const desde = new Date();
    desde.setDate(desde.getDate() - (dias - 1));
    const inicio = isoDia(desde);
    const termo = normalizarBusca(busca.trim());
    const m = new Map<string, Linha[]>();
    for (const l of linhas ?? []) {
      if (!l.data_pedido || l.data_pedido < inicio || !l.pedido) continue;
      if (cliente && (l.cliente ?? "—") !== cliente) continue;
      if (termo && !normalizarBusca([l.pedido, l.pedido_cliente, l.obra, l.obra_desc, l.cliente, l.descricao].filter(Boolean).join(" ")).includes(termo))
        continue;
      const dia = m.get(l.data_pedido) ?? [];
      dia.push(l);
      m.set(l.data_pedido, dia);
    }
    return [...m.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dia, itens]) => ({
        dia,
        itens: itens.sort((a, b) => Number(b.pedido) - Number(a.pedido) || (a.pedido_cliente ?? "").localeCompare(b.pedido_cliente ?? "", "pt-BR", { numeric: true })),
        pedidos: new Set(itens.map((l) => l.pedido)).size,
        valor: itens.reduce((s, l) => s + (l.status === "CANCELADO" ? 0 : l.valor), 0),
      }));
  }, [linhas, dias, cliente, busca]);

  const maior = Math.max(1, ...porDia.map((d) => d.itens.length));
  const total = {
    pedidos: porDia.reduce((s, d) => s + d.pedidos, 0),
    itens: porDia.reduce((s, d) => s + d.itens.length, 0),
    valor: porDia.reduce((s, d) => s + d.valor, 0),
  };
  const hoje = isoDia(new Date());

  if (erro && !linhas) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>;
  if (!linhas) return <p className="py-10 text-center text-stone-500 dark:text-slate-400">Carregando pedidos…</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Itens lançados", String(total.itens), `nos últimos ${dias} dias`],
          ["Pedidos", String(total.pedidos), "pedidos de venda desses itens"],
          ["Valor", moeda(total.valor), "sem os cancelados"],
        ].map(([r, v, s]) => (
          <div key={r} className="rounded-xl border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">{r}</p>
            <p className="text-2xl font-black text-stone-900 dark:text-white">{v}</p>
            <p className="text-xs text-stone-500 dark:text-slate-400">{s}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map(([n, r]) => (
          <button
            key={n}
            type="button"
            onClick={() => setDias(n)}
            className={`h-11 rounded-lg px-3 text-sm font-bold ${
              dias === n ? "bg-green-700 text-white dark:bg-cyan-600" : "border border-stone-300 text-stone-700 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            {r}
          </button>
        ))}
        <select
          value={cliente}
          onChange={(e) => setCliente(e.target.value)}
          className="h-11 rounded-lg border border-stone-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          aria-label="Cliente"
        >
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          type="search"
          placeholder="🔍 Pedido, PO, obra…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <button
          type="button"
          onClick={atualizarAgora}
          disabled={!!atualizando}
          className="flex h-11 items-center rounded-lg border-2 border-green-700 px-3 text-sm font-bold text-green-800 hover:bg-green-50 disabled:opacity-60 dark:border-cyan-500 dark:text-cyan-200 dark:hover:bg-cyan-950/40"
          title="Lê o Sectra agora (sem esperar os 15 min)"
        >
          {atualizando ? `⏳ ${atualizando}` : "⟳ Atualizar do Sectra"}
        </button>
        <span className="text-xs text-stone-500 dark:text-slate-400">
          atualizado{" "}
          {geradoEm ? new Date(geradoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
        </span>
      </div>
      {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>}
      {semData && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          A data de entrada dos pedidos chega na próxima leitura do Sectra — toque em “Atualizar do Sectra”.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {!porDia.length && !semData && <p className="py-6 text-center text-sm text-stone-500 dark:text-slate-400">Nenhum item lançado nesse período.</p>}
        {porDia.map((d) => (
          <div key={d.dia} className="rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setAberto(aberto === d.dia ? null : d.dia)}
              aria-expanded={aberto === d.dia}
              className="flex w-full items-center gap-3 p-3 text-left"
            >
              <span className="w-24 shrink-0">
                <span className="block font-bold text-stone-900 dark:text-white">{diaBr(d.dia)}</span>
                <span className="text-xs text-stone-500 dark:text-slate-400">
                  {semana(d.dia)}
                  {d.dia === hoje ? " · HOJE" : ""}
                </span>
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="h-3 rounded-full bg-stone-100 dark:bg-slate-800">
                  <span
                    className="block h-3 rounded-full bg-green-600 dark:bg-cyan-500"
                    style={{ width: `${Math.max(4, (d.itens.length / maior) * 100)}%` }}
                  />
                </span>
                <span className="text-xs text-stone-500 dark:text-slate-400">
                  {d.pedidos} pedido{d.pedidos === 1 ? "" : "s"} · {moeda(d.valor)}
                </span>
              </span>
              <span className="w-20 shrink-0 text-right">
                <span className="block text-2xl font-black text-stone-900 dark:text-white">{d.itens.length}</span>
                <span className="text-xs text-stone-500 dark:text-slate-400">ite{d.itens.length === 1 ? "m" : "ns"}</span>
              </span>
              <span className="text-sm text-stone-400">{aberto === d.dia ? "▲" : "▼"}</span>
            </button>
            {aberto === d.dia && (
              <ul className="flex flex-col gap-1 border-t border-stone-200 p-2 text-sm dark:border-slate-800">
                {d.itens.map((l, n) => (
                  <li
                    key={`${l.pedido}-${n}`}
                    className={`flex flex-wrap items-baseline gap-x-3 rounded-lg px-2 py-1.5 odd:bg-stone-50 dark:odd:bg-slate-800/40 ${l.status === "CANCELADO" ? "opacity-60 line-through" : ""}`}
                  >
                    <span className="font-mono font-bold text-stone-900 dark:text-white">PO {l.pedido_cliente ?? "—"}</span>
                    <span className="text-stone-700 dark:text-slate-300">{l.cliente ?? "—"}</span>
                    <span className="font-mono text-xs text-stone-500 dark:text-slate-400">Pedido {l.pedido} · {l.obra ?? "—"}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-stone-500 dark:text-slate-400">{l.descricao ?? ""}</span>
                    <span className="ml-auto text-xs font-semibold text-stone-700 dark:text-slate-300">
                      {l.qtde.toLocaleString("pt-BR")} pç · {moeda(l.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
