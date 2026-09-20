import type { ItemChecklistProposta, PropostaConfig, RespostaOrcamentoDePdf } from "./types";

// Texto fixo do item 1 (OBJETO) — pedido explícito do usuário: não é
// campo editável, sempre o mesmo em toda proposta, então nem entra no
// jsonb persistido (ver PainelProposta.tsx/PropostaImpressao.tsx).
export const OBJETO_PROPOSTA_TEXTO =
  "O objeto da proposta é a venda dos equipamentos e serviços discriminados conforme projeto e especificações fornecidos pelo cliente, à saber:";

// Aviso de confidencialidade do rodapé — texto exato do modelo oficial
// (ver PDF de referência, MAC_0994.26).
export const AVISO_CONFIDENCIALIDADE =
  "Este documento é confidencial, protegido por lei e de uso restrito para fins comerciais sendo proibida sua edição, cópia e veiculação através de e-mail, plataformas digitais ou outros meios sem autorização prévia da Macfab";

export const ENDERECO_MACFAB =
  "MACFAB FABRICAÇÕES E SERVIÇOS INDUSTRIAIS LTDA - ME, RUA BOA ESPERANÇA DO SUL, 27, DISTRITO INDUSTRIAL CEP 14.820-000, AMÉRICO BRASILIENSE SP, TEL. (16) 3392-8313";

export const CIDADE_EMISSAO = "Américo Brasiliense";

// Dados de quem assina a proposta — hoje fixos (só uma pessoa emite),
// mas isolados numa constante própria pra virarem configuráveis no
// futuro sem mexer no restante do template (pedido explícito do usuário).
export const RESPONSAVEL_COMERCIAL = {
  nome: "Jerri José C. dos Santos",
  email: "vendas@macfab.com.br",
  telefone: "(16) 3392-8313",
};

function item(id: string, texto: string, subitens?: ItemChecklistProposta[]): ItemChecklistProposta {
  return { id, texto, marcado: true, padraoId: id, subitens };
}

// Templates dos itens 7/8 — cópia fiel do PDF modelo (MAC_0994.26). Uma
// proposta nova começa com todos marcados (é o que o modelo mostra); o
// usuário desmarca/edita/adiciona conforme o caso, sem alterar esse
// array (cada proposta guarda sua PRÓPRIA cópia, ver criarPropostaInicial).
export function escopoMacfabPadrao(): ItemChecklistProposta[] {
  return [
    item("fabricacao", "Fabricação completa conforme desenho: Caldeiraria e usinagem e pintura"),
    item("materia-prima", "Matéria-prima: Aço carbono ASTM A36 com certificado"),
    item("insumos-solda", "Insumos de solda: AWS FCAW E71T-1, GMAW ER70S-6, GTAW ER70S-3"),
    item("insumos-pintura", "Insumos de pintura: Tintas e diluentes proporcionais conforme especificação"),
    item("acabamento", "Acabamento / Proteção", [
      item("acabamento-jateamento", "Jateamento ao metal quase branco Sa 2,5 - ISO 8501-1"),
      item("acabamento-pintura", "Pintura, conforme desenho e especificação"),
      item("acabamento-rebarbas", "Peças isentas de rebarbas, respingos de solda e deformações"),
      item("acabamento-tectyl", "Áreas usinadas protegidas com Tectyl ou produto similar"),
    ]),
    item("ensaios-nd", "Ensaios ND: Conforme desenho e PIT"),
    item("inspecoes", "Inspeções: Visual e dimensional de caldeiraria e usinagem"),
    item("databook", "Databook: Relatórios e certificados (português-inglês)"),
    item("embalagem", "Embalagem: Peças adequadamente embaladas e identificadas"),
    item("normas", "Normas correlatas: AWS D1.1, ISO 13920, ISO 2768, ISO 1302"),
  ];
}

export function exclusoesClientePadrao(): ItemChecklistProposta[] {
  return [
    item("tratamento-termico", "Tratamento térmico"),
    item("itens-standard", "Itens standard: Juntas, colas, adesivos, isolantes"),
    item("projeto-aprovado", "Projeto e desenho aprovados para fabricação (dwg ou pdf)"),
    item("eps", "EPS especificação de soldagem"),
    item("epp", "EPP especificação de pintura"),
    item("pit", "PIT plano de inspeção e testes"),
    item("art", "ART anotação de responsabilidade técnica"),
    item("descarregamento", "Descarregamento após entrega"),
    item("nao-especificados", "Materiais e serviços não claramente especificados nesta proposta"),
  ];
}

export const PRAZO_ENTREGA_PADRAO = "De 25 a 30 dias úteis após a confirmação do pedido";
export const VALIDADE_PADRAO = "30 dias após a data de emissão.";
export const GARANTIA_PADRAO =
  "Os equipamentos serão fabricados conforme projeto, especificações e normas vigentes com garantia de 24 meses a partir da data de emissão da nota fiscal.";
export const QUALIDADE_PADRAO =
  "Todos os materiais e ensaios serão fornecidos com certificado em conformidade com todos os requisitos das normas ISO, ABNT, ASTM, SAE, DIN, ANSI, AISI, ASME e AWS.";
export const NOTAS_PADRAO =
  "Por ora espero ter atendido a vossa expectativa e desde já me coloco a disposição para esclarecer eventuais dúvidas.";

// Chamada uma vez só, quando o usuário abre a aba PROPOSTA e o orçamento
// ainda não tem uma configuração salva — puxa o que já existe
// (identificação do cliente + resultado calculado) pro item de preço
// inicial; o resto vem do template padrão (editável depois, sem afetar
// outras propostas — cada orçamento guarda sua própria cópia).
export function criarPropostaInicial(resultado: RespostaOrcamentoDePdf | null): PropostaConfig {
  const peso = resultado?.orcamento.comercial.peso_liquido_kg;
  const valor = resultado?.orcamento.comercial.preco_venda_com_impostos ?? 0;

  return {
    tituloServico: "",
    contatoCliente: "",
    itensPreco: [
      {
        item: "2.1",
        quantidade: "01",
        discriminacao: peso ? `(Peso aproximado: ${Math.round(peso)} kg)` : "",
        valorTotal: valor,
      },
    ],
    ipi: "isento",
    icmsPisCofins: "27,25% incluso",
    ncm: "",
    prazoEntrega: PRAZO_ENTREGA_PADRAO,
    localEntrega: "",
    escopoMacfab: escopoMacfabPadrao(),
    exclusoesCliente: exclusoesClientePadrao(),
    validade: VALIDADE_PADRAO,
    garantia: GARANTIA_PADRAO,
    qualidade: QUALIDADE_PADRAO,
    notasConsideracoes: NOTAS_PADRAO,
    dataEmissao: null,
  };
}
