import { NextResponse, type NextRequest } from "next/server";
import { contaTotem, perfilModulo } from "@/lib/acesso";
import { emailParaLogin } from "@/lib/loginInterno";
import { numeroOP, type Apontamento, type Operador } from "@/lib/producao";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";
import { CAMPOS_AP, cadastros, carregarOps, encerrarSeConcluida, recalcularPecas, registrarNoPedido, type Admin } from "../dados";

// Totem de apontamento (tela /follow-up/totem) — pedido do usuário (07/11/2026).
// O aparelho fica logado (conta "totem", ou o PCP pra testar); quem aponta é o
// operador, identificado pelo nº do crachá do Sectra (RH_FUNCIONARIOCRACHA).
// POST {acao, cracha, ...}:
//   identificar                    → operador + o que ele está fazendo + OPs liberadas;
//   iniciar {etapa_id, tipo}       → começa produção/preparação (fecha o anterior como "troca");
//   parada {motivo}                → parada sem OP (falta de material, aguardando engenharia…);
//   pausar {motivo?, qtde?}        → fecha o aberto (a etapa fica Pausada);
//   finalizar {qtde, encerrar_etapa, observacao?} → fecha o aberto; encerrar = etapa concluída.

async function aparelho() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const p = perfilModulo(user);
  return contaTotem(user) || p === "total" || p === "follow_up" ? user : null;
}

function erro(msg: string, status = 400) {
  return NextResponse.json({ erro: msg }, { status });
}

async function abertoDo(admin: Admin, codigo: number): Promise<Apontamento | null> {
  const { data, error } = await comRetentativa(() =>
    admin.from("prod_apontamentos").select(CAMPOS_AP).eq("operador_codigo", codigo).is("fim", null).maybeSingle(),
  );
  if (error) throw new Error(error.message);
  return (data as Apontamento | null) ?? null;
}

async function fechar(admin: Admin, ap: Apontamento, campos: Record<string, unknown>) {
  const { error } = await comRetentativa(() =>
    admin.from("prod_apontamentos").update({ fim: new Date().toISOString(), ...campos }).eq("id", ap.id).is("fim", null),
  );
  if (error) throw new Error(error.message);
  if (ap.etapa_id) await recalcularPecas(admin, ap.etapa_id);
}

export async function POST(request: NextRequest) {
  const user = await aparelho();
  if (!user) return erro("Este aparelho não está liberado para apontamento.", 401);
  const origem = emailParaLogin(user.email ?? "");
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return erro("Pedido inválido.");
  }
  const admin = criarClienteSupabaseAdmin();
  try {
    const cad = await cadastros(admin);
    const cracha = String(b.cracha ?? "").replace(/\D/g, "");
    const op: Operador | undefined = cad.operadores.find((o) => o.ativo && o.cracha.replace(/\D/g, "") === cracha);
    if (!cracha || !op) return erro("Crachá não encontrado. Confira o número ou procure o PCP.", 404);

    if (b.acao === "identificar") {
      const [aberto, dados, abertosTodos, hoje] = await Promise.all([
        abertoDo(admin, op.codigo),
        carregarOps(admin, { status: ["liberada"] }),
        comRetentativa(() => admin.from("prod_apontamentos").select("etapa_id, operador_nome").is("fim", null)),
        comRetentativa(() =>
          admin
            .from("prod_apontamentos")
            .select(CAMPOS_AP)
            .eq("operador_codigo", op.codigo)
            .gte("inicio", `${new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10)}T03:00:00Z`)
            .order("inicio", { ascending: false }),
        ),
      ]);
      return NextResponse.json({
        operador: { codigo: op.codigo, nome: op.nome, apelido: op.apelido, cracha: op.cracha, centro: op.centro },
        aberto,
        ops: dados.ops,
        apontamentos: dados.apontamentos,
        // Quem está em cada etapa agora (pra mostrar "Fulano está nessa etapa").
        ocupadas: (abertosTodos.data ?? []).filter((a) => a.etapa_id),
        hoje: hoje.data ?? [],
        motivos: cad.motivos.length ? cad.motivos : ["FALTA DE MATERIAL", "AGUARDANDO ENGENHARIA"],
        centros: cad.centros,
        feriados: cad.feriados.map((f) => f.data), // Calendário de apontamento
      });
    }

    const aberto = await abertoDo(admin, op.codigo);

    if (b.acao === "iniciar") {
      const tipo = b.tipo === "setup" ? "setup" : "producao";
      const etapaId = String(b.etapa_id ?? "");
      const { data: et } = await comRetentativa(() =>
        admin.from("prod_op_etapas").select("id, op_id, posicao, concluido_em, prod_ops!inner(status, numero, item_id)").eq("id", etapaId).maybeSingle(),
      );
      const opInfo = (et as unknown as { prod_ops: { status: string; numero: number; item_id: string | null } } | null)?.prod_ops;
      if (!et || !opInfo) return erro("Etapa não encontrada.", 404);
      if (opInfo.status !== "liberada") return erro("Essa OP não está liberada para produção. Procure o PCP.");
      if (et.concluido_em) return erro("Essa etapa já foi concluída.");
      if (aberto && aberto.etapa_id === etapaId && aberto.tipo === tipo) return erro("Você já está apontando nessa etapa.");
      if (aberto) await fechar(admin, aberto, { fim_tipo: "troca" });
      const { data, error } = await comRetentativa(() =>
        admin
          .from("prod_apontamentos")
          .insert({ op_id: et.op_id, etapa_id: etapaId, operador_codigo: op.codigo, operador_nome: op.apelido, cracha: op.cracha, tipo, origem })
          .select(CAMPOS_AP)
          .single(),
      );
      if (error) throw new Error(error.message.includes("prod_apontamentos_aberto_idx") ? "Você já tem um apontamento aberto." : error.message);
      return NextResponse.json({ ok: true, aberto: data });
    }

    if (b.acao === "parada") {
      const motivo = String(b.motivo ?? "").trim().slice(0, 200);
      if (!motivo) return erro("Escolha o motivo da parada.");
      if (aberto) await fechar(admin, aberto, { fim_tipo: "troca" });
      const { data, error } = await comRetentativa(() =>
        admin
          .from("prod_apontamentos")
          .insert({ operador_codigo: op.codigo, operador_nome: op.apelido, cracha: op.cracha, tipo: "parada", motivo, origem })
          .select(CAMPOS_AP)
          .single(),
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, aberto: data });
    }

    if (!aberto) return erro("Você não tem apontamento aberto.");
    const qtde = b.qtde === undefined || b.qtde === null || b.qtde === "" ? null : Math.max(0, Number(b.qtde) || 0);
    const obs = typeof b.observacao === "string" && b.observacao.trim() ? b.observacao.trim().slice(0, 500) : null;

    if (b.acao === "pausar") {
      const motivo = typeof b.motivo === "string" && b.motivo.trim() ? b.motivo.trim().slice(0, 200) : null;
      await fechar(admin, aberto, { fim_tipo: "pausa", motivo: aberto.tipo === "parada" ? aberto.motivo : motivo, qtde, observacao: obs });
      return NextResponse.json({ ok: true });
    }

    if (b.acao === "finalizar") {
      const encerrar = !!b.encerrar_etapa && aberto.tipo !== "parada";
      await fechar(admin, aberto, { fim_tipo: "fim", qtde, encerrou_etapa: encerrar, observacao: obs });
      let opEncerrada = false;
      if (encerrar && aberto.etapa_id) {
        // Outros operadores ainda na mesma etapa: a etapa só conclui quando o último sair.
        const { data: outros } = await comRetentativa(() =>
          admin.from("prod_apontamentos").select("id").eq("etapa_id", aberto.etapa_id!).is("fim", null),
        );
        const { data: et } = await comRetentativa(() =>
          admin
            .from("prod_op_etapas")
            .select("id, op_id, posicao, operacao_desc, centro_desc, qtde_produzida, prod_ops!inner(numero, item_id)")
            .eq("id", aberto.etapa_id!)
            .maybeSingle(),
        );
        if (et && !outros?.length) {
          await comRetentativa(() =>
            admin.from("prod_op_etapas").update({ concluido_em: new Date().toISOString(), concluido_por: op.apelido }).eq("id", et.id),
          );
          const o = (et as unknown as { prod_ops: { numero: number; item_id: string | null } }).prod_ops;
          await registrarNoPedido(
            admin,
            o.item_id,
            `${numeroOP(o.numero)} · etapa ${et.posicao} ${et.operacao_desc ?? et.centro_desc ?? ""} concluída por ${op.apelido} (${Number(et.qtde_produzida) || 0} pç)`,
            `totem: ${op.apelido}`,
          );
          opEncerrada = await encerrarSeConcluida(admin, et.op_id);
        }
      }
      return NextResponse.json({ ok: true, opEncerrada });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 500);
  }
}
