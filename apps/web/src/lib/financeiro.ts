// Aba Financeiro — pedido explícito do usuário: SÓ a conta flpmac14 vê.
// O bloqueio de verdade é no servidor (proxy.ts pra página e
// app/api/financeiro/route.ts pros dados); aqui no cliente é só pra
// esconder o link. Dados: resumo do ERP gravado por
// services/calc_engine/scripts/sincronizar_financeiro.py (mesmas consultas
// do DashboardIndustrial).

import type { User } from "@supabase/supabase-js";

export const EMAIL_FINANCEIRO = "flpmac14@gmail.com";
export const ROTA_FINANCEIRO = "/financeiro";

// Conta do usuário (flpmac14): também é a "admin" em outras telas (Ver como, Registro).
export function podeVerFinanceiro(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === EMAIL_FINANCEIRO;
}

// Perfil "financeiro" (gabriele, pedido do usuário 15/10/2026): só o painel, sem Budget.
export const PERFIL_FINANCEIRO = "financeiro";
// Perfil "financeiro_consulta" (luana, pedido do usuário 29/10/2026): também presa
// no /financeiro, mas só as abas Pedido - ativo, Coletas (só olhar) e Faturamento.
export const PERFIL_FINANCEIRO_CONSULTA = "financeiro_consulta";
export function perfilFinanceiroConsulta(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.acesso === PERFIL_FINANCEIRO_CONSULTA;
}
export function perfilFinanceiro(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.acesso === PERFIL_FINANCEIRO || perfilFinanceiroConsulta(user);
}

/** Quem abre /financeiro e /api/financeiro: o flpmac14 e o perfil "financeiro". */
export function podeAbrirFinanceiro(user: Pick<User, "app_metadata" | "email"> | null | undefined): boolean {
  return podeVerFinanceiro(user?.email) || perfilFinanceiro(user);
}

export interface ResumoFinanceiro {
  meses: string[]; // "AAAA-MM", 13 meses, do mais antigo pro atual
  faturamento: Record<string, { producao: number; servico: number }>;
  custos: Record<string, Record<string, number>>; // mês → grupo → R$
  grupos: string[];
  entrada_pedidos: Record<string, number>;
  // NFs faturadas (mesmo filtro do faturamento), a mais recente primeiro.
  notas: NotaFiscal[];
  // Painel do financeiro (15/10/2026): compras recentes, a pagar e a receber.
  hoje?: string;
  compras?: CompraErp[];
  pagar?: { abertos: TituloErp[]; pagos: TituloErp[] };
  receber?: { abertos: TituloErp[]; recebidos: TituloErp[] };
}

/** Pedido de compra (CO_PEDIDOS) dos últimos 45 dias. */
export interface CompraErp {
  pedido: string;
  data: string | null;
  prazo: string | null;
  status: string;
  status_rotulo: string;
  fornecedor: string | null;
  total: number;
  frete: number;
  obras: string[];
  itens: {
    item: string | null;
    descricao: string | null;
    qtd: number;
    und: string | null;
    total: number;
    obra: string | null;
    prazo: string | null;
  }[];
}

/** Título a pagar (FN_PAGAR) ou a receber (FN_RECEBER). */
export interface TituloErp {
  id: number;
  vencimento: string | null;
  nome: string | null; // fornecedor / cliente
  documento: string | null;
  forma: string | null;
  valor: number;
  pago_em?: string | null;
  nota?: string | null;
  filial?: number;
}

export interface NotaFiscal {
  nota: string;
  emissao: string; // AAAA-MM-DD
  cliente: string | null;
  pedido: string | null; // pedido de venda (interno)
  mac: string | null; // obra (ex.: 924.26), do pedido de venda
  po: string | null; // pedido do cliente (PO)
  producao: number;
  servico: number;
  total: number;
  cancelada?: boolean; // vermelha na tabela, fora da soma (o faturamento já não conta)
}

/** Condição de pagamento do pedido de venda (VE_CONDPAGTO): "28/42/56" = dias de cada parcela e % dela. */
export interface CondicaoPagamento {
  desc: string | null;
  dias: number[];
  pct: number[];
}

/** Item ativo do Follow up com data de coleta, cruzado com o pedido de venda no Sectra (fluxo de caixa). */
export interface ColetaFluxo {
  po: string;
  mac: string | null;
  cliente: string | null;
  desenho: string | null;
  descricao: string | null;
  qtd: number | null;
  coleta: string; // AAAA-MM-DD
  situacao: "sem_entrada" | "em_aberto" | "faturado" | "cancelado";
  valor: number | null;
  pedidos: string[];
  cliente_erp: string | null;
  condicao: CondicaoPagamento | null;
}

/** GET /api/financeiro/fluxo (só flpmac14). */
export interface RespostaFluxo {
  hoje: string | null;
  gerado_em: string | null;
  coletas: ColetaFluxo[];
  receber: TituloErp[];
  pagar: TituloErp[];
  dias_pagar: number; // horizonte do A pagar carregado
}

export interface BudgetFinanceiro {
  faturamento: Record<string, number>; // mês → R$
  custos_pct: Record<string, Record<string, number>>; // grupo → mês → % do faturamento
}

export interface RespostaFinanceiro {
  resumo: ResumoFinanceiro | null;
  gerado_em: string | null;
  budget: BudgetFinanceiro;
  so_consulta?: boolean; // true pro perfil "financeiro_consulta" (luana)
  ver_budget?: boolean; // false pro perfil "financeiro" (pedido do usuário: Budget oculto)
}

/** GET /api/financeiro. Se der erro, tenta mais uma vez depois de 2 s antes de
 * mostrar (o "JWT issued at future" do Supabase é passageiro — 07/10). */
export async function buscarFinanceiro(semNotas: boolean): Promise<RespostaFinanceiro> {
  const url = semNotas ? "/api/financeiro?sem_notas=1" : "/api/financeiro";
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return j as RespostaFinanceiro;
    // 403 = não é a conta do financeiro: não adianta tentar de novo.
    if (r.status === 403 || tentativa >= 2) throw new Error(j.erro ?? `Erro ${r.status}`);
    await new Promise((ok) => setTimeout(ok, 2000));
  }
}
