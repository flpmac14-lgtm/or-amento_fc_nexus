"use client";

// Janela "Romaneio" — pedido do usuário (24/10/2026): escolher PO ou MAC (um
// ou vários, o começo já basta) e abrir o romaneio com as notas fiscais do
// Sectra de cada item (app/follow-up/romaneio/page.tsx).

import { useEffect, useMemo, useState } from "react";
import { itensDaObra, obraDoItem, type TipoObra } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

const classeCampo =
  "w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";

export default function FollowUpRelatorioRomaneio({ itens, onFechar }: { itens: ItemFollowUp[]; onFechar: () => void }) {
  const [tipo, setTipo] = useState<TipoObra>("po");
  const [valor, setValor] = useState("");
  const valores = useMemo(() => valor.split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean), [valor]);
  const achados = useMemo(() => new Set(valores.flatMap((v) => itensDaObra(itens, tipo, v).map((i) => i.id))).size, [itens, tipo, valores]);
  const sugestoes = useMemo(
    () => [...new Set(itens.map((i) => obraDoItem(i, tipo)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    [itens, tipo],
  );

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  function gerar() {
    window.open(`/follow-up/romaneio?${new URLSearchParams({ tipo, valor: valores.join(",") })}`, "_blank");
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (achados) gerar();
        }}
      >
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-white">Romaneio</h2>
          <p className="text-sm text-stone-600 dark:text-slate-400">
            Itens dos pedidos ou MACs com as notas fiscais do Sectra, quantidade e peso — A4 paisagem. Pode pôr vários,
            separados por vírgula; o começo do número já basta.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-stone-200 dark:border-slate-800 p-1 text-sm">
          {(["po", "mac"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTipo(t);
                setValor("");
              }}
              className={`flex-1 rounded-md px-3 py-1 font-medium ${
                tipo === t ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950" : "text-stone-600 dark:text-slate-400"
              }`}
            >
              Por {t === "po" ? "pedido (PO)" : "MAC"}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          {tipo === "po" ? "PO" : "MAC"}
          <input
            autoFocus
            list="fu-romaneio-sugestoes"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={tipo === "po" ? "ex.: 4501743280, 4501722449" : "ex.: 690.25, 701.26"}
            className={`${classeCampo} font-mono`}
          />
          <datalist id="fu-romaneio-sugestoes">
            {sugestoes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <span className={achados ? "text-green-700 dark:text-cyan-300" : ""}>
            {valores.length ? `${achados} item(ns) encontrado(s)` : " "}
          </span>
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
            type="submit"
            disabled={achados === 0}
            className="rounded-lg bg-green-600 dark:bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 dark:hover:bg-cyan-500 disabled:opacity-50"
          >
            Gerar romaneio
          </button>
        </div>
      </form>
    </div>
  );
}
