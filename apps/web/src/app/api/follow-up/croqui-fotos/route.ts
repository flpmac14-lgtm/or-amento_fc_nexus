import { NextResponse } from "next/server";
import type { ImagemFollowUp } from "@/lib/types";
import { macBase } from "@/lib/almoxarifado";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Fotos de referência do Croqui de corte — pedido do usuário (04/11/2026): a
// mesma coluna Foto do Follow up na 1ª coluna do croqui. Devolve as imagens de
// cada peça do Follow up (só os hashes; o arquivo vem como no Follow up) e de qual
// peça é cada PO, desenho e MAC. O croqui escolhe na ordem PO → desenho → MAC.
type Linha = {
  id: string;
  midia_sha256: string;
  ordem: number;
  origem: ImagemFollowUp["origem"];
  celula: string | null;
  item: { id: string; po: string | null; mac: string | null; desenho: string | null };
};

export async function GET() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Faça login." }, { status: 401 });
  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin()
      .from("follow_up_imagens")
      .select("id, midia_sha256, ordem, origem, celula, item:follow_up_itens!inner(id, po, mac, desenho)")
      .order("ordem")
      .limit(10000),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const grupos: ImagemFollowUp[][] = [];
  const indiceItem = new Map<string, number>();
  const po: Record<string, number> = {};
  const desenho: Record<string, number> = {};
  const mac: Record<string, number> = {};
  for (const r of (data ?? []) as unknown as Linha[]) {
    let g = indiceItem.get(r.item.id);
    if (g === undefined) {
      g = grupos.push([]) - 1;
      indiceItem.set(r.item.id, g);
      const p = (r.item.po ?? "").trim().toUpperCase();
      const d = (r.item.desenho ?? "").trim().toUpperCase();
      const m = macBase(r.item.mac);
      if (p && po[p] === undefined) po[p] = g;
      if (d && desenho[d] === undefined) desenho[d] = g;
      if (m && mac[m] === undefined) mac[m] = g;
    }
    grupos[g].push({ id: r.id, sha256: r.midia_sha256, ordem: r.ordem, origem: r.origem, celula: r.celula, largura: null, altura: null });
  }
  return NextResponse.json({ grupos, po, desenho, mac }, { headers: { "Cache-Control": "private, max-age=600" } });
}
