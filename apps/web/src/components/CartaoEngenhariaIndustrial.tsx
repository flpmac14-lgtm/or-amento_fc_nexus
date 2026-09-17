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

// Descritivo fixo (pedido explícito do usuário) — ao contrário de
// Contingenciamento, aqui a descrição não é digitável: engenharia
// industrial é sempre "Desenho - Croqui p/ Delineamento". Mesmo padrão de
// adicionar/posição/item dos outros cartões, só a descrição que não muda.
const DESCRICAO_FIXA = "Desenho - Croqui p/ Delineamento";
const VALOR_PADRAO = "60";

export default function CartaoEngenhariaIndustrial({
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
  valorInicial,
}: Props) {
  const [quantidade, setQuantidade] = useState("1");
  const [valorUnitario, setValorUnitario] = useState(VALOR_PADRAO);
  // R$/pç vem travado no padrão (R$60) até o usuário clicar em ✎ — pedido
  // explícito do usuário: "deixa fixo mas um botão que eu possa alterar".
  const [editandoValor, setEditandoValor] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!valorInicial) return;
    const d = valorInicial.dados;
    setQuantidade(String(d.quantidade));
    setValorUnitario(String(d.valorUnitario));
    setEditandoValor(String(d.valorUnitario) !== VALOR_PADRAO);
    setErro("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorInicial?.id]);

  const quantidadeNum = Number(quantidade.replace(",", ".")) || 0;
  const valorUnitarioNum = Number(valorUnitario.replace(",", ".")) || 0;
  const custoTotal = quantidadeNum > 0 && valorUnitarioNum > 0 ? quantidadeNum * valorUnitarioNum : null;

  function adicionar() {
    if (!custoTotal) {
      setErro("Informe a quantidade e o R$/pç antes de adicionar.");
      return;
    }
    setErro("");
    onAdicionar({
      descricao: DESCRICAO_FIXA,
      quantidade: quantidadeNum,
      valorUnitario: valorUnitarioNum,
      custoTotal,
    });
    setQuantidade("1");
    setValorUnitario(VALOR_PADRAO);
    setEditandoValor(false);
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-900/60 p-4">
      <h3 className="mb-1 font-semibold text-white">Engenharia Industrial</h3>
      <p className="mb-3 text-xs text-slate-400">
        Desenho/croqui para delineamento — descritivo fixo, cobrado por posição de engenharia
        (quantidade de peças), não por peso.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-slate-400">Descrição</span>
          <input
            type="text"
            value={DESCRICAO_FIXA}
            readOnly
            className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-sm text-slate-300 outline-none"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">Quantidade (pç)</span>
          <input
            type="text"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">R$/pç</span>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={valorUnitario}
              readOnly={!editandoValor}
              onChange={(e) => setValorUnitario(e.target.value)}
              className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-cyan-500 ${
                editandoValor
                  ? "border-slate-700 bg-slate-900 text-slate-100"
                  : "border-slate-800 bg-slate-950 text-cyan-300"
              }`}
            />
            <button
              type="button"
              title={editandoValor ? "Travar no padrão" : "Editar manualmente"}
              onClick={() => setEditandoValor((v) => !v)}
              className="shrink-0 rounded border border-slate-700 px-1.5 py-1 text-slate-400 hover:border-cyan-500 hover:text-cyan-300"
            >
              ✎
            </button>
          </div>
        </label>
      </div>

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

      {custoTotal !== null && (
        <PainelResultadoCalculo
          linhas={[
            { rotulo: "Quantidade", valor: `${formatarNumero(quantidadeNum, 0)} pç` },
            { rotulo: "R$/pç", valor: formatarMoeda(valorUnitarioNum) },
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
          className="ml-auto rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          Adicionar ao orçamento
        </button>
      </div>
    </div>
  );
}
