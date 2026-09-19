"use client";

import { useEffect, useMemo, useState } from "react";
import { buscarPerfis, buscarTiposPerfil } from "@/lib/api";
import { calcularPesoComercial } from "@/lib/calculoPeso";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import PainelResultadoCalculo from "@/components/PainelResultadoCalculo";
import SeletorPosicaoItem from "@/components/SeletorPosicaoItem";
import type { EdicaoPendente, ItemCalculado, MaterialCatalogo, PerfilCatalogo } from "@/lib/types";

type UnidadeComprimento = "mm" | "cm" | "m";

const FATOR_PARA_METRO: Record<UnidadeComprimento, number> = { mm: 1 / 1000, cm: 1 / 100, m: 1 };

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

export default function CartaoPerfilLaminado({
  materiais,
  posicaoNum,
  itemNum,
  setPosicaoNum,
  setItemNum,
  onAdicionar,
  valorInicial,
}: Props) {
  const [tipos, setTipos] = useState<Record<string, string>>({});
  const [materialIndice, setMaterialIndice] = useState("");
  const [tipoPerfil, setTipoPerfil] = useState("W");
  const [perfisDoTipo, setPerfisDoTipo] = useState<PerfilCatalogo[]>([]);
  const [carregandoPerfis, setCarregandoPerfis] = useState(true);

  const [designacao, setDesignacao] = useState("");
  const [pesoManual, setPesoManual] = useState("");
  const [pesoEditadoManualmente, setPesoEditadoManualmente] = useState(false);

  const [comprimento, setComprimento] = useState("");
  const [unidadeComprimento, setUnidadeComprimento] = useState<UnidadeComprimento>("mm");
  const [quantidade, setQuantidade] = useState("1");
  const [precoKg, setPrecoKg] = useState("");
  const [perdaPct, setPerdaPct] = useState("10");
  const [arredondamento, setArredondamento] = useState("");
  const [erro, setErro] = useState("");

  useEffect(() => {
    buscarTiposPerfil()
      .then((r) => setTipos(r.tipos))
      .catch(() => setErro("Não consegui carregar os tipos de perfil."));
  }, []);

  const materialAtual = materialIndice !== "" ? materiais[Number(materialIndice)] : null;

  useEffect(() => {
    buscarPerfis(tipoPerfil, "")
      .then(setPerfisDoTipo)
      .catch(() => setPerfisDoTipo([]))
      .finally(() => setCarregandoPerfis(false));
  }, [tipoPerfil]);

  // Restaura o formulário quando o botão "editar" da lista de itens puxa
  // essa peça de volta.
  useEffect(() => {
    if (!valorInicial) return;
    const snap = valorInicial.dados.formSnapshot ?? {};
    if (snap.tipoPerfil !== undefined) setTipoPerfil(snap.tipoPerfil);
    setMaterialIndice(snap.materialIndice ?? "");
    setDesignacao(snap.designacao ?? "");
    setPesoEditadoManualmente(snap.pesoEditadoManualmente === "1");
    setPesoManual(snap.pesoManual ?? "");
    setComprimento(snap.comprimento ?? "");
    setUnidadeComprimento((snap.unidadeComprimento as UnidadeComprimento) ?? "mm");
    setQuantidade(snap.quantidade ?? "1");
    setPrecoKg(snap.precoKg ?? "");
    setPerdaPct(snap.perdaPct ?? "10");
    setArredondamento(snap.arredondamento ?? "");
    setErro("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorInicial?.id]);

  function selecionarTipoPerfil(novoTipo: string) {
    setCarregandoPerfis(true);
    setTipoPerfil(novoTipo);
    setDesignacao("");
    setPesoManual("");
    setPesoEditadoManualmente(false);
  }

  const perfilEncontrado = useMemo(
    () => perfisDoTipo.find((p) => normalizarBusca(p.designacao) === normalizarBusca(designacao)) ?? null,
    [perfisDoTipo, designacao],
  );

  // Peso/m vem do catálogo por padrão; "editar manualmente" troca pra um
  // valor digitado — derivado a cada render, sem efeito.
  const pesoKgM = perfilEncontrado && !pesoEditadoManualmente ? String(perfilEncontrado.peso_kg_m) : pesoManual;

  function selecionarDesignacao(valor: string) {
    setDesignacao(valor);
    setPesoEditadoManualmente(false);
  }

  function alternarPesoManual() {
    const proximo = !pesoEditadoManualmente;
    if (proximo && perfilEncontrado) setPesoManual(String(perfilEncontrado.peso_kg_m));
    setPesoEditadoManualmente(proximo);
  }

  const calculo = useMemo(() => {
    const pesoKgMNum = Number(pesoKgM.replace(",", "."));
    const comprimentoNum = Number(comprimento.replace(",", "."));
    if (!pesoKgMNum || !comprimentoNum) return null;

    const comprimentoM = comprimentoNum * FATOR_PARA_METRO[unidadeComprimento];
    const pesoUnitario = pesoKgMNum * comprimentoM;
    const resultado = calcularPesoComercial(pesoUnitario, quantidade, perdaPct, precoKg, arredondamento);
    if (!resultado) return null;

    const memoria =
      `${formatarNumero(pesoKgMNum, 2)} kg/m × ${formatarNumero(comprimentoM, 3)} m × qtd ${resultado.quantidadeNum} ` +
      `= ${formatarNumero(resultado.pesoLiquido, 2)} kg líquido` +
      (resultado.perdaNum ? ` + perda ${formatarNumero(resultado.perdaNum, 1)}% = ${formatarNumero(resultado.pesoBrutoExato, 2)} kg` : "") +
      (resultado.incrementoArredondamento ? ` arredondado p/ cima em ${formatarNumero(resultado.incrementoArredondamento, 2)} kg = ${formatarNumero(resultado.pesoBruto, 2)} kg bruto` : "") +
      (resultado.custoMp !== null ? ` × R$ ${formatarNumero(resultado.precoKgNum ?? 0, 2)}/kg = ${formatarMoeda(resultado.custoMp)}` : "");

    return { ...resultado, memoria };
  }, [pesoKgM, comprimento, unidadeComprimento, quantidade, perdaPct, precoKg, arredondamento]);

  function adicionar() {
    if (!calculo || !materialAtual) {
      setErro("Preencha perfil (ou peso/m manual), comprimento, quantidade e o material antes de adicionar.");
      return;
    }
    setErro("");
    const rotuloPerfil = designacao.trim() || `Perfil ${tipoPerfil} (kg/m manual)`;
    onAdicionar({
      tipo: "perfil",
      tipoRotulo: rotuloPerfil,
      descricao: rotuloPerfil,
      norma: materialAtual.norma,
      quantidade: calculo.quantidadeNum,
      peso_kg: calculo.pesoLiquido,
      memoria_calculo: calculo.memoria,
      preco_kg: calculo.precoKgNum ?? undefined,
      perdaPct: calculo.perdaNum || undefined,
      pesoParaCompraKg: calculo.pesoBruto,
      custoTotal: calculo.custoMp ?? undefined,
      formSnapshot: {
        tipoPerfil,
        materialIndice,
        designacao,
        pesoEditadoManualmente: pesoEditadoManualmente ? "1" : "",
        pesoManual,
        comprimento,
        unidadeComprimento,
        quantidade,
        precoKg,
        perdaPct,
        arredondamento,
      },
    });

    setDesignacao("");
    setPesoManual("");
    setPesoEditadoManualmente(false);
    setComprimento("");
    setQuantidade("1");
    setPrecoKg("");
    setPerdaPct("10");
    setArredondamento("");
  }

  return (
    <div className="rounded-xl border border-green-600/30 dark:border-cyan-500/30 bg-white dark:bg-slate-900/60 p-4">
      <h3 className="mb-3 font-semibold text-stone-900 dark:text-white">Perfil laminado (I, H, W, U)</h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">Tipo de perfil</span>
          <select
            value={tipoPerfil}
            onChange={(e) => selecionarTipoPerfil(e.target.value)}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          >
            {Object.entries(Object.keys(tipos).length === 0 ? { W: "W", I: "I", H: "H", U: "U" } : tipos).map(([sigla, rotulo]) => (
              <option key={sigla} value={sigla}>{rotulo}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-stone-600 dark:text-slate-400">Perfil / bitola</span>
          <input
            type="text"
            list="lista-perfis-catalogo"
            value={designacao}
            onChange={(e) => selecionarDesignacao(e.target.value)}
            placeholder={carregandoPerfis ? "carregando catálogo…" : "ex: W 310 x 32,7"}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
          <datalist id="lista-perfis-catalogo">
            {perfisDoTipo.map((p) => (
              <option key={p.designacao} value={p.designacao} />
            ))}
          </datalist>
          {designacao && !perfilEncontrado && (
            <span className="text-amber-700 dark:text-amber-400">
              não encontrado no catálogo{perfisDoTipo.length === 0 ? " (tipo ainda sem cadastro)" : ""} — informe o peso/m manualmente
            </span>
          )}
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">
            Peso/m {perfilEncontrado && !pesoEditadoManualmente ? "(catálogo)" : "(manual)"}
          </span>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={pesoKgM}
              readOnly={Boolean(perfilEncontrado) && !pesoEditadoManualmente}
              onChange={(e) => setPesoManual(e.target.value)}
              className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-green-600 dark:focus:border-cyan-500 ${
                perfilEncontrado && !pesoEditadoManualmente
                  ? "border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950 text-green-700 dark:text-cyan-300"
                  : "border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-stone-900 dark:text-slate-100"
              }`}
            />
            {perfilEncontrado && (
              <button
                type="button"
                title={pesoEditadoManualmente ? "Voltar a usar o valor do catálogo" : "Editar manualmente (caso excepcional)"}
                onClick={alternarPesoManual}
                className="shrink-0 rounded border border-stone-300 dark:border-slate-700 px-1.5 py-1 text-stone-600 dark:text-slate-400 hover:border-green-600 dark:hover:border-cyan-500 hover:text-green-700 dark:hover:text-cyan-300"
              >
                ✎
              </button>
            )}
          </div>
        </label>
      </div>

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
          <span className="text-stone-600 dark:text-slate-400">Comprimento</span>
          <div className="flex gap-1">
            <input
              type="text"
              inputMode="decimal"
              value={comprimento}
              onChange={(e) => setComprimento(e.target.value)}
              className="w-full rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
            <select
              value={unidadeComprimento}
              onChange={(e) => setUnidadeComprimento(e.target.value as UnidadeComprimento)}
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
            </select>
          </div>
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

        <label className="flex flex-col gap-1 text-xs">
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

        <label className="flex flex-col gap-1 text-xs">
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

      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}

      {calculo && materialAtual && (
        <PainelResultadoCalculo
          linhas={[
            { rotulo: "Material", valor: materialAtual.material },
            { rotulo: "Quantidade", valor: `${formatarNumero(Number(quantidade.replace(",", ".")) || 0, 0)} peça(s)` },
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
          nota="Peso de catálogo tem prioridade sobre reconstrução geométrica do perfil."
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
          className="ml-auto rounded-md bg-green-600 dark:bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white dark:text-slate-950 hover:bg-green-500 dark:hover:bg-cyan-400"
        >
          Adicionar ao orçamento
        </button>
      </div>
    </div>
  );
}
