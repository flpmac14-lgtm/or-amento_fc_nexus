"use client";

// Janela "Relatório de alívio de tensão" — pedido explícito do usuário: no
// mesmo padrão do relatório de coleta, com os pedidos que têm "alívio de
// tensão" anotado na Obs. Felipe/Marcelo. Pergunta os clientes (1 ou mais) e abre o
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
  // Pedido do usuário: o alívio é feito de uma vez, então dá pra juntar 2+
  // clientes no mesmo relatório. Nenhum marcado = todos.
  const [marcados, setMarcados] = useState<string[]>([]);
  const total = marcados.length
    ? clientes.filter(([c]) => marcados.includes(c)).reduce((s, [, n]) => s + n, 0)
    : comAlivio.length;
  function alternar(c: string) {
    setMarcados((m) => (m.includes(c) ? m.filter((x) => x !== c) : [...m, c]));
  }

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
    if (marcados.length) qs.set("cliente", [...marcados].sort((a, b) => a.localeCompare(b, "pt-BR")).join(","));
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
        <div className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Clientes <span>(marque um ou mais para juntar no mesmo relatório; nenhum marcado = todos)</span>
          {comAlivio.length > 0 ? (
            <div className={`${classeCampo} flex max-h-60 flex-col gap-0.5 overflow-y-auto`}>
              <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-stone-100 dark:hover:bg-slate-800">
                <input
                  type="checkbox"
                  checked={marcados.length === 0}
                  onChange={() => setMarcados([])}
                  className="h-4 w-4 accent-green-600 dark:accent-cyan-500"
                />
                <span className="font-semibold">Todos os clientes</span>
                <span className="ml-auto text-stone-500 dark:text-slate-400">{comAlivio.length} pedido(s)</span>
              </label>
              {clientes.map(([c, n]) => (
                <label
                  key={c}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-stone-100 dark:hover:bg-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={marcados.includes(c)}
                    onChange={() => alternar(c)}
                    className="h-4 w-4 accent-green-600 dark:accent-cyan-500"
                  />
                  <span>{c}</span>
                  <span className="ml-auto text-stone-500 dark:text-slate-400">{n} pedido(s)</span>
                </label>
              ))}
            </div>
          ) : (
            <span className="text-sm text-stone-600 dark:text-slate-400">
              Nenhum pedido com “alívio de tensão” na Obs. Felipe/Marcelo.
            </span>
          )}
          {comAlivio.length > 0 && (
            <span className="text-right font-semibold text-stone-700 dark:text-slate-300">
              {marcados.length ? `${marcados.length} cliente(s) · ` : ""}
              {total} pedido(s) no relatório
            </span>
          )}
        </div>
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
