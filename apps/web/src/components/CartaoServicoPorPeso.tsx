"use client";

import { useState } from "react";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { ServicoPorPeso } from "@/lib/types";

interface Props {
  titulo: string;
  descricaoCard: string;
  catalogo: { nome: string; valor_kg: number | null }[];
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
  onAdicionar: (item: Omit<ServicoPorPeso, "posicao">) => void;
}

// Mesma mecânica (peso × R$/kg) usada tanto pro cartão "Serviços de
// terceiros" quanto "Tratamento térmico" — só o catálogo/textos mudam
// (ver CalculoManual.tsx), pra não duplicar a lógica duas vezes.
export default function CartaoServicoPorPeso({
  titulo,
  descricaoCard,
  catalogo,
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
}: Props) {
  const [servicoIndice, setServicoIndice] = useState("");
  const [descricaoManual, setDescricaoManual] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [valorManual, setValorManual] = useState("");
  const [valorEditado, setValorEditado] = useState(false);
  const [erro, setErro] = useState("");

  const servicoCatalogo = servicoIndice !== "" ? catalogo[Number(servicoIndice)] : null;
  const temValorReferencia = Boolean(servicoCatalogo && servicoCatalogo.valor_kg !== null);
  const descricao = servicoCatalogo ? servicoCatalogo.nome : descricaoManual;
  const valorKg = temValorReferencia && !valorEditado ? String(servicoCatalogo!.valor_kg) : valorManual;

  function selecionarServico(indice: string) {
    setServicoIndice(indice);
    setValorEditado(false);
    if (indice === "") setValorManual("");
  }

  function alternarValorManual() {
    const proximo = !valorEditado;
    if (proximo && temValorReferencia) setValorManual(String(servicoCatalogo!.valor_kg));
    setValorEditado(proximo);
  }

  const pesoKgNum = Number(pesoKg.replace(",", ".")) || 0;
  const valorKgNum = Number(valorKg.replace(",", ".")) || 0;
  const custoTotal = pesoKgNum > 0 && valorKgNum > 0 ? pesoKgNum * valorKgNum : null;

  function adicionar() {
    if (!descricao.trim() || !custoTotal) {
      setErro("Informe o serviço, o peso (kg) e o valor por kg antes de adicionar.");
      return;
    }
    setErro("");
    onAdicionar({ descricao: descricao.trim(), pesoKg: pesoKgNum, valorKg: valorKgNum, custoTotal });
    setPesoKg("");
    setValorManual("");
    setValorEditado(false);
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-900/60 p-4">
      <h3 className="mb-1 font-semibold text-white">{titulo}</h3>
      <p className="mb-3 text-xs text-slate-400">{descricaoCard}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-slate-400">Serviço</span>
          <select
            value={servicoIndice}
            onChange={(e) => selecionarServico(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="">Outro (digitar abaixo)…</option>
            {catalogo.map((s, i) => (
              <option key={s.nome} value={i}>{s.nome}</option>
            ))}
          </select>
          {servicoIndice === "" && (
            <input
              type="text"
              value={descricaoManual}
              onChange={(e) => setDescricaoManual(e.target.value)}
              placeholder="ex: serviço fora do catálogo"
              className="mt-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          )}
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">Peso (kg)</span>
          <input
            type="text"
            inputMode="decimal"
            value={pesoKg}
            onChange={(e) => setPesoKg(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">
            Valor por kg (R$/kg) {temValorReferencia && !valorEditado ? "" : "— sem referência"}
          </span>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={valorKg}
              readOnly={temValorReferencia && !valorEditado}
              onChange={(e) => setValorManual(e.target.value)}
              placeholder="informe manualmente"
              className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-cyan-500 ${
                temValorReferencia && !valorEditado
                  ? "border-slate-800 bg-slate-950 text-cyan-300"
                  : "border-slate-700 bg-slate-900 text-slate-100"
              }`}
            />
            {temValorReferencia && (
              <button
                type="button"
                title={valorEditado ? "Voltar a usar a taxa de referência" : "Editar manualmente"}
                onClick={alternarValorManual}
                className="shrink-0 rounded border border-slate-700 px-1.5 py-1 text-slate-400 hover:border-cyan-500 hover:text-cyan-300"
              >
                ✎
              </button>
            )}
          </div>
        </label>
      </div>

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

      {custoTotal !== null && (
        <PainelResultadoCalculo
          linhas={[
            { rotulo: "Peso", valor: `${formatarNumero(pesoKgNum, 2)} kg` },
            { rotulo: "Valor por kg", valor: formatarMoeda(valorKgNum) },
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
