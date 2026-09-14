import type {
  CatalogoGeometria,
  EstimativasOrcamento,
  ItemCalculado,
  RespostaOrcamentoDePdf,
} from "./types";

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

export async function buscarCatalogoGeometria(): Promise<CatalogoGeometria> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/geometria/tipos`);
  if (!resposta.ok) {
    throw new Error(`Falha ao carregar os tipos de geometria (${resposta.status}).`);
  }
  return resposta.json();
}

export async function calcularPesoGeometria(
  tipo: string,
  medidas: Record<string, number>,
  quantidade: number,
): Promise<{ peso_kg: number; memoria_calculo: string }> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/geometria/calcular`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tipo, medidas, quantidade }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Falha ao calcular o peso (${resposta.status}). ${corpo}`);
  }

  return resposta.json();
}

export async function analisarBom(
  itens: ItemCalculado[],
  estimativas: EstimativasOrcamento,
): Promise<RespostaOrcamentoDePdf> {
  const bom = itens.map((item, i) => ({
    item_numero: `${item.posicao} · ${i + 1}`,
    descricao: `${item.descricao} (${item.posicao})`,
    peso_kg: item.peso_kg,
    norma: item.norma || null,
    quantidade: 1,
    tipo: item.tipo,
  }));

  const resposta = await fetch(`${CALC_ENGINE_URL}/orcamento-de-bom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bom, estimativas }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao calcular o orçamento (${resposta.status}). ${corpo || "Verifique se os serviços estão rodando."}`,
    );
  }

  return resposta.json();
}
