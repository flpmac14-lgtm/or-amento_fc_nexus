import { NextResponse } from "next/server";
import { podeAbrirFinanceiro } from "@/lib/financeiro";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Aba Financeiro → Pedidos (pedidos de venda do ERP) — pedido do usuário
// (17/10/2026). Mesma proteção do /api/financeiro: tabela com RLS sem policy
// (migration 0053), o servidor confere o usuário e lê com a service_role.
// Separado do resumo: só é buscado quando a aba Pedidos abre.
async function podeAbrir(): Promise<boolean> {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return podeAbrirFinanceiro(user);
}

// Botão Atualizar (pedido do usuário, 29/10/2026 — migration 0063): pede pro
// vigia da máquina da Macfab ler o Sectra agora. ?estado=1 no GET só devolve
// as datas (o site consulta até o pedido ser atendido, sem reler os dados).
export async function POST() {
  if (!(await podeAbrir())) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
  const admin = criarClienteSupabaseAdmin();
  const pedido = new Date().toISOString();
  const { error } = await admin.from("financeiro_pedidos").update({ pedir_atualizacao_em: pedido }).eq("id", 1);
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ pedido_em: pedido });
}

export async function GET(request: Request) {
  if (!(await podeAbrir())) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });

  const admin = criarClienteSupabaseAdmin();
  if (new URL(request.url).searchParams.has("estado")) {
    const { data, error } = await admin.from("financeiro_pedidos").select("gerado_em, atendido_em").eq("id", 1).maybeSingle();
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data ?? {}, { headers: { "Cache-Control": "no-store" } });
  }
  for (let tentativa = 1; ; tentativa++) {
    const { data, error } = await admin.from("financeiro_pedidos").select("dados, gerado_em, atendido_em").eq("id", 1).maybeSingle();
    // "JWT issued at future" (erro passageiro do Supabase, ver /api/financeiro): tenta de novo.
    if (error && /future|nbf|not yet valid/i.test(error.message) && tentativa < 3) {
      await new Promise((r) => setTimeout(r, 700 * tentativa));
      continue;
    }
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(
      { pedidos: data?.dados ?? null, gerado_em: data?.gerado_em ?? null, atendido_em: data?.atendido_em ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
}
