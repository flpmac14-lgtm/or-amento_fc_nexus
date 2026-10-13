// E-mail pronto pro Outlook — pedido do usuário: apertar um botão e o e-mail
// do relatório já sair criado pra ele encaminhar. O site não abre o Outlook
// sozinho, então gera um .eml com "X-Unsent: 1": aberto no Outlook do
// computador, vira uma mensagem NOVA (rascunho) com assunto, corpo em HTML e
// fotos no corpo — só falta pôr o destinatário e enviar.

export interface ImagemEml {
  cid: string; // referenciada no HTML como src="cid:..."
  tipo: string; // image/png, image/jpeg…
  base64: string;
}

function base64Utf8(texto: string): string {
  return base64Bytes(new TextEncoder().encode(texto));
}

function base64Bytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Base64 em linhas de 76 (regra do MIME).
function quebrar(b64: string): string {
  return b64.replace(/.{1,76}/g, "$&\r\n");
}

export function escaparHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Foto do pedido (servida pelo calc_engine) → imagem embutida no e-mail.
export async function imagemParaEml(url: string, cid: string): Promise<ImagemEml | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const tipo = r.headers.get("content-type")?.split(";")[0] || "image/png";
    return { cid, tipo, base64: base64Bytes(new Uint8Array(await r.arrayBuffer())) };
  } catch {
    return null; // sem a foto, o e-mail sai do mesmo jeito
  }
}

export function baixarEml(nomeArquivo: string, assunto: string, html: string, imagens: ImagemEml[] = []) {
  const fronteira = `----=_FCNexus_${Date.now().toString(36)}`;
  const partes = [
    `--${fronteira}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    quebrar(base64Utf8(html)),
    ...imagens.flatMap((im) => [
      `--${fronteira}`,
      `Content-Type: ${im.tipo}`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${im.cid}>`,
      `Content-Disposition: inline; filename="${im.cid}"`,
      "",
      quebrar(im.base64),
    ]),
    `--${fronteira}--`,
    "",
  ];
  const eml = [
    "X-Unsent: 1",
    "To: ",
    `Subject: =?UTF-8?B?${base64Utf8(assunto)}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/related; boundary="${fronteira}"; type="text/html"`,
    "",
    ...partes,
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo.endsWith(".eml") ? nomeArquivo : `${nomeArquivo}.eml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
