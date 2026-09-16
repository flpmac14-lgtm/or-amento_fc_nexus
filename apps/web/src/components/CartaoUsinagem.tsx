"use client";

import { useState } from "react";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { OperacaoUsinagem } from "@/lib/types";

interface Props {
  catalogo: { nome: string; valor_hora: number | null }[];
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
  onAdicionar: (item: Omit<OperacaoUsinagem, "posicao">) => void;
}

export default function CartaoUsinagem({
  catalogo,
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
}: Props) {
  const [maquinaIndice, setMaquinaIndice] = useState("");
  const [maquinaManual, setMaquinaManual] = useState("");
  const [horas, setHoras] = useState("");
  const [valorManual, setValorManual] = useState("");
  const [valorEditado, setValorEditado] = useState(false);
  const [erro, setErro] = useState("");

  const maquinaCatalogo = maquinaIndice !== "" ? catalogo[Number(maquinaIndice)] : null;
  const temValorReferencia = Boolean(maquinaCatalogo && maquinaCatalogo.valor_hora !== null);
  const maquina = maquinaCatalogo ? maquinaCatalogo.nome : maquinaManual;
  const valorHora =
    temValorReferencia && !valorEditado ? String(maquinaCatalogo!.valor_hora) : valorManual;

  function selecionarMaquina(indice: string) {
    setMaquinaIndice(indice);
    setValorEditado(false);
    if (indice === "") setValorManual("");
  }

  function alternarValorManual() {
    const proximo = !valorEditado;
    if (proximo && temValorReferencia) setValorManual(String(maquinaCatalogo!.valor_hora));
    setValorEditado(proximo);
  }

  const horasNum = Number(horas.replace(",", ".")) || 0;
  const valorHoraNum = Number(valorHora.replace(",", ".")) || 0;
  const custoTotal = horasNum > 0 && valorHoraNum > 0 ? horasNum * valorHoraNum : null;

  function adicionar() {
    if (!maquina.trim() || !custoTotal) {
      setErro("Informe a máquina/operação, as horas e o valor por hora antes de adicionar.");
      return;
    }
    setErro("");
    onAdicionar({ maquina: maquina.trim(), horas: horasNum, valorHora: valorHoraNum, custoTotal });
    setHoras("");
    setValorManual("");
    setValorEditado(false);
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-900/60 p-4">
      <h3 className="mb-1 font-semibold text-white">Usinagem</h3>
      <p className="mb-3 text-xs text-slate-400">
        Operações de usinagem terceirizada/interna (torno, furadeira, plaina, mandriladora CNC,
        usinagem pesada especial) — soma horas × R$/h numa única linha &quot;Usinagem&quot;.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-slate-400">Máquina/operação</span>
          <select
            value={maquinaIndice}
            onChange={(e) => selecionarMaquina(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="">Outra (digitar abaixo)…</option>
            {catalogo.map((m, i) => (
              <option key={m.nome} value={i}>{m.nome}</option>
            ))}
          </select>
          {maquinaIndice === "" && (
            <input
              type="text"
              value={maquinaManual}
              onChange={(e) => setMaquinaManual(e.target.value)}
              placeholder="ex: usinagem especial fora do catálogo"
              className="mt-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          )}
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">Horas</span>
          <input
            type="text"
            inputMode="decimal"
            value={horas}
            onChange={(e) => setHoras(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">
            Valor por hora (R$/h) {temValorReferencia && !valorEditado ? "" : "— sem referência"}
          </span>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={valorHora}
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
            { rotulo: "Horas", valor: `${formatarNumero(horasNum, 2)} h` },
            { rotulo: "Valor por hora", valor: formatarMoeda(valorHoraNum) },
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
