"use client";

// Aba Financeiro → Pedido - ativo — pedido do usuário (17/10/2026): comparativo
// entre os pedidos ATIVOS do Follow up (ST = A, filha da Controle de obras) e
// os pedidos de venda do Sectra, pelo número do pedido do cliente + item.
// Mostra se já foi dada entrada, se está em aberto ou já faturado no Sectra e
// acusa duplicidade. Montado a cada 15 min por
// scripts/sincronizar_financeiro.py::comparar_com_follow_up (vem junto de
// /api/financeiro/pedidos).

import { useEffect, useMemo, useState } from "react";
import { moeda } from "@/components/FinanceiroPainel";
import { normalizarBusca } from "@/lib/followUp";

export interface ItemComparativo {
  po: string;
  mac: string | null;
  cliente: string | null;
  desenho: string | null;
  descricao: string | null;
  qtd: number | null;
  prazo: string | null;
  status_fu: string | null;
  situacao: "sem_entrada" | "em_aberto" | "faturado" | "cancelado";
  duplicado: boolean;
  pedidos: string[];
  status_erp: string[];
  qtd_erp: number | null;
  valor: number | null;
  entrega: string | null;
  cliente_erp: string | null;
  alertas: string[];
}

interface SoSectra {
  pedido: string | null;
  obra: string | null;
  obra_desc: string | null;
  pedido_cliente: string | null;
  status: string | null;
  descricao: string | null;
  qtde: number;
  valor: number;
  entrega: string | null;
  cliente: string | null;
}

type Filtro = "sem_entrada" | "em_aberto" | "faturado" | "cancelado" | "duplicado" | "todos" | "so_sectra";

const SITUACAO: Record<ItemComparativo["situacao"], { rotulo: string; cor: string }> = {
  sem_entrada: { rotulo: "Pendente dar entrada", cor: "bg-red-600 text-white" },
  em_aberto: { rotulo: "Em aberto no Sectra", cor: "bg-green-600 text-white" },
  faturado: { rotulo: "Já faturado no Sectra", cor: "bg-amber-400 text-stone-900" },
  cancelado: { rotulo: "Cancelado no Sectra", cor: "bg-stone-500 text-white" },
};

const ROTULO_ERP: Record<string, string> = {
  "EM ABERTO": "Em aberto",
  LIBERADO: "Liberado",
  "EM PRODUCAO": "Em produção",
  FATURADO: "Faturado",
  CANCELADO: "Cancelado",
};

function diaBr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export default function FinanceiroPedidoAtivo() {
  const [itens, setItens] = useState<ItemComparativo[] | null>(null);
  const [soSectra, setSoSectra] = useState<SoSectra[]>([]);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("sem_entrada");
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch("/api/financeiro/pedidos", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro ?? `Falha ao carregar (${r.status}).`);
        return j as { pedidos: { comparativo?: { itens: ItemComparativo[]; so_sectra: SoSectra[] } } | null; gerado_em: string | null };
      })
      .then((j) => {
        if (!ativo) return;
        setItens(j.pedidos?.comparativo?.itens ?? []);
        setSoSectra(j.pedidos?.comparativo?.so_sectra ?? []);
        setGeradoEm(j.gerado_em);
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  const contagem = useMemo(() => {
    const l = itens ?? [];
    return {
      todos: l.length,
      sem_entrada: l.filter((i) => i.situacao === "sem_entrada").length,
      em_aberto: l.filter((i) => i.situacao === "em_aberto").length,
      faturado: l.filter((i) => i.situacao === "faturado").length,
      cancelado: l.filter((i) => i.situacao === "cancelado").length,
      duplicado: l.filter((i) => i.duplicado).length,
      so_sectra: soSectra.length,
    };
  }, [itens, soSectra]);

  const clientes = useMemo(() => [...new Set((itens ?? []).map((i) => i.cliente ?? "—"))].sort(), [itens]);
  const termo = normalizarBusca(busca.trim());

  const lista = useMemo(
    () =>
      {
        const l = (itens ?? []).filter((i) => {
          if (filtro === "duplicado" ? !i.duplicado : filtro !== "todos" && filtro !== "so_sectra" && i.situacao !== filtro) return false;
          if (cliente && (i.cliente ?? "—") !== cliente) return false;
          return (
            !termo ||
            normalizarBusca([i.po, i.mac, i.desenho, i.descricao, i.cliente, ...i.pedidos].filter(Boolean).join(" ")).includes(termo)
          );
        });
        // Pendentes de entrada: prazo mais curto primeiro (sem prazo no fim) — pedido do usuário 17/10.
        if (filtro === "sem_entrada")
          l.sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999") || (a.po ?? "").localeCompare(b.po ?? ""));
        return l;
      },
    [itens, filtro, cliente, termo],
  );
  const listaSectra = useMemo(
    () =>
      soSectra.filter(
        (l) =>
          !termo ||
          normalizarBusca([l.pedido, l.obra, l.obra_desc, l.pedido_cliente, l.descricao, l.cliente].filter(Boolean).join(" ")).includes(termo),
      ),
    [soSectra, termo],
  );

  if (erro) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>;
  if (!itens) return <p className="py-10 text-center text-stone-500 dark:text-slate-400">Carregando comparativo…</p>;
  if (!itens.length)
    return <p className="py-10 text-center text-stone-500 dark:text-slate-400">O comparativo aparece na próxima atualização do ERP (até 15 min).</p>;

  const cartoes: [Filtro, string, number, string, string][] = [
    ["sem_entrada", "Pendente dar entrada", contagem.sem_entrada, "ativo no Follow up, não achado no Sectra", "border-red-500 text-red-700 dark:text-red-300"],
    ["em_aberto", "Em aberto no Sectra", contagem.em_aberto, "entrada dada, ainda não faturado", "border-green-600 text-green-700 dark:text-green-400"],
    ["faturado", "Já faturado no Sectra", contagem.faturado, "faturado lá, mas ainda ativo no Follow up", "border-amber-500 text-amber-700 dark:text-amber-300"],
    ["duplicado", "Duplicidade", contagem.duplicado, "mesmo pedido/item repetido", "border-violet-500 text-violet-700 dark:text-violet-300"],
    ["todos", "Ativos no Follow up", contagem.todos, "ST = A", "border-stone-400 text-stone-800 dark:text-slate-200"],
    ["so_sectra", "Só no Sectra", contagem.so_sectra, "em aberto lá, sem ativo no Follow up", "border-stone-400 text-stone-600 dark:text-slate-400"],
  ];
  const th = "whitespace-nowrap px-2 py-2";
  const td = "whitespace-nowrap px-2 py-1.5";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {cartoes.map(([f, rotulo, n, detalhe, cor]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-xl border-2 bg-white p-3 text-left dark:bg-slate-900 ${cor} ${
              filtro === f ? "ring-2 ring-offset-1 ring-current dark:ring-offset-slate-950" : "opacity-90 hover:opacity-100"
            }`}
          >
            <p className="text-[11px] font-bold uppercase tracking-wide">{rotulo}</p>
            <p className="text-2xl font-black">{n}</p>
            <p className="text-[11px] text-stone-500 dark:text-slate-400">{detalhe}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          type="search"
          placeholder="🔍 PO, MAC, desenho, descrição, nº do pedido no Sectra…"
          className="h-11 min-w-[14rem] flex-1 rounded-lg border-2 border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-green-700 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-500"
        />
        {filtro !== "so_sectra" && (
          <select
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            className="h-11 rounded-lg border-2 border-stone-300 bg-white px-2 text-sm text-stone-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        {/* Relatório só dos pendentes de dar entrada — pedido do usuário (23/10/2026). */}
        <a
          href={`/financeiro/pendentes-entrada${cliente ? `?cliente=${encodeURIComponent(cliente)}` : ""}`}
          target="_blank"
          rel="noopener"
          className="flex h-11 items-center rounded-lg bg-red-600 px-3 text-sm font-bold text-white hover:bg-red-500"
        >
          🖨️ Relatório pendentes de entrada ({itens.filter((i) => i.situacao === "sem_entrada" && (!cliente || (i.cliente ?? "—") === cliente)).length})
        </a>
        <span className="text-xs text-stone-500 dark:text-slate-400">
          Referência: pedido do cliente + item · atualizado{" "}
          {geradoEm ? new Date(geradoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
        </span>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {filtro === "so_sectra" ? (
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-stone-100 text-left text-xs uppercase text-stone-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                {["Pedido Sectra", "PO cliente", "Status", "Obra", "Obra desc.", "Desc. material", "Qtde", "Valor", "Prev. entrega", "Cliente"].map((c) => (
                  <th key={c} className={th}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listaSectra.map((l, n) => (
                <tr key={`${l.pedido}-${l.pedido_cliente}-${n}`} className="odd:bg-stone-50/60 dark:odd:bg-slate-800/30">
                  <td className={`${td} font-mono font-semibold`}>{l.pedido}</td>
                  <td className={`${td} font-mono`}>{l.pedido_cliente ?? "—"}</td>
                  <td className={td}>{ROTULO_ERP[l.status ?? ""] ?? l.status}</td>
                  <td className={`${td} font-mono`}>{l.obra ?? "—"}</td>
                  <td className={`${td} max-w-[14rem] truncate`} title={l.obra_desc ?? ""}>
                    {l.obra_desc}
                  </td>
                  <td className={`${td} max-w-[20rem] truncate`} title={l.descricao ?? ""}>
                    {l.descricao}
                  </td>
                  <td className={`${td} text-right font-mono`}>{l.qtde.toLocaleString("pt-BR")}</td>
                  <td className={`${td} text-right font-mono`}>{moeda(l.valor)}</td>
                  <td className={td}>{diaBr(l.entrega)}</td>
                  <td className={`${td} max-w-[12rem] truncate`}>{l.cliente}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-stone-100 text-left text-xs uppercase text-stone-600 dark:bg-slate-800 dark:text-slate-300">
              <tr>
                <th className={th}>Situação</th>
                <th className={th}>PO / item (Follow up)</th>
                <th className={th}>MAC</th>
                <th className={th}>Cli</th>
                <th className={th}>Desenho</th>
                <th className={th}>Descrição</th>
                <th className={`${th} text-right`}>Qtd</th>
                <th className={th}>Prazo</th>
                <th className={th}>Status Follow up</th>
                <th className={th}>Pedido Sectra</th>
                <th className={th}>Status Sectra</th>
                <th className={`${th} text-right`}>Qtd Sectra</th>
                <th className={`${th} text-right`}>Valor</th>
                <th className={th}>Prev. entrega</th>
                <th className={th}>Alertas</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i, n) => (
                <tr
                  key={`${i.po}-${n}`}
                  className={`odd:bg-stone-50/60 dark:odd:bg-slate-800/30 ${i.duplicado ? "outline outline-2 -outline-offset-2 outline-violet-400" : ""}`}
                >
                  <td className={td}>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${SITUACAO[i.situacao].cor}`}>{SITUACAO[i.situacao].rotulo}</span>
                    {i.duplicado && <span className="ml-1 rounded bg-violet-600 px-1.5 py-0.5 text-xs font-bold text-white">DUPLICADO</span>}
                  </td>
                  <td className={`${td} font-mono font-semibold`}>{i.po}</td>
                  <td className={`${td} font-mono`}>{i.mac ?? "—"}</td>
                  <td className={td}>{i.cliente ?? "—"}</td>
                  <td className={`${td} font-mono text-xs`}>{i.desenho ?? "—"}</td>
                  <td className={`${td} max-w-[18rem] truncate`} title={i.descricao ?? ""}>
                    {i.descricao}
                  </td>
                  <td className={`${td} text-right font-mono`}>{i.qtd ?? "—"}</td>
                  <td className={td}>{diaBr(i.prazo)}</td>
                  <td className={`${td} max-w-[10rem] truncate`} title={i.status_fu ?? ""}>
                    {i.status_fu ?? "—"}
                  </td>
                  <td className={`${td} font-mono`}>{i.pedidos.join(", ") || "—"}</td>
                  <td className={td}>{i.status_erp.map((s) => ROTULO_ERP[s] ?? s).join(", ") || "—"}</td>
                  <td className={`${td} text-right font-mono`}>{i.qtd_erp ?? "—"}</td>
                  <td className={`${td} text-right font-mono`}>{i.valor !== null ? moeda(i.valor) : "—"}</td>
                  <td className={td}>{diaBr(i.entrega)}</td>
                  <td className={`${td} max-w-[22rem] whitespace-normal text-xs font-semibold text-violet-700 dark:text-violet-300`}>
                    {i.alertas.join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(filtro === "so_sectra" ? listaSectra : lista).length === 0 && (
          <p className="py-8 text-center text-stone-500 dark:text-slate-400">Nada com esses filtros.</p>
        )}
      </div>
    </div>
  );
}
