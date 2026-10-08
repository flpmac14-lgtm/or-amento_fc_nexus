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

// Campos de acompanhamento — os únicos editáveis no app. O resto vem da
// Controle de obras (PROCV pelo PO) ou é calculado (Status, Ano).
// Espelha CAMPOS_EDITAVEIS de services/calc_engine/app/follow_up_mae.py.
export type TipoEdicao = "etapa" | "coleta" | "texto" | "numero" | "booleano";
export const CAMPOS_EDITAVEIS: Record<string, TipoEdicao> = {
  ...Object.fromEntries(["eng", "cor", "mon", "sol", "usi", "dob", "jat", "pin"].map((e) => [e, "etapa" as const])),
  coleta: "coleta",
  fornecedor: "texto",
  orcamento_terceirizado_unid: "numero",
  orcamento_custo_macfab_unid: "numero",
  obs_felipe_marcelo: "texto",
  preco_previsto: "numero",
  falta_material: "booleano",
};

// Campos que vêm da Controle de obras (a "mãe", por PROCV pelo PO) —
// travados no app. Espelha CAMPOS_MAE de app/follow_up_mae.py.
export const CAMPOS_DA_MAE = new Set<string>([
  "prazo_contratual", "cliente", "quantidade", "mac", "desenho", "descricao", "obs_alisson",
  "cor2", "cor_2", "plano_pintura", "st", "nf", "tipagem", "peso_unid", "peso_total",
]);

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
// Cor do grupo de pintura — pedido do usuário: pedidos com o mesmo Plano de
// pintura + COR2 + COR-2 destacados na mesma cor. Sai do número fixo do grupo
// (ângulo de ouro no matiz, 3 níveis de luz) — mesma conta do Excel
// (cor_grupo_pintura em services/calc_engine/app/follow_up_excel.py).
export function corGrupoPintura(indice: number): string {
  const matiz = (indice * 137.508) % 360;
  const luz = [58, 45, 70][indice % 3];
  return `hsl(${matiz.toFixed(1)} 70% ${luz}%)`;
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

// --- Relatório por obra -------------------------------------------------------
// Pedido do usuário: gerar por MAC ou por PO. O valor digitado é o começo:
// "4501743280" junta -010, -020...; "690.25" junta 690.25.20.01, 690.25.20.02...

export type TipoObra = "po" | "mac";

export function itensDaObra(itens: ItemFollowUp[], tipo: TipoObra, valor: string): ItemFollowUp[] {
  const alvo = normalizarBusca(valor);
  if (!alvo) return [];
  return itens.filter((i) => normalizarBusca(String(i[tipo] ?? "")).startsWith(alvo));
}

// Valor sugerido a partir de um item: PO sem o número do item / MAC com 2 partes.
export function obraDoItem(item: ItemFollowUp, tipo: TipoObra): string {
  if (tipo === "po") return item.po.split("-")[0];
  return (item.mac ?? "").split(".").slice(0, 2).join(".");
}
