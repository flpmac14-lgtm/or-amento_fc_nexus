// Leitura do "quadradinho" (DataMatrix GS1) das latas de tinta — pedido do
// usuário (17/11/2026). Exemplos reais (WEG), com GS (\x1d) entre os campos:
//   01 7899125301740 | 10 0004161016 | 91 1139359184 | 240 10004434 | 11 10/2026 | 16 10/2028
//   = GTIN, lote 4161016, código WEG 10004434, fabricação 10/2026, validade 10/2028.
// A WEG grava as datas como "MM/AAAA" (fora do padrão AAMMDD) — aceitamos os dois.
// Não traz nome nem cor: o app aprende "código -> produto" (tabela pintura_codigos).

export interface EtiquetaGs1 {
  bruto: string;
  gtin: string | null;
  lote: string | null;
  codigo: string | null; // código do produto do fabricante (AI 240)
  fabricacao: string | null; // AAAA-MM
  validade: string | null; // AAAA-MM
  serie: string | null;
}

const GS = "\u001d";

function data(v: string): string | null {
  const s = v.trim();
  let m = /^(\d{2})\/(\d{4})$/.exec(s); // MM/AAAA (WEG)
  if (m) return `${m[2]}-${m[1]}`;
  m = /^(\d{2})(\d{2})(\d{2})$/.exec(s); // AAMMDD (padrão GS1)
  if (m) return `20${m[1]}-${m[2]}`;
  m = /^(\d{2})\/?(\d{2})$/.exec(s); // MM/AA
  if (m) return `20${m[2]}-${m[1]}`;
  return null;
}

/** Interpreta o texto lido. Devolve null se não parece GS1 (ex.: QR com URL). */
export function lerGs1(texto: string): EtiquetaGs1 | null {
  const bruto = texto.replace(/^\]d2|^\]C1|^\]Q3/, "");
  // Campos separados por GS; alguns leitores trocam o GS por espaço.
  const partes = bruto
    .split(new RegExp(`[${GS}\\s]+`))
    .map((p) => p.trim())
    .filter(Boolean);
  const r: EtiquetaGs1 = { bruto: texto, gtin: null, lote: null, codigo: null, fabricacao: null, validade: null, serie: null };
  for (let p of partes) {
    // GTIN (01) tem tamanho fixo de 14: pode vir colado no campo seguinte.
    while (p) {
      if (p.startsWith("01")) {
        const corpo = p.slice(2);
        const fixo = corpo.length > 14 && /^\d{14}/.test(corpo) ? 14 : corpo.length;
        r.gtin = corpo.slice(0, fixo).replace(/^0+(?=\d{13}$)/, "");
        p = corpo.slice(fixo);
        continue;
      }
      if (p.startsWith("240")) r.codigo = p.slice(3) || null;
      else if (p.startsWith("10")) r.lote = p.slice(2).replace(/^0+(?=\d)/, "") || null;
      else if (p.startsWith("21")) r.serie = p.slice(2) || null;
      else if (p.startsWith("11")) r.fabricacao = data(p.slice(2));
      else if (p.startsWith("17") || p.startsWith("16") || p.startsWith("15")) r.validade = data(p.slice(2)) ?? r.validade;
      break;
    }
  }
  return r.gtin || r.lote || r.codigo ? r : null;
}

/** Chave pra aprender/buscar o produto: código do fabricante, senão o GTIN. */
export function chaveEtiqueta(e: EtiquetaGs1): string | null {
  return e.codigo ?? e.gtin;
}
