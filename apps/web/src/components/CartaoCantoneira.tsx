"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buscarCantoneirasCatalogo, calcularPesoGeometria } from "@/lib/api";
import { calcularPesoComercial } from "@/lib/calculoPeso";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { CantoneiraCatalogo, EdicaoPendente, ItemCalculado, MaterialCatalogo } from "@/lib/types";

interface Props {
  materiais: MaterialCatalogo[];
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
  onAdicionar: (item: Omit<ItemCalculado, "posicao">) => void;
  valorInicial?: EdicaoPendente<ItemCalculado> | null;
}

function normalizarBusca(texto: string): string {
  return texto.trim().toUpperCase().replace(/,/g, ".").replace(/\s+/g, "");
}

export default function CartaoCantoneira({
  materiais,
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
  valorInicial,
}: Props) {
  const [modoManual, setModoManual] = useState(false);

  const [catalogo, setCatalogo] = useState<CantoneiraCatalogo[]>([]);
  const [designacao, setDesignacao] = useState("");
  const [kgMManual, setKgMManual] = useState("");
  const [kgMEditado, setKgMEditado] = useState(false);

  const [aba, setAba] = useState("");
  const [espessura, setEspessura] = useState("");
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
    buscarCantoneirasCatalogo("")
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  const cantoneiraEncontrada = useMemo(
    () => catalogo.find((c) => normalizarBusca(c.designacao) === normalizarBusca(designacao)) ?? null,
    [catalogo, designacao],
  );

  const kgM = cantoneiraEncontrada && !kgMEditado ? String(cantoneiraEncontrada.kg_m) : kgMManual;

  function alternarKgMManual() {
    const proximo = !kgMEditado;
    if (proximo && cantoneiraEncontrada) setKgMManual(String(cantoneiraEncontrada.kg_m));
    setKgMEditado(proximo);
  }

  // Restaura o formulário quando o botão "editar" da lista de itens puxa
  // essa peça de volta. No modo manual, o resultado da geometria (async)
  // não dá pra restaurar de sincrono — fica pro usuário clicar "Calcular"
  // de novo, mesmo comportamento de um cálculo novo.
  useEffect(() => {
    if (!valorInicial) return;
    const snap = valorInicial.dados.formSnapshot ?? {};
    setModoManual(snap.modoManual === "1");
    setDesignacao(snap.designacao ?? "");
    setKgMEditado(snap.kgMEditado === "1");
    setKgMManual(snap.kgMManual ?? "");
    setAba(snap.aba ?? "");
    setEspessura(snap.espessura ?? "");
    setResultadoManual(null);
    setMaterialIndice(snap.materialIndice ?? "");
    setComprimento(snap.comprimento ?? "");
    setQuantidade(snap.quantidade ?? "1");
    setPrecoKg(snap.precoKg ?? "");
    setPerdaPct(snap.perdaPct ?? "10");
    setArredondamento(snap.arredondamento ?? "");
    setErro("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorInicial?.id]);

  // Token da última chamada — evita que a resposta de um cálculo mais
  // antigo (rede lenta) sobrescreva o resultado de uma mudança mais nova.
  const tokenCalculoRef = useRef(0);

  async function calcularManual() {
    const abaNum = Number(aba.replace(",", "."));
    const espessuraNum = Number(espessura.replace(",", "."));
    const comprimentoNum = Number(comprimento.replace(",", "."));
    const densidade = materialAtual?.densidade_kg_m3;
    if (!abaNum || !espessuraNum || !comprimentoNum || !densidade) {
      setErro("Preencha aba, espessura, comprimento e selecione o material antes de calcular.");
      return;
    }
    const token = ++tokenCalculoRef.current;
    setErro("");
    setCalculandoManual(true);
    try {
      const r = await calcularPesoGeometria(
        "cantoneira",
        { aba_mm: abaNum, espessura_mm: espessuraNum, comprimento_mm: comprimentoNum, densidade_kg_m3: densidade },
        1,
      );
      if (token !== tokenCalculoRef.current) return;
      setResultadoManual(r);
    } catch (e) {
      if (token !== tokenCalculoRef.current) return;
      setResultadoManual(null);
      setErro(e instanceof Error ? e.message : "Erro ao calcular o peso.");
    } finally {
      if (token === tokenCalculoRef.current) setCalculandoManual(false);
    }
  }

  // Recalcula sozinho quando aba/espessura/comprimento ou a densidade do
  // material mudam — mesmo problema do CartaoGeometriaPadrao.tsx: trocar o
  // material depois de já ter calculado deixava o peso (modo manual, sem
  // cantoneira no catálogo) com a densidade antiga até clicar em "Calcular"
  // de novo. Só dispara se já existe um resultado calculado (evita chamada
  // de rede a cada tecla no primeiro preenchimento).
  useEffect(() => {
    if (!modoManual || !resultadoManual) return;
    const abaNum = Number(aba.replace(",", "."));
    const espessuraNum = Number(espessura.replace(",", "."));
    const comprimentoNum = Number(comprimento.replace(",", "."));
    if (!abaNum || !espessuraNum || !comprimentoNum || !materialAtual?.densidade_kg_m3) return;
    const timer = setTimeout(() => {
      calcularManual();
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoManual, aba, espessura, comprimento, materialAtual?.densidade_kg_m3]);

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
      ? `Cantoneira L ${aba}×${espessura}mm`
      : designacao.trim() || "Cantoneira (kg/m manual)";
    const fonte = modoManual ? "geometria teórica" : cantoneiraEncontrada ? "catálogo" : "kg/m manual";
    const memoria =
      `${rotulo} [${fonte}]: peso unitário ${formatarNumero(calculo.pesoUnitario, 2)} kg × qtd ${calculo.quantidadeNum} ` +
      `= ${formatarNumero(calculo.pesoLiquido, 2)} kg líquido` +
      (calculo.perdaNum ? ` + perda ${formatarNumero(calculo.perdaNum, 1)}% = ${formatarNumero(calculo.pesoBrutoExato, 2)} kg` : "") +
      (calculo.incrementoArredondamento ? ` arredondado p/ cima em ${formatarNumero(calculo.incrementoArredondamento, 2)} kg = ${formatarNumero(calculo.pesoBruto, 2)} kg bruto` : "") +
      (calculo.custoMp !== null ? ` × R$ ${formatarNumero(calculo.precoKgNum ?? 0, 2)}/kg = ${formatarMoeda(calculo.custoMp)}` : "");

    onAdicionar({
      tipo: "cantoneira",
      tipoRotulo: "Cantoneira L (abas iguais)",
      descricao: rotulo,
      norma: materialAtual.norma,
      quantidade: calculo.quantidadeNum,
      peso_kg: calculo.pesoLiquido,
      memoria_calculo: memoria,
      preco_kg: calculo.precoKgNum ?? undefined,
      perdaPct: calculo.perdaNum || undefined,
      pesoParaCompraKg: calculo.pesoBruto,
      custoTotal: calculo.custoMp ?? undefined,
      formSnapshot: {
        modoManual: modoManual ? "1" : "",
        designacao,
        kgMEditado: kgMEditado ? "1" : "",
        kgMManual,
        aba,
        espessura,
        materialIndice,
        comprimento,
        quantidade,
        precoKg,
        perdaPct,
        arredondamento,
      },
    });

    setDesignacao("");
    setKgMManual("");
    setKgMEditado(false);
    setAba("");
    setEspessura("");
    setResultadoManual(null);
    setComprimento("");
    setQuantidade("1");
    setPrecoKg("");
    setPerdaPct("10");
    setArredondamento("");
  }

  return (
    <div className="rounded-xl border border-green-600/30 dark:border-cyan-500/30 bg-white dark:bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-stone-900 dark:text-white">Cantoneira L (abas iguais)</h3>
        <div className="flex overflow-hidden rounded-md border border-stone-300 dark:border-slate-700 text-xs">
          <button
            type="button"
            onClick={() => setModoManual(false)}
            className={`px-2 py-1 ${!modoManual ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950" : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"}`}
          >
            Catálogo
          </button>
          <button
            type="button"
            onClick={() => setModoManual(true)}
            className={`px-2 py-1 ${modoManual ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950" : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"}`}
          >
            Manual
          </button>
        </div>
      </div>

      {!modoManual ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-stone-600 dark:text-slate-400">Bitola (ex: L 2&quot; x 2&quot; x 1/4&quot;)</span>
            <input
              type="text"
              list="lista-cantoneiras-catalogo"
              value={designacao}
              onChange={(e) => {
                setDesignacao(e.target.value);
                setKgMEditado(false);
              }}
              placeholder="digite pra buscar…"
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
            <datalist id="lista-cantoneiras-catalogo">
              {catalogo.map((c) => (
                <option key={c.designacao} value={c.designacao} />
              ))}
            </datalist>
            {designacao && !cantoneiraEncontrada && (
              <span className="text-amber-700 dark:text-amber-400">não encontrada — informe o kg/m manualmente ou use o modo manual</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-stone-600 dark:text-slate-400">Peso/m {cantoneiraEncontrada && !kgMEditado ? "(catálogo)" : "(manual)"}</span>
            <div className="flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                value={kgM}
                readOnly={Boolean(cantoneiraEncontrada) && !kgMEditado}
                onChange={(e) => setKgMManual(e.target.value)}
                className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-green-600 dark:focus:border-cyan-500 ${
                  cantoneiraEncontrada && !kgMEditado ? "border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950 text-green-700 dark:text-cyan-300" : "border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100"
                }`}
              />
              {cantoneiraEncontrada && (
                <button
                  type="button"
                  onClick={alternarKgMManual}
                  className="shrink-0 rounded border border-stone-300 dark:border-slate-700 px-1.5 py-1 text-stone-600 dark:text-slate-400 hover:border-green-600 dark:hover:border-cyan-500 hover:text-green-700 dark:hover:text-cyan-300"
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
            <span className="text-stone-600 dark:text-slate-400">Aba (mm)</span>
            <input
              type="text"
              inputMode="decimal"
              value={aba}
              onChange={(e) => setAba(e.target.value)}
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-stone-600 dark:text-slate-400">Espessura (mm)</span>
            <input
              type="text"
              inputMode="decimal"
              value={espessura}
              onChange={(e) => setEspessura(e.target.value)}
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          </label>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">Material/Norma</span>
          <select
            value={materialIndice}
            onChange={(e) => setMaterialIndice(e.target.value)}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          >
            <option value="">Selecione…</option>
            {materiais.map((m, i) => (
              <option key={m.norma} value={i}>{m.material}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">Comprimento (mm)</span>
          <input
            type="text"
            inputMode="decimal"
            value={comprimento}
            onChange={(e) => setComprimento(e.target.value)}
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
          <span className="text-stone-600 dark:text-slate-400">Perda de material (%)</span>
          <input
            type="text"
            inputMode="decimal"
            value={perdaPct}
            onChange={(e) => setPerdaPct(e.target.value)}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-stone-600 dark:text-slate-400">Preço por kg (R$/kg) — opcional</span>
          <input
            type="text"
            inputMode="decimal"
            value={precoKg}
            onChange={(e) => setPrecoKg(e.target.value)}
            placeholder="deixe em branco para usar o preço padrão"
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-stone-600 dark:text-slate-400">Arredondar peso bruto p/ cima em (kg)</span>
          <input
            type="text"
            inputMode="decimal"
            value={arredondamento}
            onChange={(e) => setArredondamento(e.target.value)}
            placeholder="ex: 1 — em branco não arredonda"
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>
      </div>

      {modoManual && (
        <button
          type="button"
          onClick={calcularManual}
          disabled={calculandoManual}
          className="mt-3 rounded-md bg-green-600 dark:bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white dark:text-slate-950 transition-colors hover:bg-green-500 dark:hover:bg-cyan-400 disabled:opacity-50"
        >
          {calculandoManual ? "Calculando…" : "Calcular"}
        </button>
      )}

      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}

      {calculo && materialAtual && (
        <PainelResultadoCalculo
          linhas={[
            { rotulo: "Material", valor: materialAtual.material },
            { rotulo: "Fonte do peso/m", valor: modoManual ? "geometria teórica" : cantoneiraEncontrada ? "catálogo" : "manual" },
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
          nota={!modoManual ? "Peso de catálogo prioriza o kg/m real sobre a geometria teórica (raio/tolerância de laminação não modelados)." : undefined}
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
          className="ml-auto rounded-md bg-green-600 dark:bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white dark:text-slate-950 hover:bg-green-500 dark:hover:bg-cyan-400 disabled:opacity-50"
        >
          Adicionar ao orçamento
        </button>
      </div>
    </div>
  );
}
