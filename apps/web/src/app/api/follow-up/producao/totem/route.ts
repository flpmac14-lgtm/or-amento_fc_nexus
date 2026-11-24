import { NextResponse, type NextRequest } from "next/server";
import { contaTotem, perfilModulo } from "@/lib/acesso";
import { podeVerFinanceiro } from "@/lib/financeiro";
import { emailParaLogin } from "@/lib/loginInterno";
import { SETORES_INTERNO, listaMotivosRefugo, numeroOP, type Apontamento, type Operador } from "@/lib/producao";
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
// Fluxo produtivo / improdutivo (13/11/2026, migration 0072):
//   quantidades = {qtde (conformes), qtde_refugo (não conformes), motivo_refugo (código obrigatório se houver refugo)};
//   parada com produtivo aberto → pausa o produtivo e a parada guarda retoma_ap_id;
//   parcial {quantidades}          → aponta e continua produzindo (fecha o trecho e abre outro igual);
//   retomar                        → fecha a parada e reabre a mesma etapa que ela pausou;
//   apontar_pausado {ap_id, quantidades, encerrar_etapa} → quantidade do trecho pausado que ficou sem.

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

// Peças conformes + não conformes (com o código do refugo).
function quantidades(b: Record<string, unknown>, motivosValidos: Set<string>) {
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? null : Math.max(0, Math.round(Number(v) || 0)));
  const qtde = num(b.qtde);
  const refugo = num(b.qtde_refugo);
  const motivo = typeof b.motivo_refugo === "string" ? b.motivo_refugo.trim().slice(0, 200) : "";
  if (refugo && !motivo) throw new ErroUsuario("Escolha o código do motivo do refugo (peças não conformes).");
  if (refugo && !motivosValidos.has(motivo)) throw new ErroUsuario("Código de refugo inválido.");
  return { qtde, qtde_refugo: refugo || null, motivo_refugo: refugo ? motivo : null };
}
class ErroUsuario extends Error {}

// Etapa concluída: só quando o último operador sair dela. Devolve se a OP inteira terminou.
async function concluirEtapa(admin: Admin, etapaId: string, apelido: string): Promise<boolean> {
  const { data: outros } = await comRetentativa(() => admin.from("prod_apontamentos").select("id").eq("etapa_id", etapaId).is("fim", null));
  const { data: et } = await comRetentativa(() =>
    admin
      .from("prod_op_etapas")
      .select("id, op_id, posicao, operacao_desc, centro_desc, qtde_produzida, concluido_em, prod_ops!inner(numero, item_id)")
      .eq("id", etapaId)
      .maybeSingle(),
  );
  if (!et || outros?.length || et.concluido_em) return false;
  await comRetentativa(() => admin.from("prod_op_etapas").update({ concluido_em: new Date().toISOString(), concluido_por: apelido }).eq("id", et.id));
  const o = (et as unknown as { prod_ops: { numero: number; item_id: string | null } }).prod_ops;
  await registrarNoPedido(
    admin,
    o.item_id,
    `${numeroOP(o.numero)} · etapa ${et.posicao} ${et.operacao_desc ?? et.centro_desc ?? ""} concluída por ${apelido} (${Number(et.qtde_produzida) || 0} pç)`,
    `totem: ${apelido}`,
  );
  return encerrarSeConcluida(admin, et.op_id);
}

// Etapa liberada pra apontar (OP liberada e etapa não concluída).
async function etapaLiberada(admin: Admin, etapaId: string): Promise<{ op_id: string } | string> {
  const { data: et } = await comRetentativa(() =>
    admin.from("prod_op_etapas").select("id, op_id, concluido_em, prod_ops!inner(status)").eq("id", etapaId).maybeSingle(),
  );
  const st = (et as unknown as { prod_ops: { status: string } } | null)?.prod_ops?.status;
  if (!et || !st) return "Etapa não encontrada.";
  if (st !== "liberada") return "Essa OP não está liberada para produção. Procure o PCP.";
  if (et.concluido_em) return "Essa etapa já foi concluída.";
  return { op_id: et.op_id as string };
}

// Editar apontamento no próprio totem — pedido do usuário (24/11/2026): a conta
// "apontamento" corrige hora, tipo (produção/preparação) ou cancela um apontamento,
// mas só com a senha do encarregado — variável de ambiente TOTEM_SENHA_EDICAO na Vercel
// (fora do código/git). Sem a variável, ninguém edita pelo totem (só o flpmac14).
//   editar_listar {senha, dias?}                       → apontamentos abertos + dos últimos dias;
//   editar_salvar {senha, apontamento_id, inicio, fim, tipo?} → corrige (fim vazio = continua aberto);
//   editar_cancelar {senha, apontamento_id}            → apaga (peças e conclusão da etapa recalculadas).

// flpmac14 edita sem senha (pedido do usuário, 24/11/2026).
async function editar(admin: Admin, b: Record<string, unknown>, origem: string, semSenha: boolean) {
  const senhaCerta = process.env.TOTEM_SENHA_EDICAO?.trim();
  if (!semSenha && (!senhaCerta || String(b.senha ?? "").trim() !== senhaCerta)) return erro("Senha incorreta.", 403);
  if (b.acao === "editar_listar") {
    const dias = Math.min(31, Math.max(1, Number(b.dias) || 7));
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const { data, error } = await comRetentativa(() =>
      admin
        .from("prod_apontamentos")
        .select(`${CAMPOS_AP}, cracha, prod_ops(numero, descricao), prod_op_etapas(posicao, operacao_desc, centro)`)
        .or(`fim.is.null,inicio.gte.${desde}`)
        .order("inicio", { ascending: false })
        .limit(500),
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ apontamentos: data ?? [] });
  }
  const apId = String(b.apontamento_id ?? "");
  const { data: ap } = await comRetentativa(() =>
    admin.from("prod_apontamentos").select("id, inicio, fim, tipo, etapa_id, op_id, encerrou_etapa").eq("id", apId).maybeSingle(),
  );
  if (!ap) return erro("Apontamento não encontrado.", 404);
  if (b.acao === "editar_salvar") {
    const inicio = typeof b.inicio === "string" && b.inicio ? new Date(b.inicio) : new Date(ap.inicio);
    const fim = typeof b.fim === "string" && b.fim ? new Date(b.fim) : null;
    if (Number.isNaN(inicio.getTime()) || (fim && Number.isNaN(fim.getTime()))) return erro("Data/hora inválida.");
    if (fim && fim <= inicio) return erro("O fim tem que ser depois do início.");
    if (fim && fim.getTime() > Date.now() + 60000) return erro("O fim não pode ser no futuro.");
    // Tipo: só entre produção e preparação (parada/serviço interno não têm etapa).
    let tipo = ap.tipo as string;
    if (typeof b.tipo === "string" && b.tipo !== tipo) {
      if (!ap.etapa_id || !["producao", "setup"].includes(b.tipo)) return erro("Só dá pra trocar entre Produção e Preparação (setup).");
      tipo = b.tipo;
    }
    if (!fim) {
      // Reabrir: o operador não pode ficar com dois apontamentos abertos.
      const { data: outro } = await comRetentativa(() =>
        admin.from("prod_apontamentos").select("id, operador_codigo").is("fim", null).neq("id", ap.id),
      );
      const { data: dono } = await comRetentativa(() => admin.from("prod_apontamentos").select("operador_codigo").eq("id", ap.id).maybeSingle());
      if (outro?.some((o) => o.operador_codigo === dono?.operador_codigo)) return erro("Esse operador já tem outro apontamento aberto. Encerre o outro antes.");
    }
    const { error } = await comRetentativa(() =>
      admin
        .from("prod_apontamentos")
        .update({
          inicio: inicio.toISOString(),
          fim: fim?.toISOString() ?? null,
          ...(ap.fim && fim ? {} : { fim_tipo: fim ? "correcao" : null }),
          tipo,
        })
        .eq("id", ap.id),
    );
    if (error) throw new Error(error.message);
    if (ap.etapa_id) await recalcularPecas(admin, ap.etapa_id);
    return NextResponse.json({ ok: true, por: origem });
  }
  if (b.acao === "editar_cancelar") {
    const { error } = await comRetentativa(() => admin.from("prod_apontamentos").delete().eq("id", ap.id));
    if (error) throw new Error(error.message);
    if (ap.etapa_id) {
      await recalcularPecas(admin, ap.etapa_id);
      if (ap.encerrou_etapa) {
        await comRetentativa(() => admin.from("prod_op_etapas").update({ concluido_em: null, concluido_por: null }).eq("id", ap.etapa_id!));
        if (ap.op_id) await comRetentativa(() => admin.from("prod_ops").update({ status: "liberada", encerrado_em: null }).eq("id", ap.op_id!).eq("status", "encerrada"));
      }
    }
    return NextResponse.json({ ok: true });
  }
  return erro("Ação desconhecida.");
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
    if (typeof b.acao === "string" && b.acao.startsWith("editar_")) return await editar(admin, b, origem, podeVerFinanceiro(user.email));
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
      // Parada aberta que pausou um produtivo: o trecho pausado (pra oferecer "retomar a mesma obra").
      let pausado: Apontamento | null = null;
      if (aberto?.retoma_ap_id) {
        const { data: p } = await comRetentativa(() => admin.from("prod_apontamentos").select(CAMPOS_AP).eq("id", aberto.retoma_ap_id!).maybeSingle());
        pausado = (p as Apontamento | null) ?? null;
      }
      return NextResponse.json({
        operador: { codigo: op.codigo, nome: op.nome, apelido: op.apelido, cracha: op.cracha, centro: op.centro },
        aberto,
        pausado,
        motivos_refugo: listaMotivosRefugo(cad.motivos_refugo),
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
      const et = await etapaLiberada(admin, etapaId);
      if (typeof et === "string") return erro(et);
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
      // Produtivo aberto (com OP): pausa ele (motivo = a parada) e a parada lembra qual trecho retomar.
      // Serviço interno não é retomado: fecha e abre a parada.
      const pausou = aberto && aberto.tipo !== "parada" && aberto.etapa_id ? aberto : null;
      if (pausou) await fechar(admin, pausou, { fim_tipo: "pausa", motivo });
      else if (aberto) await fechar(admin, aberto, { fim_tipo: "troca" });
      const { data, error } = await comRetentativa(() =>
        admin
          .from("prod_apontamentos")
          .insert({ operador_codigo: op.codigo, operador_nome: op.apelido, cracha: op.cracha, tipo: "parada", motivo, origem, retoma_ap_id: pausou?.id ?? null })
          .select(CAMPOS_AP)
          .single(),
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, aberto: data });
    }

    // Serviço interno Macfab (sem OP) — pedido do usuário (16/11/2026): setor no motivo.
    if (b.acao === "interno") {
      const setor = String(b.setor ?? "").toUpperCase();
      if (!(SETORES_INTERNO as readonly string[]).includes(setor)) return erro("Escolha o setor: Usinagem, Caldeiraria ou Solda.");
      if (aberto && aberto.etapa_id) return erro("Encerre o apontamento da ordem antes de começar um serviço interno.");
      if (aberto?.tipo === "interno" && aberto.motivo === setor) return erro("Você já está em serviço interno nesse setor.");
      if (aberto) await fechar(admin, aberto, { fim_tipo: "troca" });
      const { data, error } = await comRetentativa(() =>
        admin
          .from("prod_apontamentos")
          .insert({ operador_codigo: op.codigo, operador_nome: op.apelido, cracha: op.cracha, tipo: "interno", motivo: setor, origem })
          .select(CAMPOS_AP)
          .single(),
      );
      if (error) throw new Error(error.message.includes("prod_apontamentos_aberto_idx") ? "Você já tem um apontamento aberto." : error.message);
      return NextResponse.json({ ok: true, aberto: data });
    }

    const motivosValidos = new Set(listaMotivosRefugo(cad.motivos_refugo).map((m) => `${m.codigo} - ${m.descricao}`));

    if (b.acao === "apontar_pausado") {
      // Quantidade do trecho produtivo pausado (pela parada) que ficou sem informar.
      const { data: p } = await comRetentativa(() =>
        admin.from("prod_apontamentos").select(CAMPOS_AP).eq("id", String(b.ap_id ?? "")).eq("operador_codigo", op.codigo).maybeSingle(),
      );
      const ap = p as Apontamento | null;
      if (!ap || !ap.fim || ap.tipo === "parada" || !ap.etapa_id) return erro("Apontamento não encontrado.");
      // Se já tinha peças nesse trecho, soma (não apaga o que foi apontado antes).
      const q = quantidades(b, motivosValidos);
      const encerrar = !!b.encerrar_etapa;
      const { error } = await comRetentativa(() =>
        admin
          .from("prod_apontamentos")
          .update({
            qtde: (Number(ap.qtde) || 0) + (q.qtde ?? 0),
            qtde_refugo: (Number(ap.qtde_refugo) || 0) + (q.qtde_refugo ?? 0) || null,
            motivo_refugo: q.motivo_refugo ?? ap.motivo_refugo ?? null,
            encerrou_etapa: encerrar || ap.encerrou_etapa,
          })
          .eq("id", ap.id),
      );
      if (error) throw new Error(error.message);
      await recalcularPecas(admin, ap.etapa_id);
      const opEncerrada = encerrar ? await concluirEtapa(admin, ap.etapa_id, op.apelido) : false;
      return NextResponse.json({ ok: true, opEncerrada });
    }

    if (!aberto) return erro("Você não tem apontamento aberto.");

    if (b.acao === "retomar") {
      // Fecha a parada e reabre a mesma etapa/tipo que ela pausou.
      if (aberto.tipo !== "parada" || !aberto.retoma_ap_id) return erro("Não há produção pausada para retomar.");
      const { data: p } = await comRetentativa(() => admin.from("prod_apontamentos").select(CAMPOS_AP).eq("id", aberto.retoma_ap_id!).maybeSingle());
      const ap = p as Apontamento | null;
      if (!ap?.etapa_id) return erro("Produção pausada não encontrada.");
      const et = await etapaLiberada(admin, ap.etapa_id);
      if (typeof et === "string") return erro(et);
      await fechar(admin, aberto, { fim_tipo: "fim" });
      const { data, error } = await comRetentativa(() =>
        admin
          .from("prod_apontamentos")
          .insert({ op_id: et.op_id, etapa_id: ap.etapa_id, operador_codigo: op.codigo, operador_nome: op.apelido, cracha: op.cracha, tipo: ap.tipo, origem })
          .select(CAMPOS_AP)
          .single(),
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, aberto: data });
    }

    const q = aberto.tipo === "parada" || aberto.tipo === "interno" ? { qtde: null, qtde_refugo: null, motivo_refugo: null } : quantidades(b, motivosValidos);
    const obs = typeof b.observacao === "string" && b.observacao.trim() ? b.observacao.trim().slice(0, 500) : null;

    if (b.acao === "parcial") {
      // Apontou quantidade e continua produzindo: fecha o trecho e abre outro igual.
      if (aberto.tipo === "parada" || !aberto.etapa_id) return erro("Você não está produzindo.");
      await fechar(admin, aberto, { fim_tipo: "parcial", ...q, observacao: obs });
      const { data, error } = await comRetentativa(() =>
        admin
          .from("prod_apontamentos")
          .insert({ op_id: aberto.op_id, etapa_id: aberto.etapa_id, operador_codigo: op.codigo, operador_nome: op.apelido, cracha: op.cracha, tipo: aberto.tipo, origem })
          .select(CAMPOS_AP)
          .single(),
      );
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, aberto: data });
    }

    if (b.acao === "pausar") {
      const motivo = typeof b.motivo === "string" && b.motivo.trim() ? b.motivo.trim().slice(0, 200) : null;
      await fechar(admin, aberto, { fim_tipo: "pausa", motivo: aberto.tipo === "parada" ? aberto.motivo : motivo, ...q, observacao: obs });
      return NextResponse.json({ ok: true });
    }

    if (b.acao === "finalizar") {
      const encerrar = !!b.encerrar_etapa && !!aberto.etapa_id;
      await fechar(admin, aberto, { fim_tipo: "fim", ...q, encerrou_etapa: encerrar, observacao: obs });
      const opEncerrada = encerrar && aberto.etapa_id ? await concluirEtapa(admin, aberto.etapa_id, op.apelido) : false;
      return NextResponse.json({ ok: true, opEncerrada });
    }

    return erro("Ação desconhecida.");
  } catch (e) {
    if (e instanceof ErroUsuario) return erro(e.message);
    return erro(e instanceof Error ? e.message : String(e), 500);
  }
}
