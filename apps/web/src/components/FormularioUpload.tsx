"use client";

import { useState, type DragEvent } from "react";
import CalculoManual from "@/components/CalculoManual";
import PainelItensOrcamento from "@/components/PainelItensOrcamento";
import PainelProposta from "@/components/PainelProposta";
import ExtracaoPedidos from "@/components/ExtracaoPedidos";
import ReferenciaPrecosMP from "@/components/ReferenciaPrecosMP";
import OrcamentosSalvos from "@/components/OrcamentosSalvos";
import RelatorioTecnicoIA from "@/components/RelatorioTecnicoIA";
import type { ItemEstruturadoIA } from "@/lib/api";
import type {
  EstadoCalculoManual,
  EstimativasOrcamento,
  IdentificacaoCliente,
  OrcamentoSalvoCompleto,
  PropostaConfig,
  RespostaOrcamentoDePdf,
} from "@/lib/types";

export type ModoFormulario =
  | "arquivo"
  | "extracaoPedidos"
  | "manual"
  | "itens"
  | "proposta"
  | "referencia"
  | "salvos";

interface Props {
  modo: ModoFormulario;
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
  // Aba "PROPOSTA" — precisa do resultado calculado (preço/peso), do MAC
  // (nome do orçamento salvo) e da identificação do cliente pra
  // auto-preencher; a config em si vive em page.tsx (persiste junto do
  // orçamento salvo, ver PropostaConfig).
  mac: string;
  resultado: RespostaOrcamentoDePdf | null;
  identificacaoCliente: IdentificacaoCliente;
  propostaConfig: PropostaConfig | null;
  onPropostaConfigChange: (proposta: PropostaConfig) => void;
  onGerarPdfProposta: () => void;
  // "Anexar desenho" — pedido explícito do usuário: vincula o PDF ao
  // orçamento salvo só quando esse botão é clicado (nunca automático na
  // extração). Ver RelatorioTecnicoIA.tsx.
  onAnexarDesenho: (arquivo: File) => void;
  anexandoDesenho: boolean;
  desenhosAnexados: string[];
}

export default function FormularioUpload({
  modo,
  carregando,
  onAnalisar,
  onResultadoManual,
  onErroManual,
  estadoManual,
  onEstadoManualChange,
  onAbrirSalvo,
  pesoLiquidoManualAtivo,
  onItensEstruturadosChange,
  mac,
  resultado,
  identificacaoCliente,
  propostaConfig,
  onPropostaConfigChange,
  onGerarPdfProposta,
  onAnexarDesenho,
  anexandoDesenho,
  desenhosAnexados,
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
          resultado={resultado}
        />
      )}

      {modo === "proposta" && (
        <PainelProposta
          mac={mac}
          resultado={resultado}
          identificacaoCliente={identificacaoCliente}
          proposta={propostaConfig}
          onPropostaChange={onPropostaConfigChange}
          onGerarPdf={onGerarPdfProposta}
        />
      )}

      {modo === "extracaoPedidos" && <ExtracaoPedidos />}

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
          onAnexarDesenho={onAnexarDesenho}
          anexandoDesenho={anexandoDesenho}
          desenhosAnexados={desenhosAnexados}
        />
      )}

    </form>
  );
}
