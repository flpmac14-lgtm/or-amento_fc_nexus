import { NextResponse, type NextRequest } from "next/server";
import { podeAnalisarPit, type ItemPit } from "@/lib/pit";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Análise de PIT — pedido do usuário (23/11/2026). Recebe o PIT do cliente:
// texto (Excel convertido no navegador, ou o texto do PDF) no campo "texto",
// ou o PDF em si ("arquivo") só quando é escaneado (sem texto). Devolve os
// itens extraídos; as regras rodam no navegador (lib/pit.ts::analisarPit).
// Só o flpmac14 e o lailto (o proxy deixa /api/qualidade/* pro perfil qualidade).
//
// GASTAR POUCO TOKEN (pedido do usuário, 23/11/2026):
// - texto em vez de PDF sempre que dá; texto enxuto (colunas vazias somem) e com teto;
// - chaves curtas no JSON de saída (a saída é a parte cara) e textos curtos;
// - sem "raciocínio" (thinking) e saída limitada;
// - o navegador guarda a leitura por arquivo (mesmo PIT de novo = zero chamada).

export const maxDuration = 300;

const MODELO = process.env.PIT_IA_MODELO ?? "gemini-3.5-flash-lite";
const MAX_PDF = 4 * 1024 * 1024; // a Vercel não aceita corpo acima de 4,5 MB
const MAX_TEXTO = 60_000; // ~15 mil tokens de entrada no máximo

const PROMPT =
  "PIT (Plano de Inspeção e Testes / ITP) de cliente de caldeiraria. Responda em JSON curto, em português:\n" +
  "cl=cliente, doc=nº do PIT, rev=revisão, proj=pedido/projeto, eq=equipamento, av=prazo para convocar o cliente " +
  "(ex.: '5 dias úteis'), leg=legenda dos códigos resumida (ex.: 'H=Hold W=Witness R=Review').\n" +
  "it=TODAS as linhas de inspeção/teste, na ordem (títulos de seção não). Cada uma: s=nº, a=atividade (máx. 70 " +
  "caracteres), r=norma/procedimento (curto), c=critério de aceitação (máx. 50 caracteres), e=extensão (100%, 10%…), " +
  "f=código do fabricante, k=código do cliente, t=código de terceiro/certificadora. Códigos como estão (H, W, R, S…).\n" +
  "esp=até 5 exigências incomuns ou críticas (frases de até 90 caracteres).\n" +
  "Campo ausente = omita. Não invente.";

const S = { type: "STRING" };
const SCHEMA = {
  type: "OBJECT",
  properties: {
    cl: S,
    doc: S,
    rev: S,
    proj: S,
    eq: S,
    av: S,
    leg: S,
    it: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { s: S, a: S, r: S, c: S, e: S, f: S, k: S, t: S },
        required: ["a"],
      },
    },
    esp: { type: "ARRAY", items: S },
  },
  required: ["it"],
};

type Curto = Record<string, string | undefined>;
const v = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);

// Chaves curtas da IA → formato do app (lib/pit.ts::LeituraPit).
function expandir(j: { it?: Curto[]; esp?: string[] } & Curto) {
  const itens: ItemPit[] = (j.it ?? []).map((i) => ({
    seq: v(i.s),
    atividade: v(i.a) ?? "",
    referencia: v(i.r),
    criterio: v(i.c),
    registro: null,
    extensao: v(i.e),
    ponto_fornecedor: v(i.f),
    ponto_cliente: v(i.k),
    ponto_terceiro: v(i.t),
  }));
  return {
    cliente: v(j.cl),
    documento: v(j.doc),
    revisao: v(j.rev),
    projeto: v(j.proj),
    equipamento: v(j.eq),
    aviso_previo: v(j.av),
    legenda: v(j.leg),
    itens,
    requisitos_especiais: Array.isArray(j.esp) ? j.esp.filter((x) => typeof x === "string") : [],
  };
}

// Tira o que só gasta token: espaços repetidos, colunas vazias, linhas repetidas.
function enxugar(t: string): string {
  const vistas = new Set<string>();
  return t
    .split("\n")
    .map((l) =>
      l
        .replace(/[ \t\u00A0]+/g, " ")
        .replace(/( ?\| ?)+/g, " | ")
        .replace(/^ ?\| ?| ?\| ?$/g, "")
        .trim(),
    )
    .filter((l) => {
      if (!l) return false;
      if (l.startsWith("###")) return true;
      if (vistas.has(l)) return false; // cabeçalho repetido em toda página
      vistas.add(l);
      return true;
    })
    .join("\n");
}

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
  const texto = enxugar(String(form?.get("texto") ?? "")).slice(0, MAX_TEXTO);
  const arquivo = form?.get("arquivo");
  let parte: object;
  if (texto.length > 30) {
    parte = { text: texto };
  } else if (arquivo instanceof File) {
    if (arquivo.size > MAX_PDF) return erro("PDF escaneado muito grande (máx. 4 MB).", 400);
    parte = { inlineData: { mimeType: "application/pdf", data: Buffer.from(await arquivo.arrayBuffer()).toString("base64") } };
  } else {
    return erro("Arquivo vazio ou ilegível.", 400);
  }

  const config = { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA, maxOutputTokens: 16000 };
  const montar = (semThinking: boolean) =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: PROMPT }] },
      contents: [{ role: "user", parts: [parte] }],
      generationConfig: semThinking ? { ...config, thinkingConfig: { thinkingBudget: 0 } } : config,
    });
  // 503/429 = Gemini sobrecarregado (passageiro): tenta de novo. 400 com o
  // thinkingConfig = modelo não aceita desligar: manda sem ele.
  let resposta: Response | null = null;
  let semThinking = true;
  for (let t = 0; t < 4; t++) {
    resposta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: montar(semThinking),
    });
    if (resposta.status === 400 && semThinking) {
      semThinking = false;
      continue;
    }
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
    const bruto = JSON.parse(txt);
    if (!Array.isArray(bruto?.it)) throw new Error("sem itens");
    const uso = j.usageMetadata ?? {};
    return NextResponse.json(
      { leitura: expandir(bruto), tokens: { entrada: uso.promptTokenCount ?? null, saida: uso.candidatesTokenCount ?? null } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return erro("A IA não devolveu uma leitura válida do PIT. Confira se o arquivo é mesmo um PIT.", 502);
  }
}
