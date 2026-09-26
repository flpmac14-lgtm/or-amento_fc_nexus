// Regras de exibição da aba FOLLOW UP — reproduzem o SIGNIFICADO da
// formatação da aba "Gerencia" do Excel (as regras vêm da própria
// importação, não estão fixas aqui), com aparência do app.

import type { EtapaFollowUp, ImportacaoFollowUp, ItemFollowUp, RegraFormatacaoFollowUp } from "./types";

export const ETAPAS: { campo: EtapaFollowUp; rotulo: string; nome: string }[] = [
  { campo: "eng", rotulo: "ENG", nome: "Engenharia" },
  { campo: "cor", rotulo: "COR", nome: "Corte" },
  { campo: "mon", rotulo: "MON", nome: "Montagem" },
  { campo: "sol", rotulo: "SOL", nome: "Solda" },
  { campo: "usi", rotulo: "USI", nome: "Usinagem" },
  { campo: "dob", rotulo: "DOB", nome: "Dobra" },
  { campo: "jat", rotulo: "JAT", nome: "Jato" },
  { campo: "pin", rotulo: "PIN", nome: "Pintura" },
];

// Mesmo critério da fórmula do Status na planilha: etapa "feita" = 100.
export type SituacaoEtapa = "concluida" | "parcial" | "pendente";

export function situacaoEtapa(valor: number | null): SituacaoEtapa {
  if (valor === null || valor <= 0) return "pendente";
  if (valor >= 100) return "concluida";
  return "parcial";
}

// --- Prazo ------------------------------------------------------------------
// A planilha não tem regra de cor para prazo — este destaque é do app.
export type SituacaoPrazo = "atrasado" | "hoje" | "proximo" | "no_prazo" | "sem_prazo";

export const DIAS_PROXIMO_VENCIMENTO = 7;

export const ROTULO_PRAZO: Record<SituacaoPrazo, string> = {
  atrasado: "Atrasado",
  hoje: "Vence hoje",
  proximo: `Vence em até ${DIAS_PROXIMO_VENCIMENTO} dias`,
  no_prazo: "No prazo",
  sem_prazo: "Sem prazo",
};

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diasEntre(deIso: string, ateIso: string): number {
  const [a1, m1, d1] = deIso.split("-").map(Number);
  const [a2, m2, d2] = ateIso.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export function situacaoPrazo(prazo: string | null, hoje = hojeIso()): SituacaoPrazo {
  if (!prazo) return "sem_prazo";
  const dias = diasEntre(hoje, prazo);
  if (dias < 0) return "atrasado";
  if (dias === 0) return "hoje";
  if (dias <= DIAS_PROXIMO_VENCIMENTO) return "proximo";
  return "no_prazo";
}

export function diasParaPrazo(prazo: string | null, hoje = hojeIso()): number | null {
  return prazo ? diasEntre(hoje, prazo) : null;
}

// --- Formatação condicional da planilha -------------------------------------

function cobre(regra: RegraFormatacaoFollowUp, campo: string, linha: number): boolean {
  return regra.intervalos.some((iv) => iv.campo === campo && linha >= iv.de && linha <= iv.ate);
}

function textoCasa(regra: RegraFormatacaoFollowUp, valor: string): boolean {
  // SEARCH() do Excel: não diferencia maiúsculas/minúsculas.
  const v = valor.toLocaleLowerCase("pt-BR");
  const t = (regra.texto ?? "").toLocaleLowerCase("pt-BR");
  switch (regra.operador) {
    case "notContains":
      return !v.includes(t);
    case "beginsWith":
      return v.startsWith(t);
    case "endsWith":
      return v.endsWith(t);
    default:
      return v.includes(t);
  }
}

export interface ContextoRegras {
  regras: RegraFormatacaoFollowUp[]; // ordenadas por prioridade (menor = vence)
  duplicados: Record<string, Set<string>>; // campo → valores repetidos entre os registros presentes
}

export function montarContextoRegras(importacao: ImportacaoFollowUp | null, itens: ItemFollowUp[]): ContextoRegras {
  const regras = [...(importacao?.regras ?? [])].sort((a, b) => a.prioridade - b.prioridade);
  const duplicados: Record<string, Set<string>> = {};
  const presentes = itens.filter((i) => i.presente_na_ultima_importacao);
  for (const regra of regras) {
    if (regra.tipo !== "duplicateValues") continue;
    for (const campo of new Set(regra.intervalos.map((iv) => iv.campo))) {
      if (duplicados[campo]) continue;
      const contagem = new Map<string, number>();
      for (const item of presentes) {
        const v = valorTexto(item, campo);
        if (v) contagem.set(v, (contagem.get(v) ?? 0) + 1);
      }
      duplicados[campo] = new Set([...contagem].filter(([, n]) => n > 1).map(([v]) => v));
    }
  }
  return { regras, duplicados };
}

function valorTexto(item: ItemFollowUp, campo: string): string {
  const v = (item as unknown as Record<string, unknown>)[campo];
  return v === null || v === undefined ? "" : String(v);
}

// Cor que a formatação condicional da planilha daria a esta célula (ou null).
export function corCondicional(
  ctx: ContextoRegras,
  item: ItemFollowUp,
  campo: string,
): { fundo: string | null; fonte: string | null } | null {
  if (!item.presente_na_ultima_importacao) return null; // linha antiga: as regras são da última planilha
  const valor = valorTexto(item, campo);
  for (const regra of ctx.regras) {
    if (regra.tipo === "dataBar" || !cobre(regra, campo, item.linha_planilha)) continue;
    let casa = false;
    if (regra.tipo === "containsText") casa = valor !== "" && textoCasa(regra, valor);
    else if (regra.tipo === "duplicateValues") casa = ctx.duplicados[campo]?.has(valor) ?? false;
    else if (regra.tipo === "uniqueValues") casa = valor !== "" && !(ctx.duplicados[campo]?.has(valor) ?? false);
    else if (regra.tipo === "containsBlanks") casa = valor.trim() === "";
    else if (regra.tipo === "notContainsBlanks") casa = valor.trim() !== "";
    if (casa && (regra.preenchimento || regra.fonte_cor)) {
      return { fundo: regra.preenchimento, fonte: regra.fonte_cor };
    }
  }
  return null;
}

// Texto legível sobre um fundo qualquer (preto ou branco, pelo contraste).
export function corTextoSobre(fundo: string): string {
  const hex = fundo.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.6 ? "#1c1917" : "#ffffff";
}

// Cor de destaque manual da linha na planilha (preenchimento da célula do PO).
export function corDestaque(item: ItemFollowUp): string | null {
  return item.cores?.po?.fundo ?? null;
}

// --- Busca / ordenação --------------------------------------------------------

export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function compararValores(a: unknown, b: unknown): number {
  const vazioA = a === null || a === undefined || a === "";
  const vazioB = b === null || b === undefined || b === "";
  if (vazioA && vazioB) return 0;
  if (vazioA) return 1; // vazios sempre no fim
  if (vazioB) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR", { numeric: true, sensitivity: "base" });
}
