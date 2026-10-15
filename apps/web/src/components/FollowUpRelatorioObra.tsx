"use client";

// Janela "Relatório por obra" — pedido explícito do usuário: escolher MAC ou
// PO, digitar (o começo já basta) e gerar um resumo estilo card numa folha A4
// (app/follow-up/obra/page.tsx).

import { useEffect, useMemo, useState } from "react";
import { itensDaObra, metaDoItem, obraDoItem, type TipoObra } from "@/lib/followUp";
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
  // Tique "Sem fornecedores" (pedido do usuário): o relatório já abre com os
  // terceirizados como "Serviço de monitoramento externo" (dá pra trocar lá também).
  const [semFornecedor, setSemFornecedor] = useState(false);
  const daObra = useMemo(() => itensDaObra(itens, tipo, valor), [itens, tipo, valor]);
  // Metas escolhidas (1P, 2P…) — pedido do usuário: uma ou várias; cada uma
  // abre o próprio relatório (um PDF por Meta). Vazio = todas num relatório só.
  const [escolhidas, setEscolhidas] = useState<Set<string>>(new Set());
  const metas = useMemo(
    () => [...new Set(daObra.map(metaDoItem).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    [daObra],
  );
  const metasValidas = useMemo(() => metas.filter((m) => escolhidas.has(m)), [metas, escolhidas]);
  const achados = useMemo(
    () => (metasValidas.length ? daObra.filter((i) => metasValidas.includes(metaDoItem(i))) : daObra),
    [daObra, metasValidas],
  );

  function alternarMeta(m: string) {
    setEscolhidas((s) => {
      if (!m) return new Set();
      const n = new Set(s);
      if (n.has(m)) n.delete(m);
      else n.add(m);
      return n;
    });
  }
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
    // Várias Metas: uma aba só, que salva um PDF por Meta (abrir várias abas o navegador bloqueia).
    const params = new URLSearchParams({ tipo, valor: valor.trim() });
    if (metasValidas.length) params.set("meta", metasValidas.join(","));
    if (semFornecedor) params.set("sem_fornecedor", "1");
    window.open(`/follow-up/obra?${params}`, "_blank");
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
        {metas.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
            Meta — marque uma ou várias (cada uma sai num relatório / PDF separado)
            <div className="flex flex-wrap gap-1">
              {["", ...metas].map((m) => (
                <button
                  key={m || "todas"}
                  type="button"
                  onClick={() => alternarMeta(m)}
                  aria-pressed={m ? escolhidas.has(m) : metasValidas.length === 0}
                  className={`rounded-md border px-2.5 py-1 font-mono text-sm font-semibold ${
                    (m ? escolhidas.has(m) : metasValidas.length === 0)
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-stone-300 text-stone-700 dark:border-slate-700 dark:text-slate-300"
                  }`}
                >
                  {m ? `${escolhidas.has(m) ? "☑" : "☐"} ${m}` : "Todas juntas"}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-stone-200 dark:border-slate-800 p-2.5 text-sm text-stone-800 dark:text-slate-200">
          <input
            type="checkbox"
            checked={semFornecedor}
            onChange={(e) => setSemFornecedor(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-violet-600"
          />
          <span>
            <strong>Sem fornecedores (pra cliente)</strong>
            <span className="block text-xs text-stone-500 dark:text-slate-400">
              Terceirizado aparece como “Serviço de monitoramento externo”, também na Obs.
            </span>
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
            {metasValidas.length > 1 ? `Gerar ${metasValidas.length} relatórios (1 PDF cada)` : "Gerar relatório"}
          </button>
        </div>
      </form>
    </div>
  );
}
