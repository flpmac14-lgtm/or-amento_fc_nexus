import { NextResponse, type NextRequest } from "next/server";
import { ASSUNTOS, FREQUENCIAS, IMPACTOS, SETORES } from "@/lib/canalEscuta";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";

// Canal de Escuta — rota PÚBLICA (sem login; liberada no proxy.ts por /api/publico/)
// chamada pelo formulário do site da MACFAB (outro domínio). O formulário manda
// Content-Type text/plain pra não ter requisição prévia (preflight) de CORS, então
// basta liberar a leitura da resposta. Não grava IP, e-mail nem horário: só a data.

const CORS = { "Access-Control-Allow-Origin": "*" };

function resposta(corpo: object, status = 200) {
  return NextResponse.json(corpo, { status, headers: CORS });
}

function texto(v: unknown, max: number) {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

// Só valores conhecidos; "Outro" vira "Outro: <texto>".
function lista(valores: unknown, permitidos: readonly string[], outro: unknown) {
  return (Array.isArray(valores) ? valores : [])
    .filter((v): v is string => typeof v === "string" && permitidos.includes(v))
    .map((v) => (v === "Outro" ? `Outro: ${texto(outro, 80)}` : v));
}

// Freio contra envio em massa: só em memória (por instância), nunca gravado.
const LIMITE = 10;
const JANELA_MS = 60 * 60 * 1000;
const envios = new Map<string, number[]>();
function excedeuLimite(ip: string) {
  const agora = Date.now();
  const recentes = (envios.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  if (recentes.length >= LIMITE) return true;
  envios.set(ip, [...recentes, agora]);
  return false;
}

export async function POST(request: NextRequest) {
  const d = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!d || typeof d !== "object") return resposta({ ok: false, erro: "dados inválidos" }, 400);

  // Campo-isca preenchido = robô. Responde "ok" e descarta.
  if (d.site) return resposta({ ok: true });

  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (ip && excedeuLimite(ip)) return resposta({ ok: false, erro: "muitos envios, tente mais tarde" }, 429);

  const relato = texto(d.relato, 3000);
  if (relato.length < 3) return resposta({ ok: false, erro: "relato vazio" }, 400);

  let setor = typeof d.setor === "string" && (SETORES as readonly string[]).includes(d.setor) ? d.setor : "Prefiro não informar";
  if (setor === "Outro") setor = `Outro: ${texto(d.setorOutro, 60)}`;

  const { error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin()
      .from("canal_escuta_relatos")
      .insert({
        data: new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }), // AAAA-MM-DD
        setor,
        assuntos: lista(d.assunto, ASSUNTOS, d.assuntoOutro),
        frequencia: typeof d.frequencia === "string" && (FREQUENCIAS as readonly string[]).includes(d.frequencia) ? d.frequencia : null,
        impactos: lista(d.impacto, IMPACTOS, d.impactoOutro),
        relato,
        onde: texto(d.onde, 1500) || null,
        sugestao: texto(d.sugestao, 1500) || null,
      }),
  );
  if (error) return resposta({ ok: false, erro: "não foi possível gravar" }, 500);
  return resposta({ ok: true });
}
