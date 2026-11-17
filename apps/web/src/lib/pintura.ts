// Pintura — pedido do usuário (17/11/2026): aba principal do menu, espelho de
// "J:\6 - PCP\PCP-Pintura\PCP-Pintura-Estoque.xlsx" (abas Estoque e Tinta),
// sincronizado a cada 15 min (services/calc_engine/app/pintura_estoque.py,
// migration 0074). Por enquanto só o flpmac14.

import { podeVerFinanceiro } from "@/lib/financeiro";
import type { ColunaControleObras, ValorControleObras } from "@/lib/types";

export const ROTA_PINTURA = "/pintura";

export function podeVerPintura(email: string | null | undefined): boolean {
  return podeVerFinanceiro(email);
}

export type AbaPintura = "estoque" | "tinta";

export interface RespostaPintura {
  status: {
    arquivo: string;
    colunas: Record<AbaPintura, ColunaControleObras[]>;
    linhas: Record<AbaPintura, number>;
    arquivo_modificado_em: string | null;
    ultima_alteracao_em: string;
    ultima_verificacao_em: string;
    ultimo_erro: string | null;
    ultimo_erro_em: string | null;
  } | null;
  linhas: Record<AbaPintura, { linha: number; valores: ValorControleObras[] }[]>;
}
