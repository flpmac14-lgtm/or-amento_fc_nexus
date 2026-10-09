import { NextResponse } from "next/server";
import { podeVerQualidade } from "@/lib/acesso";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Aba QUALIDADE — pedido explícito do usuário: a conta flpmac14 e o perfil
// "qualidade" (ana, carol, pedro, lailto). Tabelas da migration 0034 com RLS sem
// policy: aqui o servidor confere o usuário e lê com a service_role.
// Gravadas por services/calc_engine/scripts/sincronizar_certificados.py.
// ?so_notificacoes=1 (sininho, a cada 5 min): não manda a lista (~7 mil itens).
// ?fonte=backup: aba "Backup Recebimento" (pasta BACKUP RECEBIMENTO 20260828,
// linha 2); sem fonte = pasta principal (linha 1). Migration 0036.
const ID_FONTE = { principal: 1, backup: 2 } as const;

const NEGADO = () => NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });

export async function GET(request: Request) {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!podeVerQualidade(user)) return NEGADO();

  const params = new URL(request.url).searchParams;
  const soNotificacoes = params.has("so_notificacoes");
  const fonte = params.get("fonte") === "backup" ? "backup" : "principal";
  const admin = criarClienteSupabaseAdmin();
  const [lista, notificacoes] = await Promise.all([
    soNotificacoes
      ? Promise.resolve({ data: null, error: null })
      : admin.from("qualidade_certificados").select("dados, gerado_em").eq("id", ID_FONTE[fonte]).maybeSingle(),
    admin
      .from("qualidade_notificacoes")
      .select("id, tipo, nri, arquivo, descricao, criado_em")
      .eq("fonte", fonte)
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
