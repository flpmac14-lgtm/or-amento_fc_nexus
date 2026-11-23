// Análise de PIT (Plano de Inspeção e Testes) — pedido do usuário (23/11/2026):
// o PIT do cliente (Vale, Dana, Brevini…) em Excel ou PDF entra, a IA (Gemini)
// extrai os itens e as regras daqui (determinísticas) montam os pontos
// críticos por tópico, que viram uma folha Word A4 (lib/pitWord.ts).
// Aba "Análise de PIT" no módulo Qualidade: só o flpmac14 e o lailto.
import { EMAIL_FINANCEIRO } from "@/lib/financeiro";
import { DOMINIO_LOGIN_INTERNO } from "@/lib/loginInterno";

const PODEM_ANALISAR = new Set([EMAIL_FINANCEIRO, `lailto@${DOMINIO_LOGIN_INTERNO}`]);

export function podeAnalisarPit(email: string | null | undefined): boolean {
  return PODEM_ANALISAR.has((email ?? "").trim().toLowerCase());
}

// ---- O que a IA devolve (ver app/api/qualidade/pit/route.ts) ----
export interface ItemPit {
  seq: string | null; // nº do item no PIT
  atividade: string; // o que é inspecionado/testado
  referencia: string | null; // norma / procedimento / desenho
  criterio: string | null; // critério de aceitação
  registro: string | null; // documento/relatório gerado
  extensao: string | null; // extensão/frequência (100%, 10%, por lote…)
  ponto_fornecedor: string | null; // H/W/R/S/I/M… do fabricante (Macfab)
  ponto_cliente: string | null; // H/W/R/S… do cliente
  ponto_terceiro: string | null; // inspeção de terceiro / certificadora
}

export interface LeituraPit {
  cliente: string | null;
  documento: string | null; // nº do PIT
  revisao: string | null;
  projeto: string | null; // pedido / projeto / equipamento
  equipamento: string | null;
  aviso_previo: string | null; // prazo de convocação do cliente ("5 dias úteis")
  legenda: string | null; // legenda dos códigos (H = Hold…), como está no PIT
  itens: ItemPit[];
  requisitos_especiais: string[]; // exigências incomuns que a IA destacou
}

// ---- Resultado da análise ----
export interface Topico {
  titulo: string;
  pontos: string[];
}

export interface AnalisePit {
  leitura: LeituraPit;
  arquivo: string;
  resumo: { itens: number; hold: number; witness: number; revisao: number; end: number; semCriterio: number };
  topicos: Topico[];
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

// Tema = pela atividade e o critério (a referência fica de fora: "AWS D1.1" ou
// "desenho de montagem" num item dimensional jogaria ele no tema errado).
function textoItem(i: ItemPit): string {
  return norm([i.atividade, i.criterio].filter(Boolean).join(" | "));
}

// Códigos de ponto: aceita "H", "W/R", "HP", "Hold", "Testemunha", "Espera"…
function temCodigo(v: string | null, cod: "H" | "W" | "R"): boolean {
  const s = norm(v);
  if (!s) return false;
  if (cod === "H") return /(^|[^A-Z])(H|HP|HOLD|ESPERA|PE|PARADA)([^A-Z]|$)/.test(s);
  if (cod === "W") return /(^|[^A-Z])(W|WP|WITNESS|TESTEMUNHA|PT|T)([^A-Z]|$)/.test(s);
  return /(^|[^A-Z])(R|RV|REVIEW|REVISAO|ANALISE|D|DOC|A)([^A-Z]|$)/.test(s);
}

const clienteH = (i: ItemPit) => temCodigo(i.ponto_cliente, "H") || temCodigo(i.ponto_terceiro, "H");
const clienteW = (i: ItemPit) => temCodigo(i.ponto_cliente, "W") || temCodigo(i.ponto_terceiro, "W");
const clienteR = (i: ItemPit) => temCodigo(i.ponto_cliente, "R");

function rotulo(i: ItemPit): string {
  const seq = i.seq ? `${i.seq} – ` : "";
  return `${seq}${i.atividade.trim()}`;
}

function detalhe(i: ItemPit, ...campos: (keyof ItemPit)[]): string {
  const partes: string[] = [];
  for (const c of campos) {
    const v = (i[c] as string | null)?.trim();
    if (v) partes.push(v);
  }
  return partes.length ? ` (${partes.join("; ")})` : "";
}

const encurtar = (s: string, max = 170) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

// Regra = categoria + palavras-chave + o que lembrar quando aparece.
interface Regra {
  titulo: string;
  chave: RegExp;
  lembrete?: (itens: ItemPit[]) => string | null;
  campos: (keyof ItemPit)[];
}

const REGRAS: Regra[] = [
  {
    titulo: "Ensaios não destrutivos (END)",
    chave: /\b(LP|PM|US|RX|RT|UT|MT|PT|VT|EVS|END|NDT)\b|LIQUIDO PENETRANTE|PARTICULAS MAGNETICAS|ULTRA[- ]?SOM|RADIOGRAF|GAMAGRAF|PHASED ARRAY|TOFD|VISUAL DE SOLDA|INSPECAO VISUAL/,
    lembrete: () => "Inspetor END qualificado (SNQC/ABENDI N2) e procedimento de END aprovado antes do ensaio.",
    campos: ["extensao", "referencia", "criterio"],
  },
  {
    titulo: "Soldagem",
    chave: /\b(SOLD|EPS|RQPS|RQS|WPS|PQR|WPQ|SOLDADOR|ASME IX|AWS D1|ISO 15614|ISO 9606|CONSUMIVE|ELETRODO|ARAME)/,
    lembrete: () => "EPS/RQPS e qualificação dos soldadores aprovadas pelo cliente antes de iniciar a soldagem.",
    campos: ["referencia", "criterio"],
  },
  {
    titulo: "Matéria-prima e rastreabilidade",
    chave: /\b(MATERIA[- ]?PRIMA|MATERIAL|CERTIFICADO|EN 10204|3\.1|3\.2|RASTREAB|CORRIDA|PMI|RECEBIMENTO|COMPOSICAO QUIMICA|PROPRIEDADES MECANICAS|CHAPA|BARRA|FUNDID|FORJAD)/,
    lembrete: () => "Certificados da usina conferidos com o NRI/corrida e marcação transferida em cada peça cortada.",
    campos: ["criterio", "referencia"],
  },
  {
    titulo: "Tratamento térmico e dureza",
    chave: /\b(TRATAMENTO TERMICO|TTAT|ALIVIO DE TENS|NORMALIZ|TEMPERA|REVENIMENTO|DUREZA|HARDNESS|PWHT|PRE[- ]?AQUECIMENTO)/,
    lembrete: () => "Gráfico do forno/termopares e relatório de dureza entram no data book.",
    campos: ["criterio", "referencia"],
  },
  {
    titulo: "Dimensional e montagem",
    chave: /\b(DIMENSION|MEDICAO|PLANICIDADE|PARALELISMO|CONCENTRIC|BATIMENTO|ALINHAMENTO|MONTAGEM|PRE[- ]?MONTAGEM|AJUSTE|TOLERANCIA|AS[- ]?BUILT)/,
    lembrete: () => "Relatório dimensional com instrumentos calibrados (certificado de calibração válido).",
    campos: ["referencia", "criterio"],
  },
  {
    titulo: "Testes (pressão, estanqueidade, funcional)",
    chave: /\b(HIDROSTAT|PNEUMAT|ESTANQUEIDADE|VAZAMENTO|LEAK|TESTE FUNCIONAL|FUNCIONAMENTO|BALANCEAMENTO|TORQUE|CARGA|PROVA DE CARGA|RUIDO|VIBRACAO|FAT)/,
    lembrete: () => "Manômetros/torquímetros calibrados e procedimento de teste aprovado antes do ensaio.",
    campos: ["criterio", "referencia"],
  },
  {
    titulo: "Pintura, revestimento e galvanização",
    chave: /\b(PINTURA|TINTA|JATEAMENTO|JATO|SA ?2|SA2|RUGOSIDADE|PERFIL DE ANCORAGEM|ESPESSURA|DFT|EPS DE PINTURA|ADERENCIA|HOLIDAY|DESCONTINUIDADE|UMIDADE RELATIVA|PONTO DE ORVALHO|GALVANIZ|ZINCAGEM|REVESTIMENTO|PETROBRAS N-?\d)/,
    lembrete: () => "Registrar condições ambientais (UR, ponto de orvalho, temp. de superfície), rugosidade e DFT por demão.",
    campos: ["criterio", "referencia"],
  },
  {
    titulo: "Identificação, embalagem e preservação",
    chave: /\b(IDENTIFICA|MARCACAO|PLAQUETA|TAG|EMBALAG|PRESERVA|PROTECAO|ACONDICION|EXPEDICAO|TRANSPORTE|ROMANEIO|ICAMENTO)/,
    campos: ["criterio", "referencia"],
  },
  {
    titulo: "Documentação e data book",
    chave: /\b(DATA ?BOOK|DOSSIE|DOCUMENTA|RELATORIO FINAL|LIBERACAO|CERTIFICADO DE CONFORMIDADE|IRN|RELEASE NOTE|MANUAL|AS[- ]?BUILT|PLANO DE INSPECAO|APROVACAO DE PROCEDIMENTO)/,
    lembrete: () => "Montar o data book na ordem do PIT; cada linha precisa de um registro assinado.",
    campos: ["registro", "criterio"],
  },
];

const MAX_POR_TOPICO = 6;

function listar(itens: ItemPit[], campos: (keyof ItemPit)[]): string[] {
  const l = itens.map((i) => encurtar(rotulo(i) + detalhe(i, ...campos)));
  if (l.length > MAX_POR_TOPICO) return [...l.slice(0, MAX_POR_TOPICO - 1), `+ ${l.length - MAX_POR_TOPICO + 1} outro(s) item(ns) — ver PIT.`];
  return l;
}

/** Aplica as regras da Macfab sobre a leitura da IA. */
export function analisarPit(leitura: LeituraPit, arquivo: string): AnalisePit {
  const itens = (leitura.itens ?? []).filter((i) => i && i.atividade?.trim());
  const hold = itens.filter(clienteH);
  const witness = itens.filter((i) => !clienteH(i) && clienteW(i));
  const revisao = itens.filter((i) => !clienteH(i) && !clienteW(i) && clienteR(i));
  const semCriterio = itens.filter((i) => !i.criterio?.trim() && !i.referencia?.trim());
  const topicos: Topico[] = [];

  // 1. Pontos de espera — o mais crítico: a fabricação para até o cliente liberar.
  if (hold.length) {
    const p = listar(hold, ["extensao"]);
    p.unshift(
      `PARAR a fabricação nestas etapas até a liberação formal do cliente${leitura.aviso_previo ? ` — convocar com ${leitura.aviso_previo} de antecedência` : ""}.`,
    );
    topicos.push({ titulo: `Pontos de espera – HOLD (${hold.length})`, pontos: p });
  }
  // 2. Testemunha — convocar; se não vier no prazo, segue com registro.
  if (witness.length) {
    const p = listar(witness, ["extensao"]);
    p.unshift(
      `Convocar o inspetor do cliente${leitura.aviso_previo ? ` com ${leitura.aviso_previo} de antecedência` : ""}; guardar o e-mail da convocação como evidência.`,
    );
    topicos.push({ titulo: `Pontos testemunhados – WITNESS (${witness.length})`, pontos: p });
  }
  // 3. Por categoria técnica (um item pode cair em mais de uma).
  for (const r of REGRAS) {
    const doTema = itens.filter((i) => r.chave.test(textoItem(i)));
    if (!doTema.length) continue;
    const p = listar(doTema, r.campos);
    const lembrete = r.lembrete?.(doTema);
    if (lembrete) p.push(`➜ ${lembrete}`);
    topicos.push({ titulo: r.titulo, pontos: p });
  }
  // 4. Revisão de documentos pelo cliente antes de usar.
  if (revisao.length) {
    topicos.push({
      titulo: `Documentos para aprovação prévia do cliente – R (${revisao.length})`,
      pontos: listar(revisao, ["registro"]),
    });
  }
  // 5. O que a IA achou de incomum no PIT.
  const especiais = (leitura.requisitos_especiais ?? []).map((s) => s.trim()).filter(Boolean);
  if (especiais.length) topicos.push({ titulo: "Requisitos especiais do cliente", pontos: especiais.slice(0, 8).map((s) => encurtar(s)) });
  // 6. Lacunas: linha sem norma nem critério = esclarecer antes de fabricar.
  if (semCriterio.length) {
    topicos.push({
      titulo: `A esclarecer com o cliente – sem norma/critério (${semCriterio.length})`,
      pontos: listar(semCriterio, []),
    });
  }
  if (!leitura.legenda?.trim() && (hold.length || witness.length)) {
    topicos.push({ titulo: "Observação", pontos: ["O PIT não traz legenda dos códigos (H/W/R) — confirmar o significado com o cliente."] });
  }

  const end = itens.filter((i) => REGRAS[0].chave.test(textoItem(i))).length;
  return {
    leitura,
    arquivo,
    resumo: { itens: itens.length, hold: hold.length, witness: witness.length, revisao: revisao.length, end, semCriterio: semCriterio.length },
    topicos,
  };
}
