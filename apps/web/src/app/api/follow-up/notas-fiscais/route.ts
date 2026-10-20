import { NextResponse } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Relatório de coleta "com Nota fiscal" — pedido do usuário (20/10/2026): NF de
// cada pedido e dia de emissão, do ERP (migration 0054, RLS sem policy). Só
// número e data, sem valores: qualquer conta logada que abre o relatório de
// coleta lê (o proxy deixa /api/follow-up/ passar pras contas restritas).
export async function GET() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Faça login." }, { status: 401 });

  const admin = criarClienteSupabaseAdmin();
  const { data, error } = await comRetentativa(() =>
    admin.from("follow_up_notas_fiscais").select("dados, gerado_em").eq("id", 1).maybeSingle(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(
    { notas: data?.dados ?? { po: {}, nf: {} }, gerado_em: data?.gerado_em ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
