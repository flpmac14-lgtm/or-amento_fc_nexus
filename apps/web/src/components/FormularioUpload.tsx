"use client";

import { useState, type DragEvent } from "react";
import CalculoManual from "@/components/CalculoManual";
import PainelItensOrcamento from "@/components/PainelItensOrcamento";
import ReferenciaPrecosMP from "@/components/ReferenciaPrecosMP";
import OrcamentosSalvos from "@/components/OrcamentosSalvos";
import RelatorioTecnicoIA from "@/components/RelatorioTecnicoIA";
import type { ItemEstruturadoIA } from "@/lib/api";
import type {
  EstadoCalculoManual,
  EstimativasOrcamento,
  OrcamentoSalvoCompleto,
  RespostaOrcamentoDePdf,
} from "@/lib/types";

export type ModoFormulario = "arquivo" | "manual" | "itens" | "referencia" | "salvos";

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
  onItensEstruturadosChange: (itens: ItemEstruturadoIA[]) => void;
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
  onItensEstruturadosChange,
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
      <div className="flex gap-1 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-1 text-sm">
        <button
          type="button"
          onClick={() => setModo("arquivo")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "arquivo" ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950" : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
          }`}
        >
          Enviar desenho (PDF)
        </button>
        <button
          type="button"
          onClick={() => setModo("manual")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "manual" ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950" : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
          }`}
        >
          Cálculo manual
        </button>
        <button
          type="button"
          onClick={() => setModo("itens")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "itens" ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950" : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
          }`}
        >
          Itens do orçamento
        </button>
        <button
          type="button"
          onClick={() => setModo("referencia")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "referencia" ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950" : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
          }`}
        >
          Referência de preços
        </button>
        <button
          type="button"
          onClick={() => setModo("salvos")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "salvos" ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950" : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
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

      {modo === "itens" && (
        <PainelItensOrcamento
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
              ? "border-green-500 dark:border-cyan-400 bg-green-600/10 dark:bg-cyan-500/10"
              : "border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900/40"
          }`}
        >
          <p className="text-sm text-stone-600 dark:text-slate-400">
            Arraste o desenho técnico (PDF) aqui, ou
          </p>
          <label className="cursor-pointer rounded-md bg-green-600 dark:bg-cyan-500 px-4 py-2 text-sm font-medium text-white dark:text-slate-950 transition-colors hover:bg-green-500 dark:hover:bg-cyan-400">
            Escolher arquivo
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => selecionarArquivo(e.target.files)}
            />
          </label>
          {arquivo && (
            <p className="mt-2 text-sm font-medium text-stone-900 dark:text-slate-100">
              {arquivo.name}
            </p>
          )}
        </div>
      )}

      {modo === "arquivo" && (
        <RelatorioTecnicoIA
          arquivo={arquivo}
          onItensEstruturadosChange={onItensEstruturadosChange}
        />
      )}

    </form>
  );
}
