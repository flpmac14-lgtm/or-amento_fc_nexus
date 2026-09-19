"use client";

import { useState } from "react";
import { baixarExcelRelatorioTecnico, extrairListaMateriais, type ItemEstruturadoIA } from "@/lib/api";

interface Props {
  arquivo: File | null;
  // Repassa a BOM estruturada assim que a IA termina, pro pai (page.tsx)
  // inserir automaticamente no Cálculo manual — pedido explícito do
  // usuário. `[]` no início de cada extração limpa a inserção anterior.
  onItensEstruturadosChange: (itens: ItemEstruturadoIA[]) => void;
}

// Extração da lista de materiais (BOM) por IA — pedido explícito do
// usuário: só isso, nenhum relatório narrativo (removido por custo de API
// — era a parte mais cara de cada chamada e não era usado). Uma chamada
// rápida, forçando a IA a devolver só o formato estruturado. Os itens
// entram automaticamente no Cálculo manual como cartões "Peso direto",
// usando o peso extraído do desenho/estimado pela IA como valor inicial
// editável — o orçamentista confere/ajusta antes de fechar (custo/hora/
// preço continuam sempre vindo do motor determinístico).
export default function RelatorioTecnicoIA({ arquivo, onItensEstruturadosChange }: Props) {
  const [extraindo, setExtraindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [itensEstruturados, setItensEstruturados] = useState<ItemEstruturadoIA[]>([]);
  const [baixandoExcel, setBaixandoExcel] = useState(false);

  async function handleExtrair() {
    if (!arquivo) return;
    setExtraindo(true);
    setErro(null);
    setItensEstruturados([]);
    onItensEstruturadosChange([]);
    try {
      const itens = await extrairListaMateriais(arquivo);
      setItensEstruturados(itens);
      onItensEstruturadosChange(itens);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao extrair a lista de materiais.");
    } finally {
      setExtraindo(false);
    }
  }

  async function handleBaixarExcel() {
    setBaixandoExcel(true);
    setErro(null);
    try {
      await baixarExcelRelatorioTecnico(itensEstruturados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao gerar o Excel.");
    } finally {
      setBaixandoExcel(false);
    }
  }

  if (!arquivo && itensEstruturados.length === 0) return null;

  return (
    <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-stone-800 dark:text-slate-200">Lista de materiais (IA)</p>
          <p className="text-xs text-stone-500 dark:text-slate-500">
            Extrai posição, material, quantidade e peso de cada peça e insere automaticamente no
            Cálculo manual como &quot;Peso direto&quot; (editável) — confira antes de fechar o
            orçamento.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {arquivo && (
            <button
              type="button"
              onClick={handleExtrair}
              disabled={extraindo}
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-stone-800 dark:text-slate-200 transition-colors hover:border-green-600/50 dark:hover:border-cyan-500/50 hover:bg-stone-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {extraindo
                ? "Extraindo…"
                : itensEstruturados.length > 0
                  ? "Extrair de novo"
                  : "Extrair lista de materiais"}
            </button>
          )}
          {itensEstruturados.length > 0 && (
            <button
              type="button"
              onClick={handleBaixarExcel}
              disabled={baixandoExcel}
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-stone-800 dark:text-slate-200 transition-colors hover:border-green-600/50 dark:hover:border-cyan-500/50 hover:bg-stone-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {baixandoExcel ? "Gerando…" : "Excel (BOM editável)"}
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div className="mt-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
          {erro}
        </div>
      )}

      {itensEstruturados.length > 0 && (
        <ul className="mt-4 space-y-1.5 text-sm text-stone-700 dark:text-slate-300">
          {itensEstruturados.map((item, i) => (
            <li key={i} className="border-b border-stone-200 dark:border-slate-800 pb-1.5 last:border-0">
              <span className="font-medium text-green-700 dark:text-cyan-300">POS {item.posicao}</span> — {item.descricao}
              {item.norma ? ` · ${item.norma}` : ""} · Qtd: {item.quantidade}
              {item.peso_unitario_estimado_kg != null
                ? ` · ${item.peso_unitario_estimado_kg} kg/un`
                : " · peso não estimado"}
              {item.observacao ? ` · ${item.observacao}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
