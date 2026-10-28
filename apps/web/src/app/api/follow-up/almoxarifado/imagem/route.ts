import { NextResponse, type NextRequest } from "next/server";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Imagem (Follow up ou foto do almoxarifado) pela Vercel — ?sha=<sha256>.
// Mesma tabela follow_up_midias; a imagem nunca muda (é o hash), então o
// navegador guarda pra sempre e não relê do banco (egress do Supabase).
export async function GET(request: NextRequest) {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Faça login." }, { status: 401 });
  const sha = request.nextUrl.searchParams.get("sha") ?? "";
  if (!/^[0-9a-f]{64}$/.test(sha)) return NextResponse.json({ erro: "Imagem inválida." }, { status: 400 });
  const { data, error } = await comRetentativa(() =>
    criarClienteSupabaseAdmin().from("follow_up_midias").select("content_type, conteudo").eq("sha256", sha).maybeSingle(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ erro: "Imagem não encontrada." }, { status: 404 });
  const hex = String(data.conteudo).replace(/^\\x/, "");
  return new NextResponse(Buffer.from(hex, "hex"), {
    headers: { "Content-Type": data.content_type, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
