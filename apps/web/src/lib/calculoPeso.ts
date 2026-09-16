export interface ResultadoPesoComercial {
  pesoUnitario: number;
  quantidadeNum: number;
  pesoLiquido: number;
  perdaNum: number;
  pesoBrutoExato: number;
  incrementoArredondamento: number;
  pesoBruto: number;
  precoKgNum: number | null;
  custoMp: number | null;
}

function numeroBr(texto: string): number {
  return Number(texto.replace(",", "."));
}

/** Peso líquido = peso unitário × quantidade; peso bruto = peso líquido ×
 * (1 + perda/100), arredondado pra cima no incremento informado (ex: 1kg,
 * 0,5kg) — nunca compra menos material do que precisa. Sem incremento
 * (branco ou 0), peso bruto fica exato, sem arredondar. */
export function calcularPesoComercial(
  pesoUnitario: number,
  quantidade: string,
  perdaPct: string,
  precoKg: string,
  arredondamentoKg: string,
): ResultadoPesoComercial | null {
  const quantidadeNum = numeroBr(quantidade) || 0;
  if (!quantidadeNum) return null;

  const perdaNum = numeroBr(perdaPct) || 0;
  const precoKgNum = precoKg ? numeroBr(precoKg) : null;
  const incrementoArredondamento = arredondamentoKg ? numeroBr(arredondamentoKg) || 0 : 0;

  const pesoLiquido = pesoUnitario * quantidadeNum;
  const pesoBrutoExato = pesoLiquido * (1 + perdaNum / 100);
  const pesoBruto =
    incrementoArredondamento > 0
      ? Math.ceil(pesoBrutoExato / incrementoArredondamento) * incrementoArredondamento
      : pesoBrutoExato;
  const custoMp = precoKgNum !== null ? pesoBruto * precoKgNum : null;

  return { pesoUnitario, quantidadeNum, pesoLiquido, perdaNum, pesoBrutoExato, incrementoArredondamento, pesoBruto, precoKgNum, custoMp };
}
