// Aba Financeiro — pedido explícito do usuário: SÓ a conta flpmac14 vê.
// O bloqueio de verdade é no servidor (proxy.ts pra página e
// app/api/financeiro/route.ts pros dados); aqui no cliente é só pra
// esconder o link. Dados: resumo do ERP gravado por
// services/calc_engine/scripts/sincronizar_financeiro.py (mesmas consultas
// do DashboardIndustrial).

export const EMAIL_FINANCEIRO = "flpmac14@gmail.com";
export const ROTA_FINANCEIRO = "/financeiro";

export function podeVerFinanceiro(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === EMAIL_FINANCEIRO;
}

export interface ResumoFinanceiro {
  meses: string[]; // "AAAA-MM", 13 meses, do mais antigo pro atual
  faturamento: Record<string, { producao: number; servico: number }>;
  custos: Record<string, Record<string, number>>; // mês → grupo → R$
  grupos: string[];
  entrada_pedidos: Record<string, number>;
  // NFs faturadas (mesmo filtro do faturamento), a mais recente primeiro.
  notas: NotaFiscal[];
}

export interface NotaFiscal {
  nota: string;
  emissao: string; // AAAA-MM-DD
  cliente: string | null;
  pedido: string | null; // pedido de venda
  producao: number;
  servico: number;
  total: number;
}

export interface BudgetFinanceiro {
  faturamento: Record<string, number>; // mês → R$
  custos_pct: Record<string, Record<string, number>>; // grupo → mês → % do faturamento
}

export interface RespostaFinanceiro {
  resumo: ResumoFinanceiro | null;
  gerado_em: string | null;
  budget: BudgetFinanceiro;
}
