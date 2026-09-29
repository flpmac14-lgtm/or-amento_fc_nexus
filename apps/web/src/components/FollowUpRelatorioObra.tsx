"use client";

// Janela "Relatório por obra" — pedido explícito do usuário: escolher MAC ou
// PO, digitar (o começo já basta) e gerar um resumo estilo card numa folha A4
// (app/follow-up/obra/page.tsx).

import { useEffect, useMemo, useState } from "react";
import { itensDaObra, obraDoItem, type TipoObra } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

const classeCampo =
  "w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";

export default function FollowUpRelatorioObra({
  itens,
  itemInicial,
  onFechar,
}: {
  itens: ItemFollowUp[];
  itemInicial?: ItemFollowUp | null; // aberto pelo card: já vem com o PO do item
  onFechar: () => void;
}) {
  const [tipo, setTipo] = useState<TipoObra>("po");
  const [valor, setValor] = useState(() => (itemInicial ? obraDoItem(itemInicial, "po") : ""));
  const achados = useMemo(() => itensDaObra(itens, tipo, valor), [itens, tipo, valor]);
  // Sugestões: as obras (PO base / MAC base) que existem.
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

  function trocarTipo(novo: TipoObra) {
    setTipo(novo);
    setValor(itemInicial ? obraDoItem(itemInicial, novo) : "");
  }

  function gerar() {
    window.open(`/follow-up/obra?${new URLSearchParams({ tipo, valor: valor.trim() })}`, "_blank");
    onFechar();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
      <form
        className="flex w-full max-w-md flex-col gap-4 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (achados.length) gerar();
        }}
      >
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-white">Relatório por obra</h2>
          <p className="text-sm text-stone-600 dark:text-slate-400">
            Resumo dos itens da obra numa folha A4. Digite o começo do número: “4501743280” junta os itens -010, -020…;
            “690.25” junta todas as MAC 690.25.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-stone-200 dark:border-slate-800 p-1 text-sm">
          {(["po", "mac"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => trocarTipo(t)}
              className={`flex-1 rounded-md px-3 py-1 font-medium ${
                tipo === t ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950" : "text-stone-600 dark:text-slate-400"
              }`}
            >
              Por {t.toUpperCase()}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          {tipo === "po" ? "PO" : "MAC"}
          <input
            autoFocus
            list="fu-obra-sugestoes"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={tipo === "po" ? "ex.: 4501743280" : "ex.: 690.25"}
            className={`${classeCampo} font-mono`}
          />
          <datalist id="fu-obra-sugestoes">
            {sugestoes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <span className={achados.length ? "text-green-700 dark:text-cyan-300" : ""}>
            {valor.trim() ? `${achados.length} item(ns) encontrado(s)` : " "}
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
            disabled={achados.length === 0}
            className="rounded-lg bg-green-600 dark:bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-700 dark:hover:bg-cyan-500 disabled:opacity-50"
          >
            Gerar relatório
          </button>
        </div>
      </form>
    </div>
  );
}
