// ZIP simples (sem compressão — "store"), sem biblioteca: junta vários
// arquivos num só pra baixar de uma vez. Feito pras fotos de qualidade
// (components/FotosQualidade.tsx): baixar foto por foto fazia o Chrome pedir
// "permitir vários downloads" / "permitir editar a pasta" (pedido do usuário,
// 16/10/2026). JPEG já é comprimido, então "store" não perde nada.

let tabelaCrc: Uint32Array | null = null;

function crc32(dados: Uint8Array): number {
  if (!tabelaCrc) {
    tabelaCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabelaCrc[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < dados.length; i++) crc = tabelaCrc[(crc ^ dados[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Data/hora no formato do MS-DOS (é o que o ZIP guarda).
function dataDos(d: Date): { hora: number; data: number } {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    data: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ArquivoZip {
  nome: string;
  dados: Uint8Array;
  data?: Date;
}

export function montarZip(arquivos: ArquivoZip[]): Blob {
  const utf8 = new TextEncoder();
  const partes: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let posicao = 0;

  for (const a of arquivos) {
    const nome = utf8.encode(a.nome);
    const crc = crc32(a.dados);
    const { hora, data } = dataDos(a.data ?? new Date());

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão necessária
    local.setUint16(6, 0x0800, true); // nomes em UTF-8 (acentos, µ)
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, data, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, a.dados.length, true);
    local.setUint32(22, a.dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(local.buffer, nome as BlobPart, a.dados as BlobPart);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, data, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, a.dados.length, true);
    c.setUint32(24, a.dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, posicao, true); // onde começa o arquivo
    central.push(new Uint8Array(c.buffer), nome);

    posicao += 30 + nome.length + a.dados.length;
  }

  const tamanhoCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, posicao, true);

  return new Blob([...partes, ...(central as BlobPart[]), fim.buffer], { type: "application/zip" });
}
