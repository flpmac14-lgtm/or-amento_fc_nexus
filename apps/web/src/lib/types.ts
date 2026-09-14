export interface CampoExtraido<T> {
  valor: T | null;
  confianca: number;
  origem: string;
}

export interface Identificacao {
  cliente: CampoExtraido<string>;
  numero_desenho: CampoExtraido<string>;
  revisao: CampoExtraido<string>;
  codigo_equipamento: CampoExtraido<string>;
  pedido_po: CampoExtraido<string>;
  descricao: CampoExtraido<string>;
  quantidade: CampoExtraido<number>;
}

export interface ItemParaRevisao {
  item_numero: string | null;
  motivo: string;
  confianca: number;
}

export interface LinhaCusto {
  codigo: string;
  descricao: string;
  valor_bruto: number;
  aliquota_icms: number;
  aliquota_pis_cofins: number;
  valor_liquido: number;
  horas: number | null;
  memoria_calculo: string[];
}

export interface ResumoComercial {
  cenario_comercial: string;
  custo_industrial: number;
  fator_margem: number;
  aliquota_venda: number;
  preco_venda_com_impostos: number;
  preco_venda_sem_impostos: number;
  imposto_a_pagar: number;
  margem_lucro: number;
  margem_percentual: number;
  peso_liquido_kg: number;
  preco_venda_por_kg: number;
}

export interface ResultadoOrcamentoDTO {
  linhas: LinhaCusto[];
  comercial: ResumoComercial;
}

export interface RespostaOrcamentoDePdf {
  extracao: {
    confianca_geral: number;
    paginas_total: number;
    paginas_com_texto_nativo: number;
    paginas_via_ocr: number;
    identificacao: Identificacao;
    bom_itens_extraidos: number;
  };
  itens_para_revisao: ItemParaRevisao[];
  orcamento: ResultadoOrcamentoDTO;
  // Entrada já adaptada (o dict que POST /orcamento espera) — opaca pro
  // frontend, só serve pra pedir a planilha Excel depois (POST
  // /orcamento/excel) sem precisar re-extrair nada.
  entrada: Record<string, unknown>;
}

export interface EstimativasOrcamento {
  peso_liquido_kg?: number;
  area_pintura_m2?: number;
  quantidade_posicoes_engenharia?: number;
  cenario_comercial: "venda_fabricacao" | "industrializacao" | "servico";
  usar_historico_horas: boolean;
}

export interface CampoGeometria {
  chave: string;
  rotulo: string;
  unidade: string;
}

export interface TipoGeometria {
  rotulo: string;
  campos: CampoGeometria[];
}

export type CatalogoGeometria = Record<string, TipoGeometria>;

export interface ItemCalculado {
  posicao: string;
  tipo: string;
  tipoRotulo: string;
  descricao: string;
  norma: string;
  quantidade: number;
  peso_kg: number;
  memoria_calculo: string;
}
