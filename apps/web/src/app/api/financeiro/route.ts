import { NextResponse } from "next/server";
import { podeVerFinanceiro, type BudgetFinanceiro } from "@/lib/financeiro";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Dados da aba Financeiro — pedido explícito do usuário: SÓ a conta
// flpmac14. As tabelas (migration 0029) têm RLS sem policy: a chave pública
// não lê nada; aqui o servidor confere o usuário da sessão e lê com a
// service_role. O calc_engine (Render, sem login) NÃO serve esses dados.

async function usuarioFinanceiro(): Promise<string | null> {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return podeVerFinanceiro(user?.email) ? user!.email! : null;
}

// "JWT issued at future" (07/10): o token que o Supabase gera na hora às vezes
// sai uns instantes à frente do relógio do banco — erro passageiro. Espera e
// tenta de novo (até 3 vezes) em vez de mostrar o erro.
function erroPassageiro(msg: string | undefined): boolean {
  return !!msg && /issued at future|future|nbf|not yet valid/i.test(msg);
}

async function lerComRetentativa() {
  const admin = criarClienteSupabaseAdmin();
  for (let tentativa = 1; ; tentativa++) {
    const [resumo, budget] = await Promise.all([
      admin.from("financeiro_resumo").select("dados, gerado_em").eq("id", 1).maybeSingle(),
      admin.from("financeiro_budget").select("dados").eq("id", 1).maybeSingle(),
    ]);
    const msg = (resumo.error ?? budget.error)?.message;
    if (!erroPassageiro(msg) || tentativa >= 3) return { resumo, budget };
    await new Promise((r) => setTimeout(r, 700 * tentativa));
  }
}

const NEGADO = () => NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });

export async function GET(request: Request) {
  if (!(await usuarioFinanceiro())) return NEGADO();
  // ?sem_notas=1 (bloco da Visão Geral): não manda a lista de NFs, que é a maior parte.
  const semNotas = new URL(request.url).searchParams.has("sem_notas");
  const { resumo, budget } = await lerComRetentativa();
  if (resumo.error || budget.error) {
    return NextResponse.json({ erro: (resumo.error ?? budget.error)!.message }, { status: 500 });
  }
  return NextResponse.json(
    {
      resumo: resumo.data?.dados ? (semNotas ? { ...resumo.data.dados, notas: [] } : resumo.data.dados) : null,
      gerado_em: resumo.data?.gerado_em ?? null,
      budget: budget.data?.dados ?? { faturamento: {}, custos_pct: {} },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Salva o budget inteiro (meta de faturamento por mês e % de custo por grupo).
export async function PUT(request: Request) {
  const email = await usuarioFinanceiro();
  if (!email) return NEGADO();
  const corpo = (await request.json().catch(() => null)) as BudgetFinanceiro | null;
  const mes = /^\d{4}-\d{2}$/;
  const limpo: BudgetFinanceiro = { faturamento: {}, custos_pct: {} };
  for (const [m, v] of Object.entries(corpo?.faturamento ?? {})) {
    const n = numero(v);
    if (mes.test(m) && n) limpo.faturamento[m] = n;
  }
  for (const [g, meses] of Object.entries(corpo?.custos_pct ?? {})) {
    if (typeof g !== "string" || g.length > 60) continue;
    limpo.custos_pct[g] = {};
    for (const [m, v] of Object.entries(meses ?? {})) {
      const n = numero(v);
      if (mes.test(m) && n !== null && n <= 100) limpo.custos_pct[g][m] = n;
    }
  }
  const admin = criarClienteSupabaseAdmin();
  const { error } = await admin
    .from("financeiro_budget")
    .upsert({ id: 1, dados: limpo, atualizado_em: new Date().toISOString(), atualizado_por: email });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ budget: limpo });
}
