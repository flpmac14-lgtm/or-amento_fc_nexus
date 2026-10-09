import { NextResponse } from "next/server";
import { podeVerQualidade } from "@/lib/acesso";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Baixar o PDF do certificado (aba QUALIDADE: flpmac14 e perfil "qualidade") — pedido explícito
// do usuário, pra montar data book. Sob demanda (migration 0035): POST grava os
// pedidos; o vigia services/calc_engine/scripts/servir_certificados.py (no PC
// da fábrica) sobe o PDF pro bucket privado "certificados"; GET devolve o
// status e, quando pronto, uma URL assinada de 10 min.

const NEGADO = () => NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
const MAX_POR_VEZ = 200;
const REAPROVEITA_HORAS = 48; // o vigia apaga do bucket com 3 dias

async function autorizado(): Promise<boolean> {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return podeVerQualidade(user);
}

export async function POST(request: Request) {
  if (!(await autorizado())) return NEGADO();
  const corpo = (await request.json().catch(() => null)) as {
    itens?: { arquivo?: unknown; modificado?: unknown }[];
  } | null;
  const itens = (corpo?.itens ?? [])
    .filter((i) => typeof i.arquivo === "string" && i.arquivo.length < 400)
    .slice(0, MAX_POR_VEZ)
    .map((i) => ({ arquivo: i.arquivo as string, modificado: typeof i.modificado === "string" ? i.modificado : null }));
  if (!itens.length) return NextResponse.json({ erro: "Nenhum certificado." }, { status: 400 });

  const admin = criarClienteSupabaseAdmin();
  // Já baixado há pouco (mesmo arquivo e mesma data): reaproveita o que está no bucket.
  const desde = new Date(Date.now() - REAPROVEITA_HORAS * 3600_000).toISOString();
  const { data: prontos, error: erroProntos } = await admin
    .from("qualidade_pdf_pedidos")
    .select("id, arquivo, modificado")
    .eq("status", "pronto")
    .gte("pronto_em", desde)
    .in("arquivo", itens.map((i) => i.arquivo));
  if (erroProntos) return NextResponse.json({ erro: erroProntos.message }, { status: 500 });

  const ids: Record<string, number> = {};
  const novos: { arquivo: string; modificado: string | null }[] = [];
  for (const i of itens) {
    const p = (prontos ?? []).find((x) => x.arquivo === i.arquivo && x.modificado === i.modificado);
    if (p) ids[i.arquivo] = p.id;
    else novos.push(i);
  }
  if (novos.length) {
    const { data, error } = await admin.from("qualidade_pdf_pedidos").insert(novos).select("id, arquivo");
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    for (const r of data ?? []) ids[r.arquivo] = r.id;
  }
  return NextResponse.json({ ids });
}

export async function GET(request: Request) {
  if (!(await autorizado())) return NEGADO();
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, MAX_POR_VEZ);
  if (!ids.length) return NextResponse.json({ pedidos: [] });

  const admin = criarClienteSupabaseAdmin();
  const { data, error } = await admin
    .from("qualidade_pdf_pedidos")
    .select("id, arquivo, status, objeto, erro")
    .in("id", ids);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });

  const objetos = (data ?? []).filter((p) => p.status === "pronto" && p.objeto).map((p) => p.objeto as string);
  const urls: Record<string, string> = {};
  if (objetos.length) {
    const { data: assinadas, error: erroUrl } = await admin.storage.from("certificados").createSignedUrls(objetos, 600);
    if (erroUrl) return NextResponse.json({ erro: erroUrl.message }, { status: 500 });
    for (const a of assinadas ?? []) if (a.path && a.signedUrl) urls[a.path] = a.signedUrl;
  }
  return NextResponse.json(
    {
      pedidos: (data ?? []).map((p) => ({
        id: p.id,
        arquivo: p.arquivo,
        status: p.status,
        erro: p.erro,
        url: p.objeto ? (urls[p.objeto] ?? null) : null,
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
