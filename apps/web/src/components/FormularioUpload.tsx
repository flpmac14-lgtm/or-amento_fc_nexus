"use client";

import { useState, type DragEvent } from "react";
import type { EstimativasOrcamento } from "@/lib/types";

interface Props {
  carregando: boolean;
  onAnalisar: (arquivo: File, estimativas: EstimativasOrcamento) => void;
  onAnalisarTexto: (texto: string, estimativas: EstimativasOrcamento) => void;
}

const PLACEHOLDER_TEXTO = `CHAPA 1000 x 500 x 25 ASTM A36 qtd 2
BARRA REDONDA Ø100 x 500 SAE 1020
PERFIL W310x52 comprimento 4750 ASTM A36`;

export default function FormularioUpload({ carregando, onAnalisar, onAnalisarTexto }: Props) {
  const [modo, setModo] = useState<"arquivo" | "texto">("arquivo");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [texto, setTexto] = useState("");
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
    const estimativas: EstimativasOrcamento = {
      cenario_comercial: cenarioComercial,
      usar_historico_horas: usarHistorico,
      peso_liquido_kg: pesoLiquidoKg ? Number(pesoLiquidoKg) : undefined,
      area_pintura_m2: areaPinturaM2 ? Number(areaPinturaM2) : undefined,
      quantidade_posicoes_engenharia: qtdPosicoesEngenharia
        ? Number(qtdPosicoesEngenharia)
        : undefined,
    };
    if (modo === "arquivo") {
      if (!arquivo) return;
      onAnalisar(arquivo, estimativas);
    } else {
      if (!texto.trim()) return;
      onAnalisarTexto(texto, estimativas);
    }
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
          onClick={() => setModo("texto")}
          className={`flex-1 rounded-md py-2 font-medium transition-colors ${
            modo === "texto" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Digitar itens
        </button>
      </div>

      {modo === "arquivo" ? (
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
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-400">
              Um item por linha — a IA não calcula nada aqui, é o mesmo motor determinístico
              lendo o texto direto.
            </span>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={PLACEHOLDER_TEXTO}
              rows={7}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-cyan-500"
            />
          </label>
          <p className="text-xs text-slate-500">
            Formatos aceitos: <code className="text-slate-400">CHAPA C x L x E &lt;norma&gt;</code>,{" "}
            <code className="text-slate-400">BARRA REDONDA DD x C &lt;norma&gt;</code> (D ou Ø, tanto faz),{" "}
            <code className="text-slate-400">PERFIL &lt;designação&gt; comprimento C &lt;norma&gt;</code>{" "}
            — adicione <code className="text-slate-400">qtd N</code> no fim se for mais de 1.
          </p>
        </div>
      )}

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

      <button
        type="submit"
        disabled={(modo === "arquivo" ? !arquivo : !texto.trim()) || carregando}
        className="rounded-md bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {carregando ? "Analisando…" : modo === "arquivo" ? "Analisar desenho" : "Analisar itens"}
      </button>
    </form>
  );
}
