"use client";

import { useState, type DragEvent } from "react";
import CalculoManual from "@/components/CalculoManual";
import ReferenciaPrecosMP from "@/components/ReferenciaPrecosMP";
import OrcamentosSalvos from "@/components/OrcamentosSalvos";
import RelatorioTecnicoIA from "@/components/RelatorioTecnicoIA";
import type {
  EstadoCalculoManual,
  EstimativasOrcamento,
  OrcamentoSalvoCompleto,
  RespostaOrcamentoDePdf,
} from "@/lib/types";

export type ModoFormulario = "arquivo" | "manual" | "referencia" | "salvos";

interface Props {
  modo: ModoFormulario;
  setModo: (modo: ModoFormulario) => void;
  carregando: boolean;
  onAnalisar: (arquivo: File, estimativas: EstimativasOrcamento) => void;
  onResultadoManual: (resultado: RespostaOrcamentoDePdf, nomeArquivo: string) => void;
  onErroManual: (mensagem: string) => void;
  estadoManual: EstadoCalculoManual;
  onEstadoManualChange: (atualizacao: Partial<EstadoCalculoManual>) => void;
  onAbrirSalvo: (salvo: OrcamentoSalvoCompleto) => void;
  // Peso líquido manual aplicado via PainelPesoBase (null = usando o peso
  // bruto calculado) — repassado pro Cálculo manual pra ele NÃO perder
  // esse override toda vez que recalcula sozinho ao adicionar/editar um
  // item (bug relatado pelo usuário: aplicar o líquido e o resumo voltar
  // pro bruto depois de qualquer interação em Cálculo manual).
  pesoLiquidoManualAtivo: number | null;
}

export default function FormularioUpload({
  modo,
  setModo,
  carregando,
  onAnalisar,
  onResultadoManual,
  onErroManual,
  estadoManual,
  onEstadoManualChange,
  onAbrirSalvo,
  pesoLiquidoManualAtivo,
}: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [pesoLiquidoKg, setPesoLiquidoKg] = useState("");
  const [areaPinturaM2, setAreaPinturaM2] = useState("");
  const [qtdPosicoesEngenharia, setQtdPosicoesEngenharia] = useState("");
  const [cenarioComercial, setCenarioComercial] =
    useState<EstimativasOrcamento["cenario_comercial"]>("venda_fabricacao");
  const [usarHistorico, setUsarHistorico] = useState(false);

  function selecionarArquivo(lista: FileList | null) {
    const f = lista?.[0];
    if (f && f.name.toLowerCase().endsWith(".pdf")) {
      setArquivo(f);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (modo !== "arquivo") return; // cada uma das outras abas cuida do próprio fluxo
    if (!arquivo) return;
    const estimativas: EstimativasOrcamento = {
      cenario_comercial: cenarioComercial,
      usar_historico_horas: usarHistorico,
      peso_liquido_kg: pesoLiquidoKg ? Number(pesoLiquidoKg) : undefined,
      area_pintura_m2: areaPinturaM2 ? Number(areaPinturaM2) : undefined,
      quantidade_posicoes_engenharia: qtdPosicoesEngenharia
        ? Number(qtdPosicoesEngenharia)
        : undefined,
    };
    onAnalisar(arquivo, estimativas);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/40 p-1 text-sm">
        <button
          type="button"
          onClick={() => setModo("arquivo")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "arquivo" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Enviar desenho (PDF)
        </button>
        <button
          type="button"
          onClick={() => setModo("manual")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "manual" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Cálculo manual
        </button>
        <button
          type="button"
          onClick={() => setModo("referencia")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "referencia" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Referência de preços
        </button>
        <button
          type="button"
          onClick={() => setModo("salvos")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "salvos" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Orçamentos salvos
        </button>
      </div>

      {modo === "manual" && (
        <CalculoManual
          estado={estadoManual}
          onEstadoChange={onEstadoManualChange}
          onResultado={onResultadoManual}
          onErro={onErroManual}
          pesoLiquidoManualAtivo={pesoLiquidoManualAtivo}
        />
      )}

      {modo === "referencia" && <ReferenciaPrecosMP />}

      {modo === "salvos" && <OrcamentosSalvos onAbrir={onAbrirSalvo} />}

      {modo === "arquivo" && (
        <div
          onDragOver={(e: DragEvent) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e: DragEvent) => {
            e.preventDefault();
            setArrastando(false);
            selecionarArquivo(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
            arrastando
              ? "border-cyan-400 bg-cyan-500/10"
              : "border-slate-700 bg-slate-900/40"
          }`}
        >
          <p className="text-sm text-slate-400">
            Arraste o desenho técnico (PDF) aqui, ou
          </p>
          <label className="cursor-pointer rounded-md bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-cyan-400">
            Escolher arquivo
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => selecionarArquivo(e.target.files)}
            />
          </label>
          {arquivo && (
            <p className="mt-2 text-sm font-medium text-slate-100">
              {arquivo.name}
            </p>
          )}
        </div>
      )}

      {modo === "arquivo" && <RelatorioTecnicoIA arquivo={arquivo} />}

      {modo === "arquivo" && (
      <details className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-slate-200">
          Estimativas manuais (o que ainda não dá pra calcular sozinho)
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Peso líquido (kg)</span>
            <input
              type="number"
              step="0.01"
              value={pesoLiquidoKg}
              onChange={(e) => setPesoLiquidoKg(e.target.value)}
              placeholder="ex: 3319"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Área de pintura (m²)</span>
            <input
              type="number"
              step="0.01"
              value={areaPinturaM2}
              onChange={(e) => setAreaPinturaM2(e.target.value)}
              placeholder="ex: 83"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Posições de engenharia</span>
            <input
              type="number"
              value={qtdPosicoesEngenharia}
              onChange={(e) => setQtdPosicoesEngenharia(e.target.value)}
              placeholder="ex: 38"
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Cenário comercial</span>
            <select
              value={cenarioComercial}
              onChange={(e) =>
                setCenarioComercial(e.target.value as EstimativasOrcamento["cenario_comercial"])
              }
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            >
              <option value="venda_fabricacao">Venda de fabricação</option>
              <option value="industrializacao">Industrialização</option>
              <option value="servico">Serviço</option>
            </select>
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={usarHistorico}
              onChange={(e) => setUsarHistorico(e.target.checked)}
              className="accent-cyan-500"
            />
            <span className="text-slate-400">
              Combinar horas de caldeiraria com o histórico Macfab (camada 2)
            </span>
          </label>
        </div>
      </details>
      )}

      {modo === "arquivo" && (
        <button
          type="submit"
          disabled={!arquivo || carregando}
          className="rounded-md bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {carregando ? "Analisando…" : "Analisar desenho"}
        </button>
      )}
    </form>
  );
}
