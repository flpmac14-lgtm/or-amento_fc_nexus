"use client";

import { useState } from "react";
import { formatarNumero } from "@/lib/format";

interface Props {
  // Peso calculado pelo sistema (soma da geometria/BOM) — nunca muda por
  // causa desse painel, serve de referência pra "voltar ao bruto".
  pesoBrutoCalculado: number;
  // Peso que está de fato alimentando o custo agora (orcamento.comercial.peso_liquido_kg)
  // — pode já estar em modo líquido manual se o usuário aplicou antes.
  pesoEfetivo: number;
  onAplicar: (overrides: Record<string, number | null>) => Promise<void>;
}

const EPSILON = 0.005;

// Pedido explícito do usuário: o app calcula um peso "bruto" (via geometria/
// BOM), mas às vezes a peça é pesada de verdade depois e o valor real
// (líquido) é outro — esse painel deixa digitar esse peso líquido manual e
// escolher qual dos dois entra no cálculo de custo/preço (corte,
// caldeiraria, solda, NDT, embalagem, transporte, energia — tudo que usa
// peso líquido do orçamento). Reusa o mesmo mecanismo de "editar" das
// linhas de custo (onEditarLinhaCusto), só que sobrescrevendo
// peso_liquido_kg no nível do orçamento inteiro em vez de um parâmetro só.
export default function PainelPesoBase({ pesoBrutoCalculado, pesoEfetivo, onAplicar }: Props) {
  const jaEstaEmModoLiquido = Math.abs(pesoEfetivo - pesoBrutoCalculado) > EPSILON;
  const [modo, setModo] = useState<"bruto" | "liquido">(jaEstaEmModoLiquido ? "liquido" : "bruto");
  const [valorManual, setValorManual] = useState(jaEstaEmModoLiquido ? String(pesoEfetivo) : "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function aplicar() {
    let pesoAlvo: number;
    if (modo === "bruto") {
      pesoAlvo = pesoBrutoCalculado;
    } else {
      const numero = Number(valorManual.replace(",", "."));
      if (!valorManual.trim() || Number.isNaN(numero) || numero <= 0) {
        setErro("Informe um peso líquido válido (kg).");
        return;
      }
      pesoAlvo = numero;
    }
    setErro("");
    setSalvando(true);
    try {
      await onAplicar({ peso_liquido_kg: pesoAlvo });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao aplicar o peso.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
      <h2 className="mb-2 font-semibold text-white">Peso do orçamento</h2>
      <p className="mb-3 text-xs text-slate-400">
        Peso bruto calculado pelo sistema:{" "}
        <span className="font-medium text-slate-200">{formatarNumero(pesoBrutoCalculado, 2)} kg</span>.
        Se a peça foi pesada de verdade e o valor líquido real é outro, informe abaixo e escolha qual
        dos dois entra no cálculo de custo/preço.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="radio"
            name="modo-peso-base"
            checked={modo === "bruto"}
            onChange={() => setModo("bruto")}
            className="accent-cyan-500"
          />
          Peso bruto ({formatarNumero(pesoBrutoCalculado, 2)} kg)
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="radio"
            name="modo-peso-base"
            checked={modo === "liquido"}
            onChange={() => setModo("liquido")}
            className="accent-cyan-500"
          />
          Peso líquido (manual):
          <input
            type="text"
            inputMode="decimal"
            value={valorManual}
            onChange={(e) => {
              setValorManual(e.target.value);
              setModo("liquido");
            }}
            placeholder="ex: 3319"
            className="w-28 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
          kg
        </label>

        <button
          type="button"
          onClick={aplicar}
          disabled={salvando}
          className="rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          {salvando ? "Aplicando…" : "Aplicar"}
        </button>
      </div>

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}
    </section>
  );
}
