import { NextResponse, type NextRequest } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";
import { COLUNAS_TAREFA, PRIORIDADES_TAREFA, podeVerTarefas } from "@/lib/tarefas";

// Tarefas (Kanban pessoal) — tela /tarefas (pedido do usuário, 09/11/2026).
// Tabela tarefas_kanban (migration 0067, RLS sem policy): só esta rota lê/grava,
// sempre filtrando pelo e-mail de quem está logado (dono).
// GET: tarefas do dono · POST: cria · PATCH: { id, ...campos } · DELETE: ?id=

async function dono(): Promise<string | null> {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email && podeVerTarefas(user.email) ? user.email.trim().toLowerCase() : null;
}

const negado = () => NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });

/** Valida e normaliza os campos editáveis vindos do corpo. */
function campos(corpo: Record<string, unknown>): Record<string, unknown> | string {
  const m: Record<string, unknown> = {};
  if (corpo.titulo !== undefined) {
    const t = typeof corpo.titulo === "string" ? corpo.titulo.trim() : "";
    if (!t) return "Informe o título da tarefa.";
    m.titulo = t.slice(0, 300);
  }
  if (corpo.descricao !== undefined)
    m.descricao = typeof corpo.descricao === "string" && corpo.descricao.trim() ? corpo.descricao.trim().slice(0, 5000) : null;
  if (corpo.coluna !== undefined) {
    if (!COLUNAS_TAREFA.some((c) => c.valor === corpo.coluna)) return "Coluna inválida.";
    m.coluna = corpo.coluna;
    m.concluido_em = corpo.coluna === "concluido" ? new Date().toISOString() : null;
  }
  if (corpo.prioridade !== undefined) {
    if (!PRIORIDADES_TAREFA.some((p) => p.valor === corpo.prioridade)) return "Prioridade inválida.";
    m.prioridade = corpo.prioridade;
  }
  if (corpo.prazo !== undefined) {
    if (corpo.prazo === null || corpo.prazo === "") m.prazo = null;
    else if (typeof corpo.prazo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corpo.prazo)) m.prazo = corpo.prazo;
    else return "Prazo inválido.";
  }
  if (corpo.ordem !== undefined) {
    const o = Number(corpo.ordem);
    if (!Number.isFinite(o)) return "Ordem inválida.";
    m.ordem = o;
  }
  return m;
}

export async function GET() {
  const email = await dono();
  if (!email) return negado();
  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin().from("tarefas_kanban").select("*").eq("dono", email).order("ordem", { ascending: true }),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ tarefas: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const corpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const m = campos({ ...corpo, titulo: corpo.titulo ?? "" });
  if (typeof m === "string") return NextResponse.json({ erro: m }, { status: 400 });
  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin().from("tarefas_kanban").insert({ ...m, dono: email }).select("*").single(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ tarefa: data });
}

export async function PATCH(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const corpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const id = typeof corpo.id === "string" ? corpo.id : "";
  if (!id) return NextResponse.json({ erro: "Informe a tarefa." }, { status: 400 });
  const m = campos(corpo);
  if (typeof m === "string") return NextResponse.json({ erro: m }, { status: 400 });
  m.atualizado_em = new Date().toISOString();
  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin().from("tarefas_kanban").update(m).eq("id", id).eq("dono", email).select("*").maybeSingle(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Tarefa não encontrada." }, { status: 404 });
  return NextResponse.json({ tarefa: data });
}

export async function DELETE(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ erro: "Informe a tarefa." }, { status: 400 });
  const { error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin().from("tarefas_kanban").delete().eq("id", id).eq("dono", email),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
