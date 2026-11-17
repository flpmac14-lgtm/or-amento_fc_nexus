import { NextResponse, type NextRequest } from "next/server";
import { podeVerPintura } from "@/lib/pintura";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Leitura da etiqueta da lata pela IA — pedido do usuário (17/11/2026): o
// quadradinho não funcionou na prática; o felipe tira até 3 fotos e a IA
// devolve produto, fabricante, cor e, por componente (A/B), lote, validade e
// conteúdo. Uma chamada por entrada (Gemini Flash-Lite, nível gratuito).
// A chave fica só no servidor (GOOGLE_API_KEY nas variáveis da Vercel).

export const maxDuration = 120;

const MODELO = process.env.PINTURA_IA_MODELO ?? "gemini-3.5-flash-lite";
const MAX_FOTOS = 3;
const MAX_BYTES = 3 * 1024 * 1024; // por foto (o celular já reduz antes de enviar)

const PROMPT =
  "Fotos de etiquetas de latas de tinta industrial: pode ser a mesma lata em várias fotos, ou o componente A e o " +
  "componente B (catalisador) do mesmo produto. Extraia: produto (nome comercial do componente A, ex.: 'LACKTHANE N 2677 R', " +
  "'INTERSEAL 670 HS'; se só houver o B, o nome do produto ao qual ele pertence), fabricante (ex.: WEG, International, " +
  "Sumaré, Renner), cor curta como na planilha ('CZ N6,5', 'AM 5 Y 8/12', 'CZ RAL 7035'; siglas: CZ cinza, AM amarelo, " +
  "AZ azul, BR branco, PT preto, VM vermelho, LR laranja, VD verde, AL alumínio; null se não houver) e, para cada lata " +
  "visível (sem repetir a mesma lata): componente ('A', 'B' ou null se a etiqueta não disser), lote, validade (AAAA-MM), " +
  "conteudo_litros (número; ml/1000) e descricao curta (ex.: 'Catalisador PU 5013'). Diluente sozinho: produto = nome do " +
  "diluente, componente null. Não invente: campo ilegível = null.";

const SCHEMA = {
  type: "OBJECT",
  properties: {
    produto: { type: "STRING", nullable: true },
    fabricante: { type: "STRING", nullable: true },
    cor: { type: "STRING", nullable: true },
    latas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          componente: { type: "STRING", nullable: true },
          lote: { type: "STRING", nullable: true },
          validade: { type: "STRING", nullable: true },
          conteudo_litros: { type: "NUMBER", nullable: true },
          descricao: { type: "STRING", nullable: true },
        },
      },
    },
  },
  required: ["latas"],
};

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

export async function POST(request: NextRequest) {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !podeVerPintura(user)) return erro("Acesso restrito.", 403);
  const chave = process.env.GOOGLE_API_KEY;
  if (!chave) return erro("Leitura por IA não configurada no servidor.", 503);

  const form = await request.formData().catch(() => null);
  const fotos = (form?.getAll("fotos") ?? []).filter((f): f is File => f instanceof File).slice(0, MAX_FOTOS);
  if (!fotos.length) return erro("Envie ao menos uma foto da etiqueta.", 400);
  const partes = [];
  for (const f of fotos) {
    if (f.size > MAX_BYTES) return erro("Foto muito grande.", 400);
    partes.push({ inlineData: { mimeType: f.type || "image/jpeg", data: Buffer.from(await f.arrayBuffer()).toString("base64") } });
  }

  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: PROMPT }] },
    contents: [{ role: "user", parts: partes }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
  });
  // 503/429 = Gemini sobrecarregado (passageiro): tenta de novo algumas vezes.
  let resposta: Response | null = null;
  for (let t = 0; t < 4; t++) {
    resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: corpo,
    });
    if (![429, 500, 503].includes(resposta.status)) break;
    await new Promise((ok) => setTimeout(ok, 2500 * (t + 1)));
  }
  if (!resposta || !resposta.ok) {
    const s = resposta?.status ?? 0;
    return erro(
      s === 429 || s === 503 ? "A IA está ocupada agora. Tente de novo em alguns segundos." : `Falha na leitura da etiqueta (${s}).`,
      502,
    );
  }
  try {
    const j = await resposta.json();
    const texto = j.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? "{}";
    return NextResponse.json({ leitura: JSON.parse(texto) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return erro("A IA não devolveu uma leitura válida. Tente outra foto.", 502);
  }
}
