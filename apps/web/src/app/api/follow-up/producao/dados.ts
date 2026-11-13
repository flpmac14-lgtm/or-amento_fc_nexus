// Leitura comum das rotas de produção (planejador e totem) — ver lib/producao.ts.
import type { Apontamento, Cadastros, Etapa, Feriado, OP } from "@/lib/producao";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";

export type Admin = ReturnType<typeof criarClienteSupabaseAdmin>;

export const CAMPOS_OP =
  "id, numero, item_id, po, mac, cliente, desenho, descricao, quantidade, prazo, prioridade, status, roteiro_origem, observacao, criado_por, criado_em, liberado_por, liberado_em, encerrado_em, cancelado_motivo";
export const CAMPOS_ETAPA =
  "id, op_id, posicao, operacao, operacao_desc, centro, centro_desc, descricao, hr_preparo, hr_unitario, qtde_produzida, concluido_em, concluido_por";
export const CAMPOS_AP =
  "id, op_id, etapa_id, operador_codigo, operador_nome, tipo, motivo, inicio, fim, fim_tipo, qtde, encerrou_etapa, observacao";

export async function cadastros(admin: Admin): Promise<Cadastros> {
  const [{ data, error }, fer] = await Promise.all([
    comRetentativa(() => admin.from("prod_cadastros").select("id, dados, gerado_em")),
    comRetentativa(() => admin.from("prod_feriados").select("data, descricao").order("data")),
  ]);
  if (error) throw new Error(error.message);
  const m = new Map((data ?? []).map((r) => [r.id as string, r]));
  const d = (k: string) => (m.get(k)?.dados ?? []) as never;
  const gerado = (data ?? []).map((r) => r.gerado_em as string).sort().pop() ?? null;
  return {
    operadores: d("operadores"),
    centros: d("centros"),
    operacoes: d("operacoes"),
    roteiros_padrao: d("roteiros_padrao"),
    roteiros_desenho: d("roteiros_desenho"),
    motivos: d("motivos"),
    // Sem a tabela (migration 0071 não aplicada) segue sem feriados em vez de derrubar a tela.
    feriados: fer.error ? [] : ((fer.data ?? []) as Feriado[]),
    gerado_em: gerado,
  };
}

/** OPs (com etapas e a 1ª foto do pedido) e os apontamentos delas. */
export async function carregarOps(
  admin: Admin,
  filtro: { status?: string[]; ids?: string[]; desdeEncerradas?: string; arquivo?: { q: string; de: string; ate: string; limite: number } },
): Promise<{ ops: OP[]; apontamentos: Apontamento[] }> {
  let q = admin.from("prod_ops").select(CAMPOS_OP).order("numero", { ascending: false }).limit(filtro.arquivo?.limite ?? 1000);
  if (filtro.ids) q = q.in("id", filtro.ids);
  else if (filtro.arquivo) {
    // Arquivo de OPs: todas as já criadas (sem o corte de 30 dias do painel).
    const a = filtro.arquivo;
    if (filtro.status?.length) q = q.in("status", filtro.status);
    if (a.de) q = q.gte("criado_em", `${a.de}T03:00:00Z`);
    if (a.ate) q = q.lt("criado_em", new Date(new Date(`${a.ate}T03:00:00Z`).getTime() + 86400e3).toISOString());
    const t = a.q.replace(/[,()*%\\"']/g, " ").trim();
    if (t) {
      const num = Number(t.replace(/^OP\s*/i, ""));
      const campos = ["po", "mac", "cliente", "desenho", "descricao", "observacao"].map((c) => `${c}.ilike.*${t}*`);
      if (Number.isInteger(num) && num > 0) campos.push(`numero.eq.${num}`);
      q = q.or(campos.join(","));
    }
  }
  else if (filtro.desdeEncerradas)
    q = q.or(`status.in.(aguardando,liberada),encerrado_em.gte.${filtro.desdeEncerradas},criado_em.gte.${filtro.desdeEncerradas}`);
  else if (filtro.status) q = q.in("status", filtro.status);
  const { data: ops, error } = await comRetentativa(() => q);
  if (error) throw new Error(error.message);
  const ids = (ops ?? []).map((o) => o.id as string);
  if (!ids.length) return { ops: [], apontamentos: [] };
  const itemIds = [...new Set((ops ?? []).map((o) => o.item_id as string | null).filter(Boolean))] as string[];
  const [et, ap, im] = await Promise.all([
    comRetentativa(() => admin.from("prod_op_etapas").select(CAMPOS_ETAPA).in("op_id", ids).order("posicao")),
    comRetentativa(() => admin.from("prod_apontamentos").select(CAMPOS_AP).in("op_id", ids).order("inicio")),
    itemIds.length
      ? comRetentativa(() => admin.from("follow_up_imagens").select("item_id, midia_sha256, ordem").in("item_id", itemIds).order("ordem"))
      : Promise.resolve({ data: [] as { item_id: string; midia_sha256: string }[], error: null }),
  ]);
  const erro = et.error ?? ap.error ?? im.error;
  if (erro) throw new Error(erro.message);
  const foto = new Map<string, string>();
  for (const f of im.data ?? []) if (!foto.has(f.item_id)) foto.set(f.item_id, f.midia_sha256);
  const porOp = new Map<string, Etapa[]>();
  for (const e of (et.data ?? []) as Etapa[]) {
    const n = { ...e, hr_preparo: Number(e.hr_preparo), hr_unitario: Number(e.hr_unitario), qtde_produzida: Number(e.qtde_produzida) };
    porOp.set(e.op_id, [...(porOp.get(e.op_id) ?? []), n]);
  }
  return {
    ops: (ops ?? []).map((o) => ({
      ...(o as unknown as OP),
      quantidade: Number(o.quantidade),
      foto: o.item_id ? (foto.get(o.item_id as string) ?? null) : null,
      etapas: porOp.get(o.id as string) ?? [],
    })),
    apontamentos: ((ap.data ?? []) as Apontamento[]).map((a) => ({ ...a, qtde: a.qtde === null ? null : Number(a.qtde) })),
  };
}

/** "Hoje" de Brasília (a Vercel roda em UTC). */
export function hojeBrasilia(): string {
  return new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
}

/** Registro diário do pedido no Follow up (mesmo lugar dos apontamentos da Usinagem). */
export async function registrarNoPedido(admin: Admin, itemId: string | null, texto: string, autor: string) {
  if (!itemId) return;
  await comRetentativa(() => admin.from("follow_up_registros").insert({ item_id: itemId, data: hojeBrasilia(), texto, autor }));
}

/** Encerra a OP sozinha quando todas as etapas estão concluídas. */
export async function encerrarSeConcluida(admin: Admin, opId: string): Promise<boolean> {
  const { data } = await comRetentativa(() => admin.from("prod_op_etapas").select("concluido_em").eq("op_id", opId));
  if (!data?.length || data.some((e) => !e.concluido_em)) return false;
  await comRetentativa(() =>
    admin.from("prod_ops").update({ status: "encerrada", encerrado_em: new Date().toISOString() }).eq("id", opId).eq("status", "liberada"),
  );
  return true;
}

/** Peças da etapa = soma das peças dos apontamentos dela. */
export async function recalcularPecas(admin: Admin, etapaId: string) {
  const { data } = await comRetentativa(() => admin.from("prod_apontamentos").select("qtde").eq("etapa_id", etapaId));
  const soma = (data ?? []).reduce((s, a) => s + (Number(a.qtde) || 0), 0);
  await comRetentativa(() => admin.from("prod_op_etapas").update({ qtde_produzida: soma }).eq("id", etapaId));
}
