import { NextResponse } from "next/server";
import { podeAbrirFinanceiro } from "@/lib/financeiro";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Aba Financeiro → Pedidos (pedidos de venda do ERP) — pedido do usuário
// (17/10/2026). Mesma proteção do /api/financeiro: tabela com RLS sem policy
// (migration 0053), o servidor confere o usuário e lê com a service_role.
// Separado do resumo: só é buscado quando a aba Pedidos abre.
export async function GET() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!podeAbrirFinanceiro(user)) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });

  const admin = criarClienteSupabaseAdmin();
  for (let tentativa = 1; ; tentativa++) {
    const { data, error } = await admin.from("financeiro_pedidos").select("dados, gerado_em").eq("id", 1).maybeSingle();
    // "JWT issued at future" (erro passageiro do Supabase, ver /api/financeiro): tenta de novo.
    if (error && /future|nbf|not yet valid/i.test(error.message) && tentativa < 3) {
      await new Promise((r) => setTimeout(r, 700 * tentativa));
      continue;
    }
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(
      { pedidos: data?.dados ?? null, gerado_em: data?.gerado_em ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
