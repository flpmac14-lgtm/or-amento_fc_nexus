"use client";

import { useEffect, useState } from "react";
import { analisarBom, buscarCatalogoGeometria, calcularPesoGeometria } from "@/lib/api";
import { formatarNumero } from "@/lib/format";
import type {
  CatalogoGeometria,
  EstimativasOrcamento,
  ItemCalculado,
  RespostaOrcamentoDePdf,
} from "@/lib/types";

interface Props {
  onResultado: (resultado: RespostaOrcamentoDePdf, nomeArquivo: string) => void;
  onErro: (mensagem: string) => void;
}

const DENSIDADES_COMUNS: { rotulo: string; valor: number }[] = [
  { rotulo: "Aço carbono (7850)", valor: 7850 },
  { rotulo: "Aço inox (8000)", valor: 8000 },
  { rotulo: "Alumínio (2700)", valor: 2700 },
];

export default function CalculoManual({ onResultado, onErro }: Props) {
  const [catalogo, setCatalogo] = useState<CatalogoGeometria | null>(null);
  const [tipoAberto, setTipoAberto] = useState<string | null>(null);
  const [medidas, setMedidas] = useState<Record<string, string>>({});
  const [quantidade, setQuantidade] = useState("1");
  const [norma, setNorma] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [resultadoCalculo, setResultadoCalculo] = useState<{ peso_kg: number; memoria_calculo: string } | null>(null);

  const [posicoes, setPosicoes] = useState<string[]>(["Item 1"]);
  const [posicaoEscolhida, setPosicaoEscolhida] = useState("Item 1");
  const [novaPosicao, setNovaPosicao] = useState("");

  const [itens, setItens] = useState<ItemCalculado[]>([]);
  const [cenarioComercial, setCenarioComercial] =
    useState<EstimativasOrcamento["cenario_comercial"]>("venda_fabricacao");
  const [analisando, setAnalisando] = useState(false);

  useEffect(() => {
    buscarCatalogoGeometria()
      .then(setCatalogo)
      .catch((e) => onErro(e instanceof Error ? e.message : "Erro ao carregar os tipos de geometria."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirCartao(tipo: string) {
    setTipoAberto(tipo);
    setMedidas({});
    setResultadoCalculo(null);
  }

  async function calcularPeso() {
    if (!tipoAberto || !catalogo) return;
    const campos = catalogo[tipoAberto].campos;
    const faltando = campos.some((c) => !medidas[c.chave]);
    if (faltando) {
      onErro("Preencha todas as medidas antes de calcular.");
      return;
    }
    setCalculando(true);
    try {
      const medidasNumericas = Object.fromEntries(
        campos.map((c) => [c.chave, Number(medidas[c.chave].replace(",", "."))]),
      );
      const r = await calcularPesoGeometria(tipoAberto, medidasNumericas, Number(quantidade.replace(",", ".")) || 1);
      setResultadoCalculo(r);
      onErro("");
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Erro ao calcular o peso.");
    } finally {
      setCalculando(false);
    }
  }

  function adicionarNaPosicao() {
    if (!tipoAberto || !catalogo || !resultadoCalculo) return;
    const posicao = posicaoEscolhida.trim() || "Item 1";
    if (!posicoes.includes(posicao)) setPosicoes((p) => [...p, posicao]);

    setItens((atuais) => [
      ...atuais,
      {
        posicao,
        tipo: tipoAberto,
        tipoRotulo: catalogo[tipoAberto].rotulo,
        descricao: catalogo[tipoAberto].rotulo,
        norma: norma.trim(),
        quantidade: Number(quantidade.replace(",", ".")) || 1,
        peso_kg: resultadoCalculo.peso_kg,
        memoria_calculo: resultadoCalculo.memoria_calculo,
      },
    ]);

    setTipoAberto(null);
    setResultadoCalculo(null);
    setMedidas({});
    setNorma("");
    setQuantidade("1");
  }

  function removerItem(indice: number) {
    setItens((atuais) => atuais.filter((_, i) => i !== indice));
  }

  function criarPosicao() {
    const nome = novaPosicao.trim();
    if (!nome || posicoes.includes(nome)) return;
    setPosicoes((p) => [...p, nome]);
    setPosicaoEscolhida(nome);
    setNovaPosicao("");
  }

  async function calcularOrcamento() {
    if (itens.length === 0) return;
    setAnalisando(true);
    try {
      const r = await analisarBom(itens, { cenario_comercial: cenarioComercial, usar_historico_horas: false });
      onResultado(r, `cálculo manual (${itens.length} ${itens.length === 1 ? "item" : "itens"})`);
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Erro ao calcular o orçamento.");
    } finally {
      setAnalisando(false);
    }
  }

  const pesoTotal = itens.reduce((soma, i) => soma + i.peso_kg, 0);
  const itensPorPosicao = posicoes
    .map((p) => ({ posicao: p, itens: itens.filter((i) => i.posicao === p) }))
    .filter((g) => g.itens.length > 0);

  if (!catalogo) {
    return <p className="text-sm text-slate-500">Carregando tipos de geometria…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 text-sm text-slate-400">
          Escolha o tipo de peça, informe as medidas e adicione à posição/item do orçamento — um
          orçamento pode ter várias posições, cada uma com várias peças.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {Object.entries(catalogo).map(([tipo, def]) => (
            <button
              key={tipo}
              type="button"
              onClick={() => abrirCartao(tipo)}
              className={`rounded-lg border p-3 text-left text-xs font-medium transition-colors ${
                tipoAberto === tipo
                  ? "border-cyan-400 bg-cyan-500/15 text-cyan-300"
                  : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              {def.rotulo}
            </button>
          ))}
        </div>
      </div>

      {tipoAberto && (
        <div className="rounded-xl border border-cyan-500/30 bg-slate-900/60 p-4">
          <h3 className="mb-3 font-semibold text-white">{catalogo[tipoAberto].rotulo}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {catalogo[tipoAberto].campos.map((campo) => (
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
            {catalogo[tipoAberto].campos.some((c) => c.chave === "densidade_kg_m3") && (
              <label className="flex flex-col gap-1 text-xs sm:col-span-3">
                <span className="text-slate-400">Densidades comuns</span>
                <div className="flex flex-wrap gap-1">
                  {DENSIDADES_COMUNS.map((d) => (
                    <button
                      key={d.valor}
                      type="button"
                      onClick={() => setMedidas((m) => ({ ...m, densidade_kg_m3: String(d.valor) }))}
                      className="rounded border border-slate-700 px-2 py-1 text-slate-400 hover:border-cyan-500 hover:text-cyan-300"
                    >
                      {d.rotulo}
                    </button>
                  ))}
                </div>
              </label>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-400">Norma/material (opcional)</span>
              <input
                type="text"
                value={norma}
                onChange={(e) => setNorma(e.target.value)}
                placeholder="ex: ASTM A36"
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
          </div>

          <button
            type="button"
            onClick={calcularPeso}
            disabled={calculando}
            className="mt-3 rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
          >
            {calculando ? "Calculando…" : "Calcular peso"}
          </button>

          {resultadoCalculo && (
            <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm">
              <p className="font-mono text-slate-300">{resultadoCalculo.memoria_calculo}</p>
              <p className="mt-1 font-semibold text-cyan-300">
                Peso: {formatarNumero(resultadoCalculo.peso_kg, 3)} kg
              </p>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-400">Adicionar à posição/item</span>
                  <select
                    value={posicaoEscolhida}
                    onChange={(e) => setPosicaoEscolhida(e.target.value)}
                    className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
                  >
                    {posicoes.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <input
                  type="text"
                  value={novaPosicao}
                  onChange={(e) => setNovaPosicao(e.target.value)}
                  placeholder="nova posição…"
                  className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={criarPosicao}
                  className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-300 hover:border-cyan-500 hover:text-cyan-300"
                >
                  + criar
                </button>
                <button
                  type="button"
                  onClick={adicionarNaPosicao}
                  className="ml-auto rounded-md bg-cyan-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-cyan-400"
                >
                  Adicionar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {itens.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="mb-3 font-semibold text-white">
            Itens calculados — {formatarNumero(pesoTotal, 2)} kg total
          </h3>
          <div className="flex flex-col gap-3">
            {itensPorPosicao.map((grupo) => (
              <div key={grupo.posicao}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-cyan-400">
                  {grupo.posicao}
                </p>
                <ul className="divide-y divide-slate-800 rounded-md border border-slate-800">
                  {grupo.itens.map((item) => {
                    const indiceGlobal = itens.indexOf(item);
                    return (
                      <li key={indiceGlobal} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="text-slate-300">
                          {item.tipoRotulo}
                          {item.norma && <span className="text-slate-500"> · {item.norma}</span>}
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="font-mono text-slate-100">{formatarNumero(item.peso_kg, 2)} kg</span>
                          <button
                            type="button"
                            onClick={() => removerItem(indiceGlobal)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            remover
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-400">Cenário comercial</span>
              <select
                value={cenarioComercial}
                onChange={(e) => setCenarioComercial(e.target.value as EstimativasOrcamento["cenario_comercial"])}
                className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
              >
                <option value="venda_fabricacao">Venda de fabricação</option>
                <option value="industrializacao">Industrialização</option>
                <option value="servico">Serviço</option>
              </select>
            </label>
            <button
              type="button"
              onClick={calcularOrcamento}
              disabled={analisando}
              className="ml-auto rounded-md bg-cyan-500 px-4 py-2 font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:opacity-50"
            >
              {analisando ? "Calculando orçamento…" : "Calcular orçamento"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
