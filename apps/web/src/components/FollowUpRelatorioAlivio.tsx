"use client";

// Janela "Relatório de alívio de tensão" — pedido explícito do usuário: no
// mesmo padrão do relatório de coleta, com os pedidos que têm "alívio de
// tensão" anotado na Obs. Felipe/Marcelo. Pergunta o cliente e abre o
// relatório em A4 paisagem (app/follow-up/alivio-tensao/page.tsx).

import { useEffect, useMemo, useState } from "react";
import { temAlivioTensao } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

const classeCampo =
  "w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";

export default function FollowUpRelatorioAlivio({ itens, onFechar }: { itens: ItemFollowUp[]; onFechar: () => void }) {
  const comAlivio = useMemo(() => itens.filter(temAlivioTensao), [itens]);
  // Clientes com pedido de alívio de tensão, com quantos pedidos.
  const clientes = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of comAlivio) if (i.cliente) m.set(i.cliente, (m.get(i.cliente) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [comAlivio]);
  const [cliente, setCliente] = useState(() => (clientes.length === 1 ? clientes[0][0] : ""));

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  // fracionado: o relatório já abre com a Qtd editável (envio parcial).
  function gerar(fracionado = false) {
    const qs = new URLSearchParams();
    if (cliente) qs.set("cliente", cliente);
    if (fracionado) qs.set("fracionado", "1");
    window.open(`/follow-up/alivio-tensao?${qs}`, "_blank");
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-white">Relatório de alívio de tensão</h2>
          <p className="text-sm text-stone-600 dark:text-slate-400">
            Pedidos com “alívio de tensão” na Obs. Felipe/Marcelo, agrupados por MAC — folha A4 paisagem.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Cliente
          {comAlivio.length > 0 ? (
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={classeCampo}>
              <option value="">Todos os clientes — {comAlivio.length} pedido(s)</option>
              {clientes.map(([c, n]) => (
                <option key={c} value={c}>
                  {c} — {n} pedido(s)
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-stone-600 dark:text-slate-400">
              Nenhum pedido com “alívio de tensão” na Obs. Felipe/Marcelo.
            </span>
          )}
        </label>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => gerar(true)}
            disabled={comAlivio.length === 0}
            title="Abre o relatório com a quantidade de cada pedido editável, para envio parcial"
            className="mr-auto rounded-lg px-2 py-1.5 text-xs text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800 hover:text-stone-800 dark:hover:text-slate-200 disabled:opacity-50"
          >
            Gerar relatório fracionado
          </button>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-sm text-stone-700 dark:text-slate-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => gerar()}
            disabled={comAlivio.length === 0}
            className="rounded-lg bg-green-600 dark:bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 dark:hover:bg-cyan-500 disabled:opacity-50"
          >
            Gerar relatório
          </button>
        </div>
      </div>
    </div>
  );
}
