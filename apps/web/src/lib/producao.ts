// Ordens de produção + totem de apontamento — pedido do usuário (07/11/2026).
// O PCP gera a OP a partir de um pedido do Follow up, escolhendo as etapas
// (operação + centro produtivo) cadastradas no Sectra; o operador aponta no
// totem com o nº do crachá do Sectra. Tabelas: supabase/migrations/0065.
// Cadastros do Sectra: scripts/sincronizar_producao.py (15 min).
// Arquivo sem dependência de servidor: usado pelas telas e pelas rotas.

import { minutosUteis } from "@/lib/jornada";

export type Operador = { codigo: number; nome: string; apelido: string; cracha: string; ativo: boolean; centro: string | null };
export type Centro = { codigo: string; descricao: string | null; nivel: string | null; pai: string | null; ativo: boolean };
export type Operacao = { codigo: string; descricao: string | null };
export type EtapaModelo = {
  posicao: number;
  operacao: string | null;
  centro: string | null;
  descricao: string | null;
  hr_preparo: number;
  hr_unitario: number;
};
export type RoteiroPadrao = { codigo: number; descricao: string | null; etapas: EtapaModelo[] };
export type RoteiroDesenho = {
  desenho: string | null;
  cod_cliente: string | null;
  descricao: string | null;
  obra: string | null;
  opcao: number;
  nome: string | null;
  padrao: boolean;
  etapas: EtapaModelo[];
};
export type Cadastros = {
  operadores: Operador[];
  centros: Centro[];
  operacoes: Operacao[];
  roteiros_padrao: RoteiroPadrao[];
  roteiros_desenho: RoteiroDesenho[];
  motivos: string[];
  gerado_em: string | null;
};

export type StatusOP = "aguardando" | "liberada" | "encerrada" | "cancelada";
export type StatusEtapa = "pendente" | "andamento" | "pausada" | "concluida";
export type TipoApontamento = "producao" | "setup" | "parada";

export type Apontamento = {
  id: string;
  op_id: string | null;
  etapa_id: string | null;
  operador_codigo: number;
  operador_nome: string | null;
  tipo: TipoApontamento;
  motivo: string | null;
  inicio: string;
  fim: string | null;
  fim_tipo: "pausa" | "fim" | "troca" | "correcao" | null;
  qtde: number | null;
  encerrou_etapa: boolean;
  observacao: string | null;
};

export type Etapa = {
  id: string;
  op_id: string;
  posicao: number;
  operacao: string | null;
  operacao_desc: string | null;
  centro: string | null;
  centro_desc: string | null;
  descricao: string | null;
  hr_preparo: number;
  hr_unitario: number;
  qtde_produzida: number;
  concluido_em: string | null;
  concluido_por: string | null;
};

export type OP = {
  id: string;
  numero: number;
  item_id: string | null;
  po: string | null;
  mac: string | null;
  cliente: string | null;
  desenho: string | null;
  descricao: string | null;
  quantidade: number;
  prazo: string | null;
  prioridade: 1 | 2 | 3;
  status: StatusOP;
  roteiro_origem: string | null;
  observacao: string | null;
  criado_por: string | null;
  criado_em: string;
  liberado_por: string | null;
  liberado_em: string | null;
  encerrado_em: string | null;
  cancelado_motivo: string | null;
  foto: string | null; // sha256 da 1ª imagem do pedido no Follow up
  etapas: Etapa[];
};

export const ROTULO_STATUS_OP: Record<StatusOP, string> = {
  aguardando: "Aguardando liberação",
  liberada: "Em produção",
  encerrada: "Encerrada",
  cancelada: "Cancelada",
};
export const COR_STATUS_OP: Record<StatusOP, string> = {
  aguardando: "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/40",
  liberada: "bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/40",
  encerrada: "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/40",
  cancelada: "bg-stone-200 text-stone-600 ring-stone-300 dark:bg-slate-700/50 dark:text-slate-400 dark:ring-slate-600",
};
export const ROTULO_STATUS_ETAPA: Record<StatusEtapa, string> = {
  pendente: "Pendente",
  andamento: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
};
export const COR_STATUS_ETAPA: Record<StatusEtapa, string> = {
  pendente: "bg-stone-100 text-stone-600 ring-stone-300 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600",
  andamento: "bg-sky-100 text-sky-800 ring-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/40",
  pausada: "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/40",
  concluida: "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/40",
};
export const ROTULO_PRIORIDADE: Record<1 | 2 | 3, string> = { 1: "Urgente", 2: "Normal", 3: "Baixa" };
export const COR_PRIORIDADE: Record<1 | 2 | 3, string> = {
  1: "bg-red-600 text-white",
  2: "bg-stone-200 text-stone-700 dark:bg-slate-700 dark:text-slate-200",
  3: "bg-stone-100 text-stone-500 dark:bg-slate-800 dark:text-slate-400",
};
export const ROTULO_TIPO: Record<TipoApontamento, string> = { producao: "Produção", setup: "Preparação (setup)", parada: "Parada" };

/** Status da etapa a partir dos apontamentos (não fica gravado: não tem como sair do lugar). */
export function statusEtapa(e: Pick<Etapa, "id" | "concluido_em">, aps: Apontamento[]): StatusEtapa {
  if (e.concluido_em) return "concluida";
  const meus = aps.filter((a) => a.etapa_id === e.id);
  if (meus.some((a) => !a.fim)) return "andamento";
  return meus.length ? "pausada" : "pendente";
}

/** Próxima etapa a fazer (a 1ª não concluída na ordem do roteiro). */
export function proximaEtapa<T extends Pick<Etapa, "posicao" | "concluido_em">>(etapas: T[]): T | null {
  return [...etapas].sort((a, b) => a.posicao - b.posicao).find((e) => !e.concluido_em) ?? null;
}

/** % concluído da OP (etapas concluídas / total). */
export function progressoOP(op: Pick<OP, "etapas">): number {
  if (!op.etapas.length) return 0;
  return Math.round((op.etapas.filter((e) => e.concluido_em).length / op.etapas.length) * 100);
}

/** Horas previstas da etapa = preparo + unitário × quantidade. */
export function horasPrevistas(e: Pick<Etapa, "hr_preparo" | "hr_unitario">, qtd: number): number {
  return (Number(e.hr_preparo) || 0) + (Number(e.hr_unitario) || 0) * (Number(qtd) || 0);
}

/** Minutos realizados (só jornada da Macfab — lib/jornada.ts) dos apontamentos da etapa/OP. */
export function minutosRealizados(aps: Apontamento[], agora = new Date()): number {
  return aps.reduce((s, a) => s + minutosUteis(a.inicio, a.fim ?? agora), 0);
}

export function fmtHoras(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "0h";
  const tot = Math.round(h * 60);
  const hh = Math.floor(tot / 60);
  const mm = tot % 60;
  return hh ? (mm ? `${hh}h${String(mm).padStart(2, "0")}` : `${hh}h`) : `${mm}min`;
}
export function fmtMin(m: number): string {
  return fmtHoras(m / 60);
}
export function fmtData(d: string | null | undefined): string {
  if (!d) return "—";
  const [a, m, dia] = d.slice(0, 10).split("-");
  return `${dia}/${m}/${a.slice(2)}`;
}
export function fmtDataHora(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
export function fmtQtd(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
export function numeroOP(n: number): string {
  return `OP ${String(n).padStart(4, "0")}`;
}
/** Dias até o prazo (negativo = atrasada), pelo dia de Brasília. */
export function diasParaPrazo(prazo: string | null, hoje = new Date()): number | null {
  if (!prazo) return null;
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const [a, m, d] = prazo.slice(0, 10).split("-").map(Number);
  return Math.round((new Date(a, m - 1, d).getTime() - h) / 86400000);
}

// ---- Código de barras da etapa (impresso na OP, lido no totem) -------------
// Conteúdo "OP12-30" = OP nº 12, etapa da posição 30. Code 39 (só A-Z 0-9 -),
// o mesmo tipo que o Sectra usa nas OPs dele; qualquer leitor USB lê.
export function codigoEtapa(numero: number, posicao: number): string {
  return `OP${numero}-${posicao}`;
}
/** Lê "OP12-30" (ou "op 12 - 30") → { numero, posicao }; null se não for código de etapa. */
export function lerCodigoEtapa(txt: string): { numero: number; posicao: number } | null {
  const m = /^\s*\*?OP\s*0*(\d+)\s*[-/.]\s*(\d+)\*?\s*$/i.exec(txt);
  return m ? { numero: Number(m[1]), posicao: Number(m[2]) } : null;
}

const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww",
  M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw",
  Y: "wwnnwnnnn", Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "*": "nwnnwnwnn",
};
/** Barras do Code 39 como lista de [x, largura] (unidades: estreita = 1, larga = 3). */
export function barrasCode39(texto: string): { barras: [number, number][]; largura: number } {
  const t = `*${texto.toUpperCase().replace(/[^0-9A-Z.\- ]/g, "")}*`;
  const barras: [number, number][] = [];
  let x = 0;
  for (const ch of t) {
    const p = CODE39[ch];
    for (let i = 0; i < 9; i++) {
      const w = p[i] === "w" ? 3 : 1;
      if (i % 2 === 0) barras.push([x, w]);
      x += w;
    }
    x += 1; // espaço entre caracteres
  }
  return { barras, largura: x - 1 };
}

// ---- Etapas que NÃO entram na OP -----------------------------------------
// Pedido do usuário (07/11/2026): o apontamento da OP é pra fabricação
// (caldeiraria, solda, usinagem…). Ficam de fora:
//   Corte e Pintura — já apontados pelos operadores nas abas Corte e Pintura;
//   Engenharia — apontada pelo João e pelo Honório (Croqui de corte);
//   PCP — planejamento, não é apontado na fábrica;
//   Jateamento — pedido do usuário (07/11/2026).
// Vale pela operação do Sectra e pelo centro produtivo (1º nível da árvore NIVEL).
const FORA_DA_OP: { operacao: string; nivel: string; onde: string }[] = [
  { operacao: "00.60", nivel: "12", onde: "aba Corte" },
  { operacao: "01.60", nivel: "08", onde: "aba Pintura" },
  { operacao: "00.20", nivel: "09", onde: "Engenharia (João / Honório)" },
  { operacao: "00.10", nivel: "10", onde: "PCP" },
  { operacao: "01.40", nivel: "07", onde: "Jateamento (fora da OP)" }, // pedido do usuário (07/11/2026)
];
export const OPERACOES_FORA_DA_OP = FORA_DA_OP.map((f) => f.operacao);
export const NIVEIS_FORA_DA_OP = FORA_DA_OP.map((f) => f.nivel);
export const MOTIVO_FORA_DA_OP =
  "Corte, Pintura, Jateamento, Engenharia e PCP não entram na OP — já são apontados em outro lugar (abas Corte e Pintura, João/Honório).";

function nivelRaiz(centros: Pick<Centro, "codigo" | "nivel">[], centro: string | null | undefined): string {
  return (centros.find((c) => c.codigo === centro)?.nivel ?? "").split(".")[0];
}
export function centroForaDaOP(centros: Pick<Centro, "codigo" | "nivel">[], centro: string | null | undefined): boolean {
  return !!centro && NIVEIS_FORA_DA_OP.includes(nivelRaiz(centros, centro));
}
export function etapaForaDaOP(
  centros: Pick<Centro, "codigo" | "nivel">[],
  e: { operacao?: string | null; centro?: string | null },
): boolean {
  return (!!e.operacao && OPERACOES_FORA_DA_OP.includes(e.operacao)) || centroForaDaOP(centros, e.centro);
}
/** Onde essa etapa já é apontada ("aba Corte"…), pra mostrar no lugar do ＋. */
export function ondeApontaFora(centros: Pick<Centro, "codigo" | "nivel">[], e: { operacao?: string | null; centro?: string | null }): string {
  const n = nivelRaiz(centros, e.centro);
  return (FORA_DA_OP.find((f) => f.operacao === e.operacao) ?? FORA_DA_OP.find((f) => f.nivel === n))?.onde ?? "outro lugar";
}
