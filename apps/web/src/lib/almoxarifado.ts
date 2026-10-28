// Aba Almoxarifado (leandro) — pedido do usuário (28/10/2026): digitar a MAC
// ou o pedido e ver tudo o que o Compras pensou, organizado por conjunto:
//   - a lista mãe do projeto (Material de compra = aba MACLM do MACLM.xlsx);
//   - as peças do Follow up (com a imagem) e o pedido de compra / NF de
//     entrada do Sectra de cada uma (terceirizado);
//   - os pedidos de compra do Valdir pra MAC (chapa, tubo, parafuso…).
// Ele vai marcando "Chegou" e tirando foto. Dados: /api/follow-up/almoxarifado
// (migration 0061). Tipos e regras compartilhados entre a rota e a tela.

import type { ComprasItem, CompraValdir } from "@/components/FollowUpCompras";

/** Linha da lista mãe (MACLM) — só os campos que o almoxarifado usa. */
export interface LinhaLista {
  chave: string; // "ml:<PO+IT+POS>|<CODIGO>"
  po_it_pos: string | null;
  pzc: string | null;
  descricao: string | null;
  mac1: string | null; // "723.26.01" (conjunto)
  desenho: string | null;
  st: string | null;
  po: string | null; // PO do cliente (= PO do Follow up)
  qtt: number | null;
  un: string | null;
  codigo: string | null;
  mp: string | null; // matéria-prima ("CH A36 28.57")
  larg: number | null;
  comp: number | null;
  di: number | null;
  l: string | null;
}

export interface ItemAlmox {
  id: string;
  chave: string; // "fu:<id>"
  po: string;
  mac: string | null;
  desenho: string | null;
  descricao: string | null;
  quantidade: number | null;
  st: string | null;
  status: string | null;
  fornecedor: string | null;
  coleta_data: string | null;
  prazo_contratual: string | null;
  material_chegou: boolean;
  falta_material: boolean | null;
  fotos: string[]; // sha256 das imagens do Follow up
  compras: ComprasItem | null; // pedido de compra / remessa / NF de entrada do Sectra
}

export interface Conferencia {
  chave: string;
  por: string | null;
  em: string;
  observacao: string | null;
}

export interface FotoAlmox {
  id: string;
  chave: string | null;
  rotulo: string | null;
  midia_sha256: string;
  observacao: string | null;
  por: string | null;
  em: string;
}

export interface DetalheMac {
  mac: string; // "723.26"
  cliente: string | null;
  itens: ItemAlmox[];
  lista: LinhaLista[];
  compras: CompraValdir[]; // do Valdir pra MAC
  conferencias: Conferencia[];
  fotos: FotoAlmox[];
  compras_em: string | null; // última leitura do Sectra
}

export interface OpcaoMac {
  mac: string;
  cliente: string | null;
  itens: number;
  motivo?: string; // por que apareceu na busca ("PO N18776-003")
  pedidos?: string[]; // nº do pedido do cliente (PO sem o item: "N18776", "4501770564")
  prazo?: string | null; // prazo contratual mais cedo das peças ainda não entregues
  coleta?: string | null; // próxima coleta marcada no Follow up (de hoje em diante; senão a mais recente)
  foto?: string | null; // sha256 da imagem de referência (Follow up) da obra
}

export type RespostaAlmox = { detalhe: DetalheMac } | { opcoes: OpcaoMac[] };

/** "723.26.10" / "0723.26" / "723-26" → "723.26" (sem zero à esquerda, igual ao Sectra). */
export function macBase(texto: string | null | undefined): string {
  const m = /(?<!\d)0*(\d{1,4})[.\-/ ](\d{2})(?!\d)/.exec(texto ?? "");
  return m ? `${Number(m[1])}.${m[2]}` : "";
}

/** "18.26" → "018.26" — o Follow up e o MACLM escrevem a MAC com 3 dígitos no mínimo. */
export function macPlanilha(base: string): string {
  const [a, b] = base.split(".");
  return `${a.padStart(3, "0")}.${b}`;
}

/** Prazo contratual mais cedo (peças não entregues), a próxima coleta e os nº de pedido do cliente da MAC. */
export function datasDaMac(
  itens: { po?: string | null; st?: string | null; prazo_contratual?: string | null; coleta_data?: string | null }[],
  hoje: string,
) {
  const prazos = itens.filter((i) => i.st !== "E" && i.prazo_contratual).map((i) => i.prazo_contratual as string).sort();
  const coletas = [...new Set(itens.map((i) => i.coleta_data).filter((d): d is string => !!d))].sort();
  return {
    prazo: prazos[0] ?? null,
    coleta: coletas.find((d) => d >= hoje) ?? coletas[coletas.length - 1] ?? null,
    coletas,
    pedidos: pedidosDoCliente(itens.map((i) => i.po)),
  };
}

/** "N18776-003" → "N18776"; "4501770564-010" → "4501770564" (sem repetir, em ordem). */
export function pedidosDoCliente(pos: (string | null | undefined)[]): string[] {
  const s = new Set<string>();
  for (const po of pos) {
    const p = (po ?? "").trim().replace(/-0*\d+$/, "");
    if (p) s.add(p);
  }
  return [...s].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const chaveLista = (po_it_pos: string | null, codigo: string | null) => `ml:${po_it_pos ?? ""}|${codigo ?? ""}`;
export const chavePc = (pc: number) => `pc:${pc}`;
export const chaveItem = (id: string) => `fu:${id}`;

export function urlImagemAlmox(sha: string): string {
  return `/api/follow-up/almoxarifado/imagem?sha=${encodeURIComponent(sha)}`;
}
