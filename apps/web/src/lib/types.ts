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
  // Itens standard comerciais (parafusos, porcas, arruelas etc.) — ver
  // app/orcamento.py::_agregar_itens_padrao. Sem peso/geometria, só custo
  // direto (quantidade × preço), com a mesma tributação da matéria-prima.
  itens_padrao?: { descricao: string; quantidade: number; preco_unitario: number }[];
  // Custo médio de insumos de corte (oxicorte/plasma/laser, R$/kg) — padrão
  // R$ 1,50/kg (app/parametros_padrao.py), editável no cálculo manual.
  // Multiplica o peso líquido total dos itens (ver app/processos.py::corte).
  corte_valor_kg?: number;
  // Insumos de pintura escolhidos item a item (fundo/intermediária/
  // acabamento/diluente) — quantidade em LITROS. Varia conforme o plano de
  // pintura pedido, por isso não cabe numa fórmula única de R$/m² (essa
  // continua existindo em area_pintura_m2, pro fluxo de PDF). Mesma
  // alíquota de "pintura_material" — ver app/orcamento.py::_agregar_insumos_pintura.
  insumos_pintura?: { descricao: string; quantidade: number; preco_unitario: number }[];
  // Operações de usinagem terceirizada (máquina/horas/R$ por hora) — uma
  // linha "Usinagem" só, somando horas×valor de todas. Ver app/processos.py::usinagem.
  usinagem_operacoes?: { maquina: string; horas: number; valor_hora: number }[];
  // Serviços de outsourcing cobrados por peso (conformação pesada/dobra em
  // calandra, rebordeamento de tampos, balanceamento etc.) — ver
  // app/orcamento.py::_agregar_servicos_terceiros.
  servicos_terceiros?: { descricao: string; peso_kg: number; valor_kg: number }[];
  // Tratamento térmico terceirizado (alívio de tensões, têmpera/revenimento
  // etc.) — ver app/orcamento.py::_agregar_tratamento_termico.
  tratamento_termico?: { descricao: string; peso_kg: number; valor_kg: number }[];
  // Provisão de qualificação/contingência — ver app/orcamento.py::_agregar_contingenciamento.
  contingenciamento?: { descricao: string; quantidade: number; valor_unitario: number }[];
}

// Catálogo pequeno com taxa de referência conhecida (quando existe) pros
// cartões de usinagem/serviços de terceiros/tratamento térmico — ver
// app/catalogo_processos_terceirizados.py.
export interface CatalogoProcessosTerceirizados {
  usinagem: { nome: string; valor_hora: number | null }[];
  servicos_terceiros: { nome: string; valor_kg: number | null }[];
  tratamento_termico: { nome: string; valor_kg: number | null }[];
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
  // Só preenchidos pelo cartão de perfil laminado — preço/kg e perda
  // digitados na tela, com prioridade sobre o preço padrão cadastrado por
  // norma (ver services/calc_engine/app/adapter.py). custoTotal é só pra
  // exibição na lista de itens; quem recalcula pra valer é o backend.
  preco_kg?: number;
  perdaPct?: number;
  pesoParaCompraKg?: number;
  custoTotal?: number;
}

export interface ItemComercial {
  posicao: string;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  unidade?: string;
  fornecedor?: string;
  custoTotal: number;
}

export interface OperacaoUsinagem {
  posicao: string;
  maquina: string;
  horas: number;
  valorHora: number;
  custoTotal: number;
}

// Usado tanto por "Serviços de terceiros" quanto "Tratamento térmico" —
// mesma mecânica (peso × R$/kg), só o catálogo/rótulo do cartão muda.
export interface ServicoPorPeso {
  posicao: string;
  descricao: string;
  pesoKg: number;
  valorKg: number;
  custoTotal: number;
}

export interface ItemContingenciamento {
  posicao: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  custoTotal: number;
}

// Estado editável da aba "Cálculo manual" — o que dá pra salvar e restaurar
// pra continuar de onde parou (ver components/CalculoManual.tsx e
// app/orcamentos_salvos.py, campo `estado_manual`).
export interface EstadoCalculoManual {
  itens: ItemCalculado[];
  itensComerciais: ItemComercial[];
  // Mesmo formato de ItemComercial (descrição/quantidade/preço) — a
  // quantidade aqui é em litros, não em unidades/peças. Ver CartaoInsumoPintura.tsx.
  insumosPintura: ItemComercial[];
  operacoesUsinagem: OperacaoUsinagem[];
  servicosTerceiros: ServicoPorPeso[];
  tratamentoTermico: ServicoPorPeso[];
  contingenciamento: ItemContingenciamento[];
  cenarioComercial: EstimativasOrcamento["cenario_comercial"];
  corteValorKg: string;
  posicaoNum: number;
  itemNum: number;
}

export const ESTADO_CALCULO_MANUAL_INICIAL: EstadoCalculoManual = {
  itens: [],
  itensComerciais: [],
  insumosPintura: [],
  operacoesUsinagem: [],
  servicosTerceiros: [],
  tratamentoTermico: [],
  contingenciamento: [],
  cenarioComercial: "venda_fabricacao",
  corteValorKg: "1,50",
  posicaoNum: 1,
  itemNum: 1,
};

export type OrigemOrcamentoSalvo = "manual" | "pdf" | "texto";

export interface ResumoOrcamentoSalvo {
  cliente: string | null;
  numero_desenho: string | null;
  peso_liquido_kg: number | null;
  preco_venda_com_impostos: number | null;
}

export interface OrcamentoSalvoResumo {
  id: string;
  nome: string;
  origem: OrigemOrcamentoSalvo;
  resumo: ResumoOrcamentoSalvo;
  created_at: string;
  updated_at: string;
}

export interface OrcamentoSalvoCompleto {
  id: string;
  nome: string;
  origem: OrigemOrcamentoSalvo;
  resultado: RespostaOrcamentoDePdf;
  estado_manual: EstadoCalculoManual | null;
  estado_texto: { texto: string; estimativas: EstimativasOrcamento } | null;
  created_at: string;
  updated_at: string;
}

export interface PerfilCatalogo {
  designacao: string;
  peso_kg_m: number;
  tipo: string;
}

export interface TiposPerfilResposta {
  tipos: Record<string, string>;
  normas_sugeridas: string[];
}

export interface MaterialCatalogo {
  material: string;
  norma: string;
  categoria: string;
  densidade_kg_m3: number;
}

export interface CantoneiraCatalogo {
  designacao: string;
  aba_mm: number;
  espessura_mm: number;
  kg_m: number;
  fonte: string;
}

export interface TuboCatalogo {
  designacao: string;
  diametro_externo_mm: number;
  espessura_mm: number;
  diametro_interno_mm: number;
  kg_m: number;
  fonte: string;
}

export interface PrecoMercadoResposta {
  encontrado: boolean;
  preco_kg?: number;
  fornecedor?: string;
  data_compra?: string | null;
  espessura_referencia_mm?: number;
  exato?: boolean;
}

export interface CompraMercadoLinha {
  codigo: string;
  material: string;
  descricao: string;
  preco_unitario: number;
  unidade: string;
  fornecedor: string;
  obra: string;
  data_compra: string | null;
}

export interface PrecosMercadoLista {
  arquivo_encontrado: boolean;
  caminho: string;
  total_referencias: number;
  sincronizado_em: string | null;
  compras: CompraMercadoLinha[];
}
