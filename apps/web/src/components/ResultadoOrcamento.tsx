"use client";

import { useState } from "react";
import type { RespostaOrcamentoDePdf } from "@/lib/types";
import {
  corConfianca,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
  NOMES_PROCESSO,
} from "@/lib/format";
import PainelPesoBase from "@/components/PainelPesoBase";

function Confianca({ valor }: { valor: number }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${corConfianca(valor)}`}
    >
      {valor > 0 ? `${Math.round(valor * 100)}%` : "não identificado"}
    </span>
  );
}

// Parâmetros (taxas/valores unitários) que alimentam a fórmula de cada
// processo — a fórmula em si nunca muda, só o valor que entra nela. Chaves
// batem exatamente com services/calc_engine/app/orcamento.py::PARAMS_ESCALARES_SOBRESCREVIVEIS
// (mais pintura_preco_fundo/acabamento, tratados à parte no backend).
// Processos sem entrada aqui não têm "editar" no agregado — já são editáveis
// item a item no painel "Itens do orçamento".
const PARAMS_POR_PROCESSO: Record<string, { chave: string; rotulo: string }[]> = {
  corte: [
    { chave: "corte_valor_kg", rotulo: "R$/kg" },
    { chave: "corte_peso_kg", rotulo: "Peso (kg)" },
    { chave: "corte_fator_percentual_adicional", rotulo: "% adicional" },
  ],
  caldeiraria: [
    // Vazio = usa o peso líquido do orçamento (igual corte_peso_kg já faz).
    // Não tem efeito quando o orçamento usa histórico de horas
    // (usar_historico_horas) — nesse caso as horas já vêm prontas de outra
    // camada e não dependem mais do peso digitado aqui.
    { chave: "caldeiraria_peso_kg", rotulo: "Peso (kg)" },
    { chave: "caldeiraria_fator_h_kg", rotulo: "h/kg" },
    { chave: "caldeiraria_valor_hora", rotulo: "R$/h" },
  ],
  jateamento_pintura_mo: [
    { chave: "jateamento_pintura_divisor", rotulo: "divisor" },
    { chave: "jateamento_pintura_valor_hora", rotulo: "R$/h" },
  ],
  solda: [
    // Peso do consumível carbono: vazio = usa o peso líquido do orçamento
    // (igual corte_peso_kg já fazia pro corte) — pedido explícito do
    // usuário pra poder editar o peso além da % e do R$/kg.
    { chave: "solda_peso_kg", rotulo: "Peso consumível (kg)" },
    { chave: "solda_fator_consumo_percentual", rotulo: "% consumo carbono" },
    { chave: "solda_preco_kg_consumivel", rotulo: "R$/kg carbono" },
    // Peso-base do gás: vazio = usa o kg de consumível calculado acima —
    // mesma lógica, agora pro "tópico do gás".
    { chave: "solda_gas_peso_kg", rotulo: "Peso-base gás (kg)" },
    { chave: "solda_fator_gas_sobre_consumivel", rotulo: "% gás CO2" },
    { chave: "solda_preco_unidade_gas", rotulo: "R$/un. gás CO2" },
    // Inox é opt-in: 0 kg por padrão (não soma nada no custo), disponível
    // pra digitar quando a peça realmente levar solda inox — pedido
    // explícito do usuário, calibrado contra a planilha de referência
    // "INSUMOS DE SOLDA".
    { chave: "solda_inox_qtd_kg", rotulo: "kg inox (0 = não usa)" },
    { chave: "solda_inox_preco_kg_consumivel", rotulo: "R$/kg inox" },
    { chave: "solda_inox_fator_gas_sobre_consumivel", rotulo: "% gás Ar-CO2" },
    { chave: "solda_inox_preco_unidade_gas", rotulo: "R$/un. gás Ar-CO2" },
  ],
  pintura_material: [
    { chave: "pintura_fator_l_m2", rotulo: "L/m² por demão" },
    { chave: "pintura_preco_fundo", rotulo: "R$/L fundo" },
    { chave: "pintura_preco_acabamento", rotulo: "R$/L acabamento" },
  ],
  ndt: [{ chave: "ndt_valor_kg", rotulo: "R$/kg" }],
  engenharia: [{ chave: "engenharia_valor_unitario", rotulo: "R$/posição" }],
  embalagem: [
    { chave: "embalagem_valor_kg", rotulo: "R$/kg" },
    { chave: "embalagem_peso_kg", rotulo: "Peso (kg)" },
  ],
  transporte: [
    { chave: "transporte_valor_kg", rotulo: "R$/kg" },
    { chave: "transporte_peso_kg", rotulo: "Peso (kg)" },
  ],
  energia: [
    { chave: "energia_valor_kg", rotulo: "R$/kg" },
    { chave: "energia_peso_kg", rotulo: "Peso (kg)" },
  ],
};

function LinhaDeCusto({
  linha,
  parametros,
  pesoLiquidoKg,
  onEditar,
}: {
  linha: RespostaOrcamentoDePdf["orcamento"]["linhas"][number];
  parametros?: Record<string, number | null>;
  pesoLiquidoKg?: number;
  onEditar?: (overrides: Record<string, number | null>) => Promise<void>;
}) {
  const [aberta, setAberta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>({});
  // Pro campo continuar "derivado" (null) mesmo depois de editar outro
  // campo do mesmo box (ver bug abaixo): guarda, campo a campo, o texto do
  // valor derivado que foi mostrado na hora de abrir o "editar".
  const [padroesDerivados, setPadroesDerivados] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const camposParametro = PARAMS_POR_PROCESSO[linha.codigo];

  function valorPadraoPesoOpcional(chave: string): number | undefined {
    if (
      chave === "corte_peso_kg" || chave === "solda_peso_kg" || chave === "caldeiraria_peso_kg" ||
      chave === "embalagem_peso_kg" || chave === "transporte_peso_kg" || chave === "energia_peso_kg"
    ) {
      return pesoLiquidoKg;
    }
    if (chave === "solda_gas_peso_kg") {
      const pesoConsumivel = parametros?.solda_peso_kg ?? pesoLiquidoKg;
      const fatorConsumo = parametros?.solda_fator_consumo_percentual;
      if (pesoConsumivel == null || fatorConsumo == null) return undefined;
      return pesoConsumivel * fatorConsumo;
    }
    return undefined;
  }

  const CAMPOS_PESO_OPCIONAL = new Set([
    "corte_peso_kg", "solda_peso_kg", "solda_gas_peso_kg", "caldeiraria_peso_kg", "embalagem_peso_kg",
    "transporte_peso_kg", "energia_peso_kg",
  ]);

  function iniciarEdicao() {
    if (!camposParametro) return;
    const iniciais: Record<string, string> = {};
    const padroes: Record<string, string> = {};
    for (const campo of camposParametro) {
      const bruto = parametros?.[campo.chave];
      let atual = bruto;
      // Campos de peso opcionais (null = usa um peso derivado, ver
      // valorPadraoPesoOpcional) pré-preenchem com o valor efetivo em uso
      // hoje, em vez de deixar em branco — mas registra que é um valor
      // DERIVADO (não um override salvo), pra "salvarEdicao" saber que
      // não pode virar um número fixo se o campo não for tocado.
      if ((atual === null || atual === undefined) && CAMPOS_PESO_OPCIONAL.has(campo.chave)) {
        atual = valorPadraoPesoOpcional(campo.chave);
        padroes[campo.chave] = atual !== undefined && atual !== null ? String(atual) : "";
      }
      iniciais[campo.chave] = atual !== undefined && atual !== null ? String(atual) : "";
    }
    setValores(iniciais);
    setPadroesDerivados(padroes);
    setErro("");
    setEditando(true);
  }

  async function salvarEdicao() {
    if (!camposParametro || !onEditar) return;
    const overrides: Record<string, number | null> = {};
    for (const campo of camposParametro) {
      const bruto = (valores[campo.chave] ?? "").trim();
      if (CAMPOS_PESO_OPCIONAL.has(campo.chave)) {
        // Campo vazio = volta a usar o peso derivado (comportamento
        // padrão) em vez de travar num valor fixo.
        if (bruto === "") {
          overrides[campo.chave] = null;
          continue;
        }
        // Campo estava mostrando um valor DERIVADO (não um override) e o
        // usuário não mexeu nele — continua derivado. Sem isso, editar só
        // "Peso consumível (kg)" e deixar "Peso-base gás (kg)" como veio
        // congelava o gás no kg antigo em vez de recalcular a partir do
        // novo peso do consumível.
        if (campo.chave in padroesDerivados && bruto === padroesDerivados[campo.chave]) {
          overrides[campo.chave] = null;
          continue;
        }
      }
      const numero = Number(bruto.replace(",", "."));
      if (bruto === "" || Number.isNaN(numero)) {
        setErro(`Informe um valor numérico para "${campo.rotulo}".`);
        return;
      }
      overrides[campo.chave] = numero;
    }
    setSalvando(true);
    setErro("");
    try {
      await onEditar(overrides);
      setEditando(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar o valor ajustado.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="border-b border-slate-800 last:border-0">
      <div
        onClick={() => !editando && setAberta((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-4 py-3 text-left"
      >
        <div>
          <p className="font-medium text-slate-100">
            {NOMES_PROCESSO[linha.codigo] ?? linha.descricao}
          </p>
          {linha.horas !== null && (
            <p className="text-xs text-slate-500">{formatarNumero(linha.horas)} h</p>
          )}
        </div>
        {editando ? (
          <div
            className="flex flex-wrap items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {camposParametro?.map((campo) => (
              <label key={campo.chave} className="flex items-center gap-1">
                <span className="text-xs text-slate-500">{campo.rotulo}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valores[campo.chave] ?? ""}
                  onChange={(e) =>
                    setValores((v) => ({ ...v, [campo.chave]: e.target.value }))
                  }
                  className="w-20 rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-sm text-slate-100 outline-none focus:border-cyan-500"
                />
              </label>
            ))}
            <button
              type="button"
              onClick={salvarEdicao}
              disabled={salvando}
              className="rounded border border-cyan-500/40 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
            >
              {salvando ? "salvando…" : "salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              disabled={salvando}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              cancelar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-slate-100">
              {formatarMoeda(linha.valor_liquido)}
            </span>
            {onEditar && camposParametro && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  iniciarEdicao();
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300"
              >
                editar
              </button>
            )}
            <span className="text-xs text-cyan-400">{aberta ? "▲" : "▼"} Ver cálculo</span>
          </div>
        )}
      </div>
      {erro && <p className="pb-2 text-xs text-red-400">{erro}</p>}
      {aberta && !editando && (
        <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
          <ul className="list-inside list-disc space-y-1">
            {linha.memoria_calculo.map((m, i) => (
              <li key={i} className="font-mono">{m}</li>
            ))}
          </ul>
          {(linha.aliquota_icms > 0 || linha.aliquota_pis_cofins > 0) && (
            <p className="mt-2">
              Bruto {formatarMoeda(linha.valor_bruto)} − ICMS{" "}
              {formatarPercentual(linha.aliquota_icms)} − PIS/COFINS{" "}
              {formatarPercentual(linha.aliquota_pis_cofins)} = líquido{" "}
              {formatarMoeda(linha.valor_liquido)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  resultado: RespostaOrcamentoDePdf;
  // Ajusta um ou mais parâmetros (R$/kg, R$/h etc.) que alimentam a fórmula
  // de uma linha do "Custo por processo" e recalcula o orçamento no backend
  // — a fórmula em si fica fixa, só o valor do parâmetro muda. Ver
  // page.tsx::handleEditarLinhaCusto e app/orcamento.py::resolver_params.
  onEditarLinhaCusto?: (overrides: Record<string, number | null>) => Promise<void>;
}

export default function ResultadoOrcamento({ resultado, onEditarLinhaCusto }: Props) {
  const { extracao, itens_para_revisao, orcamento } = resultado;
  const pesoBrutoCalculado =
    typeof resultado.entrada.peso_bruto_calculado_kg === "number"
      ? resultado.entrada.peso_bruto_calculado_kg
      : orcamento.comercial.peso_liquido_kg;

  return (
    <div className="flex flex-col gap-6">
      {onEditarLinhaCusto && (
        <PainelPesoBase
          pesoBrutoCalculado={pesoBrutoCalculado}
          pesoEfetivo={orcamento.comercial.peso_liquido_kg}
          onAplicar={onEditarLinhaCusto}
        />
      )}

      {/* Identificação do cliente virou um painel próprio, sempre visível
          no topo da página (page.tsx), preenchido manualmente/por CNPJ —
          pedido explícito do usuário. Aqui sobra só o resumo técnico da
          extração do PDF (páginas/OCR/BOM), e só quando veio de PDF de
          verdade (cálculo manual não tem nada disso pra mostrar). */}
      {extracao.paginas_total > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-white">Extração do desenho</h2>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>Confiança geral</span>
              <Confianca valor={extracao.confianca_geral} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {extracao.paginas_total} página(s) — {extracao.paginas_com_texto_nativo} com texto
            nativo, {extracao.paginas_via_ocr} via OCR · {extracao.bom_itens_extraidos} item(ns) de
            BOM extraído(s)
          </p>
        </section>
      )}

      {itens_para_revisao.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <h2 className="mb-2 font-semibold text-amber-300">
            Itens para revisão ({itens_para_revisao.length})
          </h2>
          <ul className="space-y-1 text-sm text-amber-200/90">
            {itens_para_revisao.map((item, i) => (
              <li key={i}>
                {item.item_numero && <span className="font-medium">Item {item.item_numero}: </span>}
                {item.motivo}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-2 font-semibold text-white">
          Custo por processo
        </h2>
        <div>
          {orcamento.linhas.map((linha) => (
            <LinhaDeCusto
              key={linha.codigo}
              linha={linha}
              parametros={orcamento.parametros ?? resultado.parametros}
              pesoLiquidoKg={orcamento.comercial.peso_liquido_kg}
              onEditar={onEditarLinhaCusto}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border-2 border-cyan-500/40 bg-slate-900/60 p-5 shadow-[0_0_40px_-15px_rgba(34,211,238,0.4)]">
        <h2 className="mb-4 font-semibold text-white">Resumo comercial</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Peso líquido</dt>
            <dd className="font-medium text-slate-100">{formatarNumero(orcamento.comercial.peso_liquido_kg)} kg</dd>
          </div>
          <div>
            <dt className="text-slate-500">Custo industrial</dt>
            <dd className="font-medium text-slate-100">{formatarMoeda(orcamento.comercial.custo_industrial)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Margem</dt>
            <dd className="font-medium text-slate-100">
              {formatarMoeda(orcamento.comercial.margem_lucro)} (
              {formatarPercentual(orcamento.comercial.margem_percentual)})
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Impostos</dt>
            <dd className="font-medium text-slate-100">{formatarMoeda(orcamento.comercial.imposto_a_pagar)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Venda (s/ impostos)</dt>
            <dd className="font-medium text-slate-100">
              {formatarMoeda(orcamento.comercial.preco_venda_sem_impostos)}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-slate-500">R$/kg</dt>
            <dd className="font-medium text-slate-100">{formatarMoeda(orcamento.comercial.preco_venda_por_kg)}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t border-slate-800 pt-4">
          <span className="text-slate-400">Preço de venda (c/ impostos)</span>
          <span className="text-2xl font-bold text-cyan-400">
            {formatarMoeda(orcamento.comercial.preco_venda_com_impostos)}
          </span>
        </div>
      </section>
    </div>
  );
}
