"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarPrecosMercado } from "@/lib/api";
import { normalizarBusca } from "@/lib/busca";
import { formatarDataBr, formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { CompraMercadoLinha, ItemComercial } from "@/lib/types";

interface Props {
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
  onAdicionar: (item: Omit<ItemComercial, "posicao">) => void;
}

const MAX_SUGESTOES = 8;

export default function CartaoItemComercial({
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
}: Props) {
  const [compras, setCompras] = useState<CompraMercadoLinha[]>([]);
  const [descricao, setDescricao] = useState("");
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [referencia, setReferencia] = useState<CompraMercadoLinha | null>(null);
  const [quantidade, setQuantidade] = useState("1");
  const [precoManual, setPrecoManual] = useState("");
  const [precoEditado, setPrecoEditado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    buscarPrecosMercado()
      .then((r) => setCompras(r.compras))
      .catch(() => setCompras([]));
  }, []);

  // Sugestões da planilha de compras (mesma fonte da aba "Referência de
  // preços") conforme o usuário digita — pega só a compra mais recente de
  // cada descrição (a lista já vem ordenada por data desc do backend).
  const sugestoes = useMemo(() => {
    const termos = normalizarBusca(descricao).split(" ").filter(Boolean);
    if (termos.length === 0) return [];
    const vistos = new Set<string>();
    const resultado: CompraMercadoLinha[] = [];
    for (const c of compras) {
      const alvo = normalizarBusca(`${c.descricao} ${c.material}`);
      if (!termos.every((t) => alvo.includes(t))) continue;
      if (vistos.has(c.descricao)) continue;
      vistos.add(c.descricao);
      resultado.push(c);
      if (resultado.length >= MAX_SUGESTOES) break;
    }
    return resultado;
  }, [descricao, compras]);

  const precoUnitario = referencia && !precoEditado ? String(referencia.preco_unitario) : precoManual;

  function selecionarSugestao(c: CompraMercadoLinha) {
    setDescricao(c.descricao);
    setReferencia(c);
    setPrecoEditado(false);
    setSugestoesAbertas(false);
  }

  function alterarDescricao(valor: string) {
    setDescricao(valor);
    setReferencia(null);
    setPrecoEditado(false);
    setSugestoesAbertas(true);
  }

  function alternarPrecoManual() {
    const proximo = !precoEditado;
    if (proximo && referencia) setPrecoManual(String(referencia.preco_unitario));
    setPrecoEditado(proximo);
  }

  const quantidadeNum = Number(quantidade.replace(",", ".")) || 0;
  const precoNum = Number(precoUnitario.replace(",", ".")) || 0;
  const custoTotal = quantidadeNum > 0 && precoNum > 0 ? quantidadeNum * precoNum : null;

  function adicionar() {
    if (!descricao.trim() || !custoTotal) {
      setErro("Informe a descrição, a quantidade e o preço unitário antes de adicionar.");
      return;
    }
    setErro("");
    onAdicionar({
      descricao: descricao.trim(),
      quantidade: quantidadeNum,
      preco_unitario: precoNum,
      unidade: referencia?.unidade,
      fornecedor: referencia?.fornecedor,
      custoTotal,
    });
    setDescricao("");
    setReferencia(null);
    setQuantidade("1");
    setPrecoManual("");
    setPrecoEditado(false);
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-900/60 p-4">
      <h3 className="mb-1 font-semibold text-white">Itens standard comerciais</h3>
      <p className="mb-3 text-xs text-slate-400">
        Elementos de fixação e outros itens comprados prontos (parafusos, porcas, arruelas etc.)
        — sem cálculo de peso/geometria, só custo direto (quantidade × preço), com a mesma
        referência de preço da aba &quot;Referência de preços&quot;.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-400">Descrição</span>
            <input
              type="text"
              value={descricao}
              onChange={(e) => alterarDescricao(e.target.value)}
              onFocus={() => setSugestoesAbertas(true)}
              onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
              placeholder="ex: parafuso allen m12, porca sextavada…"
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          {sugestoesAbertas && sugestoes.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-700 bg-slate-900 shadow-lg">
              {sugestoes.map((s, i) => (
                <li key={`${s.codigo}-${i}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selecionarSugestao(s)}
                    className="flex w-full flex-col gap-0.5 border-b border-slate-800 px-3 py-2 text-left text-xs last:border-0 hover:bg-slate-800"
                  >
                    <span className="text-slate-200">{s.descricao}</span>
                    <span className="text-slate-500">
                      R$ {formatarNumero(s.preco_unitario, 2)} / {s.unidade || "un"} ·{" "}
                      {s.fornecedor || "fornecedor não informado"}
                      {s.data_compra ? ` · ${formatarDataBr(s.data_compra)}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">Quantidade</span>
          <input
            type="text"
            inputMode="decimal"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">
            Preço unitário (R$) {referencia && !precoEditado ? "" : "— sem referência"}
          </span>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={precoUnitario}
              readOnly={Boolean(referencia) && !precoEditado}
              onChange={(e) => setPrecoManual(e.target.value)}
              placeholder="informe manualmente"
              className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-cyan-500 ${
                referencia && !precoEditado
                  ? "border-slate-800 bg-slate-950 text-cyan-300"
                  : "border-slate-700 bg-slate-900 text-slate-100"
              }`}
            />
            {referencia && (
              <button
                type="button"
                title={precoEditado ? "Voltar a usar o preço de referência" : "Editar manualmente"}
                onClick={alternarPrecoManual}
                className="shrink-0 rounded border border-slate-700 px-1.5 py-1 text-slate-400 hover:border-cyan-500 hover:text-cyan-300"
              >
                ✎
              </button>
            )}
          </div>
        </label>
      </div>

      {referencia && (
        <p className="mt-2 text-xs text-slate-500">
          Ref.: {referencia.fornecedor || "fornecedor não informado"}
          {referencia.data_compra ? ` · última compra em ${formatarDataBr(referencia.data_compra)}` : ""}
          {referencia.unidade ? ` · unidade ${referencia.unidade}` : ""}
        </p>
      )}

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

      {custoTotal !== null && (
        <PainelResultadoCalculo
          linhas={[
            { rotulo: "Quantidade", valor: `${formatarNumero(quantidadeNum, 0)} un.` },
            { rotulo: "Preço unitário", valor: formatarMoeda(precoNum) },
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
