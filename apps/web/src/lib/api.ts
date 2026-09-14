import type { EstimativasOrcamento, RespostaOrcamentoDePdf } from "./types";

const CALC_ENGINE_URL =
  process.env.NEXT_PUBLIC_CALC_ENGINE_URL ?? "http://localhost:8002";

export async function analisarPdf(
  arquivo: File,
  estimativas: EstimativasOrcamento,
): Promise<RespostaOrcamentoDePdf> {
  const params = new URLSearchParams();
  params.set("cenario_comercial", estimativas.cenario_comercial);
  params.set("usar_historico_horas", String(estimativas.usar_historico_horas));
  if (estimativas.peso_liquido_kg !== undefined) {
    params.set("peso_liquido_kg", String(estimativas.peso_liquido_kg));
  }
  if (estimativas.area_pintura_m2 !== undefined) {
    params.set("area_pintura_m2", String(estimativas.area_pintura_m2));
  }
  if (estimativas.quantidade_posicoes_engenharia !== undefined) {
    params.set(
      "quantidade_posicoes_engenharia",
      String(estimativas.quantidade_posicoes_engenharia),
    );
  }

  const formData = new FormData();
  formData.set("file", arquivo);

  const resposta = await fetch(
    `${CALC_ENGINE_URL}/orcamento-de-pdf?${params.toString()}`,
    { method: "POST", body: formData },
  );

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao analisar o PDF (${resposta.status}). ${corpo || "Verifique se os serviços estão rodando."}`,
    );
  }

  return resposta.json();
}
