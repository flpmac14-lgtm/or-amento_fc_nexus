"use client";

import { useState } from "react";
import { baixarExcelPedidoWeir, extrairPedidosWeir } from "@/lib/api";
import { formatarMoeda } from "@/lib/format";
import type { ItemPedidoWeir } from "@/lib/types";

// Aba "Extração de Pedidos" > WEIR — pedido explícito do usuário:
// aceita vários PDFs de uma vez (cada um pode ser um pedido diferente),
// extração 100% local (texto + regex, sem IA). O valor de cada item já
// sai dividido por FATOR_AJUSTE_VALOR_WEIR e sempre arredondado pra cima
// (ver services/extractor/app/extraction/weir_oc.py). A WEIR não tem um
// campo tipo MAC pra detectar sozinho — a coluna "Referência" fica
// sempre vazia da extração, editável linha a linha antes de baixar.
export default function PedidoWeir() {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [extraindo, setExtraindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemPedidoWeir[] | null>(null);
  const [baixando, setBaixando] = useState(false);

  async function handleExtrair() {
    if (arquivos.length === 0) return;
    setExtraindo(true);
    setErro(null);
    setItens(null);
    try {
      const r = await extrairPedidosWeir(arquivos);
      setItens(r.itens);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao extrair os pedidos.");
    } finally {
      setExtraindo(false);
    }
  }

  function handleReferenciaChange(indice: number, valor: string) {
    setItens((atual) => {
      if (!atual) return atual;
      const copia = [...atual];
      copia[indice] = { ...copia[indice], referencia: valor };
      return copia;
    });
  }

  async function handleBaixarExcel() {
    if (!itens) return;
    setBaixando(true);
    setErro(null);
    try {
      await baixarExcelPedidoWeir(itens);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao gerar o Excel.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <p className="text-sm font-medium text-stone-800 dark:text-slate-200">Pedidos — WEIR</p>
        <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
          Envie um ou mais PDFs de pedido (cada um pode ser uma OC diferente) — item, código do desenho,
          quantidade, valor (já ajustado) e data de entrega saem prontos. A coluna Referência fica em
          branco pra você preencher item a item.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-md bg-green-600 dark:bg-cyan-500 px-4 py-2 text-sm font-medium text-white dark:text-slate-950 transition-colors hover:bg-green-500 dark:hover:bg-cyan-400">
            {arquivos.length > 0 ? `${arquivos.length} arquivo(s) selecionado(s)` : "Selecionar arquivos"}
            <input
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const lista = Array.from(e.target.files ?? []).filter((f) =>
                  f.name.toLowerCase().endsWith(".pdf"),
                );
                if (lista.length > 0) setArquivos(lista);
              }}
            />
          </label>
          <button
            type="button"
            onClick={handleExtrair}
            disabled={arquivos.length === 0 || extraindo}
            className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-stone-800 dark:text-slate-200 transition-colors hover:border-green-600/50 dark:hover:border-cyan-500/50 hover:bg-stone-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {extraindo ? "Extraindo…" : "Extrair dados"}
          </button>
        </div>

        {arquivos.length > 0 && (
          <ul className="mt-2 text-xs text-stone-500 dark:text-slate-500">
            {arquivos.map((a) => (
              <li key={a.name}>{a.name}</li>
            ))}
          </ul>
        )}

        {erro && (
          <div className="mt-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
            {erro}
          </div>
        )}
      </div>

      {itens && (
        <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-stone-500 dark:text-slate-500">{itens.length} item(ns)</div>
            <button
              type="button"
              onClick={handleBaixarExcel}
              disabled={baixando}
              className="shrink-0 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-stone-800 dark:text-slate-200 transition-colors hover:border-green-600/50 dark:hover:border-cyan-500/50 hover:bg-stone-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {baixando ? "Gerando…" : "Baixar Excel"}
            </button>
          </div>

          <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200 dark:border-slate-800">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-stone-50 dark:bg-slate-900/60 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-slate-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Quantidade</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Referência</th>
                  <th className="px-3 py-2">Data de entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-slate-800">
                {itens.map((item, i) => (
                  <tr key={item.item} className="text-stone-800 dark:text-slate-200">
                    <td className="px-3 py-2 font-mono">{item.item}</td>
                    <td className="px-3 py-2 font-mono">{item.codigo ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{formatarMoeda(item.valor_total)}</td>
                    <td className="px-3 py-2">{item.quantidade}</td>
                    <td className="px-3 py-2 text-stone-600 dark:text-slate-400">{item.descricao}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.referencia ?? ""}
                        onChange={(e) => handleReferenciaChange(i, e.target.value)}
                        placeholder="—"
                        className="w-28 rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
                      />
                    </td>
                    <td className="px-3 py-2">{item.data_entrega ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
