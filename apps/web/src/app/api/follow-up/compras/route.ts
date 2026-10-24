import { NextResponse } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Coluna "Compra / Retorno" do Follow up — pedido do usuário (24/10/2026): de
// cada item terceirizado, o pedido de compra, a remessa e as NFs de entrada do
// Sectra (migration 0058, RLS sem policy). Sem valores: qualquer conta logada
// que vê o Follow up lê (o proxy deixa /api/follow-up/ passar pras restritas).
export async function GET() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Faça login." }, { status: 401 });

  const admin = criarClienteSupabaseAdmin();
  const { data, error } = await comRetentativa(() =>
    admin.from("follow_up_compras").select("dados, gerado_em").eq("id", 1).maybeSingle(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(
    { compras: data?.dados ?? {}, gerado_em: data?.gerado_em ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
