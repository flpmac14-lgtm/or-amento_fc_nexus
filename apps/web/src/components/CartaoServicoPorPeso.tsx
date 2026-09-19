"use client";

import { useEffect, useState } from "react";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { EdicaoPendente, ServicoPorPeso } from "@/lib/types";

interface Props {
  titulo: string;
  descricaoCard: string;
  catalogo: { nome: string; valor_kg: number | null }[];
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
  onAdicionar: (item: Omit<ServicoPorPeso, "posicao">) => void;
  valorInicial?: EdicaoPendente<ServicoPorPeso> | null;
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
  valorInicial,
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

  // Restaura o formulário quando o botão "editar" da lista de itens puxa
  // esse serviço de volta — tenta casar com o catálogo pelo nome; se não
  // achar, cai no campo manual.
  useEffect(() => {
    if (!valorInicial) return;
    const d = valorInicial.dados;
    const indiceCatalogo = catalogo.findIndex((s) => s.nome === d.descricao);
    if (indiceCatalogo >= 0) {
      setServicoIndice(String(indiceCatalogo));
      setValorEditado(catalogo[indiceCatalogo].valor_kg !== d.valorKg);
      setValorManual(String(d.valorKg));
    } else {
      setServicoIndice("");
      setDescricaoManual(d.descricao);
      setValorEditado(true);
      setValorManual(String(d.valorKg));
    }
    setPesoKg(String(d.pesoKg));
    setErro("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorInicial?.id]);

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
    <div className="rounded-xl border border-green-600/30 dark:border-cyan-500/30 bg-white dark:bg-slate-900/60 p-4">
      <h3 className="mb-1 font-semibold text-stone-900 dark:text-white">{titulo}</h3>
      <p className="mb-3 text-xs text-stone-600 dark:text-slate-400">{descricaoCard}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-stone-600 dark:text-slate-400">Serviço</span>
          <select
            value={servicoIndice}
            onChange={(e) => selecionarServico(e.target.value)}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
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
              className="mt-1 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          )}
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">Peso (kg)</span>
          <input
            type="text"
            inputMode="decimal"
            value={pesoKg}
            onChange={(e) => setPesoKg(e.target.value)}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">
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
              className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-green-600 dark:focus:border-cyan-500 ${
                temValorReferencia && !valorEditado
                  ? "border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950 text-green-700 dark:text-cyan-300"
                  : "border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100"
              }`}
            />
            {temValorReferencia && (
              <button
                type="button"
                title={valorEditado ? "Voltar a usar a taxa de referência" : "Editar manualmente"}
                onClick={alternarValorManual}
                className="shrink-0 rounded border border-stone-300 dark:border-slate-700 px-1.5 py-1 text-stone-600 dark:text-slate-400 hover:border-green-600 dark:hover:border-cyan-500 hover:text-green-700 dark:hover:text-cyan-300"
              >
                ✎
              </button>
            )}
          </div>
        </label>
      </div>

      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}

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
          className="ml-auto rounded-md bg-green-600 dark:bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white dark:text-slate-950 hover:bg-green-500 dark:hover:bg-cyan-400 disabled:opacity-50"
        >
          Adicionar ao orçamento
        </button>
      </div>
    </div>
  );
}
