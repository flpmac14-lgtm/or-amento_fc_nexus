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
  "visível (sem repetir a mesma lata): componente ('A', 'B' ou null se a etiqueta não disser), lote, " +
  "fabricacao e validade, conteudo_litros (número; ml/1000) e descricao curta (ex.: 'Catalisador PU 5013'). " +
  "DATAS — muito importante: a etiqueta costuma trazer DUAS datas. 'fabricacao' = data de fabricação/produção " +
  "(FAB, FABR., DT. FAB., PROD., MFG). 'validade' = data de VENCIMENTO (VAL, VALID., VALIDADE, VENC., VENCIMENTO, " +
  "EXP, USE ATÉ, CONSUMIR ATÉ). NUNCA coloque a data de fabricação em 'validade'; a validade é sempre DEPOIS da " +
  "fabricação (normalmente 12 a 36 meses depois). Copie cada data exatamente como impressa, com o ano completo se " +
  "houver (ex.: '10/2028', '10/28', '15/10/2028'). Se a etiqueta só trouxer o prazo ('validade 24 meses'), deixe " +
  "'validade' null e preencha 'validade_meses'. Diluente sozinho: produto = nome do diluente, componente null. " +
  "Não invente: campo ilegível = null.";

// "10/2028", "10/28", "15/10/2028", "2028-10", "10.2028" -> "2028-10".
function normalizarMes(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim().replace(/[.\-\s]/g, "/");
  let m = /^(\d{4})\/(\d{1,2})(\/\d{1,2})?$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = /^(?:(\d{1,2})\/)?(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mes = Number(m[2]);
    if (mes < 1 || mes > 12) return null;
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${ano}-${String(mes).padStart(2, "0")}`;
  }
  return null;
}

function somarMeses(aaaamm: string, meses: number): string {
  const [a, m] = aaaamm.split("-").map(Number);
  const total = a * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

type Lata = { fabricacao?: unknown; validade?: unknown; validade_meses?: unknown; [k: string]: unknown };

// Corrige a validade: normaliza o formato, calcula pelo prazo se só houver
// fabricação + meses, e descarta/troca quando veio a data de fabricação.
function ajustarValidade(l: Lata): Lata {
  const fab = normalizarMes(l.fabricacao);
  let val = normalizarMes(l.validade);
  const meses = typeof l.validade_meses === "number" && l.validade_meses > 0 ? Math.round(l.validade_meses) : null;
  // validade antes da fabricação = a IA trocou os campos; igual = pegou a fabricação nos dois.
  if (fab && val && val <= fab) val = meses ? somarMeses(fab, meses) : val < fab ? fab : null;
  if (!val && fab && meses) val = somarMeses(fab, meses);
  return { ...l, fabricacao: fab, validade: val };
}

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
          fabricacao: { type: "STRING", nullable: true },
          validade: { type: "STRING", nullable: true },
          validade_meses: { type: "NUMBER", nullable: true },
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
    const leitura = JSON.parse(texto);
    if (Array.isArray(leitura?.latas)) leitura.latas = leitura.latas.map(ajustarValidade);
    return NextResponse.json({ leitura }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return erro("A IA não devolveu uma leitura válida. Tente outra foto.", 502);
  }
}
