// Botão "WhatsApp" da Solicitação de hora extra — pedido do usuário (26/10/2026):
// encaminhar o relatório no WhatsApp. Monta o PDF aqui mesmo (pdf-lib, mesmo
// conteúdo da folha /follow-up/hora-extra) e abre o "Compartilhar" do aparelho
// (no celular o WhatsApp aparece e o PDF vai anexado). Sem compartilhar arquivo
// (PC antigo): baixa o PDF e abre o WhatsApp com o resumo em texto.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarDataBr } from "@/lib/format";
import { diaDaSemana, formatarHoras, minutosDaSolicitacao, minutosDoDia, type SolicitacaoHoraExtra } from "@/lib/horaExtra";

const A4: [number, number] = [595.28, 841.89];
const MARGEM = 40;
const AZUL = rgb(0.12, 0.25, 0.55);
const CINZA = rgb(0.45, 0.45, 0.45);
const LINHA = rgb(0.8, 0.8, 0.8);
const PRETO = rgb(0.1, 0.1, 0.1);

function nomeArquivo(s: SolicitacaoHoraExtra): string {
  return `Solicitacao de hora extra n${s.numero}.pdf`;
}

function quebrar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) > largura && atual) {
      linhas.push(atual);
      atual = palavra;
    } else atual = tentativa;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export async function gerarPdfHoraExtra(s: SolicitacaoHoraExtra): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Solicitação de hora extra nº ${s.numero}`);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const largura = A4[0] - 2 * MARGEM;

  let pagina: PDFPage = pdf.addPage(A4);
  let y = A4[1] - MARGEM;
  const texto = (t: string, x: number, tam: number, fonte = normal, cor = PRETO) => pagina.drawText(t, { x, y, size: tam, font: fonte, color: cor });
  const linha = (yy: number, cor = LINHA, esp = 0.6, x0 = MARGEM, x1 = A4[0] - MARGEM) =>
    pagina.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness: esp, color: cor });
  const novaPaginaSe = (falta: number) => {
    if (y - falta < MARGEM) {
      pagina = pdf.addPage(A4);
      y = A4[1] - MARGEM;
    }
  };

  // Cabeçalho
  texto("FC NEXUS · MACFAB", MARGEM, 8, negrito, AZUL);
  const num = `Nº ${s.numero}`;
  texto(num, A4[0] - MARGEM - negrito.widthOfTextAtSize(num, 16), 16, negrito);
  y -= 20;
  texto("Solicitação de hora extra", MARGEM, 18, negrito);
  const emitida = `Emitida em ${new Date(s.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`;
  texto(emitida, A4[0] - MARGEM - normal.widthOfTextAtSize(emitida, 8), 8, normal, CINZA);
  y -= 8;
  linha(y, AZUL, 2.5);
  y -= 22;

  // Resumo
  const total = minutosDaSolicitacao(s.dias) * s.funcionarios.length;
  const caixas: [string, string][] = [
    ["SOLICITANTE", s.solicitante],
    ["FUNCIONÁRIOS", String(s.funcionarios.length)],
    ["TOTAL DE HORAS", formatarHoras(total)],
  ];
  const lc = (largura - 16) / 3;
  caixas.forEach(([r, v], i) => {
    const x = MARGEM + i * (lc + 8);
    pagina.drawRectangle({ x, y: y - 22, width: lc, height: 34, borderColor: LINHA, borderWidth: 0.8 });
    pagina.drawText(r, { x: x + 6, y: y + 2, size: 6.5, font: normal, color: CINZA });
    // Nome comprido: diminui a letra até caber numa linha.
    let tam = 10;
    while (tam > 6 && negrito.widthOfTextAtSize(v, tam) > lc - 12) tam -= 0.5;
    pagina.drawText(v, { x: x + 6, y: y - 12, size: tam, font: negrito, color: PRETO });
  });
  y -= 44;

  if (s.motivo) {
    const linhas = quebrar(`Motivo: ${s.motivo}`, normal, 9.5, largura - 12);
    pagina.drawRectangle({ x: MARGEM, y: y - linhas.length * 12 + 4, width: largura, height: linhas.length * 12 + 6, color: rgb(0.93, 0.95, 1) });
    pagina.drawRectangle({ x: MARGEM, y: y - linhas.length * 12 + 4, width: 3, height: linhas.length * 12 + 6, color: AZUL });
    for (const l of linhas) {
      texto(l, MARGEM + 8, 9.5);
      y -= 12;
    }
    y -= 12;
  }

  // Dias e horário
  texto("DIAS E HORÁRIO", MARGEM, 8, negrito, CINZA);
  y -= 14;
  const colDias = [MARGEM, MARGEM + 110, MARGEM + 210, MARGEM + 290];
  ["DATA", "DIA", "INÍCIO", "FIM"].forEach((c, i) => pagina.drawText(c, { x: colDias[i], y, size: 7, font: normal, color: CINZA }));
  pagina.drawText("HORAS", { x: A4[0] - MARGEM - normal.widthOfTextAtSize("HORAS", 7), y, size: 7, font: normal, color: CINZA });
  y -= 5;
  linha(y, CINZA, 1);
  for (const d of s.dias) {
    novaPaginaSe(20);
    y -= 14;
    texto(formatarDataBr(d.data), colDias[0], 10, negrito);
    texto(diaDaSemana(d.data), colDias[1], 10);
    texto(d.inicio, colDias[2], 10);
    texto(d.fim, colDias[3], 10);
    const h = formatarHoras(minutosDoDia(d));
    texto(h, A4[0] - MARGEM - negrito.widthOfTextAtSize(h, 10), 10, negrito);
    y -= 5;
    linha(y);
  }
  y -= 10;
  texto("Almoço (12:00–13:00) descontado das horas.", MARGEM, 7, normal, CINZA);
  y -= 24;

  // Funcionários, com espaço pra assinar
  novaPaginaSe(40);
  texto("FUNCIONÁRIOS", MARGEM, 8, negrito, CINZA);
  y -= 14;
  const xAss = A4[0] - MARGEM - 190;
  pagina.drawText("#", { x: MARGEM, y, size: 7, font: normal, color: CINZA });
  pagina.drawText("NOME", { x: MARGEM + 22, y, size: 7, font: normal, color: CINZA });
  pagina.drawText("ASSINATURA DO FUNCIONÁRIO", { x: xAss, y, size: 7, font: normal, color: CINZA });
  y -= 5;
  linha(y, CINZA, 1);
  s.funcionarios.forEach((f, i) => {
    novaPaginaSe(26);
    y -= 20;
    texto(String(i + 1), MARGEM, 10, normal, CINZA);
    texto(f, MARGEM + 22, 10, negrito);
    y -= 6;
    linha(y, LINHA, 0.6, MARGEM, xAss - 10);
    linha(y, CINZA, 0.8, xAss, A4[0] - MARGEM);
  });

  // Assinaturas
  novaPaginaSe(80);
  y -= 60;
  const la = (largura - 40) / 3;
  (
    [
      ["Solicitante", s.solicitante],
      ["Aprovação (Diretoria)", ""],
      ["Recursos Humanos", ""],
    ] as const
  ).forEach(([r, nome], i) => {
    const x = MARGEM + i * (la + 20);
    linha(y, PRETO, 0.8, x, x + la);
    pagina.drawText(r, { x: x + (la - negrito.widthOfTextAtSize(r, 8.5)) / 2, y: y - 11, size: 8.5, font: negrito, color: PRETO });
    if (nome) pagina.drawText(nome, { x: x + Math.max(0, (la - normal.widthOfTextAtSize(nome, 7)) / 2), y: y - 21, size: 7, font: normal, color: CINZA });
  });

  return pdf.save();
}

export function textoWhatsApp(s: SolicitacaoHoraExtra): string {
  return [
    `*Solicitação de hora extra nº ${s.numero}*`,
    "",
    "*Dias:*",
    ...s.dias.map((d) => `• ${formatarDataBr(d.data)} (${diaDaSemana(d.data)}) das ${d.inicio} às ${d.fim}`),
    "",
    `*Funcionários (${s.funcionarios.length}):*`,
    ...s.funcionarios.map((f) => `• ${f}`),
    ...(s.motivo ? ["", `*Motivo:* ${s.motivo}`] : []),
    "",
    `Solicitante: ${s.solicitante}`,
  ].join("\n");
}

/** Abre o Compartilhar com o PDF (celular → WhatsApp); sem suporte, baixa o PDF e abre o WhatsApp com o texto. */
export async function encaminharWhatsApp(s: SolicitacaoHoraExtra): Promise<void> {
  const bytes = await gerarPdfHoraExtra(s);
  const arquivo = new File([bytes as BlobPart], nomeArquivo(s), { type: "application/pdf" });
  const texto = textoWhatsApp(s);
  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: `Solicitação de hora extra nº ${s.numero}`, text: texto });
      return;
    } catch (e) {
      if ((e as Error).name === "AbortError") return; // fechou o Compartilhar
    }
  }
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
}
