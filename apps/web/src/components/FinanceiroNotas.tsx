"use client";

// NFs faturadas na aba Financeiro — pedido do usuário: no lugar dos pedidos
// de venda em aberto, a tabela de notas "conforme vai saindo", da mais
// recente pra mais antiga. Mesmo filtro do faturamento (soma bate com os
// cartões). Filtro por mês, busca (nota, cliente, pedido) e "mostrar mais".
// Canceladas (pedido do usuário, 08/10): aparecem em vermelho e não somam.

import { useMemo, useState } from "react";
import { rotuloMes } from "@/components/FinanceiroGraficos";
import { linkObra } from "@/lib/painel";
import type { NotaFiscal } from "@/lib/financeiro";

const POR_PAGINA = 50;

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataBr(iso: string): string {
  return iso.split("-").reverse().join("/");
}

// mes/setMes vêm da página: o filtro de mês do topo também filtra as NFs.
export default function FinanceiroNotas({
  notas,
  mes,
  setMes,
}: {
  notas: NotaFiscal[];
  mes: string; // "" = últimos 13 meses
  setMes: (m: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);

  const meses = useMemo(() => [...new Set(notas.map((n) => n.emissao.slice(0, 7)))], [notas]);
  const termo = busca.trim().toLowerCase();
  const filtradas = useMemo(
    () =>
      notas.filter(
        (n) =>
          (!mes || n.emissao.startsWith(mes)) &&
          (!termo || [n.nota, n.cliente, n.pedido, n.mac, n.po].some((v) => (v ?? "").toLowerCase().includes(termo))),
      ),
    [notas, mes, termo],
  );
  const total = filtradas.reduce((s, n) => s + (n.cancelada ? 0 : n.total), 0);
  const canceladas = filtradas.filter((n) => n.cancelada).length;
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const campo =
    "rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200";

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700 dark:text-slate-300">NFs faturadas</h2>
          <p className="text-xs text-stone-500 dark:text-slate-400">Da mais recente pra mais antiga · mesmo filtro do faturamento</p>
        </div>
        <select
          value={mes}
          onChange={(e) => {
            setMes(e.target.value);
            setLimite(POR_PAGINA);
          }}
          className={campo}
        >
          <option value="">Últimos 13 meses</option>
          {meses.map((m) => (
            <option key={m} value={m}>
              {rotuloMes(m)}
            </option>
          ))}
        </select>
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setLimite(POR_PAGINA);
          }}
          type="search"
          placeholder="Nota, cliente, MAC, PO…"
          className={`${campo} w-56`}
        />
      </div>

      <p className="mb-2 text-sm text-stone-700 dark:text-slate-300">
        <strong>{filtradas.length - canceladas}</strong> nota(s) · total <strong>{moeda(total)}</strong>
        {canceladas > 0 && (
          <span className="ml-2 font-semibold text-red-600 dark:text-red-400">
            · {canceladas} cancelada(s) em vermelho, fora da soma
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-xs uppercase text-stone-500 dark:border-slate-700 dark:text-slate-400">
              <th className="py-1.5 pr-2">NF</th>
              <th className="pr-2">Emissão</th>
              <th className="pr-2">Cliente</th>
              <th className="pr-2">MAC</th>
              <th className="pr-2">PO cliente</th>
              <th className="pr-2" title="Pedido de venda (ERP)">Ped. venda</th>
              <th className="pr-2 text-right">Produção</th>
              <th className="pr-2 text-right">Serviço</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, limite).map((n) => (
              <tr
                key={`${n.nota}-${n.emissao}`}
                title={n.cancelada ? "Nota cancelada — não entra na soma nem no faturamento" : undefined}
                className={`border-b ${
                  n.cancelada
                    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 [&_*]:!text-red-700 dark:[&_*]:!text-red-300"
                    : "border-stone-100 hover:bg-stone-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                }`}
              >
                <td className="py-1 pr-2 font-mono font-semibold text-stone-900 dark:text-white">
                  {n.nota}
                  {n.cancelada && (
                    <span className="ml-1 rounded border border-red-500 bg-white px-1 font-sans text-[10px] font-bold dark:bg-red-950">CANCELADA</span>
                  )}
                </td>
                <td className="whitespace-nowrap pr-2 text-stone-700 dark:text-slate-300">
                  {dataBr(n.emissao)}
                  {n.emissao === hoje && (
                    <span className="ml-1 rounded bg-green-100 px-1 text-[10px] font-bold text-green-800 dark:bg-cyan-950 dark:text-cyan-300">hoje</span>
                  )}
                </td>
                <td className="max-w-[18rem] truncate pr-2 text-stone-800 dark:text-slate-200" title={n.cliente ?? ""}>
                  {n.cliente ?? "—"}
                </td>
                <td className="whitespace-nowrap pr-2">
                  {n.mac && /^\d+\.\d{2}$/.test(n.mac) ? (
                    <a
                      href={linkObra(n.mac)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded bg-stone-100 px-1.5 font-semibold text-stone-700 hover:underline dark:bg-slate-800 dark:text-slate-300"
                      title="Abrir a obra no Follow up"
                    >
                      {n.mac}
                    </a>
                  ) : (
                    <span className="text-xs text-stone-500 dark:text-slate-400">{n.mac ?? "—"}</span>
                  )}
                </td>
                <td className="pr-2 font-mono text-stone-800 dark:text-slate-200">{n.po ?? "—"}</td>
                <td className="pr-2 font-mono text-stone-500 dark:text-slate-400">{n.pedido ?? "—"}</td>
                <td className="pr-2 text-right text-stone-700 dark:text-slate-300">{n.producao ? moeda(n.producao) : "—"}</td>
                <td className="pr-2 text-right text-stone-700 dark:text-slate-300">{n.servico ? moeda(n.servico) : "—"}</td>
                <td className={`text-right font-semibold text-stone-900 dark:text-white ${n.cancelada ? "line-through" : ""}`}>{moeda(n.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtradas.length === 0 && <p className="py-6 text-center text-sm text-stone-500 dark:text-slate-400">Nenhuma nota encontrada.</p>}
      {filtradas.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + POR_PAGINA)}
          className="mt-3 w-full rounded-lg border border-stone-300 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Mostrar mais ({filtradas.length - limite} restantes)
        </button>
      )}
    </section>
  );
}
