import { useEffect, useRef, useState } from "react";
import { analisarBom } from "./api";
import type { EstadoCalculoManual, RespostaOrcamentoDePdf } from "./types";

interface Props {
  estado: EstadoCalculoManual;
  onResultado: (resultado: RespostaOrcamentoDePdf, nomeArquivo: string) => void;
  onErro: (mensagem: string) => void;
  // Peso líquido manual aplicado via PainelPesoBase (null = peso bruto
  // calculado) — precisa ir em toda chamada, senão o auto-cálculo
  // recalcula do zero e perde o override, voltando pro peso bruto sozinho.
  pesoLiquidoManualAtivo: number | null;
}

// Extraído de CalculoManual.tsx pra ser reaproveitado por qualquer tela que
// edite `estado.itens` (ex.: PainelItensOrcamento, a aba "Itens do
// orçamento" em tela cheia) — cada uma só fica montada enquanto sua aba
// está ativa, então precisam do mesmo auto-recálculo, não só a Cálculo
// manual. Duplicar esse hook em vez de compartilhar arriscava as duas
// telas divergirem (ex.: uma esquecer pesoLiquidoManualAtivo).
export function useAutoCalculoOrcamento({ estado, onResultado, onErro, pesoLiquidoManualAtivo }: Props) {
  const {
    itens, itensComerciais, insumosPintura, operacoesUsinagem, servicosTerceiros, tratamentoTermico,
    contingenciamento, ndtItens, engenhariaItens, cenarioComercial, corteValorKg,
  } = estado;

  const [analisando, setAnalisando] = useState(false);

  const totalItens =
    itens.length + itensComerciais.length + insumosPintura.length + operacoesUsinagem.length +
    servicosTerceiros.length + tratamentoTermico.length + contingenciamento.length + ndtItens.length +
    engenhariaItens.length;

  // Token da última chamada disparada — evita que a resposta de um cálculo
  // mais antigo (rede lenta) sobrescreva o resultado de um mais novo.
  const tokenCalculoRef = useRef(0);

  async function calcularOrcamento() {
    if (totalItens === 0) return;
    const token = ++tokenCalculoRef.current;
    setAnalisando(true);
    try {
      const r = await analisarBom(
        itens, itensComerciais, insumosPintura, operacoesUsinagem, servicosTerceiros, tratamentoTermico,
        contingenciamento, ndtItens, engenhariaItens,
        {
          cenario_comercial: cenarioComercial,
          usar_historico_horas: false,
          corte_valor_kg: Number(corteValorKg.replace(",", ".")) || undefined,
          peso_liquido_kg: pesoLiquidoManualAtivo ?? undefined,
        },
      );
      if (token !== tokenCalculoRef.current) return;
      onResultado(r, `cálculo manual (${totalItens} ${totalItens === 1 ? "item" : "itens"})`);
    } catch (e) {
      if (token !== tokenCalculoRef.current) return;
      onErro(e instanceof Error ? e.message : "Erro ao calcular o orçamento.");
    } finally {
      if (token === tokenCalculoRef.current) setAnalisando(false);
    }
  }

  // Pedido explícito do usuário: recalcular sozinho conforme ele vai
  // adicionando/editando itens, sem precisar apertar um botão toda vez.
  // Debounce de 600ms pra não disparar uma chamada por tecla digitada nem
  // uma por item quando várias mudanças acontecem em sequência rápida.
  useEffect(() => {
    if (totalItens === 0) return;
    const timer = setTimeout(() => {
      calcularOrcamento();
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    itens, itensComerciais, insumosPintura, operacoesUsinagem, servicosTerceiros, tratamentoTermico,
    contingenciamento, ndtItens, engenhariaItens, cenarioComercial, corteValorKg, pesoLiquidoManualAtivo,
  ]);

  return { calcularOrcamento, analisando, totalItens };
}
