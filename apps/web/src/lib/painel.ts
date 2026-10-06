// Tipos da tela Visão Geral — espelham services/calc_engine/app/painel.py
// (um endpoint /painel/... por bloco). Regras dos blocos documentadas lá.

export type Severidade = "vermelho" | "amarelo";
export type Semaforo = Severidade | "verde";

export interface PedidoPainel {
  id: string;
  po: string;
  mac: string | null;
  obra: string;
  cliente: string | null;
  descricao: string | null;
  prazo: string | null;
  coleta: string | null;
  status: string | null;
  st: string | null;
  kg: number | null;
  qtd: number | null;
}

export interface FiltrosPainel {
  cliente: string;
  obra: string;
  prazoDe: string;
  prazoAte: string;
}

export const FILTROS_PAINEL_VAZIOS: FiltrosPainel = { cliente: "", obra: "", prazoDe: "", prazoAte: "" };

export interface OpcoesPainel {
  clientes: string[];
  obras: string[];
  planilha_sincronizada_em: string | null;
  config: Record<string, number | boolean>;
  pendencias: string[];
}

export interface ClienteColeta {
  cliente: string;
  pedidos: PedidoPainel[];
  obras: string[];
  kg: number;
  entregue: boolean;
  alerta: Severidade | null;
  motivo: string[];
}

export interface RespostaColetas {
  dias: { data: string; hoje: boolean; clientes: ClienteColeta[] }[];
  coletas_em_texto: number;
  /** Uma coleta = um cliente num dia. */
  semana: { valor: number; anterior: number };
}

export interface ProgramaCorte {
  programa: string;
  obras: string[];
  mps: string[];
  pecas: number | null;
  itens: number;
  cortando_em: string | null;
  cortando_por: string | null;
  finalizado_em: string | null;
  finalizado_por: string | null;
  falta_material_em: string | null;
  falta_material_por: string | null;
  minutos: number | null;
}

export interface RespostaCorte {
  cortando: ProgramaCorte[];
  falta_material: ProgramaCorte[];
  hoje: { programas: number; pecas: number };
  semana: { programas: number; pecas: number };
  por_dia: { data: string; programas: number }[];
  recentes: ProgramaCorte[];
  operadores: OperadorCorte[];
}

export interface OperadorCorte {
  operador: string;
  hoje: number;
  semana: number;
  minutos_hoje: number;
  por_dia: { data: string; programas: number }[];
  recentes: ProgramaCorte[];
}

export interface LinhaAtencao {
  severidade: Severidade;
  regra: string;
  titulo: string;
  criterio: string;
  obra: string;
  cliente: string;
  n_pedidos: number;
  dias: number;
  texto_dias: string;
  data_ref: string | null;
  pedidos: PedidoPainel[];
}

export interface RespostaAtencao {
  linhas: LinhaAtencao[];
  max: number;
  pendencias: string[];
}

export interface ClienteEntregas {
  cliente: string;
  entregues: number;
  programados: number;
  kg_entregue: number;
  kg_programado: number;
  pedidos: PedidoPainel[];
}

export interface RespostaEntregas {
  mes: string;
  de: string;
  ate: string;
  top: number;
  clientes: ClienteEntregas[];
}

export interface LinhaEsteira {
  obra: string;
  cliente: string;
  n_pedidos: number;
  n_prontos: number;
  kg: number;
  prazo: string | null;
  proxima_coleta: string | null;
  etapas: Record<string, number>;
  semaforo: Semaforo;
  /** sha256 da 1ª foto do pedido de prazo mais próximo (null = sem foto) */
  foto: string | null;
  dias_prazo: number | null;
}

export interface RespostaEsteira {
  etapas: { campo: string; nome: string }[];
  linhas: LinhaEsteira[];
  pendencias: string[];
}

export type AcaoRegistro = "criou" | "alterou" | "concluiu" | "excluiu";

export interface EventoRegistro {
  em: string;
  modulo: string;
  acao: AcaoRegistro;
  descricao: string;
  usuario: string;
  link: string | null;
}

export interface RespostaRegistros {
  data: string;
  eventos: EventoRegistro[];
  aviso: string;
}

// --- formatação -------------------------------------------------------------

/** "2026-10-06" → "06/10" */
export function ddmm(iso: string | null | undefined): string {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function kg(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  // peça pequena (0,4 kg) não pode virar "0 kg"
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(valor) < 10 ? 1 : 0 })} kg`;
}

export function horaMinuto(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** 95 → "1h35"; 40 → "40 min" */
export function duracao(minutos: number | null): string {
  if (minutos === null) return "—";
  if (minutos < 60) return `${minutos} min`;
  return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
}

export function linkObra(obra: string): string {
  return `/follow-up/obra?tipo=mac&valor=${encodeURIComponent(obra)}`;
}

export const COR_SEVERIDADE: Record<Semaforo, string> = {
  vermelho: "bg-red-500",
  amarelo: "bg-amber-400",
  verde: "bg-green-500",
};

export interface ItemCompra {
  codigo: string | null;
  descricao: string | null;
  preco: number | null;
  unidade: string | null;
  obra: string | null;
  /** obra no formato do app (MAC 2 partes) quando a compra é de uma obra */
  obra_mac: string | null;
}

export interface RespostaCompras {
  dias: number;
  notas: { data: string; nfe: number; fornecedor: string; itens: ItemCompra[] }[];
  n_itens: number;
  atualizado_em: string | null;
}

export interface GrupoApontamento {
  obra: string;
  descricao: string | null;
  em: string;
  n: number;
  programas: string[];
  status: Record<string, number>;
}

export interface Projetista {
  projetista: string;
  fazendo: { pedido: string; obra: string; descricao: string | null; programa: string | null; desde: string | null }[];
  hoje: number;
  hoje_por_status: Record<string, number>;
  semana: number;
  por_dia: { data: string; n: number }[];
  recentes: GrupoApontamento[];
}

export interface RespostaProjeto {
  projetistas: Projetista[];
}

// Usinagem (GET /painel/usinagem — app/painel.py::usinagem).
export interface ApontamentoUsinagem {
  em: string;
  status: "em_andamento" | "pausado" | "finalizado" | "falta_material";
  rotulo: string;
  operador: string | null;
  observacao: string | null;
  por: string | null;
  po: string | null;
  obra_mac: string | null;
  desenho: string | null;
  descricao: string | null;
  servico: string | null; // serviço interno Macfab (sem pedido)
}

export interface RespostaUsinagem {
  operadores: { nome: string; usinando: ApontamentoUsinagem[]; pausados: ApontamentoUsinagem[] }[];
  falta_material: ApontamentoUsinagem[];
  hoje: ApontamentoUsinagem[];
}
