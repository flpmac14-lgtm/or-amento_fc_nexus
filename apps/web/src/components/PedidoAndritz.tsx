"use client";

import { useState } from "react";
import { baixarExcelPedidoAndritz, extrairPedidoAndritz } from "@/lib/api";
import type { RespostaPedidoAndritz } from "@/lib/types";

// Aba "Pedido ANDRITZ" — pedido explícito do usuário: hoje ele digita
// item a item numa planilha de controle toda vez que chega uma Ordem de
// Compra; aqui a extração é 100% local (texto + regex, sem IA) e já sai
// pronta nesse formato. A MAC é detectada automaticamente, mas continua
// SEMPRE editável — nunca inventa um valor quando não acha, e nunca
// escolhe sozinha quando acha mais de uma diferente no mesmo PDF (ver
// services/extractor/app/extraction/andritz_oc.py).
export default function PedidoAndritz() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaPedidoAndritz | null>(null);
  const [mac, setMac] = useState("");
  const [baixando, setBaixando] = useState(false);

  async function handleExtrair() {
    if (!arquivo) return;
    setExtraindo(true);
    setErro(null);
    setResultado(null);
    setMac("");
    try {
      const r = await extrairPedidoAndritz(arquivo);
      setResultado(r);
      setMac(r.mac ?? "");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao extrair o pedido.");
    } finally {
      setExtraindo(false);
    }
  }

  async function handleBaixarExcel() {
    if (!resultado) return;
    setBaixando(true);
    setErro(null);
    try {
      const macFinal = mac.trim() || null;
      const itensComMac = resultado.itens.map((item) => ({ ...item, mac: macFinal }));
      await baixarExcelPedidoAndritz(resultado.numero_oc, itensComMac);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao gerar o Excel.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <p className="text-sm font-medium text-stone-800 dark:text-slate-200">Pedido (Ordem de Compra) — ANDRITZ</p>
        <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
          Envie o PDF da Ordem de Compra: item, material, quantidade, valor, data de entrega e a MAC saem
          prontos no formato da planilha de controle de pedidos — extração 100% local (texto + regras), sem IA.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-md bg-green-600 dark:bg-cyan-500 px-4 py-2 text-sm font-medium text-white dark:text-slate-950 transition-colors hover:bg-green-500 dark:hover:bg-cyan-400">
            {arquivo ? arquivo.name : "Selecionar arquivo"}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && f.name.toLowerCase().endsWith(".pdf")) setArquivo(f);
              }}
            />
          </label>
          <button
            type="button"
            onClick={handleExtrair}
            disabled={!arquivo || extraindo}
            className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-stone-800 dark:text-slate-200 transition-colors hover:border-green-600/50 dark:hover:border-cyan-500/50 hover:bg-stone-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {extraindo ? "Extraindo…" : "Extrair dados"}
          </button>
        </div>

        {erro && (
          <div className="mt-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
            {erro}
          </div>
        )}
      </div>

      {resultado && (
        <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="text-xs text-stone-500 dark:text-slate-500">
                Pedido {resultado.numero_oc ?? "—"} · {resultado.itens.length} item(ns)
              </div>
              <label className="flex flex-col gap-1 text-xs">
                <span className="text-stone-600 dark:text-slate-400">MAC identificada</span>
                <input
                  type="text"
                  value={mac}
                  onChange={(e) => setMac(e.target.value)}
                  placeholder="ex: 792.26"
                  className="w-40 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
                />
              </label>
              {resultado.mac_ambigua ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Foram encontradas múltiplas MACs neste pedido — escolha uma:{" "}
                  {resultado.mac_candidatos.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setMac(c)}
                      className="ml-1 rounded border border-amber-400/50 px-1.5 py-0.5 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                    >
                      {c}
                    </button>
                  ))}
                </p>
              ) : resultado.mac ? (
                <p className="text-xs text-stone-500 dark:text-slate-500">✓ MAC encontrada automaticamente no pedido</p>
              ) : (
                <p className="text-xs text-stone-500 dark:text-slate-500">
                  MAC não encontrada automaticamente — digite se souber.
                </p>
              )}
            </div>
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
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-stone-50 dark:bg-slate-900/60 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-slate-500">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Material</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Quantidade</th>
                  <th className="px-3 py-2">Material antigo</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">MAC</th>
                  <th className="px-3 py-2">Data de entrega</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-slate-800">
                {resultado.itens.map((item) => (
                  <tr key={item.item} className="text-stone-800 dark:text-slate-200">
                    <td className="px-3 py-2 font-mono">{item.item}</td>
                    <td className="px-3 py-2 font-mono">{item.material}</td>
                    <td className="px-3 py-2 font-mono">R$ {item.valor_total}</td>
                    <td className="px-3 py-2">{item.quantidade}</td>
                    <td className="px-3 py-2">{item.material_antigo ?? "—"}</td>
                    <td className="px-3 py-2 text-stone-600 dark:text-slate-400">{item.descricao ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{mac.trim() || "—"}</td>
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
