"use client";

// Compras recentes na Visão Geral (pedido do usuário): notas de entrada do ERP,
// copiadas todo dia pela tarefa "Atualizar preços ERP" — GET /painel/compras
// (app/painel.py::compras). Só a última compra de cada material, sem quantidade.

import { useState } from "react";
import { Bloco, Vazio, useBloco } from "@/components/VisaoGeralComum";
import { formatarMoeda } from "@/lib/format";
import { ddmm, horaMinuto, linkObra, type RespostaCompras } from "@/lib/painel";

// Pedido do usuário: sem busca, mostra só as últimas notas (cabe na tela);
// pra ver mais, usa a busca.
const NOTAS_SEM_BUSCA = 4;
const ITENS_SEM_BUSCA = 3;

export default function VisaoGeralCompras({ tick }: { tick: number }) {
  const [busca, setBusca] = useState("");
  const { dados, erro, carregando } = useBloco<RespostaCompras>("compras", { dias: "15" }, tick);
  const termo = busca.trim().toLowerCase();
  const notas = (dados?.notas ?? [])
    .map((n) => ({
      ...n,
      itens: termo
        ? n.itens.filter((i) =>
            [n.fornecedor, i.descricao, i.obra, i.codigo].some((v) => (v ?? "").toLowerCase().includes(termo)),
          )
        : n.itens,
    }))
    .filter((n) => n.itens.length > 0);
  const visiveis = termo ? notas : notas.slice(0, NOTAS_SEM_BUSCA);

  return (
    <Bloco
      titulo="🛒 Compras recentes"
      carregando={carregando}
      erro={erro}
      extra={
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 buscar…"
          className="w-32 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-stone-800 dark:text-slate-200"
        />
      }
    >
      <ul className="min-h-0 flex-1 overflow-auto pr-1">
        {dados && notas.length === 0 && <Vazio>{termo ? "Nada encontrado." : "Nenhuma compra lançada no período."}</Vazio>}
        {visiveis.map((n) => (
          <li key={`${n.data}-${n.nfe}`} className="mb-2">
            <div className="sticky top-0 z-10 flex items-baseline gap-2 border-b border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-0.5">
              <span className="rounded bg-green-100 px-1.5 text-xs font-bold text-green-800 dark:bg-cyan-950/60 dark:text-cyan-300">{ddmm(n.data)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-stone-900 dark:text-white" title={n.fornecedor}>
                {n.fornecedor}
              </span>
              <span className="shrink-0 text-[11px] text-stone-500 dark:text-slate-400">{n.itens.length} item(ns)</span>
            </div>
            <ul>
              {(termo ? n.itens : n.itens.slice(0, ITENS_SEM_BUSCA)).map((i, k) => (
                <li key={k} className="flex items-center gap-2 py-0.5 pl-1 text-xs">
                  <span className="min-w-0 flex-1 truncate text-stone-800 dark:text-slate-200" title={`${i.codigo ?? ""} ${i.descricao ?? ""}`}>
                    {i.descricao ?? "—"}
                  </span>
                  {i.obra_mac ? (
                    <a href={linkObra(i.obra_mac)} target="_blank" rel="noreferrer" className="shrink-0 rounded bg-stone-100 dark:bg-slate-800 px-1.5 font-semibold text-stone-700 dark:text-slate-300 hover:underline">
                      {i.obra_mac}
                    </a>
                  ) : (
                    <span className="shrink-0 text-[10px] uppercase text-stone-400 dark:text-slate-500">{i.obra ?? ""}</span>
                  )}
                  <span className="w-24 shrink-0 text-right font-semibold text-stone-700 dark:text-slate-300">
                    {formatarMoeda(i.preco)}
                    <span className="font-normal text-stone-500 dark:text-slate-400">/{(i.unidade ?? "").toLowerCase()}</span>
                  </span>
                </li>
              ))}
              {!termo && n.itens.length > ITENS_SEM_BUSCA && (
                <li className="pl-1 text-[11px] text-stone-400 dark:text-slate-500">+ {n.itens.length - ITENS_SEM_BUSCA} item(ns)</li>
              )}
            </ul>
          </li>
        ))}
        {!termo && notas.length > NOTAS_SEM_BUSCA && (
          <li className="text-center text-[11px] text-stone-500 dark:text-slate-400">
            + {notas.length - NOTAS_SEM_BUSCA} nota(s) · use a busca pra ver mais
          </li>
        )}
      </ul>
      {dados && (
        <p
          className="mt-1 shrink-0 text-[11px] italic text-stone-400 dark:text-slate-500"
          title="A cópia do ERP guarda só a última compra de cada material (base da Referência de preços), sem quantidade."
        >
          {dados.n_itens} itens em {dados.dias} dias · notas de entrada do ERP · última compra de cada material
          {dados.atualizado_em ? ` · copiado às ${horaMinuto(dados.atualizado_em)}` : ""}
        </p>
      )}
    </Bloco>
  );
}
