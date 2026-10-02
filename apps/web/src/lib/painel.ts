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
}

export interface ObraResumo {
  obra: string;
  cliente: string;
  n_pedidos: number;
  prazo: string | null;
  kg: number;
}

export interface ColetaResumo {
  data: string;
  cliente: string;
  n_pedidos: number;
  kg: number;
  obras: string[];
}

export interface RespostaKpis {
  obras: { ativas: number; em_atraso: number; lista_atraso: ObraResumo[]; lista_ativas: ObraResumo[] };
  coletas_semana: { valor: number; anterior: number; de: string; ate: string; lista: ColetaResumo[] };
  kg_corte: { valor: null; pendencia: string };
  materiais_criticos: { valor: null; pendencia: string };
  otd: {
    percentual: number | null;
    base: number;
    no_prazo: number;
    anterior: number | null;
    dias: number;
    atrasados: PedidoPainel[];
  };
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

export function linkObra(obra: string): string {
  return `/follow-up/obra?tipo=mac&valor=${encodeURIComponent(obra)}`;
}

export const COR_SEVERIDADE: Record<Semaforo, string> = {
  vermelho: "bg-red-500",
  amarelo: "bg-amber-400",
  verde: "bg-green-500",
};
