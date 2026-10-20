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
  const [comNf, setComNf] = useState(false);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  // fracionado: o relatório já abre com a Qtd editável (coleta parcial).
  function gerar(fracionado = false) {
    const qs = new URLSearchParams({ data: dataValida });
    if (cliente) qs.set("cliente", cliente);
    if (fracionado) qs.set("fracionado", "1");
    if (comNf) qs.set("nf", "1");
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
        <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={comNf}
            onChange={(e) => setComNf(e.target.checked)}
            className="h-4 w-4 accent-green-600 dark:accent-cyan-500"
          />
          Com Nota fiscal <span className="text-xs text-stone-500 dark:text-slate-400">(NF e dia de emissão de cada pedido)</span>
        </label>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => gerar(true)}
            disabled={!dataValida}
            title="Abre o relatório com a quantidade de cada pedido editável, para coleta parcial"
            className="mr-auto rounded-lg px-2 py-1.5 text-xs text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800 hover:text-stone-800 dark:hover:text-slate-200 disabled:opacity-50"
          >
            Gerar relatório fracionado
          </button>
          <button
            type="button"
            onClick={() => {
              window.open(`/follow-up/coleta-semanal${dataValida ? `?semana=${dataValida}` : ""}`, "_blank");
              onFechar();
            }}
            title="Diagrama da semana: em cada dia, os clientes com coleta e a quantidade de itens"
            className="rounded-lg px-2 py-1.5 text-xs text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800 hover:text-stone-800 dark:hover:text-slate-200"
          >
            Diagrama semanal
          </button>
          <button
            type="button"
            onClick={() => {
              const qs = new URLSearchParams();
              if (cliente) qs.set("cliente", cliente);
              window.open(`/follow-up/carga${qs.size ? `?${qs}` : ""}`, "_blank");
              onFechar();
            }}
            title="Relatório de carga: o que já foi feito e quanto falta (pelo % das etapas) nas coletas do período, e onde aplicar mais energia na fabricação"
            className="rounded-lg px-2 py-1.5 text-xs text-stone-500 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800 hover:text-stone-800 dark:hover:text-slate-200"
          >
            Relatório de carga
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
