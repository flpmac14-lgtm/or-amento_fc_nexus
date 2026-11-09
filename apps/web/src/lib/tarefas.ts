// Tarefas (Kanban pessoal) — pedido do usuário (09/11/2026). Só o flpmac14 por enquanto.
// Tabela tarefas_kanban (migration 0067); API em app/api/tarefas; tela em app/tarefas.

import { podeVerFinanceiro } from "@/lib/financeiro";

export const ROTA_TAREFAS = "/tarefas";

export function podeVerTarefas(email: string | null | undefined): boolean {
  return podeVerFinanceiro(email);
}

export const COLUNAS_TAREFA = [
  { valor: "a_fazer", rotulo: "A fazer" },
  { valor: "em_andamento", rotulo: "Em andamento" },
  { valor: "concluido", rotulo: "Concluído" },
] as const;
export type ColunaTarefa = (typeof COLUNAS_TAREFA)[number]["valor"];

export const PRIORIDADES_TAREFA = [
  { valor: "alta", rotulo: "Alta" },
  { valor: "media", rotulo: "Média" },
  { valor: "baixa", rotulo: "Baixa" },
] as const;
export type PrioridadeTarefa = (typeof PRIORIDADES_TAREFA)[number]["valor"];

export type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  coluna: ColunaTarefa;
  prioridade: PrioridadeTarefa;
  prazo: string | null; // yyyy-mm-dd
  ordem: number;
  criado_em: string;
  atualizado_em: string;
  concluido_em: string | null;
};
