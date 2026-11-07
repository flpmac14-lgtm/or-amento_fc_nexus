import { NextResponse, type NextRequest } from "next/server";
import { contaTotem, podePlanejarOP } from "@/lib/acesso";
import { emailParaLogin } from "@/lib/loginInterno";
import { MOTIVO_FORA_DA_OP, etapaForaDaOP, numeroOP, type EtapaModelo } from "@/lib/producao";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";
import { CAMPOS_AP, cadastros, carregarOps, encerrarSeConcluida, recalcularPecas, registrarNoPedido, type Admin } from "./dados";

// Ordens de produção (aba "Ordens de produção" do Follow up) — pedido do usuário (07/11/2026).
// GET                    → cadastros do Sectra + OPs abertas (e encerradas/canceladas nos últimos 30 dias) + apontamentos;
// GET ?tipo=pedidos&q=   → pedidos ativos do Follow up pra gerar OP (com foto e OPs que já têm);
// GET ?tipo=historico&de=AAAA-MM-DD&ate=AAAA-MM-DD → apontamentos do período (inclui paradas);
// POST {acao: "criar" | "liberar" | "voltar" | "encerrar" | "reabrir" | "cancelar" | "excluir" | "editar" |
//       "concluir_etapa" | "reabrir_etapa" | "corrigir_apontamento" | "fechar_apontamento"}.
// Ver: qualquer conta logada (menos o totem). Gravar: podePlanejarOP (flpmac14 e marcelo/PCP).

async function usuario() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && !contaTotem(user) ? user : null;
}

function erro(msg: string, status = 400) {
  return NextResponse.json({ erro: msg }, { status });
}

export async function GET(request: NextRequest) {
  const user = await usuario();
  if (!user) return erro("Faça login.", 401);
  const admin = criarClienteSupabaseAdmin();
  const tipo = request.nextUrl.searchParams.get("tipo");
  try {
    if (tipo === "op") {
      const opId = request.nextUrl.searchParams.get("id") ?? "";
      const dados = await carregarOps(admin, { ids: [opId] });
      if (!dados.ops.length) return erro("OP não encontrada.", 404);
      return NextResponse.json({ op: dados.ops[0], apontamentos: dados.apontamentos });
    }
    if (tipo === "pedidos") return NextResponse.json(await pedidos(admin, request.nextUrl.searchParams.get("q") ?? ""));
    if (tipo === "historico") {
      const de = request.nextUrl.searchParams.get("de") ?? "";
      const ate = request.nextUrl.searchParams.get("ate") ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return erro("Período inválido.");
      const { data, error } = await comRetentativa(() =>
        admin
          .from("prod_apontamentos")
          .select(CAMPOS_AP)
          .gte("inicio", `${de}T03:00:00Z`)
          .lt("inicio", new Date(new Date(`${ate}T03:00:00Z`).getTime() + 86400e3).toISOString())
          .order("inicio", { ascending: false })
          .limit(5000),
      );
      if (error) throw new Error(error.message);
      const opIds = [...new Set((data ?? []).map((a) => a.op_id).filter(Boolean))] as string[];
      const { ops } = opIds.length ? await carregarOps(admin, { ids: opIds }) : { ops: [] };
      return NextResponse.json({ apontamentos: data ?? [], ops, cadastros: await cadastros(admin) });
    }
    const desde = new Date(Date.now() - 30 * 86400e3).toISOString();
    const [cad, dados, abertos] = await Promise.all([
      cadastros(admin),
      carregarOps(admin, { desdeEncerradas: desde }),
      comRetentativa(() => admin.from("prod_apontamentos").select(CAMPOS_AP).is("fim", null)),
    ]);
    if (abertos.error) throw new Error(abertos.error.message);
    return NextResponse.json({
      cadastros: cad,
      ...dados,
      abertos: abertos.data ?? [],
      podeEditar: podePlanejarOP(user),
      agora: new Date().toISOString(),
    });
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 500);
  }
}

async function pedidos(admin: Admin, q: string) {
  const termo = q.trim().replace(/[%,()]/g, " ").trim();
  let consulta = admin
    .from("follow_up_itens")
    .select("id, po, mac, cliente, desenho, descricao, quantidade, prazo_contratual, status, fornecedor, coleta_data")
    .eq("presente_na_ultima_importacao", true)
    .eq("st", "A")
    .order("prazo_contratual", { ascending: true, nullsFirst: false })
    .limit(termo ? 80 : 60);
  if (termo)
    consulta = consulta.or(
      ["po", "mac", "desenho", "descricao", "cliente"].map((c) => `${c}.ilike.%${termo.replace(/\s+/g, "%")}%`).join(","),
    );
  const { data, error } = await comRetentativa(() => consulta);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((i) => i.id as string);
  const [im, ops] = ids.length
    ? await Promise.all([
        comRetentativa(() => admin.from("follow_up_imagens").select("item_id, midia_sha256, ordem").in("item_id", ids).order("ordem")),
        comRetentativa(() => admin.from("prod_ops").select("item_id, numero, status, quantidade").in("item_id", ids).neq("status", "cancelada")),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (im.error ?? ops.error) throw new Error((im.error ?? ops.error)!.message);
  const foto = new Map<string, string>();
  for (const f of (im.data ?? []) as { item_id: string; midia_sha256: string }[]) if (!foto.has(f.item_id)) foto.set(f.item_id, f.midia_sha256);
  const opsDo = new Map<string, { numero: number; status: string; quantidade: number }[]>();
  for (const o of (ops.data ?? []) as { item_id: string; numero: number; status: string; quantidade: number }[])
    opsDo.set(o.item_id, [...(opsDo.get(o.item_id) ?? []), { numero: o.numero, status: o.status, quantidade: Number(o.quantidade) }]);
  return {
    pedidos: (data ?? []).map((i) => ({
      ...i,
      quantidade: i.quantidade === null ? null : Number(i.quantidade),
      foto: foto.get(i.id as string) ?? null,
      ops: opsDo.get(i.id as string) ?? [],
    })),
  };
}

type EtapaEntrada = EtapaModelo & { id?: string; operacao_desc?: string | null; centro_desc?: string | null };

// Tira o "id" (o banco gera): no insert em lote o supabase-js manda chave ausente como null.
function semId(e: EtapaEntrada): Omit<EtapaEntrada, "id"> {
  const c: Partial<EtapaEntrada> = { ...e };
  delete c.id;
  return c as Omit<EtapaEntrada, "id">;
}

function limparEtapas(lista: unknown): EtapaEntrada[] | string {
  if (!Array.isArray(lista) || !lista.length) return "Escolha pelo menos uma etapa.";
  const out: EtapaEntrada[] = [];
  const vistas = new Set<number>();
  for (const [i, e] of lista.entries()) {
    const x = e as Partial<EtapaEntrada>;
    const posicao = Number(x.posicao) || (i + 1) * 10;
    if (vistas.has(posicao)) return `Posição ${posicao} repetida.`;
    vistas.add(posicao);
    if (!x.centro && !x.operacao) return `Etapa ${posicao}: escolha a operação ou o centro produtivo.`;
    out.push({
      id: typeof x.id === "string" && x.id ? x.id : undefined,
      posicao,
      operacao: x.operacao || null,
      operacao_desc: x.operacao_desc || null,
      centro: x.centro || null,
      centro_desc: x.centro_desc || null,
      descricao: (x.descricao ?? "").toString().trim().slice(0, 500) || null,
      hr_preparo: Math.max(0, Number(x.hr_preparo) || 0),
      hr_unitario: Math.max(0, Number(x.hr_unitario) || 0),
    });
  }
  return out.sort((a, b) => a.posicao - b.posicao);
}

export async function POST(request: NextRequest) {
  const user = await usuario();
  if (!user) return erro("Faça login.", 401);
  if (!podePlanejarOP(user)) return erro("Só o PCP cria e altera ordens de produção.", 403);
  const quem = emailParaLogin(user.email ?? "");
  const admin = criarClienteSupabaseAdmin();
  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return erro("Pedido inválido.");
  }
  const id = typeof b.id === "string" ? b.id : "";
  const agora = new Date().toISOString();

  async function op() {
    const { data, error } = await comRetentativa(() => admin.from("prod_ops").select("id, numero, status, item_id, descricao").eq("id", id).maybeSingle());
    if (error) throw new Error(error.message);
    return data as { id: string; numero: number; status: string; item_id: string | null; descricao: string | null } | null;
  }
  async function temApontamento(campo: "op_id" | "etapa_id", valor: string) {
    const { count } = await comRetentativa(() => admin.from("prod_apontamentos").select("id", { count: "exact", head: true }).eq(campo, valor));
    return (count ?? 0) > 0;
  }
  async function mudar(campos: Record<string, unknown>, deStatus: string[]) {
    const { data, error } = await comRetentativa(() => admin.from("prod_ops").update(campos).eq("id", id).in("status", deStatus).select("id"));
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("A OP mudou de situação — recarregue a tela.");
  }

  try {
    switch (b.acao) {
      case "criar": {
        const etapas = limparEtapas(b.etapas);
        if (typeof etapas === "string") return erro(etapas);
        const { centros } = await cadastros(admin);
        const fora = etapas.filter((e) => etapaForaDaOP(centros, e));
        if (fora.length) return erro(`Etapa ${fora.map((e) => e.posicao).join(", ")}: ${MOTIVO_FORA_DA_OP}`);
        const quantidade = Number(b.quantidade);
        if (!(quantidade > 0)) return erro("Informe a quantidade.");
        const prioridade = [1, 2, 3].includes(Number(b.prioridade)) ? Number(b.prioridade) : 2;
        const prazo = typeof b.prazo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.prazo) ? b.prazo : null;
        let item: Record<string, unknown> | null = null;
        if (typeof b.item_id === "string" && b.item_id) {
          const r = await comRetentativa(() =>
            admin.from("follow_up_itens").select("id, po, mac, cliente, desenho, descricao").eq("id", b.item_id as string).maybeSingle(),
          );
          if (r.error) throw new Error(r.error.message);
          item = r.data;
          if (!item) return erro("Pedido do Follow up não encontrado.");
        }
        const txt = (k: string) => (typeof b[k] === "string" && (b[k] as string).trim() ? (b[k] as string).trim() : null);
        const { data: nova, error } = await comRetentativa(() =>
          admin
            .from("prod_ops")
            .insert({
              item_id: item?.id ?? null,
              po: (item?.po as string) ?? txt("po"),
              mac: (item?.mac as string) ?? txt("mac"),
              cliente: (item?.cliente as string) ?? txt("cliente"),
              desenho: (item?.desenho as string) ?? txt("desenho"),
              descricao: txt("descricao") ?? (item?.descricao as string) ?? null,
              quantidade,
              prazo,
              prioridade,
              status: b.liberar ? "liberada" : "aguardando",
              liberado_por: b.liberar ? quem : null,
              liberado_em: b.liberar ? agora : null,
              roteiro_origem: txt("roteiro_origem") ?? "Manual",
              observacao: txt("observacao"),
              criado_por: quem,
            })
            .select("id, numero")
            .single(),
        );
        if (error) throw new Error(error.message);
        const ins = await comRetentativa(() => admin.from("prod_op_etapas").insert(etapas.map((e) => ({ ...semId(e), op_id: nova.id }))));
        if (ins.error) {
          await admin.from("prod_ops").delete().eq("id", nova.id);
          throw new Error(ins.error.message);
        }
        await registrarNoPedido(
          admin,
          (item?.id as string) ?? null,
          `${numeroOP(nova.numero)} gerada (${quantidade} pç, ${etapas.length} etapas)${b.liberar ? " e liberada pra produção" : ""}`,
          quem,
        );
        return NextResponse.json({ ok: true, id: nova.id, numero: nova.numero });
      }
      case "liberar":
        await mudar({ status: "liberada", liberado_por: quem, liberado_em: agora }, ["aguardando"]);
        break;
      case "voltar": // liberada → aguardando (sem apontamento ainda)
        if (await temApontamento("op_id", id)) return erro("Essa OP já tem apontamento — não dá pra voltar pra Aguardando.");
        await mudar({ status: "aguardando", liberado_por: null, liberado_em: null }, ["liberada"]);
        break;
      case "encerrar": {
        const { data: abertos } = await comRetentativa(() => admin.from("prod_apontamentos").select("id").eq("op_id", id).is("fim", null));
        if (abertos?.length) return erro("Tem operador apontando nessa OP agora — feche o apontamento antes.");
        await mudar({ status: "encerrada", encerrado_em: agora }, ["liberada", "aguardando"]);
        break;
      }
      case "reabrir":
        await mudar({ status: "liberada", encerrado_em: null, cancelado_motivo: null }, ["encerrada", "cancelada"]);
        break;
      case "cancelar": {
        const { data: abertos } = await comRetentativa(() => admin.from("prod_apontamentos").select("id").eq("op_id", id).is("fim", null));
        if (abertos?.length) return erro("Tem operador apontando nessa OP agora — feche o apontamento antes.");
        const motivo = typeof b.motivo === "string" ? b.motivo.trim().slice(0, 300) : "";
        if (!motivo) return erro("Informe o motivo do cancelamento.");
        await mudar({ status: "cancelada", cancelado_motivo: motivo, encerrado_em: agora }, ["aguardando", "liberada"]);
        break;
      }
      case "excluir": {
        const o = await op();
        if (!o) return erro("OP não encontrada.", 404);
        if (o.status !== "aguardando" || (await temApontamento("op_id", id)))
          return erro("Só dá pra excluir OP aguardando liberação e sem apontamento — use Cancelar.");
        const { error } = await comRetentativa(() => admin.from("prod_ops").delete().eq("id", id));
        if (error) throw new Error(error.message);
        break;
      }
      case "editar": {
        const o = await op();
        if (!o) return erro("OP não encontrada.", 404);
        const campos: Record<string, unknown> = {};
        if (b.prioridade !== undefined) campos.prioridade = [1, 2, 3].includes(Number(b.prioridade)) ? Number(b.prioridade) : 2;
        if (b.prazo !== undefined) campos.prazo = typeof b.prazo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.prazo) ? b.prazo : null;
        if (b.observacao !== undefined) campos.observacao = typeof b.observacao === "string" && b.observacao.trim() ? b.observacao.trim() : null;
        if (b.descricao !== undefined && typeof b.descricao === "string" && b.descricao.trim()) campos.descricao = b.descricao.trim();
        if (b.quantidade !== undefined) {
          const q = Number(b.quantidade);
          if (!(q > 0)) return erro("Quantidade inválida.");
          campos.quantidade = q;
        }
        if (Object.keys(campos).length) {
          const { error } = await comRetentativa(() => admin.from("prod_ops").update(campos).eq("id", id));
          if (error) throw new Error(error.message);
        }
        // Roteiro: as etapas já apontadas ficam; as outras são trocadas pela lista nova.
        if (b.etapas !== undefined) {
          if (o.status === "encerrada" || o.status === "cancelada") return erro("OP encerrada/cancelada: reabra antes de mudar o roteiro.");
          const etapas = limparEtapas(b.etapas);
          if (typeof etapas === "string") return erro(etapas);
          const { centros } = await cadastros(admin);
          const fora = etapas.filter((e) => !e.id && etapaForaDaOP(centros, e));
          if (fora.length) return erro(`Etapa ${fora.map((e) => e.posicao).join(", ")}: ${MOTIVO_FORA_DA_OP}`);
          const { data: atuais } = await comRetentativa(() => admin.from("prod_op_etapas").select("id, posicao").eq("op_id", id));
          const { data: aps } = await comRetentativa(() => admin.from("prod_apontamentos").select("etapa_id").eq("op_id", id));
          const usadas = new Set((aps ?? []).map((a) => a.etapa_id));
          const travadas = (atuais ?? []).filter((e) => usadas.has(e.id) || false);
          const idsNovos = new Set(etapas.map((e) => e.id).filter(Boolean));
          const faltando = travadas.filter((e) => !idsNovos.has(e.id));
          if (faltando.length) return erro(`A etapa ${faltando.map((e) => e.posicao).join(", ")} já tem apontamento e não pode sair do roteiro.`);
          const idsTravados = new Set(travadas.map((e) => e.id));
          // 1) apaga as não apontadas, 2) atualiza as apontadas, 3) insere o resto.
          const apagar = (atuais ?? []).filter((e) => !idsTravados.has(e.id)).map((e) => e.id);
          if (apagar.length) {
            const r = await comRetentativa(() => admin.from("prod_op_etapas").delete().in("id", apagar));
            if (r.error) throw new Error(r.error.message);
          }
          for (const e of etapas.filter((x) => x.id && idsTravados.has(x.id))) {
            const { id: eid, ...campos } = e;
            const r = await comRetentativa(() => admin.from("prod_op_etapas").update(campos).eq("id", eid!));
            if (r.error) throw new Error(r.error.message);
          }
          const inserir = etapas.filter((x) => !x.id || !idsTravados.has(x.id)).map((e) => ({ ...semId(e), op_id: id }));
          if (inserir.length) {
            const r = await comRetentativa(() => admin.from("prod_op_etapas").insert(inserir));
            if (r.error) throw new Error(r.error.message);
          }
          if (b.roteiro_origem && typeof b.roteiro_origem === "string")
            await comRetentativa(() => admin.from("prod_ops").update({ roteiro_origem: b.roteiro_origem }).eq("id", id));
        }
        break;
      }
      case "concluir_etapa":
      case "reabrir_etapa": {
        const etapaId = String(b.etapa_id ?? "");
        const { data: et } = await comRetentativa(() => admin.from("prod_op_etapas").select("id, op_id, posicao, operacao_desc, centro_desc").eq("id", etapaId).maybeSingle());
        if (!et) return erro("Etapa não encontrada.", 404);
        if (b.acao === "concluir_etapa") {
          const { data: abertos } = await comRetentativa(() => admin.from("prod_apontamentos").select("id").eq("etapa_id", etapaId).is("fim", null));
          if (abertos?.length) return erro("Tem operador apontando nessa etapa agora.");
          await comRetentativa(() => admin.from("prod_op_etapas").update({ concluido_em: agora, concluido_por: quem }).eq("id", etapaId));
          await encerrarSeConcluida(admin, et.op_id);
        } else {
          await comRetentativa(() => admin.from("prod_op_etapas").update({ concluido_em: null, concluido_por: null }).eq("id", etapaId));
          await comRetentativa(() => admin.from("prod_ops").update({ status: "liberada", encerrado_em: null }).eq("id", et.op_id).eq("status", "encerrada"));
        }
        break;
      }
      case "fechar_apontamento":
      case "corrigir_apontamento": {
        const apId = String(b.apontamento_id ?? "");
        const { data: ap } = await comRetentativa(() => admin.from("prod_apontamentos").select("id, inicio, fim, qtde, etapa_id").eq("id", apId).maybeSingle());
        if (!ap) return erro("Apontamento não encontrado.", 404);
        const inicio = typeof b.inicio === "string" ? new Date(b.inicio) : new Date(ap.inicio);
        const fim = b.acao === "fechar_apontamento" ? new Date() : typeof b.fim === "string" && b.fim ? new Date(b.fim) : ap.fim ? new Date(ap.fim) : null;
        if (Number.isNaN(inicio.getTime()) || (fim && Number.isNaN(fim.getTime()))) return erro("Data/hora inválida.");
        if (fim && fim <= inicio) return erro("O fim tem que ser depois do início.");
        const qtde = b.qtde === undefined ? ap.qtde : b.qtde === null || b.qtde === "" ? null : Number(b.qtde);
        const { error } = await comRetentativa(() =>
          admin
            .from("prod_apontamentos")
            .update({
              inicio: inicio.toISOString(),
              fim: fim?.toISOString() ?? null,
              ...(ap.fim && fim ? {} : { fim_tipo: fim ? "correcao" : null }),
              qtde,
              observacao: typeof b.observacao === "string" ? b.observacao.trim() || null : undefined,
            })
            .eq("id", apId),
        );
        if (error) throw new Error(error.message);
        // Peças da etapa = soma dos apontamentos (recalcula depois da correção).
        if (ap.etapa_id) await recalcularPecas(admin, ap.etapa_id);
        break;
      }
      default:
        return erro("Ação desconhecida.");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erro(e instanceof Error ? e.message : String(e), 500);
  }
}
