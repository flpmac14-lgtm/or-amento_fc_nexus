"use client";

import { useEffect, useState } from "react";
import { buscarPrecosMercado } from "@/lib/api";
import { normalizarBusca } from "@/lib/busca";
import { formatarDataBr, formatarMoeda, formatarNumero } from "@/lib/format";
import { agruparItensPorPosicao } from "@/lib/itensCalculados";
import { useAutoCalculoOrcamento } from "@/lib/useAutoCalculoOrcamento";
import type { CompraMercadoLinha, EstadoCalculoManual, PrecosMercadoLista, RespostaOrcamentoDePdf } from "@/lib/types";

interface Props {
  estado: EstadoCalculoManual;
  onEstadoChange: (atualizacao: Partial<EstadoCalculoManual>) => void;
  onResultado: (resultado: RespostaOrcamentoDePdf, nomeArquivo: string) => void;
  onErro: (mensagem: string) => void;
  pesoLiquidoManualAtivo: number | null;
}

const MAX_RESULTADOS_BUSCA = 8;

// Aba "Itens do orçamento" em tela cheia — pedido explícito do usuário:
// além do resumo no canto direito da Cálculo manual (que continua igual),
// uma tela maior/mais confortável pra revisar item por item DEPOIS de
// inserir tudo, com uma busca de preço de referência (igual a "Referência
// de preços") direto em cada item — sem precisar reabrir o cartão de
// geometria original só pra digitar um preço/kg.
export default function PainelItensOrcamento({
  estado, onEstadoChange, onResultado, onErro, pesoLiquidoManualAtivo,
}: Props) {
  const { itens, acrescimoPercentualPadrao } = estado;

  const { analisando } = useAutoCalculoOrcamento({ estado, onResultado, onErro, pesoLiquidoManualAtivo });

  const [precos, setPrecos] = useState<PrecosMercadoLista | null>(null);
  const [buscas, setBuscas] = useState<Record<number, string>>({});

  useEffect(() => {
    buscarPrecosMercado()
      .then(setPrecos)
      .catch((e) => onErro(e instanceof Error ? e.message : "Erro ao carregar a referência de preços."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Só linhas por KG entram na sugestão — o valor vai direto pro "Preço
  // por kg" do item, não faz sentido sugerir preço por peça/litro/unidade.
  const comprasPorKg = (precos?.compras ?? []).filter((c) => c.unidade.trim().toUpperCase() === "KG");

  function resultadosBusca(indice: number): CompraMercadoLinha[] {
    const termo = buscas[indice];
    if (!termo || !termo.trim()) return [];
    const termos = normalizarBusca(termo).split(" ").filter(Boolean);
    return comprasPorKg
      .filter((c) => {
        const alvo = normalizarBusca(`${c.material} ${c.descricao} ${c.fornecedor}`);
        return termos.every((t) => alvo.includes(t));
      })
      .slice(0, MAX_RESULTADOS_BUSCA);
  }

  function removerItem(indice: number) {
    onEstadoChange({ itens: itens.filter((_, i) => i !== indice) });
  }

  // Mesma mecânica do acréscimo padrão já usada nos cartões de geometria
  // (ver CartaoGeometriaPadrao.tsx/CartaoPesoDireto.tsx e
  // CalculoManual.tsx::aplicarAcrescimoATodos) — guarda a referência crua
  // separada do preço efetivo, pra "Aplicar a todos" continuar recalculando
  // a partir do valor real, nunca compondo o acréscimo em cima de si mesmo.
  function aplicarPreco(indice: number, linha: CompraMercadoLinha) {
    const percentual = Number(acrescimoPercentualPadrao.replace(",", ".")) || 0;
    const itensAtualizados = itens.map((item, i) => {
      if (i !== indice) return item;
      const novoPrecoKg = linha.preco_unitario * (1 + percentual / 100);
      const pesoBase = item.pesoParaCompraKg ?? item.peso_kg;
      return {
        ...item,
        precoKgReferencia: linha.preco_unitario,
        acrescimoPercentual: percentual,
        preco_kg: novoPrecoKg,
        custoTotal: pesoBase * novoPrecoKg,
      };
    });
    onEstadoChange({ itens: itensAtualizados });
    setBuscas((atual) => ({ ...atual, [indice]: "" }));
  }

  const grupos = agruparItensPorPosicao(itens);
  const semPreco = itens.filter((i) => i.preco_kg == null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 text-sm">
        <p className="text-stone-700 dark:text-slate-300">
          Revise cada item e busque o preço de referência (histórico real de compras, mesma fonte da
          aba &quot;Referência de preços&quot;) sem precisar reabrir o cartão original — pensada pra
          usar depois de inserir tudo em &quot;Cálculo manual&quot;.
        </p>
        {itens.length > 0 && (
          <p className="shrink-0 text-xs text-stone-500 dark:text-slate-500">
            {itens.length} {itens.length === 1 ? "item" : "itens"}
            {semPreco > 0 && (
              <span className="ml-2 text-amber-700 dark:text-amber-400">
                · {semPreco} sem preço
              </span>
            )}
            {analisando && <span className="ml-2">· recalculando…</span>}
          </p>
        )}
      </div>

      {itens.length === 0 ? (
        <p className="py-12 text-center text-sm text-stone-500 dark:text-slate-500">
          Nenhum item de matéria-prima adicionado ainda — use os cartões em &quot;Cálculo manual&quot;.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {grupos.map((grupo) => (
            <div key={grupo.posicao}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-cyan-400">
                {grupo.posicao}
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {grupo.itens.map(({ item, indice }) => {
                  const resultados = resultadosBusca(indice);
                  return (
                    <div
                      key={indice}
                      className={`flex flex-col gap-2 rounded-lg border p-3 text-sm ${
                        item.preco_kg == null
                          ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20"
                          : "border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40"
                      }`}
                    >
                      <p className="text-stone-800 dark:text-slate-200">{item.descricao || item.tipoRotulo}</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-stone-600 dark:text-slate-400">
                          {formatarNumero(item.peso_kg, 2)} kg
                        </span>
                        <span className="font-mono">
                          {item.preco_kg != null ? (
                            <>
                              R$ {formatarNumero(item.preco_kg, 2)}/kg
                              {item.custoTotal !== undefined && (
                                <span className="ml-2 text-green-700 dark:text-cyan-300">
                                  {formatarMoeda(item.custoTotal)}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400">sem preço de referência</span>
                          )}
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          value={buscas[indice] ?? ""}
                          onChange={(e) => setBuscas((atual) => ({ ...atual, [indice]: e.target.value }))}
                          placeholder="buscar preço de referência (material, descrição, fornecedor)…"
                          className="w-full rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
                        />
                        {resultados.length > 0 && (
                          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                            {resultados.map((linha, i) => (
                              <li key={i}>
                                <button
                                  type="button"
                                  onClick={() => aplicarPreco(indice, linha)}
                                  className="flex w-full flex-col gap-0.5 border-b border-stone-100 dark:border-slate-800 px-2 py-1.5 text-left last:border-0 hover:bg-stone-100 dark:hover:bg-slate-800"
                                >
                                  <span className="text-xs text-stone-800 dark:text-slate-200">{linha.descricao}</span>
                                  <span className="flex items-center justify-between text-[11px] text-stone-500 dark:text-slate-500">
                                    <span>{linha.fornecedor || "fornecedor não informado"} · {formatarDataBr(linha.data_compra)}</span>
                                    <span className="font-mono text-green-700 dark:text-cyan-300">
                                      R$ {formatarNumero(linha.preco_unitario, 2)}/kg
                                    </span>
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => removerItem(indice)}
                        className="self-end text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      >
                        remover
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
