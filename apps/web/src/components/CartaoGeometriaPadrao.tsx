"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarPrecoMercado, calcularPesoGeometria } from "@/lib/api";
import { calcularPesoComercial } from "@/lib/calculoPeso";
import { formatarDataBr, formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { ItemCalculado, MaterialCatalogo, PrecoMercadoResposta, TipoGeometria } from "@/lib/types";

interface Props {
  tipo: string;
  def: TipoGeometria;
  materiais: MaterialCatalogo[];
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
  onAdicionar: (item: Omit<ItemCalculado, "posicao">) => void;
}

const PI = Math.PI;

function numero(medidas: Record<string, string>, chave: string): number {
  return Number((medidas[chave] ?? "").replace(",", "."));
}

/** Grandezas auxiliares (área, geratriz, desenvolvimento) — só pra exibição
 * de apoio; o peso "oficial" sempre vem do motor (backend), calculado com
 * as mesmas fórmulas. */
function calcularExtras(tipo: string, m: Record<string, string>): { rotulo: string; valor: string }[] {
  const extras: { rotulo: string; valor: string }[] = [];
  const n = (chave: string) => numero(m, chave);

  switch (tipo) {
    case "chapa_retangular": {
      const areaM2 = (n("comprimento_mm") * n("largura_mm")) / 1_000_000;
      if (areaM2 > 0) extras.push({ rotulo: "Área unitária", valor: `${formatarNumero(areaM2, 3)} m²` });
      break;
    }
    case "chapa_circular": {
      const areaM2 = (PI * n("diametro_mm") ** 2) / 4 / 1_000_000;
      if (areaM2 > 0) extras.push({ rotulo: "Área unitária", valor: `${formatarNumero(areaM2, 3)} m²` });
      break;
    }
    case "chapa_triangular": {
      const areaM2 = (n("base_mm") * n("altura_mm")) / 2 / 1_000_000;
      if (areaM2 > 0) extras.push({ rotulo: "Área unitária", valor: `${formatarNumero(areaM2, 3)} m²` });
      break;
    }
    case "chapa_losango": {
      const areaM2 = (n("diagonal_maior_mm") * n("diagonal_menor_mm")) / 2 / 1_000_000;
      if (areaM2 > 0) extras.push({ rotulo: "Área unitária", valor: `${formatarNumero(areaM2, 3)} m²` });
      break;
    }
    case "chapa_trapezoidal": {
      const areaM2 = ((n("base_menor_mm") + n("base_maior_mm")) / 2) * n("altura_mm") / 1_000_000;
      if (areaM2 > 0) extras.push({ rotulo: "Área unitária", valor: `${formatarNumero(areaM2, 3)} m²` });
      break;
    }
    case "chapa_anel": {
      const de = n("diametro_externo_mm");
      const di = n("diametro_interno_mm");
      if (de > 0 && di > 0) {
        const areaM2 = (PI / 4) * (de ** 2 - di ** 2) / 1_000_000;
        extras.push({ rotulo: "Área unitária", valor: `${formatarNumero(areaM2, 3)} m²` });
      }
      break;
    }
    case "cilindro": {
      const d = n("diametro_mm");
      const c = n("comprimento_mm");
      if (d > 0 && c > 0) {
        const desenvolvimento = PI * d;
        const areaM2 = (desenvolvimento * c) / 1_000_000;
        extras.push({ rotulo: "Desenvolvimento da chapa", valor: `${formatarNumero(desenvolvimento, 1)} × ${formatarNumero(c, 1)} mm` });
        extras.push({ rotulo: "Área desenvolvida", valor: `${formatarNumero(areaM2, 3)} m²` });
      }
      break;
    }
    case "cone_altura": {
      const R = n("diametro_maior_mm") / 2;
      const r = n("diametro_menor_mm") / 2;
      const h = n("altura_mm");
      if (R > 0 && h > 0) {
        const g = Math.sqrt(h ** 2 + (R - r) ** 2);
        const areaM2 = (PI * (R + r) * g) / 1_000_000;
        extras.push({ rotulo: "Geratriz", valor: `${formatarNumero(g, 1)} mm` });
        extras.push({ rotulo: "Área lateral", valor: `${formatarNumero(areaM2, 3)} m²` });
      }
      break;
    }
    case "cone_angulo": {
      const R = n("diametro_maior_mm") / 2;
      const r = n("diametro_menor_mm") / 2;
      const semiangulo = n("angulo_graus");
      if (R > 0 && semiangulo > 0 && semiangulo < 90) {
        const h = (R - r) / Math.tan((semiangulo * PI) / 180);
        const g = Math.sqrt(h ** 2 + (R - r) ** 2);
        const areaM2 = (PI * (R + r) * g) / 1_000_000;
        extras.push({ rotulo: "Altura calculada", valor: `${formatarNumero(h, 1)} mm` });
        extras.push({ rotulo: "Geratriz", valor: `${formatarNumero(g, 1)} mm` });
        extras.push({ rotulo: "Área lateral", valor: `${formatarNumero(areaM2, 3)} m²` });
      }
      break;
    }
    default:
      break;
  }
  return extras;
}

function IlustracaoSemianguloCone() {
  return (
    <svg viewBox="0 0 120 70" className="h-16 w-28 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth={1.4}>
      <line x1="60" y1="8" x2="60" y2="62" strokeDasharray="3 2" opacity={0.6} />
      <line x1="60" y1="8" x2="20" y2="62" />
      <line x1="60" y1="8" x2="100" y2="62" />
      <line x1="14" y1="62" x2="106" y2="62" opacity={0.6} />
      <path d="M60 26 A18 18 0 0 0 49 33" strokeWidth={1.2} />
      <text x="63" y="30" fontSize="9" fill="currentColor" stroke="none">α</text>
      <text x="8" y="20" fontSize="7" fill="currentColor" stroke="none">eixo</text>
    </svg>
  );
}

const NOTAS_TIPO: Record<string, string> = {
  cilindro: "Cálculo da virola/lateral (chapa calandrada), sem tampas.",
  cone_altura: "Cálculo da lateral do cone/tronco (chapa calandrada), sem tampas.",
  cone_angulo: "Ângulo informado é o semiângulo em relação ao eixo central do cone (não o ângulo total de abertura).",
};

export default function CartaoGeometriaPadrao({
  tipo,
  def,
  materiais,
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
}: Props) {
  const campos = useMemo(() => def.campos.filter((c) => c.chave !== "densidade_kg_m3"), [def]);

  // Sem efeito de "reset ao trocar tipo": o pai monta este componente com
  // key={tipo} (ver CalculoManual.tsx), então trocar de cartão já remonta
  // com estado limpo — não precisa sincronizar isso aqui.
  const [medidas, setMedidas] = useState<Record<string, string>>({});
  const [materialIndice, setMaterialIndice] = useState("");
  const [densidadeManual, setDensidadeManual] = useState("");
  const [densidadeEditada, setDensidadeEditada] = useState(false);
  const [quantidade, setQuantidade] = useState("1");
  const [precoManual, setPrecoManual] = useState("");
  const [precoEditado, setPrecoEditado] = useState(false);
  const [precoReferenciaBruta, setPrecoReferenciaBruta] = useState<PrecoMercadoResposta | null>(null);
  const [perdaPct, setPerdaPct] = useState("10");
  const [arredondamento, setArredondamento] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultadoPeso, setResultadoPeso] = useState<{ peso_kg: number; memoria_calculo: string } | null>(null);

  const materialAtual = materialIndice !== "" ? materiais[Number(materialIndice)] : null;
  // Densidade vem do material selecionado por padrão; "editar manualmente"
  // troca pra um valor digitado — derivado a cada render, sem efeito.
  const densidade = materialAtual && !densidadeEditada ? String(materialAtual.densidade_kg_m3) : densidadeManual;

  const temEspessura = campos.some((c) => c.chave === "espessura_mm");
  const espessuraAtual = temEspessura ? numero(medidas, "espessura_mm") : 0;

  // Preço/kg de referência (sincronizado da planilha de compras — ver
  // services/calc_engine/app/precos_mercado.py) por norma+espessura,
  // igual à densidade: só busca pra tipos com espessura, atualiza quando
  // material ou espessura mudam, e nunca sobrescreve edição manual.
  useEffect(() => {
    if (!temEspessura || !materialAtual || !espessuraAtual) return;
    let cancelado = false;
    buscarPrecoMercado(materialAtual.norma, espessuraAtual)
      .then((r) => {
        if (!cancelado) setPrecoReferenciaBruta(r);
      })
      .catch(() => {
        if (!cancelado) setPrecoReferenciaBruta(null);
      });
    return () => {
      cancelado = true;
    };
  }, [temEspessura, materialAtual, espessuraAtual]);

  // null sempre que as condições não valem mais (ex: apagou a espessura)
  // mesmo que a última resposta da API ainda esteja em memória.
  const precoReferencia = temEspessura && materialAtual && espessuraAtual ? precoReferenciaBruta : null;

  const precoKg =
    precoReferencia?.encontrado && !precoEditado ? String(precoReferencia.preco_kg) : precoManual;

  function selecionarMaterial(indice: string) {
    setMaterialIndice(indice);
    setDensidadeEditada(false);
    setPrecoEditado(false);
  }

  function alternarDensidadeManual() {
    const proximo = !densidadeEditada;
    if (proximo && materialAtual) setDensidadeManual(String(materialAtual.densidade_kg_m3));
    setDensidadeEditada(proximo);
  }

  function alternarPrecoManual() {
    const proximo = !precoEditado;
    if (proximo && precoReferencia?.encontrado) setPrecoManual(String(precoReferencia.preco_kg));
    setPrecoEditado(proximo);
  }

  const extras = useMemo(() => calcularExtras(tipo, medidas), [tipo, medidas]);

  async function calcular() {
    const faltando = campos.some((c) => !medidas[c.chave]);
    const densidadeNum = Number(densidade.replace(",", "."));
    if (faltando || !densidadeNum) {
      setErro("Preencha todas as medidas e selecione o material (ou informe a densidade) antes de calcular.");
      return;
    }
    setErro("");
    setCalculando(true);
    try {
      const medidasNumericas: Record<string, number> = { densidade_kg_m3: densidadeNum };
      for (const c of campos) medidasNumericas[c.chave] = numero(medidas, c.chave);
      const r = await calcularPesoGeometria(tipo, medidasNumericas, 1);
      setResultadoPeso(r);
    } catch (e) {
      setResultadoPeso(null);
      setErro(e instanceof Error ? e.message : "Erro ao calcular o peso.");
    } finally {
      setCalculando(false);
    }
  }

  const calculo = useMemo(() => {
    if (!resultadoPeso) return null;
    return calcularPesoComercial(resultadoPeso.peso_kg, quantidade, perdaPct, precoKg, arredondamento);
  }, [resultadoPeso, quantidade, perdaPct, precoKg, arredondamento]);

  function adicionar() {
    if (!calculo || !materialAtual) {
      setErro("Calcule o peso e selecione o material antes de adicionar.");
      return;
    }
    const resumoDimensoes = campos.map((c) => medidas[c.chave]).filter(Boolean).join(" × ");
    const descricao = `${def.rotulo}${resumoDimensoes ? " (" + resumoDimensoes + " mm)" : ""}`;
    const memoria =
      `${resultadoPeso!.memoria_calculo} × qtd ${calculo.quantidadeNum} = ${formatarNumero(calculo.pesoLiquido, 2)} kg líquido` +
      (calculo.perdaNum ? ` + perda ${formatarNumero(calculo.perdaNum, 1)}% = ${formatarNumero(calculo.pesoBrutoExato, 2)} kg` : "") +
      (calculo.incrementoArredondamento ? ` arredondado p/ cima em ${formatarNumero(calculo.incrementoArredondamento, 2)} kg = ${formatarNumero(calculo.pesoBruto, 2)} kg bruto` : "") +
      (calculo.custoMp !== null ? ` × R$ ${formatarNumero(calculo.precoKgNum ?? 0, 2)}/kg = ${formatarMoeda(calculo.custoMp)}` : "");

    onAdicionar({
      tipo,
      tipoRotulo: def.rotulo,
      descricao,
      norma: materialAtual.norma,
      quantidade: calculo.quantidadeNum,
      peso_kg: calculo.pesoLiquido,
      memoria_calculo: memoria,
      preco_kg: calculo.precoKgNum ?? undefined,
      perdaPct: calculo.perdaNum || undefined,
      pesoParaCompraKg: calculo.pesoBruto,
      custoTotal: calculo.custoMp ?? undefined,
    });

    setMedidas({});
    setQuantidade("1");
    setPrecoManual("");
    setPrecoEditado(false);
    setPerdaPct("10");
    setArredondamento("");
    setResultadoPeso(null);
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-900/60 p-4">
      <h3 className="mb-3 font-semibold text-white">{def.rotulo}</h3>
      {tipo === "cone_angulo" && (
        <div className="mb-3 flex items-center gap-3 rounded-md border border-slate-800 bg-slate-950/60 p-2">
          <IlustracaoSemianguloCone />
          <p className="text-xs text-slate-400">
            α é o <strong className="text-slate-200">semiângulo em relação ao eixo central</strong> (linha
            tracejada) — não o ângulo total de abertura entre as duas laterais do cone.
          </p>
        </div>
      )}
      {NOTAS_TIPO[tipo] && <p className="mb-3 text-xs text-amber-400/90">{NOTAS_TIPO[tipo]}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {campos.map((campo) => (
          <label key={campo.chave} className="flex flex-col gap-1 text-xs">
            <span className="text-slate-400">
              {campo.rotulo} ({campo.unidade})
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={medidas[campo.chave] ?? ""}
              onChange={(e) => setMedidas((m) => ({ ...m, [campo.chave]: e.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
        ))}

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">Material/Norma</span>
          <select
            value={materialIndice}
            onChange={(e) => selecionarMaterial(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          >
            <option value="">Selecione…</option>
            {materiais.map((m, i) => (
              <option key={m.norma} value={i}>{m.material}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">
            Densidade (kg/m³) {materialAtual && !densidadeEditada ? "" : "(editado)"}
          </span>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={densidade}
              readOnly={Boolean(materialAtual) && !densidadeEditada}
              onChange={(e) => setDensidadeManual(e.target.value)}
              className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-cyan-500 ${
                materialAtual && !densidadeEditada
                  ? "border-slate-800 bg-slate-950 text-cyan-300"
                  : "border-slate-700 bg-slate-900 text-slate-100"
              }`}
            />
            {materialAtual && (
              <button
                type="button"
                title="Editar densidade manualmente (material especial)"
                onClick={alternarDensidadeManual}
                className="shrink-0 rounded border border-slate-700 px-1.5 py-1 text-slate-400 hover:border-cyan-500 hover:text-cyan-300"
              >
                ✎
              </button>
            )}
          </div>
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

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">
            Preço por kg (R$/kg) {precoReferencia?.encontrado && !precoEditado ? "" : "— opcional"}
          </span>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={precoKg}
              readOnly={Boolean(precoReferencia?.encontrado) && !precoEditado}
              onChange={(e) => setPrecoManual(e.target.value)}
              placeholder="sem referência — informe manualmente"
              className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-cyan-500 ${
                precoReferencia?.encontrado && !precoEditado
                  ? "border-slate-800 bg-slate-950 text-cyan-300"
                  : "border-slate-700 bg-slate-900 text-slate-100"
              }`}
            />
            {precoReferencia?.encontrado && (
              <button
                type="button"
                title={precoEditado ? "Voltar a usar o preço de referência" : "Editar manualmente (caso excepcional)"}
                onClick={alternarPrecoManual}
                className="shrink-0 rounded border border-slate-700 px-1.5 py-1 text-slate-400 hover:border-cyan-500 hover:text-cyan-300"
              >
                ✎
              </button>
            )}
          </div>
          {precoReferencia?.encontrado && (
            <span className="text-slate-500">
              Ref.: {precoReferencia.fornecedor || "fornecedor não informado"}
              {precoReferencia.data_compra ? ` · ${formatarDataBr(precoReferencia.data_compra)}` : ""}
              {!precoReferencia.exato ? ` (espessura mais próxima: ${formatarNumero(precoReferencia.espessura_referencia_mm, 2)} mm)` : ""}
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-xs">
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

      <button
        type="button"
        onClick={calcular}
        disabled={calculando}
        className="mt-3 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
      >
        {calculando ? "Calculando…" : "Calcular"}
      </button>

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

      {calculo && materialAtual && (
        <PainelResultadoCalculo
          linhas={[
            { rotulo: "Material", valor: materialAtual.material },
            { rotulo: "Densidade", valor: `${formatarNumero(Number(densidade.replace(",", ".")), 0)} kg/m³` },
            { rotulo: "Quantidade", valor: `${formatarNumero(calculo.quantidadeNum, 0)} peça(s)` },
            ...extras,
            ...(tipo === "barra_redonda" && numero(medidas, "comprimento_mm")
              ? [{ rotulo: "Peso por metro", valor: `${formatarNumero(calculo.pesoUnitario / (numero(medidas, "comprimento_mm") / 1000), 2)} kg/m` }]
              : []),
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
