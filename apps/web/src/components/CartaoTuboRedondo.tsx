"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarTubosCatalogo, calcularPesoGeometria } from "@/lib/api";
import { calcularPesoComercial } from "@/lib/calculoPeso";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { ItemCalculado, MaterialCatalogo, TuboCatalogo } from "@/lib/types";

interface Props {
  materiais: MaterialCatalogo[];
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
  onAdicionar: (item: Omit<ItemCalculado, "posicao">) => void;
}

function normalizarBusca(texto: string): string {
  return texto.trim().toUpperCase().replace(/,/g, ".").replace(/\s+/g, "");
}

export default function CartaoTuboRedondo({
  materiais,
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
}: Props) {
  const [modoManual, setModoManual] = useState(false);

  const [catalogo, setCatalogo] = useState<TuboCatalogo[]>([]);
  const [designacao, setDesignacao] = useState("");
  const [kgMManual, setKgMManual] = useState("");
  const [kgMEditado, setKgMEditado] = useState(false);

  const [diametroExterno, setDiametroExterno] = useState("");
  const [espessuraParede, setEspessuraParede] = useState("");
  const [resultadoManual, setResultadoManual] = useState<{ peso_kg: number; memoria_calculo: string } | null>(null);
  const [calculandoManual, setCalculandoManual] = useState(false);

  const [materialIndice, setMaterialIndice] = useState("");
  const [comprimento, setComprimento] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [precoKg, setPrecoKg] = useState("");
  const [perdaPct, setPerdaPct] = useState("10");
  const [arredondamento, setArredondamento] = useState("");
  const [erro, setErro] = useState("");

  const materialAtual = materialIndice !== "" ? materiais[Number(materialIndice)] : null;

  useEffect(() => {
    buscarTubosCatalogo("")
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  const tuboEncontrado = useMemo(
    () => catalogo.find((t) => normalizarBusca(t.designacao) === normalizarBusca(designacao)) ?? null,
    [catalogo, designacao],
  );

  const kgM = tuboEncontrado && !kgMEditado ? String(tuboEncontrado.kg_m) : kgMManual;

  function alternarKgMManual() {
    const proximo = !kgMEditado;
    if (proximo && tuboEncontrado) setKgMManual(String(tuboEncontrado.kg_m));
    setKgMEditado(proximo);
  }

  const diametroInternoManual = useMemo(() => {
    const de = Number(diametroExterno.replace(",", "."));
    const e = Number(espessuraParede.replace(",", "."));
    if (!de || !e) return null;
    return de - 2 * e;
  }, [diametroExterno, espessuraParede]);

  const paredeInvalida = diametroInternoManual !== null && diametroInternoManual <= 0;

  async function calcularManual() {
    const de = Number(diametroExterno.replace(",", "."));
    const e = Number(espessuraParede.replace(",", "."));
    const comprimentoNum = Number(comprimento.replace(",", "."));
    const densidade = materialAtual?.densidade_kg_m3;
    if (!de || !e || !comprimentoNum || !densidade) {
      setErro("Preencha diâmetro externo, espessura da parede, comprimento e selecione o material antes de calcular.");
      return;
    }
    if (2 * e >= de) {
      setErro("A parede (2 × espessura) precisa ser menor que o diâmetro externo.");
      return;
    }
    setErro("");
    setCalculandoManual(true);
    try {
      const r = await calcularPesoGeometria(
        "tubo_redondo",
        { diametro_externo_mm: de, espessura_parede_mm: e, comprimento_mm: comprimentoNum, densidade_kg_m3: densidade },
        1,
      );
      setResultadoManual(r);
    } catch (e2) {
      setResultadoManual(null);
      setErro(e2 instanceof Error ? e2.message : "Erro ao calcular o peso.");
    } finally {
      setCalculandoManual(false);
    }
  }

  const pesoUnitarioCatalogo = useMemo(() => {
    const kgMNum = Number(kgM.replace(",", "."));
    const comprimentoM = Number(comprimento.replace(",", ".")) / 1000;
    if (!kgMNum || !comprimentoM) return null;
    return kgMNum * comprimentoM;
  }, [kgM, comprimento]);

  const pesoUnitario = modoManual ? resultadoManual?.peso_kg ?? null : pesoUnitarioCatalogo;

  const calculo = useMemo(() => {
    if (pesoUnitario === null) return null;
    return calcularPesoComercial(pesoUnitario, quantidade, perdaPct, precoKg, arredondamento);
  }, [pesoUnitario, quantidade, perdaPct, precoKg, arredondamento]);

  function adicionar() {
    if (!calculo || !materialAtual) {
      setErro("Calcule o peso e selecione o material antes de adicionar.");
      return;
    }
    const rotulo = modoManual
      ? `Tubo Ø${diametroExterno}x${espessuraParede}mm`
      : designacao.trim() || "Tubo (kg/m manual)";
    const fonte = modoManual ? "geometria" : tuboEncontrado ? "catálogo" : "kg/m manual";
    const memoria =
      `${rotulo} [${fonte}]: peso unitário ${formatarNumero(calculo.pesoUnitario, 2)} kg × qtd ${calculo.quantidadeNum} ` +
      `= ${formatarNumero(calculo.pesoLiquido, 2)} kg líquido` +
      (calculo.perdaNum ? ` + perda ${formatarNumero(calculo.perdaNum, 1)}% = ${formatarNumero(calculo.pesoBrutoExato, 2)} kg` : "") +
      (calculo.incrementoArredondamento ? ` arredondado p/ cima em ${formatarNumero(calculo.incrementoArredondamento, 2)} kg = ${formatarNumero(calculo.pesoBruto, 2)} kg bruto` : "") +
      (calculo.custoMp !== null ? ` × R$ ${formatarNumero(calculo.precoKgNum ?? 0, 2)}/kg = ${formatarMoeda(calculo.custoMp)}` : "");

    onAdicionar({
      tipo: "tubo_redondo",
      tipoRotulo: "Tubo redondo",
      descricao: rotulo,
      norma: materialAtual.norma,
      quantidade: calculo.quantidadeNum,
      peso_kg: calculo.pesoLiquido,
      memoria_calculo: memoria,
      preco_kg: calculo.precoKgNum ?? undefined,
      perdaPct: calculo.perdaNum || undefined,
      pesoParaCompraKg: calculo.pesoBruto,
      custoTotal: calculo.custoMp ?? undefined,
    });

    setDesignacao("");
    setKgMManual("");
    setKgMEditado(false);
    setDiametroExterno("");
    setEspessuraParede("");
    setResultadoManual(null);
    setComprimento("");
    setQuantidade("1");
    setPrecoKg("");
    setPerdaPct("10");
    setArredondamento("");
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-white">Tubo redondo</h3>
        <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs">
          <button
            type="button"
            onClick={() => setModoManual(false)}
            className={`px-2 py-1 ${!modoManual ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
          >
            Catálogo
          </button>
          <button
            type="button"
            onClick={() => setModoManual(true)}
            className={`px-2 py-1 ${modoManual ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
          >
            Manual
          </button>
        </div>
      </div>

      {!modoManual ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-slate-400">Bitola (ex: Tubo 60.3 x 3.35 mm)</span>
            <input
              type="text"
              list="lista-tubos-catalogo"
              value={designacao}
              onChange={(e) => {
                setDesignacao(e.target.value);
                setKgMEditado(false);
              }}
              placeholder="digite pra buscar…"
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
            <datalist id="lista-tubos-catalogo">
              {catalogo.map((t) => (
                <option key={t.designacao} value={t.designacao} />
              ))}
            </datalist>
            {tuboEncontrado && (
              <span className="text-slate-500">
                Øi calculado: {formatarNumero(tuboEncontrado.diametro_interno_mm, 2)} mm
              </span>
            )}
            {designacao && !tuboEncontrado && (
              <span className="text-amber-400">não encontrado — informe o kg/m manualmente ou use o modo manual</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-400">Peso/m {tuboEncontrado && !kgMEditado ? "(catálogo)" : "(manual)"}</span>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={kgM}
                readOnly={Boolean(tuboEncontrado) && !kgMEditado}
                onChange={(e) => setKgMManual(e.target.value)}
                className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-cyan-500 ${
                  tuboEncontrado && !kgMEditado ? "border-slate-800 bg-slate-950 text-cyan-300" : "border-slate-700 bg-slate-900 text-slate-100"
                }`}
              />
              {tuboEncontrado && (
                <button
                  type="button"
                  onClick={alternarKgMManual}
                  className="shrink-0 rounded border border-slate-700 px-1.5 py-1 text-slate-400 hover:border-cyan-500 hover:text-cyan-300"
                >
                  ✎
                </button>
              )}
            </div>
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-400">Diâmetro externo (mm)</span>
            <input
              type="text"
              inputMode="decimal"
              value={diametroExterno}
              onChange={(e) => setDiametroExterno(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-400">Espessura da parede (mm)</span>
            <input
              type="text"
              inputMode="decimal"
              value={espessuraParede}
              onChange={(e) => setEspessuraParede(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-400">Diâmetro interno (calculado)</span>
            <input
              type="text"
              readOnly
              value={diametroInternoManual !== null ? formatarNumero(diametroInternoManual, 2) : ""}
              className={`rounded-md border px-2 py-1.5 text-sm outline-none ${
                paredeInvalida ? "border-red-500 bg-red-950/40 text-red-300" : "border-slate-800 bg-slate-950 text-cyan-300"
              }`}
            />
          </label>
        </div>
      )}
      {modoManual && paredeInvalida && (
        <p className="mt-1 text-xs text-red-400">A parede (2 × espessura) precisa ser menor que o diâmetro externo.</p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">Material/Norma</span>
          <select
            value={materialIndice}
            onChange={(e) => setMaterialIndice(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="">Selecione…</option>
            {materiais.map((m, i) => (
              <option key={m.norma} value={i}>{m.material}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">Comprimento (mm)</span>
          <input
            type="text"
            inputMode="decimal"
            value={comprimento}
            onChange={(e) => setComprimento(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>
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
          <span className="text-slate-400">Perda de material (%)</span>
          <input
            type="text"
            inputMode="decimal"
            value={perdaPct}
            onChange={(e) => setPerdaPct(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-slate-400">Preço por kg (R$/kg) — opcional</span>
          <input
            type="text"
            inputMode="decimal"
            value={precoKg}
            onChange={(e) => setPrecoKg(e.target.value)}
            placeholder="deixe em branco para usar o preço padrão"
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-slate-400">Arredondar peso bruto p/ cima em (kg)</span>
          <input
            type="text"
            inputMode="decimal"
            value={arredondamento}
            onChange={(e) => setArredondamento(e.target.value)}
            placeholder="ex: 1 — em branco não arredonda"
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>
      </div>

      {modoManual && (
        <button
          type="button"
          onClick={calcularManual}
          disabled={calculandoManual || paredeInvalida}
          className="mt-3 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
        >
          {calculandoManual ? "Calculando…" : "Calcular"}
        </button>
      )}

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

      {calculo && materialAtual && (
        <PainelResultadoCalculo
          linhas={[
            { rotulo: "Material", valor: materialAtual.material },
            { rotulo: "Fonte do peso/m", valor: modoManual ? "geometria" : tuboEncontrado ? "catálogo" : "manual" },
            { rotulo: "Quantidade", valor: `${formatarNumero(calculo.quantidadeNum, 0)} peça(s)` },
            { rotulo: "Peso unitário", valor: `${formatarNumero(calculo.pesoUnitario, 2)} kg` },
            { rotulo: "Peso líquido", valor: `${formatarNumero(calculo.pesoLiquido, 2)} kg` },
            { rotulo: "Perda considerada", valor: `${formatarNumero(calculo.perdaNum, 1)}%` },
            {
              rotulo: "Peso bruto",
              valor: `${formatarNumero(calculo.pesoBruto, 2)} kg${calculo.incrementoArredondamento ? ` (arred. ${formatarNumero(calculo.incrementoArredondamento, 2)} kg)` : ""}`,
              destaque: true,
            },
          ]}
          custoLabel="Custo total MP"
          custoValor={calculo.custoMp !== null ? formatarMoeda(calculo.custoMp) : "informe o preço/kg para calcular"}
          nota={!modoManual ? "kg/m de catálogo é referência em aço carbono — pra outro material, use o modo manual." : undefined}
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
          disabled={!calculo}
          className="ml-auto rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400 disabled:opacity-50"
        >
          Adicionar ao orçamento
        </button>
      </div>
    </div>
  );
}
