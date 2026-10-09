import { NextResponse } from "next/server";
import { podeVerFinanceiro } from "@/lib/financeiro";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Aba QUALIDADE — pedido explícito do usuário: por enquanto SÓ a conta
// flpmac14 (mesma regra do Financeiro). Tabelas da migration 0034 com RLS sem
// policy: aqui o servidor confere o usuário e lê com a service_role.
// Gravadas por services/calc_engine/scripts/sincronizar_certificados.py.
// ?so_notificacoes=1 (sininho, a cada 5 min): não manda a lista (~7 mil itens).

const NEGADO = () => NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });

export async function GET(request: Request) {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!podeVerFinanceiro(user?.email)) return NEGADO();

  const soNotificacoes = new URL(request.url).searchParams.has("so_notificacoes");
  const admin = criarClienteSupabaseAdmin();
  const [lista, notificacoes] = await Promise.all([
    soNotificacoes
      ? Promise.resolve({ data: null, error: null })
      : admin.from("qualidade_certificados").select("dados, gerado_em").eq("id", 1).maybeSingle(),
    admin
      .from("qualidade_notificacoes")
      .select("id, tipo, nri, arquivo, descricao, criado_em")
      .order("id", { ascending: false })
      .limit(200),
  ]);
  const erro = lista.error ?? notificacoes.error;
  if (erro) return NextResponse.json({ erro: erro.message }, { status: 500 });
  return NextResponse.json(
    {
      itens: soNotificacoes ? null : (lista.data?.dados?.itens ?? []),
      gerado_em: lista.data?.gerado_em ?? null,
      notificacoes: notificacoes.data ?? [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
