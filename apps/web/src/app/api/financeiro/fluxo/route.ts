import { NextResponse } from "next/server";
import { podeVerFinanceiro, type CondicaoPagamento, type ColetaFluxo, type RespostaFluxo, type TituloErp } from "@/lib/financeiro";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Aba Financeiro → Fluxo de caixa — pedido do usuário (26/10/2026): as coletas
// marcadas no Follow up viram recebimento previsto (valor e condição de
// pagamento do pedido de venda no Sectra), junto do A receber e do A pagar do
// ERP. Só o flpmac14 (como o Budget). Lê só os pedaços que usa (egress):
// - coletas: follow_up_itens ativos com data de coleta (na hora, sem esperar o ciclo);
// - Sectra: comparativo e A pagar 180 dias (financeiro_pedidos, ciclo de 15 min);
// - A receber: financeiro_resumo.

type ItemComparativo = {
  po: string;
  situacao: ColetaFluxo["situacao"];
  valor: number | null;
  pedidos: string[];
  cliente_erp: string | null;
  condicao?: CondicaoPagamento | null;
};

function erroPassageiro(msg: string | undefined): boolean {
  return !!msg && /future|nbf|not yet valid/i.test(msg);
}

export async function GET() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!podeVerFinanceiro(user?.email)) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });

  const admin = criarClienteSupabaseAdmin();
  for (let tentativa = 1; ; tentativa++) {
    const [fu, ped, res] = await Promise.all([
      admin
        .from("follow_up_itens")
        .select("po, mac, cliente, desenho, descricao, quantidade, coleta_data")
        .eq("st", "A")
        .eq("presente_na_ultima_importacao", true)
        .not("coleta_data", "is", null),
      admin.from("financeiro_pedidos").select("itens:dados->comparativo->itens, pagar:dados->fluxo->pagar, gerado_em").eq("id", 1).maybeSingle(),
      admin.from("financeiro_resumo").select("receber:dados->receber->abertos, pagar:dados->pagar->abertos, hoje:dados->hoje").eq("id", 1).maybeSingle(),
    ]);
    const erro = fu.error ?? ped.error ?? res.error;
    if (erro && erroPassageiro(erro.message) && tentativa < 3) {
      await new Promise((r) => setTimeout(r, 700 * tentativa));
      continue;
    }
    if (erro) return NextResponse.json({ erro: erro.message }, { status: 500 });

    const pedidos = ped.data as { itens: ItemComparativo[] | null; pagar: [string, number, string | null, string | null, number][] | null; gerado_em: string | null } | null;
    const resumo = res.data as { receber: TituloErp[] | null; pagar: TituloErp[] | null; hoje: string | null } | null;
    const porPo = new Map((pedidos?.itens ?? []).map((i) => [i.po, i]));

    const coletas: ColetaFluxo[] = (fu.data ?? []).map((l) => {
      const c = porPo.get(l.po);
      return {
        po: l.po,
        mac: l.mac,
        cliente: l.cliente,
        desenho: l.desenho,
        descricao: l.descricao,
        qtd: l.quantidade === null ? null : Number(l.quantidade),
        coleta: l.coleta_data,
        // Sem linha no comparativo = item novo, ainda não cruzado (até 15 min): conta como sem entrada.
        situacao: c?.situacao ?? "sem_entrada",
        valor: c?.valor ?? null,
        pedidos: c?.pedidos ?? [],
        cliente_erp: c?.cliente_erp ?? null,
        condicao: c?.condicao ?? null,
      };
    });

    const corpo: RespostaFluxo = {
      hoje: resumo?.hoje ?? null,
      gerado_em: pedidos?.gerado_em ?? null,
      coletas,
      receber: resumo?.receber ?? [],
      // Até o 1º ciclo com o A pagar de 180 dias, usa o do painel (60 dias).
      pagar: pedidos?.pagar
        ? pedidos.pagar.map(([vencimento, valor, nome, documento, filial], id) => ({ id, vencimento, valor, nome, documento, filial, forma: null }))
        : (resumo?.pagar ?? []),
      dias_pagar: pedidos?.pagar ? 180 : 60,
    };
    return NextResponse.json(corpo, { headers: { "Cache-Control": "no-store" } });
  }
}
