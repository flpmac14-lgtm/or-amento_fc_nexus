// Folha da Análise de PIT em Word (.docx), UMA página A4 — pedido do usuário
// (23/11/2026). Gerada no navegador com a lib `docx` (igual lib/propostaWord.ts).
// Pra caber numa página: estima as linhas, diminui a fonte (9 → 7 pt) e, se
// ainda assim não couber, corta os últimos pontos dos tópicos maiores.
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { AnalisePit, Topico } from "./pit";

const AZUL = "1B4F91";
const CINZA = "666666";
const FONTE = "Calibri";
const CM = 567; // twips por cm
const MARGEM_CM = 1.2;
const ALTURA_UTIL_CM = 29.7 - 2 * MARGEM_CM - 4.4; // menos cabeçalho, resumo e rodapé
const LARGURA_UTIL_CM = 21 - 2 * MARGEM_CM;

// Linhas que um texto ocupa (Calibri ~0,19 cm por caractere em 9 pt).
function linhas(texto: string, pt: number, recuoCm = 0): number {
  const porLinha = Math.floor((LARGURA_UTIL_CM - recuoCm) / (0.0175 * pt));
  return Math.max(1, Math.ceil(texto.length / porLinha));
}

function alturaCm(topicos: Topico[], pt: number): number {
  const linhaCm = (pt * 1.2 * 2.54) / 72;
  let h = 0;
  for (const t of topicos) {
    h += linhaCm * 1.15 + 0.15; // título + espaço antes
    for (const p of t.pontos) h += linhas(p, pt, 0.5) * linhaCm + 0.02;
  }
  return h;
}

// Escolhe a fonte e, se precisar, corta pontos até caber.
function caber(topicos: Topico[]): { topicos: Topico[]; pt: number } {
  for (const pt of [9, 8.5, 8, 7.5, 7]) if (alturaCm(topicos, pt) <= ALTURA_UTIL_CM) return { topicos, pt };
  const pt = 7;
  const t = topicos.map((x) => ({ ...x, pontos: [...x.pontos] }));
  let guarda = 500;
  // Corta o último item comum do tópico maior; a 1ª linha (PARAR/Convocar) e o lembrete (➜) ficam.
  const comum = (p: string) => !p.startsWith("➜") && !p.startsWith("+ ");
  while (alturaCm(t, pt) > ALTURA_UTIL_CM && guarda-- > 0) {
    const maior = t.reduce((a, b) => (b.pontos.filter(comum).length > a.pontos.filter(comum).length ? b : a));
    const idx = maior.pontos.map((p, i) => (comum(p) ? i : -1)).filter((i) => i >= 0);
    if (idx.length <= 2) break;
    maior.pontos.splice(idx[idx.length - 1], 1);
    const iMais = maior.pontos.findIndex((p) => p.startsWith("+ "));
    const n = (iMais >= 0 ? Number(/^\+ (\d+)/.exec(maior.pontos[iMais])?.[1] ?? 0) : 0) + 1;
    const txt = `+ ${n} outro(s) item(ns) — ver PIT.`;
    if (iMais >= 0) maior.pontos[iMais] = txt;
    else {
      const iLembrete = maior.pontos.findIndex((p) => p.startsWith("➜"));
      maior.pontos.splice(iLembrete >= 0 ? iLembrete : maior.pontos.length, 0, txt);
    }
  }
  return { topicos: t, pt };
}

const SEM_BORDA = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } as const;
const BORDA = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" } as const;

function celula(rotulo: string, valor: string | null, larguraPct: number): TableCell {
  return new TableCell({
    width: { size: larguraPct, type: WidthType.PERCENTAGE },
    borders: { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA },
    margins: { top: 30, bottom: 30, left: 80, right: 80 },
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: `${rotulo}: `, bold: true, size: 17, font: FONTE, color: AZUL }),
          new TextRun({ text: valor?.trim() || "—", size: 17, font: FONTE }),
        ],
      }),
    ],
  });
}

export async function gerarWordPit(a: AnalisePit): Promise<Blob> {
  const { leitura: l, resumo: r } = a;
  const { topicos, pt } = caber(a.topicos);
  const meio = Math.round(pt * 2);
  const hoje = new Date().toLocaleDateString("pt-BR");

  const cabecalho = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "ANÁLISE DE PIT", bold: true, size: 30, font: FONTE, color: AZUL }),
        new TextRun({ text: "  –  Plano de Inspeção e Testes · pontos críticos", size: 20, font: FONTE, color: CINZA }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: { top: SEM_BORDA, bottom: SEM_BORDA, left: SEM_BORDA, right: SEM_BORDA, insideHorizontal: SEM_BORDA, insideVertical: SEM_BORDA },
      rows: [
        new TableRow({ children: [celula("Cliente", l.cliente, 34), celula("PIT", l.documento, 33), celula("Revisão", l.revisao, 33)] }),
        new TableRow({ children: [celula("Projeto/Pedido", l.projeto, 34), celula("Equipamento", l.equipamento, 33), celula("Aviso prévio", l.aviso_previo, 33)] }),
      ],
    }),
    new Paragraph({
      spacing: { before: 80, after: 40 },
      shading: { fill: "EEF3FA" },
      children: [
        new TextRun({
          text:
            `${r.itens} itens no PIT  ·  ${r.hold} HOLD  ·  ${r.witness} WITNESS  ·  ${r.revisao} p/ aprovação  ·  ` +
            `${r.end} com END  ·  ${r.semCriterio} sem norma/critério`,
          bold: true,
          size: 17,
          font: FONTE,
          color: AZUL,
        }),
      ],
    }),
  ];

  const corpo: Paragraph[] = [];
  for (const t of topicos) {
    corpo.push(
      new Paragraph({
        spacing: { before: 90, after: 20 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: AZUL, space: 1 } },
        keepNext: true,
        children: [new TextRun({ text: t.titulo.toUpperCase(), bold: true, size: meio + 1, font: FONTE, color: AZUL })],
      }),
    );
    for (const p of t.pontos) {
      const destaque = p.startsWith("PARAR") || p.startsWith("➜");
      corpo.push(
        new Paragraph({
          indent: { left: Math.round(0.5 * CM), hanging: Math.round(0.3 * CM) },
          spacing: { after: 0 },
          children: [new TextRun({ text: `• ${p}`, size: meio, font: FONTE, bold: destaque && p.startsWith("PARAR"), italics: p.startsWith("➜") })],
        }),
      );
    }
  }
  if (!topicos.length) {
    corpo.push(new Paragraph({ children: [new TextRun({ text: "Nenhum ponto crítico identificado — conferir o PIT manualmente.", size: meio, font: FONTE })] }));
  }

  const rodape = new Paragraph({
    spacing: { before: 120 },
    children: [
      new TextRun({
        text: `Gerado pelo FC Nexus em ${hoje} a partir de "${a.arquivo}" (leitura por IA + regras Macfab). Conferir sempre com o PIT original do cliente.`,
        size: 14,
        italics: true,
        font: FONTE,
        color: CINZA,
      }),
    ],
  });

  const doc = new Document({
    creator: "FC Nexus",
    title: `Análise de PIT ${l.documento ?? ""}`.trim(),
    styles: { default: { document: { run: { font: FONTE } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: MARGEM_CM * CM, bottom: MARGEM_CM * CM, left: MARGEM_CM * CM, right: MARGEM_CM * CM },
          },
        },
        children: [...cabecalho, ...corpo, rodape],
      },
    ],
  });
  return Packer.toBlob(doc);
}
