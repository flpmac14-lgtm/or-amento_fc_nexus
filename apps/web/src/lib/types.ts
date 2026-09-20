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

// Identificação do cliente digitada à mão (ou preenchida por busca de
// CNPJ) — pedido explícito do usuário: primeira etapa de automação (hoje
// isso é digitado numa planilha Excel); uma etapa futura vai trocar a
// origem desses campos por uma extração automática do desenho, mas o
// formato é o mesmo. Vive fora de `resultado` (painel sempre visível no
// topo da página, antes de qualquer cálculo) e é persistida junto do
// orçamento salvo via `RespostaOrcamentoDePdf.identificacao_cliente`.
export interface IdentificacaoCliente {
  cnpj: string;
  nomeCliente: string;
  endereco: string;
  revisao: string;
  condicaoPagamento: string;
  pedido: string;
}

export const IDENTIFICACAO_CLIENTE_INICIAL: IdentificacaoCliente = {
  cnpj: "",
  nomeCliente: "",
  endereco: "",
  revisao: "",
  condicaoPagamento: "",
  pedido: "",
};

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
  // Valores efetivos (padrão + overrides já aplicados) dos parâmetros
  // editáveis do "Custo por processo" — ver
  // services/calc_engine/app/orcamento.py::PARAMS_ESCALARES_SOBRESCREVIVEIS.
  parametros?: Record<string, number | null>;
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
  // Mesmos valores de `orcamento.parametros`, mas no nível raiz — devolvido
  // por /orcamento-de-bom, /orcamento-de-pdf e /orcamento-de-texto.
  parametros?: Record<string, number | null>;
  // Preenchido pelo frontend (page.tsx), nunca pelo backend — carona no
  // mesmo objeto só pra "Salvar orçamento" persistir/restaurar junto sem
  // precisar de coluna nova no banco. Ver IdentificacaoCliente.
  identificacao_cliente?: IdentificacaoCliente;
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
  // Ensaios não destrutivos lançados item a item (LP, ultrassom, ou outro
  // tipo descrito à mão), cobrados por peso — pedido explícito do usuário,
  // mesma mecânica de servicos_terceiros/tratamento_termico. Coexiste com a
  // linha "ndt" automática (peso líquido do orçamento × taxa única). Ver
  // app/orcamento.py::_agregar_ndt_itens.
  ndt_itens?: { descricao: string; peso_kg: number; valor_kg: number }[];
  // Engenharia industrial (desenho/croqui p/ delineamento) lançada item a
  // item, descrição fixa — mesmo padrão de adicionar/posição/item de
  // contingenciamento (pedido explícito do usuário), em vez do campo
  // escalar único que a "Estimativas manuais" do fluxo de PDF usa. Ver
  // app/orcamento.py::_agregar_engenharia_itens.
  engenharia_itens?: { descricao: string; quantidade: number; valor_unitario: number }[];
}

// Catálogo pequeno com taxa de referência conhecida (quando existe) pros
// cartões de usinagem/serviços de terceiros/tratamento térmico/ensaios não
// destrutivos — ver app/catalogo_processos_terceirizados.py.
export interface CatalogoProcessosTerceirizados {
  usinagem: { nome: string; valor_hora: number | null }[];
  servicos_terceiros: { nome: string; valor_kg: number | null }[];
  tratamento_termico: { nome: string; valor_kg: number | null }[];
  ensaios_nao_destrutivos: { nome: string; valor_kg: number | null }[];
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
  // Preço/kg de referência ORIGINAL (antes do acréscimo percentual) — só
  // preenchido quando o preço veio de busca automática (não de digitação
  // manual). Guardado separado de `preco_kg` (que é o preço EFETIVO, já
  // com o acréscimo aplicado) pra "aplicar a todos" recalcular sempre a
  // partir da referência real, sem compor o acréscimo em cima de si mesmo
  // a cada aplicação — pedido explícito do usuário.
  precoKgReferencia?: number;
  acrescimoPercentual?: number;
  perdaPct?: number;
  pesoParaCompraKg?: number;
  custoTotal?: number;
  // Cópia dos campos brutos do formulário (medidas, seleção de material,
  // modo catálogo/manual etc.) no momento de adicionar — só existe pra dar
  // pra reabrir o cartão certo já preenchido no botão "editar" (ver
  // CalculoManual.tsx). `descricao`/`peso_kg`/etc. acima são o resultado já
  // calculado, não servem pra reconstruir o formulário original.
  formSnapshot?: Record<string, string>;
}

// Item "puxado de volta" da lista de itens calculados pro botão "editar" —
// cada cartão sabe interpretar seu próprio formato de `dados` (ver
// CalculoManual.tsx::iniciarEdicao e o useEffect de restauração em cada
// Cartao*.tsx). `id` muda a cada clique em "editar", pra disparar o efeito
// de restauração mesmo editando o mesmo item duas vezes seguidas.
export interface EdicaoPendente<T = unknown> {
  id: number;
  dados: T;
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
  ndtItens: ServicoPorPeso[];
  // Engenharia industrial (desenho/croqui p/ delineamento) — descritivo
  // fixo, mesmo padrão de adicionar/posição/item de contingenciamento
  // (pedido explícito do usuário). Reusa ItemContingenciamento (mesmos
  // campos: descrição/quantidade/valor unitário/custo). Ver
  // CartaoEngenhariaIndustrial.tsx e app/orcamento.py::_agregar_engenharia_itens.
  engenhariaItens: ItemContingenciamento[];
  cenarioComercial: EstimativasOrcamento["cenario_comercial"];
  corteValorKg: string;
  posicaoNum: number;
  itemNum: number;
  // % somado sobre o preço/kg de referência dos cartões de matéria-prima
  // (chapa/circular/etc. e peso direto) — pedido explícito do usuário,
  // costume da empresa é 160%. Novos itens já nascem com esse valor
  // (editável por item); "Aplicar a todos" recalcula os já adicionados.
  acrescimoPercentualPadrao: string;
}

export const ESTADO_CALCULO_MANUAL_INICIAL: EstadoCalculoManual = {
  itens: [],
  itensComerciais: [],
  insumosPintura: [],
  operacoesUsinagem: [],
  servicosTerceiros: [],
  tratamentoTermico: [],
  contingenciamento: [],
  ndtItens: [],
  engenhariaItens: [],
  cenarioComercial: "venda_fabricacao",
  corteValorKg: "1,50",
  acrescimoPercentualPadrao: "160",
  posicaoNum: 1,
  itemNum: 1,
};

// Aba "PROPOSTA" — pedido explícito do usuário: reproduzir o modelo
// oficial de proposta comercial da Macfab (PDF de referência). Só guarda
// aqui o que é ESPECÍFICO da proposta; dados que já existem no orçamento
// (MAC/nome, cliente, revisão, condição de pagamento, peso, preço de
// venda) continuam vindo de `IdentificacaoCliente`/`ResultadoOrcamentoDTO`
// — nunca duplicados neste objeto (ver supabase/migrations/0010).
export interface ItemPrecoProposta {
  item: string; // "2.1"
  quantidade: string; // "01" — texto, não número: o modelo usa formato "01", "02"...
  discriminacao: string;
  valorTotal: number;
}

// Cada linha de escopo/exclusão — pode ter subitens (só "Acabamento /
// Proteção" usa isso no modelo, mas a estrutura é genérica). `padraoId`
// identifica de qual item do template essa linha veio (pra "restaurar
// padrão" individual); ausente em itens 100% personalizados pelo usuário.
export interface ItemChecklistProposta {
  id: string;
  texto: string;
  marcado: boolean;
  padraoId?: string;
  subitens?: ItemChecklistProposta[];
}

export interface PropostaConfig {
  // Sem correspondente hoje no orçamento (é o "objeto" descritivo, não o
  // código MAC) — só existe dentro da proposta.
  tituloServico: string;
  contatoCliente: string;
  itensPreco: ItemPrecoProposta[];
  ipi: string;
  icmsPisCofins: string;
  ncm: string;
  prazoEntrega: string;
  localEntrega: string;
  escopoMacfab: ItemChecklistProposta[];
  exclusoesCliente: ItemChecklistProposta[];
  validade: string;
  garantia: string;
  qualidade: string;
  notasConsideracoes: string;
  // ISO (YYYY-MM-DD) — null usa a data de hoje na hora de gerar/visualizar.
  dataEmissao: string | null;
}

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
  // Estudo técnico completo por IA (Markdown), quando gerado — só leitura de
  // apoio, ver components/RelatorioTecnicoIA.tsx.
  relatorio_tecnico: string | null;
  // Configuração da aba "PROPOSTA" — null quando o orçamento foi salvo
  // antes dessa aba existir, ou nunca foi aberta (ver
  // lib/propostaPadrao.ts::criarPropostaInicial).
  proposta: PropostaConfig | null;
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
  fonte_disponivel: boolean;
  fonte: string;
  total_referencias: number;
  sincronizado_em: string | null;
  compras: CompraMercadoLinha[];
}
