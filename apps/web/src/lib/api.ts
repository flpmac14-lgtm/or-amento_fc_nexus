import type {
  CantoneiraCatalogo,
  CatalogoGeometria,
  CatalogoProcessosTerceirizados,
  EstadoCalculoManual,
  EstimativasOrcamento,
  ItemCalculado,
  ItemComercial,
  ItemContingenciamento,
  MaterialCatalogo,
  OperacaoUsinagem,
  OrcamentoSalvoCompleto,
  OrcamentoSalvoResumo,
  OrigemOrcamentoSalvo,
  PerfilCatalogo,
  PrecoMercadoResposta,
  PrecosMercadoLista,
  RespostaOrcamentoDePdf,
  ResultadoOrcamentoDTO,
  ServicoPorPeso,
  TiposPerfilResposta,
  TuboCatalogo,
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

/** Estudo técnico completo por IA (geometria, BOM, peso estimado,
 * fabricação, solda, usinagem, pintura, análise crítica) — só informativo,
 * não alimenta o orçamento real. Demora (1-3 min é normal, é uma análise
 * grande) — sem timeout próprio no fetch, deixa a chamada terminar. */
export async function gerarRelatorioTecnico(arquivo: File): Promise<string> {
  const formData = new FormData();
  formData.set("file", arquivo);

  const resposta = await fetch(`${CALC_ENGINE_URL}/relatorio-tecnico`, {
    method: "POST",
    body: formData,
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao gerar o relatório técnico (${resposta.status}). ${corpo || "Tente de novo."}`,
    );
  }

  const dados = await resposta.json();
  return dados.relatorio_markdown as string;
}

export async function recalcularOrcamento(entrada: Record<string, unknown>): Promise<ResultadoOrcamentoDTO> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/orcamento`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entrada),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Falha ao recalcular o orçamento (${resposta.status}). ${corpo}`);
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

export async function buscarMateriais(): Promise<MaterialCatalogo[]> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/materiais/catalogo`);
  if (!resposta.ok) {
    throw new Error(`Falha ao carregar a biblioteca de materiais (${resposta.status}).`);
  }
  const dados = await resposta.json();
  return dados.materiais;
}

export async function buscarCnpj(cnpj: string): Promise<{ cnpj: string; nome: string; endereco: string }> {
  const digitos = cnpj.replace(/\D/g, "");
  const resposta = await fetch(`${CALC_ENGINE_URL}/cnpj/${digitos}`);
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => null);
    throw new Error(corpo?.detail || `Falha ao buscar o CNPJ (${resposta.status}).`);
  }
  return resposta.json();
}

export async function buscarCantoneirasCatalogo(termo: string): Promise<CantoneiraCatalogo[]> {
  const params = new URLSearchParams();
  if (termo) params.set("q", termo);
  const resposta = await fetch(`${CALC_ENGINE_URL}/cantoneiras/buscar?${params.toString()}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar cantoneiras no catálogo (${resposta.status}).`);
  }
  const dados = await resposta.json();
  return dados.cantoneiras;
}

export async function buscarTubosCatalogo(termo: string): Promise<TuboCatalogo[]> {
  const params = new URLSearchParams();
  if (termo) params.set("q", termo);
  const resposta = await fetch(`${CALC_ENGINE_URL}/tubos/buscar?${params.toString()}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar tubos no catálogo (${resposta.status}).`);
  }
  const dados = await resposta.json();
  return dados.tubos;
}

export async function buscarPrecoMercado(norma: string, espessuraMm: number): Promise<PrecoMercadoResposta> {
  const params = new URLSearchParams({ norma, espessura_mm: String(espessuraMm) });
  const resposta = await fetch(`${CALC_ENGINE_URL}/materiais/preco-mercado?${params.toString()}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar preço de referência (${resposta.status}).`);
  }
  return resposta.json();
}

export async function buscarPrecosMercado(): Promise<PrecosMercadoLista> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/materiais/precos-mercado`);
  if (!resposta.ok) {
    throw new Error(`Falha ao carregar a referência de preços (${resposta.status}).`);
  }
  return resposta.json();
}

export async function buscarTiposPerfil(): Promise<TiposPerfilResposta> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/perfis/tipos`);
  if (!resposta.ok) {
    throw new Error(`Falha ao carregar os tipos de perfil (${resposta.status}).`);
  }
  return resposta.json();
}

export async function buscarPerfis(tipo: string, termo: string): Promise<PerfilCatalogo[]> {
  const params = new URLSearchParams({ tipo });
  if (termo) params.set("q", termo);
  const resposta = await fetch(`${CALC_ENGINE_URL}/perfis/buscar?${params.toString()}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar perfis no catálogo (${resposta.status}).`);
  }
  const dados = await resposta.json();
  return dados.perfis;
}

export async function buscarCatalogoProcessosTerceirizados(): Promise<CatalogoProcessosTerceirizados> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/processos-terceirizados/catalogo`);
  if (!resposta.ok) {
    throw new Error(`Falha ao carregar o catálogo de processos terceirizados (${resposta.status}).`);
  }
  return resposta.json();
}

export async function analisarBom(
  itens: ItemCalculado[],
  itensComerciais: ItemComercial[],
  insumosPintura: ItemComercial[],
  operacoesUsinagem: OperacaoUsinagem[],
  servicosTerceiros: ServicoPorPeso[],
  tratamentoTermico: ServicoPorPeso[],
  contingenciamento: ItemContingenciamento[],
  ndtItens: ServicoPorPeso[],
  engenhariaItens: ItemContingenciamento[],
  estimativas: EstimativasOrcamento,
): Promise<RespostaOrcamentoDePdf> {
  const bom = itens.map((item, i) => ({
    item_numero: `${item.posicao} · ${i + 1}`,
    descricao: `${item.descricao} (${item.posicao})`,
    peso_kg: item.peso_kg,
    norma: item.norma || null,
    quantidade: 1,
    tipo: item.tipo,
    preco_kg: item.preco_kg ?? null,
    perda_pct: item.perdaPct ?? null,
  }));

  const itensPadrao = itensComerciais.map((item) => ({
    descricao: `${item.descricao} (${item.posicao})`,
    quantidade: item.quantidade,
    preco_unitario: item.preco_unitario,
  }));

  const insumosPinturaPayload = insumosPintura.map((item) => ({
    descricao: `${item.descricao} (${item.posicao})`,
    quantidade: item.quantidade,
    preco_unitario: item.preco_unitario,
  }));

  const usinagemOperacoesPayload = operacoesUsinagem.map((op) => ({
    maquina: `${op.maquina} (${op.posicao})`,
    horas: op.horas,
    valor_hora: op.valorHora,
  }));

  const servicosTerceirosPayload = servicosTerceiros.map((item) => ({
    descricao: `${item.descricao} (${item.posicao})`,
    peso_kg: item.pesoKg,
    valor_kg: item.valorKg,
  }));

  const tratamentoTermicoPayload = tratamentoTermico.map((item) => ({
    descricao: `${item.descricao} (${item.posicao})`,
    peso_kg: item.pesoKg,
    valor_kg: item.valorKg,
  }));

  const contingenciamentoPayload = contingenciamento.map((item) => ({
    descricao: `${item.descricao} (${item.posicao})`,
    quantidade: item.quantidade,
    valor_unitario: item.valorUnitario,
  }));

  const ndtItensPayload = ndtItens.map((item) => ({
    descricao: `${item.descricao} (${item.posicao})`,
    peso_kg: item.pesoKg,
    valor_kg: item.valorKg,
  }));

  const engenhariaItensPayload = engenhariaItens.map((item) => ({
    descricao: `${item.descricao} (${item.posicao})`,
    quantidade: item.quantidade,
    valor_unitario: item.valorUnitario,
  }));

  const resposta = await fetch(`${CALC_ENGINE_URL}/orcamento-de-bom`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bom,
      estimativas: {
        ...estimativas,
        itens_padrao: itensPadrao,
        insumos_pintura: insumosPinturaPayload,
        usinagem_operacoes: usinagemOperacoesPayload,
        servicos_terceiros: servicosTerceirosPayload,
        tratamento_termico: tratamentoTermicoPayload,
        contingenciamento: contingenciamentoPayload,
        ndt_itens: ndtItensPayload,
        engenharia_itens: engenhariaItensPayload,
      },
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(
      `Falha ao calcular o orçamento (${resposta.status}). ${corpo || "Verifique se os serviços estão rodando."}`,
    );
  }

  return resposta.json();
}

export async function salvarOrcamento(payload: {
  id?: string;
  nome: string;
  origem: OrigemOrcamentoSalvo;
  resultado: RespostaOrcamentoDePdf;
  estado_manual?: EstadoCalculoManual | null;
  estado_texto?: { texto: string; estimativas: EstimativasOrcamento } | null;
}): Promise<{ id: string; created_at: string; updated_at: string }> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/orcamentos-salvos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Falha ao salvar o orçamento (${resposta.status}). ${corpo}`);
  }

  return resposta.json();
}

export async function listarOrcamentosSalvos(): Promise<OrcamentoSalvoResumo[]> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/orcamentos-salvos`);
  if (!resposta.ok) {
    throw new Error(`Falha ao carregar os orçamentos salvos (${resposta.status}).`);
  }
  const dados = await resposta.json();
  return dados.orcamentos;
}

export async function buscarOrcamentoSalvo(id: string): Promise<OrcamentoSalvoCompleto> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/orcamentos-salvos/${id}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao abrir o orçamento salvo (${resposta.status}).`);
  }
  return resposta.json();
}

export async function excluirOrcamentoSalvo(id: string): Promise<void> {
  const resposta = await fetch(`${CALC_ENGINE_URL}/orcamentos-salvos/${id}`, { method: "DELETE" });
  if (!resposta.ok) {
    throw new Error(`Falha ao excluir o orçamento salvo (${resposta.status}).`);
  }
}
