import { NextResponse, type NextRequest } from "next/server";
import { podeVerFornecedores } from "@/lib/acesso";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Aba Fornecedores — pedido do usuário (28/10/2026): a planilha FORNECEDOR.xlsx
// (tabela fornecedores_planilha, migration 0062, gravada a cada 15 min só quando
// muda). Só o leandro e o flpmac14. ETag = hash do arquivo: com a planilha
// igual, responde 304 sem reler os ~1 MB do banco (egress do Supabase).
export async function GET(request: NextRequest) {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!podeVerFornecedores(user)) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });

  const admin = criarClienteSupabaseAdmin();
  const versao = await comRetentativa(() =>
    admin.from("fornecedores_planilha").select("arquivo_sha256, gerado_em").eq("id", 1).maybeSingle(),
  );
  if (versao.error) return NextResponse.json({ erro: versao.error.message }, { status: 500 });
  if (!versao.data) return NextResponse.json({ erro: "A planilha de fornecedores ainda não foi lida." }, { status: 404 });
  const etag = `"${versao.data.arquivo_sha256}"`;
  const cabecalhos = { ETag: etag, "Cache-Control": "private, no-cache" };
  if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: cabecalhos });

  const { data, error } = await comRetentativa(() =>
    admin.from("fornecedores_planilha").select("dados, arquivo, arquivo_modificado_em, gerado_em").eq("id", 1).maybeSingle(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(
    { ...(data?.dados ?? {}), arquivo: data?.arquivo ?? null, modificado_em: data?.arquivo_modificado_em ?? null, gerado_em: data?.gerado_em ?? null },
    { headers: cabecalhos },
  );
}
