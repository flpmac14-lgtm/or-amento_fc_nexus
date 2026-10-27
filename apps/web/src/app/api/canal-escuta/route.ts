import { NextResponse, type NextRequest } from "next/server";
import { STATUS_RELATO } from "@/lib/canalEscuta";
import { podeVerFinanceiro } from "@/lib/financeiro";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Canal de Escuta — tela /canal-escuta (pedido do usuário, 26/10/2026): só o
// flpmac14 lê os relatos (conteúdo sigiloso) e muda status / observação do RH.
// Tabela canal_escuta_relatos (migration 0060, RLS sem policy): só esta rota lê.
// GET: todos os relatos (o filtro é na tela); PATCH: { numero, status?, observacoes_rh? }.

async function usuario() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return podeVerFinanceiro(user?.email) ? user : null;
}

export async function GET() {
  if (!(await usuario())) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin()
      .from("canal_escuta_relatos")
      .select("*")
      .order("data", { ascending: false })
      .order("numero", { ascending: false }),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ relatos: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const user = await usuario();
  if (!user) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
  const corpo = (await request.json().catch(() => null)) as { numero?: unknown; status?: unknown; observacoes_rh?: unknown } | null;
  const numero = Number(corpo?.numero);
  if (!numero) return NextResponse.json({ erro: "Informe o número do relato." }, { status: 400 });

  const mudancas: Record<string, unknown> = { atualizado_em: new Date().toISOString(), atualizado_por: user.email ?? "" };
  if (corpo?.status !== undefined) {
    if (!(STATUS_RELATO as readonly unknown[]).includes(corpo.status)) return NextResponse.json({ erro: "Status inválido." }, { status: 400 });
    mudancas.status = corpo.status;
  }
  if (corpo?.observacoes_rh !== undefined) {
    mudancas.observacoes_rh = typeof corpo.observacoes_rh === "string" && corpo.observacoes_rh.trim() ? corpo.observacoes_rh.trim().slice(0, 3000) : null;
  }

  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin().from("canal_escuta_relatos").update(mudancas).eq("numero", numero).select("*").maybeSingle(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: `Relato nº ${numero} não encontrado.` }, { status: 404 });
  return NextResponse.json({ relato: data });
}
