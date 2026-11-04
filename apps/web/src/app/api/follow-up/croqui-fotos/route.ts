import { NextResponse } from "next/server";
import { macBase } from "@/lib/almoxarifado";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Fotos de referência do Croqui de corte — pedido do usuário (04/11/2026): a
// imagem que o Follow up anexou na peça aparece na 1ª coluna do croqui.
// Devolve só os hashes (a imagem vem de /api/follow-up/almoxarifado/imagem,
// que o navegador guarda pra sempre): 1ª imagem por PO, por desenho e por MAC.
// O croqui escolhe na ordem PO → desenho → MAC (a obra).
export async function GET() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Faça login." }, { status: 401 });
  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin()
      .from("follow_up_imagens")
      .select("midia_sha256, ordem, item:follow_up_itens!inner(po, mac, desenho)")
      .order("ordem")
      .limit(10000),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const po: Record<string, string> = {};
  const desenho: Record<string, string> = {};
  const mac: Record<string, string> = {};
  for (const r of (data ?? []) as unknown as { midia_sha256: string; item: { po: string | null; mac: string | null; desenho: string | null } }[]) {
    const p = (r.item?.po ?? "").trim().toUpperCase();
    const d = (r.item?.desenho ?? "").trim().toUpperCase();
    const m = macBase(r.item?.mac);
    if (p && !po[p]) po[p] = r.midia_sha256;
    if (d && !desenho[d]) desenho[d] = r.midia_sha256;
    if (m && !mac[m]) mac[m] = r.midia_sha256;
  }
  return NextResponse.json({ po, desenho, mac }, { headers: { "Cache-Control": "private, max-age=600" } });
}
