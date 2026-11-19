import { NextResponse, type NextRequest } from "next/server";
import { podeVerAgenda } from "@/lib/agenda";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Agenda pessoal — tela /agenda (pedido do usuário, 19/11/2026).
// Tabela agenda_lembretes (migration 0077, RLS sem policy): só esta rota lê/grava,
// sempre filtrando pelo e-mail de quem está logado (dono).
// GET ?de=&ate= (mês da tela) · GET ?pendentes=1 (avisos: até hoje e não vistos)
// POST { data, hora?, texto } · PATCH { id, data?, hora?, texto?, visto? } · DELETE ?id=

async function dono(): Promise<string | null> {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email && podeVerAgenda(user.email) ? user.email.trim().toLowerCase() : null;
}

const negado = () => NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}(:\d{2})?$/;

function campos(corpo: Record<string, unknown>): Record<string, unknown> | string {
  const m: Record<string, unknown> = {};
  if (corpo.texto !== undefined) {
    const t = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
    if (!t) return "Escreva o lembrete.";
    m.texto = t.slice(0, 500);
  }
  if (corpo.data !== undefined) {
    if (typeof corpo.data !== "string" || !DATA.test(corpo.data)) return "Data inválida.";
    m.data = corpo.data;
  }
  if (corpo.hora !== undefined) {
    if (corpo.hora === null || corpo.hora === "") m.hora = null;
    else if (typeof corpo.hora === "string" && HORA.test(corpo.hora)) m.hora = corpo.hora;
    else return "Hora inválida.";
  }
  if (corpo.visto !== undefined) m.visto_em = corpo.visto ? new Date().toISOString() : null;
  // Mudou dia/hora: volta a avisar.
  if ((m.data !== undefined || m.hora !== undefined) && corpo.visto === undefined) m.visto_em = null;
  return m;
}

export async function GET(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const p = request.nextUrl.searchParams;
  let q = criarClienteSupabaseAdmin().from("agenda_lembretes").select("*").eq("dono", email);
  if (p.get("pendentes")) {
    const ate = p.get("ate") ?? "";
    if (!DATA.test(ate)) return NextResponse.json({ erro: "Data inválida." }, { status: 400 });
    q = q.is("visto_em", null).lte("data", ate);
  } else {
    const de = p.get("de") ?? "";
    const ate = p.get("ate") ?? "";
    if (!DATA.test(de) || !DATA.test(ate)) return NextResponse.json({ erro: "Período inválido." }, { status: 400 });
    q = q.gte("data", de).lte("data", ate);
  }
  const { data, error } = await comRetentativa(() =>
    q.order("data", { ascending: true }).order("hora", { ascending: true, nullsFirst: true }),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ lembretes: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const corpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const m = campos({ ...corpo, texto: corpo.texto ?? "", data: corpo.data ?? "" });
  if (typeof m === "string") return NextResponse.json({ erro: m }, { status: 400 });
  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin().from("agenda_lembretes").insert({ ...m, dono: email }).select("*").single(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ lembrete: data });
}

export async function PATCH(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const corpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const id = typeof corpo.id === "string" ? corpo.id : "";
  if (!id) return NextResponse.json({ erro: "Informe o lembrete." }, { status: 400 });
  const m = campos(corpo);
  if (typeof m === "string") return NextResponse.json({ erro: m }, { status: 400 });
  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin().from("agenda_lembretes").update(m).eq("id", id).eq("dono", email).select("*").maybeSingle(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Lembrete não encontrado." }, { status: 404 });
  return NextResponse.json({ lembrete: data });
}

export async function DELETE(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ erro: "Informe o lembrete." }, { status: 400 });
  const { error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin().from("agenda_lembretes").delete().eq("id", id).eq("dono", email),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
