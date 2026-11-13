// PDF só com os cartões de crachá (Ordens de produção → Operadores) pra mandar
// pra gráfica — pedido do usuário (13/11/2026): "tamanho padrão de cartão".
// Tamanho de cartão de crédito / crachá (ISO 7810 ID-1 / CR80): 85,6 × 54 mm,
// um cartão por página, fundo branco, tudo dentro de uma margem de segurança
// de 4 mm (a gráfica pode cortar sem pegar texto nem código de barras).
// Logo em alta: public/macfab-logo-alta.png (recortado do logo do ERP rev 02).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { barrasCode39, type Operador } from "@/lib/producao";

const MM = 72 / 25.4;
const LARGURA = 85.6 * MM;
const ALTURA = 54 * MM;
const MARGEM = 4 * MM;
const PRETO = rgb(0.07, 0.07, 0.07);
const CINZA = rgb(0.42, 0.42, 0.42);
const VERDE = rgb(0.0, 0.4, 0.0); // verde do logo
const LINHA_CORTE = rgb(0.75, 0.75, 0.75);

/** Helvetica padrão só tem Latin-1: troca o que não couber (evita erro do pdf-lib). */
function seguro(texto: string, fonte: PDFFont): string {
  let s = "";
  for (const ch of texto) {
    try {
      fonte.encodeText(ch);
      s += ch;
    } catch {
      s += ch.normalize("NFD").replace(/[^\x20-\x7e]/g, "") || "?";
    }
  }
  return s;
}

/** Tamanho de fonte que faz o texto caber na largura (até o mínimo). */
function caber(texto: string, fonte: PDFFont, tamanho: number, largura: number, minimo: number): number {
  let t = tamanho;
  while (t > minimo && fonte.widthOfTextAtSize(texto, t) > largura) t -= 0.25;
  return t;
}

const A4: [number, number] = [210 * MM, 297 * MM];
// A4 retrato: 2 colunas × 5 linhas = 10 cartões por folha (85,6 × 54 mm cada, encostados,
// com linha fina cinza de corte). Pedido do usuário (13/11/2026): "quantos der numa folha A4".
const COLUNAS_A4 = 2;
const LINHAS_A4 = 5;
export const CARTOES_POR_A4 = COLUNAS_A4 * LINHAS_A4;

/**
 * formato "cartao" = uma página por cartão (85,6 × 54 mm), pra gráfica;
 * formato "a4" = 10 cartões por folha A4 com linhas de corte.
 */
export async function gerarPdfCartoesCracha(operadores: Operador[], formato: "cartao" | "a4" = "cartao"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Cartões de crachá — apontamento de produção MACFAB");
  pdf.setCreator("FC Nexus");
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoBytes = await fetch("/macfab-logo-alta.png").then((r) => {
    if (!r.ok) throw new Error("Não consegui carregar o logo da Macfab.");
    return r.arrayBuffer();
  });
  const logo = await pdf.embedPng(logoBytes);
  const util = LARGURA - 2 * MARGEM;

  // Desenha um cartão com o canto inferior esquerdo em (ox, oy).
  function cartao(p: PDFPage, o: Operador, ox: number, oy: number) {
    const centro = (texto: string, fonte: PDFFont, tamanho: number) => ox + (LARGURA - fonte.widthOfTextAtSize(texto, tamanho)) / 2;

    // Logo no topo, centralizado (11 mm de altura).
    const hLogo = 11 * MM;
    const wLogo = (logo.width / logo.height) * hLogo;
    p.drawImage(logo, { x: ox + (LARGURA - wLogo) / 2, y: oy + ALTURA - MARGEM - hLogo, width: wLogo, height: hLogo });

    const rotulo = "APONTAMENTO DE PRODUÇÃO";
    p.drawText(rotulo, { x: centro(rotulo, negrito, 5.5), y: oy + ALTURA - MARGEM - hLogo - 2.6 * MM, size: 5.5, font: negrito, color: VERDE });

    // Nº do crachá (o que o operador digita no totem), bem grande.
    const num = seguro(o.cracha, negrito);
    p.drawText(num, { x: centro(num, negrito, 28), y: oy + 22.8 * MM, size: 28, font: negrito, color: PRETO });

    const apelido = seguro((o.apelido || o.nome).toUpperCase(), negrito);
    const tA = caber(apelido, negrito, 9.5, util, 6);
    p.drawText(apelido, { x: centro(apelido, negrito, tA), y: oy + 17.3 * MM, size: tA, font: negrito, color: PRETO });

    const nome = seguro(o.nome, normal);
    const tN = caber(nome, normal, 6.5, util, 4.5);
    p.drawText(nome, { x: centro(nome, normal, tN), y: oy + 14 * MM, size: tN, font: normal, color: CINZA });

    // Código de barras (Code39 do nº do crachá), embaixo, até 50 mm de largura.
    const { barras, largura } = barrasCode39(o.cracha);
    const modulo = Math.min(0.5 * MM, (50 * MM) / largura);
    const wBarras = largura * modulo;
    const x0 = ox + (LARGURA - wBarras) / 2;
    const hBarras = 8 * MM;
    for (const [x, l] of barras) p.drawRectangle({ x: x0 + x * modulo, y: oy + MARGEM, width: l * modulo, height: hBarras, color: PRETO });
  }

  if (formato === "cartao") {
    for (const o of operadores) cartao(pdf.addPage([LARGURA, ALTURA]), o, 0, 0);
    return pdf.save();
  }

  const mx = (A4[0] - COLUNAS_A4 * LARGURA) / 2;
  const my = (A4[1] - LINHAS_A4 * ALTURA) / 2;
  for (let i = 0; i < operadores.length; i += CARTOES_POR_A4) {
    const p = pdf.addPage(A4);
    operadores.slice(i, i + CARTOES_POR_A4).forEach((o, k) => {
      const ox = mx + (k % COLUNAS_A4) * LARGURA;
      const oy = A4[1] - my - (Math.floor(k / COLUNAS_A4) + 1) * ALTURA;
      p.drawRectangle({ x: ox, y: oy, width: LARGURA, height: ALTURA, borderColor: LINHA_CORTE, borderWidth: 0.4 });
      cartao(p, o, ox, oy);
    });
  }
  return pdf.save();
}

export function baixarPdf(bytes: Uint8Array, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
