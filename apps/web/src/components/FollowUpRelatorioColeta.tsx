"use client";

// Janela "Gerar relatório de coleta" — pedido explícito do usuário: pergunta
// o cliente e a data (as que estão na coluna COLETA) e abre o relatório em
// A4 paisagem, agrupado por pintura igual (app/follow-up/coleta/page.tsx).

import { useEffect, useMemo, useState } from "react";
import { formatarDataBr } from "@/lib/format";
import type { ItemFollowUp } from "@/lib/types";

const classeCampo =
  "w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";

export default function FollowUpRelatorioColeta({ itens, onFechar }: { itens: ItemFollowUp[]; onFechar: () => void }) {
  const comColeta = useMemo(() => itens.filter((i) => i.coleta_data), [itens]);
  const clientes = useMemo(
    () => [...new Set(comColeta.map((i) => i.cliente ?? ""))].filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [comColeta],
  );
  const [cliente, setCliente] = useState(() => (clientes.length === 1 ? clientes[0] : ""));
  // Datas de coleta do cliente escolhido (mais recente primeiro), com quantos pedidos.
  const datas = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of comColeta) if (!cliente || i.cliente === cliente) m.set(i.coleta_data!, (m.get(i.coleta_data!) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [comColeta, cliente]);
  const [data, setData] = useState("");
  const dataValida = data || datas[0]?.[0] || "";

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  function gerar() {
    const qs = new URLSearchParams({ data: dataValida });
    if (cliente) qs.set("cliente", cliente);
    window.open(`/follow-up/coleta?${qs}`, "_blank");
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-white">Relatório de coleta</h2>
          <p className="text-sm text-stone-600 dark:text-slate-400">
            Pedidos com essa data na coluna Coleta, agrupados por pintura igual — folha A4 paisagem.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Cliente
          <select
            value={cliente}
            onChange={(e) => {
              setCliente(e.target.value);
              setData("");
            }}
            className={classeCampo}
          >
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Data da coleta
          {datas.length > 0 ? (
            <select value={dataValida} onChange={(e) => setData(e.target.value)} className={classeCampo}>
              {datas.map(([d, n]) => (
                <option key={d} value={d}>
                  {formatarDataBr(d)} — {n} pedido(s)
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-stone-600 dark:text-slate-400">Nenhuma data de coleta marcada para esse cliente.</span>
          )}
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-sm text-stone-700 dark:text-slate-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={gerar}
            disabled={!dataValida}
            className="rounded-lg bg-green-600 dark:bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 dark:hover:bg-cyan-500 disabled:opacity-50"
          >
            Gerar relatório
          </button>
        </div>
      </div>
    </div>
  );
}
