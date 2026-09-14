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

export async function baixarExcel(entrada: Record<string, unknown>): Promise<void> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/orcamento/excel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao gerar o Excel (${resposta.status}). ${corpo || "Verifique se os serviços estão rodando."}`,
    );
  }

  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "orcamento.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function analisarTexto(
  texto: string,
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
  formData.set("texto", texto);

  const resposta = await fetch(
    `${CALC_ENGINE_URL}/orcamento-de-texto?${params.toString()}`,
    { method: "POST", body: formData },
  );

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao analisar o texto (${resposta.status}). ${corpo || "Verifique se os serviços estão rodando."}`,
    );
  }

  return resposta.json();
}
