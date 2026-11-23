import { NextResponse, type NextRequest } from "next/server";
import { podeAnalisarPit } from "@/lib/pit";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Análise de PIT — pedido do usuário (23/11/2026). Recebe o PIT do cliente:
// Excel já convertido em texto no navegador (campo "texto") ou o PDF em si
// (campo "arquivo", o Gemini lê PDF, inclusive escaneado). Devolve os itens
// extraídos; as regras de análise rodam no navegador (lib/pit.ts::analisarPit).
// Uma chamada por análise (Gemini Flash-Lite; chave GOOGLE_API_KEY na Vercel).
// Só o flpmac14 e o lailto (o proxy deixa /api/qualidade/* pro perfil qualidade).

export const maxDuration = 300;

const MODELO = process.env.PIT_IA_MODELO ?? "gemini-3.5-flash-lite";
const MAX_PDF = 4 * 1024 * 1024; // a Vercel não aceita corpo acima de 4,5 MB
const MAX_TEXTO = 150_000;

const PROMPT =
  "Você é inspetor de qualidade de uma caldeiraria/usinagem pesada (Macfab). Recebe um PIT – Plano de Inspeção e Testes " +
  "(ITP / Inspection and Test Plan) de um cliente (ex.: Vale, Dana, Brevini, Weir, Andritz). Extraia:\n" +
  "- cliente, documento (nº do PIT), revisao, projeto (pedido/PO/projeto), equipamento (o que será fabricado);\n" +
  "- aviso_previo: prazo para convocar o cliente/inspetor, como está escrito (ex.: '5 dias úteis', '48 h'); null se não houver;\n" +
  "- legenda: a legenda dos códigos de inspeção copiada resumida (ex.: 'H=Hold, W=Witness, R=Review, S=Surveillance'); null se não houver;\n" +
  "- itens: TODAS as linhas de atividade de inspeção/teste, na ordem, sem pular. Para cada: seq (nº do item), atividade (curta, " +
  "em português), referencia (norma/procedimento/desenho), criterio (critério de aceitação), registro (relatório/documento " +
  "gerado), extensao (100%, 10%, por lote, amostragem…), ponto_fornecedor (código na coluna do fabricante/fornecedor/Macfab), " +
  "ponto_cliente (código na coluna do cliente/comprador), ponto_terceiro (código de inspetor terceiro/certificadora/órgão). " +
  "Copie os códigos como estão (H, W, R, S, I, M, V, X, P…). Títulos de seção sem atividade não são itens.\n" +
  "- requisitos_especiais: até 8 frases curtas com exigências incomuns ou críticas que o chão de fábrica pode esquecer " +
  "(ex.: notificação formal por e-mail, inspetor terceiro obrigatório, material com certificado 3.2, rastreabilidade peça a " +
  "peça, ensaio de impacto, PMI, procedimento a aprovar antes, prazo de entrega do data book, embalagem marítima).\n" +
  "Textos curtos e objetivos. Não invente: campo ausente = null.";

const S = { type: "STRING", nullable: true };
const SCHEMA = {
  type: "OBJECT",
  properties: {
    cliente: S,
    documento: S,
    revisao: S,
    projeto: S,
    equipamento: S,
    aviso_previo: S,
    legenda: S,
    itens: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          seq: S,
          atividade: { type: "STRING" },
          referencia: S,
          criterio: S,
          registro: S,
          extensao: S,
          ponto_fornecedor: S,
          ponto_cliente: S,
          ponto_terceiro: S,
        },
        required: ["atividade"],
      },
    },
    requisitos_especiais: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["itens", "requisitos_especiais"],
};

const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

export async function POST(request: NextRequest) {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !podeAnalisarPit(user.email)) return erro("Acesso restrito.", 403);
  const chave = process.env.GOOGLE_API_KEY;
  if (!chave) return erro("Leitura por IA não configurada no servidor.", 503);

  const form = await request.formData().catch(() => null);
  const nome = String(form?.get("nome") ?? "PIT");
  const texto = String(form?.get("texto") ?? "").slice(0, MAX_TEXTO);
  const arquivo = form?.get("arquivo");
  const partes: object[] = [];
  if (arquivo instanceof File) {
    if (arquivo.size > MAX_PDF) return erro("PDF muito grande (máx. 4 MB).", 400);
    partes.push({ inlineData: { mimeType: "application/pdf", data: Buffer.from(await arquivo.arrayBuffer()).toString("base64") } });
    partes.push({ text: `Arquivo: ${nome}` });
  } else if (texto.trim().length > 30) {
    partes.push({ text: `Arquivo: ${nome}\nConteúdo da planilha (cada aba, linhas separadas por quebra, colunas por " | "):\n\n${texto}` });
  } else {
    return erro("Arquivo vazio ou ilegível.", 400);
  }

  const corpo = JSON.stringify({
    systemInstruction: { parts: [{ text: PROMPT }] },
    contents: [{ role: "user", parts: partes }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA, maxOutputTokens: 60000 },
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
    await new Promise((ok) => setTimeout(ok, 3000 * (t + 1)));
  }
  if (!resposta || !resposta.ok) {
    const s = resposta?.status ?? 0;
    return erro(s === 429 || s === 503 ? "A IA está ocupada agora. Tente de novo em alguns segundos." : `Falha na leitura do PIT (${s}).`, 502);
  }
  try {
    const j = await resposta.json();
    const txt = j.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text ?? "{}";
    const leitura = JSON.parse(txt);
    if (!Array.isArray(leitura?.itens)) throw new Error("sem itens");
    if (!Array.isArray(leitura.requisitos_especiais)) leitura.requisitos_especiais = [];
    return NextResponse.json({ leitura }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return erro("A IA não devolveu uma leitura válida do PIT. Confira se o arquivo é mesmo um PIT.", 502);
  }
}
