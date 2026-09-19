"use client";

import { useEffect, useState } from "react";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { EdicaoPendente, ItemContingenciamento } from "@/lib/types";

interface Props {
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
  onAdicionar: (item: Omit<ItemContingenciamento, "posicao">) => void;
  valorInicial?: EdicaoPendente<ItemContingenciamento> | null;
}

export default function CartaoContingenciamento({
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
  valorInicial,
}: Props) {
  const [descricao, setDescricao] = useState("Contingenciamento");
  const [quantidade, setQuantidade] = useState("1");
  const [valorUnitario, setValorUnitario] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!valorInicial) return;
    const d = valorInicial.dados;
    setDescricao(d.descricao);
    setQuantidade(String(d.quantidade));
    setValorUnitario(String(d.valorUnitario));
    setErro("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorInicial?.id]);

  const quantidadeNum = Number(quantidade.replace(",", ".")) || 0;
  const valorUnitarioNum = Number(valorUnitario.replace(",", ".")) || 0;
  const custoTotal = quantidadeNum > 0 && valorUnitarioNum > 0 ? quantidadeNum * valorUnitarioNum : null;

  function adicionar() {
    if (!descricao.trim() || !custoTotal) {
      setErro("Informe a descrição, a quantidade e o valor unitário antes de adicionar.");
      return;
    }
    setErro("");
    onAdicionar({ descricao: descricao.trim(), quantidade: quantidadeNum, valorUnitario: valorUnitarioNum, custoTotal });
    setQuantidade("1");
    setValorUnitario("");
  }

  return (
    <div className="rounded-xl border border-green-600/30 dark:border-cyan-500/30 bg-white dark:bg-slate-900/60 p-4">
      <h3 className="mb-1 font-semibold text-stone-900 dark:text-white">Qualificações / contingência</h3>
      <p className="mb-3 text-xs text-stone-600 dark:text-slate-400">
        Provisão de risco/qualificação do orçamento (contingenciamento etc.) — não é compra de
        terceiro, por isso sem ICMS/PIS-COFINS.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-stone-600 dark:text-slate-400">Descrição</span>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">Quantidade</span>
          <input
            type="text"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">Valor unitário (R$)</span>
          <input
            type="text"
            inputMode="decimal"
            value={valorUnitario}
            onChange={(e) => setValorUnitario(e.target.value)}
            placeholder="ex: 150"
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>
      </div>

      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}

      {custoTotal !== null && (
        <PainelResultadoCalculo
          linhas={[
            { rotulo: "Quantidade", valor: `${formatarNumero(quantidadeNum, 0)}` },
            { rotulo: "Valor unitário", valor: formatarMoeda(valorUnitarioNum) },
          ]}
          custoLabel="Custo total"
          custoValor={formatarMoeda(custoTotal)}
        />
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <SeletorPosicaoItem
          posicaoNum={posicaoNum}
          itemNum={itemNum}
          setPosicaoNum={setPosicaoNum}
          setItemNum={setItemNum}
        />
        <button
          type="button"
          onClick={adicionar}
          disabled={!custoTotal}
          className="ml-auto rounded-md bg-green-600 dark:bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white dark:text-slate-950 hover:bg-green-500 dark:hover:bg-cyan-400 disabled:opacity-50"
        >
          Adicionar ao orçamento
        </button>
      </div>
    </div>
  );
}
