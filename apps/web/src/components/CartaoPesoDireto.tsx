"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarPrecoMercado } from "@/lib/api";
import { calcularPesoComercial } from "@/lib/calculoPeso";
import { formatarDataBr, formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { EdicaoPendente, ItemCalculado, MaterialCatalogo, PrecoMercadoResposta } from "@/lib/types";

interface Props {
  materiais: MaterialCatalogo[];
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
  onAdicionar: (item: Omit<ItemCalculado, "posicao">) => void;
  valorInicial?: EdicaoPendente<ItemCalculado> | null;
}

export default function CartaoPesoDireto({
  materiais,
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
  valorInicial,
}: Props) {
  const [descricao, setDescricao] = useState("");
  const [pesoUnitario, setPesoUnitario] = useState("");
  const [materialIndice, setMaterialIndice] = useState("");
  const [espessuraRef, setEspessuraRef] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [precoManual, setPrecoManual] = useState("");
  const [precoEditado, setPrecoEditado] = useState(false);
  const [precoReferenciaBruta, setPrecoReferenciaBruta] = useState<PrecoMercadoResposta | null>(null);
  const [erro, setErro] = useState("");

  const materialAtual = materialIndice !== "" ? materiais[Number(materialIndice)] : null;
  const espessuraRefNum = Number(espessuraRef.replace(",", "."));

  // Preço/kg de referência (mesma planilha de compras da aba "Referência
  // de preços") por norma+espessura — igual ao cartão de geometria padrão,
  // mas aqui a espessura é só um parâmetro de busca (o peso não depende
  // dela, já vem informado direto).
  useEffect(() => {
    if (!materialAtual || !espessuraRefNum) return;
    let cancelado = false;
    buscarPrecoMercado(materialAtual.norma, espessuraRefNum)
      .then((r) => {
        if (!cancelado) setPrecoReferenciaBruta(r);
      })
      .catch(() => {
        if (!cancelado) setPrecoReferenciaBruta(null);
      });
    return () => {
      cancelado = true;
    };
  }, [materialAtual, espessuraRefNum]);

  // Restaura o formulário quando o botão "editar" da lista de itens puxa
  // essa peça de volta. peso_kg do item é o TOTAL (unitário × quantidade)
  // — dividimos de volta pra recuperar o peso unitário digitado. Preço
  // sempre entra como manual (não temos a espessura original de referência
  // aqui pra refazer a busca automática).
  useEffect(() => {
    if (!valorInicial) return;
    const d = valorInicial.dados;
    setDescricao(d.descricao === "Peça com peso já calculado" ? "" : d.descricao);
    setQuantidade(String(d.quantidade));
    setPesoUnitario(d.quantidade ? String(d.peso_kg / d.quantidade) : String(d.peso_kg));
    const indiceMaterial = materiais.findIndex((m) => m.norma === d.norma);
    setMaterialIndice(indiceMaterial >= 0 ? String(indiceMaterial) : "");
    // Só existe quando o item veio da inserção automática da BOM por IA
    // (ver lib/itensCalculados.ts::converterParaPesoDireto) — itens
    // adicionados por este cartão nunca preenchem formSnapshot.
    setEspessuraRef(d.formSnapshot?.espessura_mm ?? "");
    setPrecoEditado(true);
    setPrecoManual(d.preco_kg !== undefined ? String(d.preco_kg) : "");
    setErro("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorInicial?.id]);

  const precoReferencia = materialAtual && espessuraRefNum ? precoReferenciaBruta : null;
  const precoKg = precoReferencia?.encontrado && !precoEditado ? String(precoReferencia.preco_kg) : precoManual;

  function selecionarMaterial(indice: string) {
    setMaterialIndice(indice);
    setPrecoEditado(false);
  }

  function alternarPrecoManual() {
    const proximo = !precoEditado;
    if (proximo && precoReferencia?.encontrado) setPrecoManual(String(precoReferencia.preco_kg));
    setPrecoEditado(proximo);
  }

  const calculo = useMemo(() => {
    const pesoUnitarioNum = Number(pesoUnitario.replace(",", "."));
    if (!pesoUnitarioNum) return null;
    // Peso já vem pronto (sem geometria) — sem perda de material nem
    // arredondamento de compra, que só fazem sentido pra estoque bruto
    // (chapa/barra) do qual a peça seria recortada.
    const resultado = calcularPesoComercial(pesoUnitarioNum, quantidade, "0", precoKg, "");
    if (!resultado) return null;

    const memoria =
      `${formatarNumero(pesoUnitarioNum, 3)} kg/un (informado) × qtd ${resultado.quantidadeNum} ` +
      `= ${formatarNumero(resultado.pesoLiquido, 2)} kg` +
      (resultado.custoMp !== null
        ? ` × R$ ${formatarNumero(resultado.precoKgNum ?? 0, 2)}/kg = ${formatarMoeda(resultado.custoMp)}`
        : "");

    return { ...resultado, memoria };
  }, [pesoUnitario, quantidade, precoKg]);

  function adicionar() {
    if (!calculo || !materialAtual || calculo.custoMp === null) {
      setErro("Informe o peso, o material/norma e o preço por kg antes de adicionar.");
      return;
    }
    setErro("");
    const rotulo = descricao.trim() || "Peça com peso já calculado";
    onAdicionar({
      tipo: "peso_direto",
      tipoRotulo: "Peso direto",
      descricao: rotulo,
      norma: materialAtual.norma,
      quantidade: calculo.quantidadeNum,
      peso_kg: calculo.pesoLiquido,
      memoria_calculo: calculo.memoria,
      preco_kg: calculo.precoKgNum ?? undefined,
      pesoParaCompraKg: calculo.pesoBruto,
      custoTotal: calculo.custoMp,
    });

    setDescricao("");
    setPesoUnitario("");
    setQuantidade("1");
    setPrecoManual("");
    setPrecoEditado(false);
  }

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-slate-900/60 p-4">
      <h3 className="mb-1 font-semibold text-white">Peso direto (peça já calculada)</h3>
      <p className="mb-3 text-xs text-slate-400">
        Para peças cujo peso líquido já foi determinado fora do sistema (memorial de cálculo
        externo, planilha própria, cotação do fornecedor) — sem recalcular geometria, só peso,
        material/norma, preço, quantidade e posição/item.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-slate-400">Descrição — opcional</span>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="ex: base soldada conforme desenho X"
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-slate-400">Peso unitário (kg)</span>
          <input
            type="text"
            inputMode="decimal"
            value={pesoUnitario}
            onChange={(e) => setPesoUnitario(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
          />
        </label>

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
          <span className="text-slate-400">Espessura (mm) — só p/ referência de preço</span>
          <input
            type="text"
            inputMode="decimal"
            value={espessuraRef}
            onChange={(e) => setEspessuraRef(e.target.value)}
            placeholder="ex: 12,7 — não afeta o peso"
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
          <span className="text-slate-400">
            Preço por kg (R$/kg) {precoReferencia?.encontrado && !precoEditado ? "" : "— sem referência"}
          </span>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={precoKg}
              readOnly={Boolean(precoReferencia?.encontrado) && !precoEditado}
              onChange={(e) => setPrecoManual(e.target.value)}
              placeholder="informe manualmente"
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
      </div>

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}

      {calculo && materialAtual && (
        <PainelResultadoCalculo
          linhas={[
            { rotulo: "Material", valor: materialAtual.material },
            { rotulo: "Quantidade", valor: `${formatarNumero(calculo.quantidadeNum, 0)} peça(s)` },
            { rotulo: "Peso unitário", valor: `${formatarNumero(calculo.pesoUnitario, 3)} kg` },
            { rotulo: "Peso total", valor: `${formatarNumero(calculo.pesoLiquido, 2)} kg`, destaque: true },
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
