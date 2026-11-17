// Pintura — pedido do usuário (17/11/2026): aba principal do menu.
// - Espelho de "J:\6 - PCP\PCP-Pintura\PCP-Pintura-Estoque.xlsx" (abas Estoque e
//   Tinta), lido a cada 15 min (services/calc_engine/app/pintura_estoque.py, 0074).
// - Entradas/saídas de tinta pelo celular do felipe (app/pintura_movimentos.py, 0075):
//   estoque do app = planilha + movimentos; o script de 15 min grava uma planilha
//   NOVA e organizada no J: (a original nunca é gravada).
// - "Vai ter tinta?": pedidos ativos (Cor 1/Cor 2/Plano) × estoque.
// Quem vê: flpmac14 e o perfil "pintura" (felipe). Corrigir/excluir: só flpmac14.

import type { User } from "@supabase/supabase-js";
import { ACESSO_PINTURA } from "@/lib/acesso";
import { podeVerFinanceiro } from "@/lib/financeiro";
import type { ColunaControleObras, ValorControleObras } from "@/lib/types";

export const ROTA_PINTURA = "/pintura";

export function podeVerPintura(user: Pick<User, "email" | "app_metadata"> | null | undefined): boolean {
  return podeVerFinanceiro(user?.email) || user?.app_metadata?.acesso === ACESSO_PINTURA;
}

export function podeCorrigirPintura(email: string | null | undefined): boolean {
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

export interface FotoPintura {
  id: string;
  sha256: string;
  por: string | null;
  em: string;
}

export interface ItemEstoquePintura {
  chave: string; // 'P:<IT>' (planilha) ou 'N:<id>' (entrada do app)
  origem: "planilha" | "app";
  linha: number | null;
  it: string | number | null;
  fabricante: string | null;
  produto: string | null;
  cor: string | null;
  un_a: string | null;
  qt_inicial_a: number;
  qt_a: number; // saldo
  saida_a: number;
  lote_a: string | null;
  venc_a: string | null;
  produto_b: string | null;
  un_b: string | null;
  qt_inicial_b: number;
  qt_b: number;
  saida_b: number;
  lote_b: string | null;
  venc_b: string | null;
  local: string | null;
  tipo: string | null;
  diluente: string | null;
  petrobras: string | number | null;
  mac: string | null;
  entrada_em: string | null;
  entrada_por: string | null;
  movimento_id?: string;
  fotos?: FotoPintura[];
  obs?: string | null;
}

export interface MovimentoPintura {
  id: string;
  seq: number;
  tipo: "entrada" | "saida";
  item: string;
  it: string | null;
  fabricante: string | null;
  produto: string | null;
  cor: string | null;
  un_a: string | null;
  qt_a: number;
  lote_a: string | null;
  venc_a: string | null;
  un_b: string | null;
  qt_b: number;
  lote_b: string | null;
  venc_b: string | null;
  local: string | null;
  mac: string | null;
  obs: string | null;
  por: string | null;
  em: string;
  fotos: FotoPintura[];
}

export interface RespostaEstoquePintura {
  estoque: ItemEstoquePintura[];
  movimentos: MovimentoPintura[]; // mais novos primeiro
}

export type SituacaoNecessidade = "tem" | "vencida" | "zerada" | "nao_tem";

export interface GrupoNecessidade {
  produto: string | null;
  cor: string | null;
  micras: number[];
  planos: string[];
  pedidos: {
    po: string;
    mac: string | null;
    cliente: string | null;
    descricao: string | null;
    peso_total: number;
    prazo: string | null;
    pin: number;
  }[];
  peso_total: number;
  situacao: SituacaoNecessidade;
  saldo_a: number;
  estoque: Pick<ItemEstoquePintura, "chave" | "it" | "produto" | "cor" | "lote_a" | "venc_a" | "qt_a" | "qt_b" | "un_a" | "local">[];
}

export interface RespostaNecessidade {
  grupos: GrupoNecessidade[];
  pedidos: number;
  planos_sem_ia: number;
  planos_lidos: number;
}

export type NovoMovimentoPintura =
  | {
      tipo: "entrada";
      produto: string;
      fabricante?: string;
      cor?: string;
      un_a?: string;
      qt_a?: number;
      lote_a?: string;
      venc_a?: string;
      un_b?: string;
      qt_b?: number;
      lote_b?: string;
      venc_b?: string;
      local?: string;
      mac?: string;
      obs?: string;
      por: string | null;
    }
  | { tipo: "saida"; item: string; qt_a: number; qt_b: number; mac?: string; obs?: string; por: string | null };
