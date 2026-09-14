"use client";

import { useState, type DragEvent } from "react";
import type { EstimativasOrcamento } from "@/lib/types";

interface Props {
  carregando: boolean;
  onAnalisar: (arquivo: File, estimativas: EstimativasOrcamento) => void;
}

export default function FormularioUpload({ carregando, onAnalisar }: Props) {
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
    if (!arquivo) return;
    onAnalisar(arquivo, {
      cenario_comercial: cenarioComercial,
      usar_historico_horas: usarHistorico,
      peso_liquido_kg: pesoLiquidoKg ? Number(pesoLiquidoKg) : undefined,
      area_pintura_m2: areaPinturaM2 ? Number(areaPinturaM2) : undefined,
      quantidade_posicoes_engenharia: qtdPosicoesEngenharia
        ? Number(qtdPosicoesEngenharia)
        : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-zinc-300 dark:border-zinc-700"
        }`}
      >
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Arraste o desenho técnico (PDF) aqui, ou
        </p>
        <label className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
          Escolher arquivo
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => selecionarArquivo(e.target.files)}
          />
        </label>
        {arquivo && (
          <p className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {arquivo.name}
          </p>
        )}
      </div>

      <details className="rounded-lg border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <summary className="cursor-pointer font-medium text-zinc-800 dark:text-zinc-200">
          Estimativas manuais (o que o desenho ainda não dá pra calcular sozinho)
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-zinc-600 dark:text-zinc-400">Peso líquido (kg)</span>
            <input
              type="number"
              step="0.01"
              value={pesoLiquidoKg}
              onChange={(e) => setPesoLiquidoKg(e.target.value)}
              placeholder="ex: 3319"
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-600 dark:text-zinc-400">Área de pintura (m²)</span>
            <input
              type="number"
              step="0.01"
              value={areaPinturaM2}
              onChange={(e) => setAreaPinturaM2(e.target.value)}
              placeholder="ex: 83"
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-600 dark:text-zinc-400">Posições de engenharia</span>
            <input
              type="number"
              value={qtdPosicoesEngenharia}
              onChange={(e) => setQtdPosicoesEngenharia(e.target.value)}
              placeholder="ex: 38"
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-zinc-600 dark:text-zinc-400">Cenário comercial</span>
            <select
              value={cenarioComercial}
              onChange={(e) =>
                setCenarioComercial(e.target.value as EstimativasOrcamento["cenario_comercial"])
              }
              className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
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
            />
            <span className="text-zinc-600 dark:text-zinc-400">
              Combinar horas de caldeiraria com o histórico Macfab (camada 2)
            </span>
          </label>
        </div>
      </details>

      <button
        type="submit"
        disabled={!arquivo || carregando}
        className="rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {carregando ? "Analisando…" : "Analisar desenho"}
      </button>
    </form>
  );
}
