import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { ComprasItem, CompraValdir } from "@/components/FollowUpCompras";
import { podeEditarAlmoxarifado } from "@/lib/acesso";
import {
  chaveItem,
  chaveLista,
  datasDaMac,
  macBase,
  macPlanilha,
  type DetalheMac,
  type ItemAlmox,
  type LinhaLista,
  type OpcaoMac,
} from "@/lib/almoxarifado";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Aba Almoxarifado — pedido do usuário (28/10/2026), ver lib/almoxarifado.ts.
// GET           → MACs com peça ativa no Follow up (pra escolher);
// GET ?q=       → busca MAC / PO / pedido de compra / desenho: o detalhe (1 MAC) ou as opções;
// GET ?mac=     → detalhe da MAC;
// POST json     → {chave, mac, chegou, observacao}: marca/desmarca "Chegou";
// POST form     → foto (file, mac, chave, rotulo, observacao, largura, altura);
// DELETE ?foto= → apaga a foto.
// Ver: qualquer conta logada (pedido do usuário, 28/10/2026 — todos olham o que o
// leandro apontou). Gravar/apagar: só o leandro e o flpmac14 (podeEditarAlmoxarifado).

type Admin = ReturnType<typeof criarClienteSupabaseAdmin>;

async function usuario(editar = false) {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return !editar || podeEditarAlmoxarifado(user) ? user : null;
}

const CAMPOS_ITEM =
  "id, po, mac, cliente, desenho, descricao, quantidade, st, status, fornecedor, coleta_data, prazo_contratual, material_chegou, falta_material";
const CAMPOS_LISTA = ["po_it_pos", "pzc", "descricao", "mac1", "desenho", "st", "po", "qtt", "un", "codigo", "mp", "larg", "comp", "di", "l"] as const;

async function compras(admin: Admin) {
  const { data, error } = await comRetentativa(() =>
    admin.from("follow_up_compras").select("itens:dados->itens, macs:dados->macs, gerado_em").eq("id", 1).maybeSingle(),
  );
  if (error) throw new Error(error.message);
  const d = data as { itens: Record<string, ComprasItem> | null; macs: Record<string, CompraValdir[]> | null; gerado_em: string | null } | null;
  return { itens: d?.itens ?? {}, macs: d?.macs ?? {}, gerado_em: d?.gerado_em ?? null };
}

/** MACs com peça no Follow up (ativas primeiro), pra tela inicial e pras opções da busca. */
type LinhaMac = { mac: string | null; cliente: string | null; po?: string | null; st?: string | null; prazo_contratual?: string | null; coleta_data?: string | null };
function agrupar(linhas: LinhaMac[], motivo?: (l: never) => string): OpcaoMac[] {
  const m = new Map<string, { o: OpcaoMac; linhas: LinhaMac[] }>();
  for (const l of linhas) {
    const base = macBase(l.mac);
    if (!base) continue;
    const g = m.get(base) ?? { o: { mac: base, cliente: l.cliente, itens: 0, motivo: motivo?.(l as never) }, linhas: [] };
    g.o.itens++;
    g.linhas.push(l);
    m.set(base, g);
  }
  // "Hoje" de Brasília (a Vercel roda em UTC).
  const hoje = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  return [...m.values()]
    .map(({ o, linhas: ls }) => {
      const d = datasDaMac(ls, hoje);
      return { ...o, prazo: d.prazo, coleta: d.coleta, pedidos: d.pedidos };
    })
    .sort((a, b) => b.itens - a.itens || a.mac.localeCompare(b.mac));
}

async function detalhe(admin: Admin, mac: string): Promise<DetalheMac> {
  const prefixo = macPlanilha(mac);
  const [itens, status, linhas, conf, fotos, comp] = await Promise.all([
    comRetentativa(() =>
      admin.from("follow_up_itens").select(CAMPOS_ITEM).eq("presente_na_ultima_importacao", true).eq("st", "A").like("mac", `${prefixo}%`).order("po").limit(2000),
    ),
    comRetentativa(() => admin.from("material_compra_status").select("colunas").eq("id", 1).maybeSingle()),
    comRetentativa(() =>
      admin.from("material_compra_linhas").select("linha_planilha, valores").like("valores->>3", `${prefixo}%`).order("linha_planilha").limit(5000),
    ),
    comRetentativa(() => admin.from("almox_conferencia").select("chave, por, em, observacao").eq("mac", mac)),
    comRetentativa(() =>
      admin.from("almox_fotos").select("id, chave, rotulo, midia_sha256, observacao, por, em").eq("mac", mac).order("em", { ascending: false }),
    ),
    compras(admin),
  ]);
  const erro = itens.error ?? status.error ?? linhas.error ?? conf.error ?? fotos.error;
  if (erro) throw new Error(erro.message);

  const doMac = (itens.data ?? []).filter((i) => macBase(i.mac) === mac);
  const posAtivos = new Set(doMac.map((i) => i.po as string));
  const ids = doMac.map((i) => i.id as string);
  const imagens = ids.length
    ? await comRetentativa(() => admin.from("follow_up_imagens").select("item_id, midia_sha256, ordem").in("item_id", ids).order("ordem"))
    : { data: [], error: null };
  if (imagens.error) throw new Error(imagens.error.message);
  const fotosItem = new Map<string, string[]>();
  for (const f of imagens.data ?? []) fotosItem.set(f.item_id, [...(fotosItem.get(f.item_id) ?? []), f.midia_sha256]);

  const colunas = ((status.data?.colunas ?? []) as { campo: string }[]).map((c) => c.campo);
  const pos = Object.fromEntries(CAMPOS_LISTA.map((c) => [c, colunas.indexOf(c)])) as Record<(typeof CAMPOS_LISTA)[number], number>;
  const lista: LinhaLista[] = (linhas.data ?? [])
    .map((l) => {
      const v = l.valores as unknown[];
      const campo = (c: (typeof CAMPOS_LISTA)[number]) => (pos[c] >= 0 ? (v[pos[c]] ?? null) : null);
      const txt = (c: (typeof CAMPOS_LISTA)[number]) => (campo(c) === null ? null : String(campo(c)));
      const num = (c: (typeof CAMPOS_LISTA)[number]) => (typeof campo(c) === "number" ? (campo(c) as number) : null);
      return {
        chave: chaveLista(txt("po_it_pos"), txt("codigo")),
        po_it_pos: txt("po_it_pos"),
        pzc: txt("pzc"),
        descricao: txt("descricao"),
        mac1: txt("mac1"),
        desenho: txt("desenho"),
        st: txt("st"),
        po: txt("po"),
        qtt: num("qtt"),
        un: txt("un")?.replace("�", "Ç") ?? null, // "P�" = "PÇ" (acento perdido na planilha)
        codigo: txt("codigo"),
        mp: txt("mp"),
        larg: num("larg"),
        comp: num("comp"),
        di: num("di"),
        l: txt("l"),
      };
    })
    // Só os pedidos ativos interessam pro almoxarifado (pedido do usuário, 28/10/2026): linha de PO entregue/cancelado sai.
    .filter((l) => macBase(l.mac1) === mac && !!l.po && posAtivos.has(l.po));

  return {
    mac,
    cliente: doMac.find((i) => i.cliente)?.cliente ?? null,
    itens: doMac.map(
      (i): ItemAlmox => ({
        id: i.id,
        chave: chaveItem(i.id),
        po: i.po,
        mac: i.mac,
        desenho: i.desenho,
        descricao: i.descricao,
        quantidade: i.quantidade === null ? null : Number(i.quantidade),
        st: i.st,
        status: i.status,
        fornecedor: i.fornecedor,
        coleta_data: i.coleta_data,
        prazo_contratual: i.prazo_contratual,
        material_chegou: !!i.material_chegou,
        falta_material: i.falta_material,
        fotos: fotosItem.get(i.id) ?? [],
        compras: comp.itens[i.id] ?? null,
      }),
    ),
    lista,
    compras: comp.macs[mac] ?? [],
    conferencias: conf.data ?? [],
    fotos: fotos.data ?? [],
    compras_em: comp.gerado_em,
  };
}

/** Imagem de referência de cada MAC — pedido do usuário (28/10/2026): a 1ª imagem
 * que o Follow up anexou numa peça ativa da obra, pra ele reconhecer a obra. */
async function comFoto(admin: Admin, opcoes: OpcaoMac[]): Promise<OpcaoMac[]> {
  if (!opcoes.length) return opcoes;
  const { data, error } = await comRetentativa(() =>
    admin
      .from("follow_up_imagens")
      .select("midia_sha256, ordem, item:follow_up_itens!inner(mac, po)")
      .eq("item.st", "A")
      .eq("item.presente_na_ultima_importacao", true)
      .order("ordem")
      .limit(5000),
  );
  if (error) return opcoes; // sem imagem não impede a tela
  const porMac = new Map<string, { po: string; sha: string }>();
  for (const r of (data ?? []) as unknown as { midia_sha256: string; item: { mac: string | null; po: string } }[]) {
    const m = macBase(r.item?.mac);
    const atual = porMac.get(m);
    if (m && (!atual || r.item.po.localeCompare(atual.po, "pt-BR", { numeric: true }) < 0)) porMac.set(m, { po: r.item.po, sha: r.midia_sha256 });
  }
  return opcoes.map((o) => ({ ...o, foto: porMac.get(o.mac)?.sha ?? null }));
}

/** O que foi digitado → MACs. MAC direto; senão PO, desenho ou nº do pedido de compra / solicitação. */
async function buscar(admin: Admin, q: string): Promise<OpcaoMac[]> {
  const termo = q.trim();
  const mac = /^\s*0*\d{1,4}[.\-/ ]\d{2}(?!\d)/.test(termo) ? macBase(termo) : "";
  if (mac) return [{ mac, cliente: null, itens: 0 }];
  const limpo = termo.replace(/[%,()]/g, "");
  if (limpo.length < 3) return [];
  const [fu, comp] = await Promise.all([
    comRetentativa(() =>
      admin
        .from("follow_up_itens")
        .select("mac, cliente, po, desenho, st, prazo_contratual, coleta_data")
        .eq("presente_na_ultima_importacao", true)
        .eq("st", "A")
        .or(`po.ilike.%${limpo}%,desenho.ilike.%${limpo}%`)
        .limit(300),
    ),
    compras(admin),
  ]);
  if (fu.error) throw new Error(fu.error.message);
  const achados = agrupar(fu.data ?? [], (l: { po: string }) => `PO ${l.po}`);
  // Nº de pedido de compra / solicitação do Sectra.
  if (/^\d{3,6}$/.test(limpo)) {
    const n = Number(limpo);
    for (const [m, lista] of Object.entries(comp.macs)) {
      if (lista.some((c) => c.pc === n || c.rq === n) && !achados.some((a) => a.mac === m))
        achados.push({ mac: m, cliente: null, itens: 0, motivo: `Pedido de compra ${n}` });
    }
    const ids = Object.entries(comp.itens)
      .filter(([, c]) => c.pc?.some((p) => p.pc === n))
      .map(([id]) => id);
    if (ids.length) {
      const r = await comRetentativa(() => admin.from("follow_up_itens").select("mac, cliente, po, st, prazo_contratual, coleta_data").in("id", ids).eq("st", "A"));
      for (const o of agrupar(r.data ?? [], () => `Pedido de compra ${n}`)) if (!achados.some((a) => a.mac === o.mac)) achados.push(o);
    }
  }
  return achados;
}

export async function GET(request: NextRequest) {
  if (!(await usuario())) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
  const admin = criarClienteSupabaseAdmin();
  const p = request.nextUrl.searchParams;
  try {
    const mac = macBase(p.get("mac"));
    if (mac) return NextResponse.json({ detalhe: await detalhe(admin, mac) }, { headers: { "Cache-Control": "no-store" } });
    const q = p.get("q");
    if (q) {
      const opcoes = await buscar(admin, q);
      if (opcoes.length === 1) return NextResponse.json({ detalhe: await detalhe(admin, opcoes[0].mac) }, { headers: { "Cache-Control": "no-store" } });
      return NextResponse.json({ opcoes: await comFoto(admin, opcoes) }, { headers: { "Cache-Control": "no-store" } });
    }
    const { data, error } = await comRetentativa(() =>
      admin.from("follow_up_itens").select("mac, cliente, po, st, prazo_contratual, coleta_data").eq("presente_na_ultima_importacao", true).eq("st", "A"),
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ opcoes: await comFoto(admin, agrupar(data ?? [])) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}

const TIPOS_IMAGEM = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const user = await usuario(true);
  if (!user) return NextResponse.json({ erro: "Só o almoxarifado (leandro) marca e tira foto — aqui é só pra olhar." }, { status: 403 });
  const por = emailParaLogin(user.email ?? "");
  const admin = criarClienteSupabaseAdmin();

  if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await request.formData();
    const arquivo = form.get("file");
    const mac = macBase(String(form.get("mac") ?? ""));
    if (!(arquivo instanceof Blob) || !mac) return NextResponse.json({ erro: "Foto ou MAC faltando." }, { status: 400 });
    const tipo = arquivo.type || "image/jpeg";
    if (!TIPOS_IMAGEM.has(tipo)) return NextResponse.json({ erro: "Formato de foto não aceito (use JPG ou PNG)." }, { status: 400 });
    const bytes = Buffer.from(await arquivo.arrayBuffer());
    const sha = createHash("sha256").update(bytes).digest("hex");
    const texto = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max) || null;
    const inteiro = (k: string) => Number(form.get(k)) || null;
    const midia = await comRetentativa(() =>
      admin.from("follow_up_midias").upsert(
        { sha256: sha, content_type: tipo, conteudo: `\\x${bytes.toString("hex")}`, largura: inteiro("largura"), altura: inteiro("altura"), tamanho: bytes.length },
        { onConflict: "sha256", ignoreDuplicates: true },
      ),
    );
    if (midia.error) return NextResponse.json({ erro: midia.error.message }, { status: 500 });
    const { data, error } = await comRetentativa(() =>
      admin
        .from("almox_fotos")
        .insert({ mac, chave: texto("chave", 300), rotulo: texto("rotulo", 300), midia_sha256: sha, observacao: texto("observacao", 500), por })
        .select("id, chave, rotulo, midia_sha256, observacao, por, em")
        .single(),
    );
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ foto: data });
  }

  const corpo = (await request.json().catch(() => null)) as { chave?: unknown; mac?: unknown; chegou?: unknown; observacao?: unknown } | null;
  const chave = typeof corpo?.chave === "string" ? corpo.chave.slice(0, 300) : "";
  const mac = macBase(typeof corpo?.mac === "string" ? corpo.mac : "");
  if (!/^(ml|pc|fu):/.test(chave) || !mac) return NextResponse.json({ erro: "Conferência inválida." }, { status: 400 });
  if (corpo?.chegou === false) {
    const { error } = await comRetentativa(() => admin.from("almox_conferencia").delete().eq("chave", chave));
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  const observacao = typeof corpo?.observacao === "string" && corpo.observacao.trim() ? corpo.observacao.trim().slice(0, 500) : null;
  const { data, error } = await comRetentativa(() =>
    admin
      .from("almox_conferencia")
      .upsert({ chave, mac, observacao, por, em: new Date().toISOString() })
      .select("chave, por, em, observacao")
      .single(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ conferencia: data });
}

export async function DELETE(request: NextRequest) {
  if (!(await usuario(true))) return NextResponse.json({ erro: "Só o almoxarifado (leandro) apaga foto." }, { status: 403 });
  const id = request.nextUrl.searchParams.get("foto") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ erro: "Foto inválida." }, { status: 400 });
  const admin = criarClienteSupabaseAdmin();
  const { data, error } = await comRetentativa(() => admin.from("almox_fotos").delete().eq("id", id).select("midia_sha256"));
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  const sha = data?.[0]?.midia_sha256 as string | undefined;
  if (sha) {
    // Apaga a imagem se ninguém mais usa (Follow up, Pintura, outra foto do almoxarifado).
    const usos = await Promise.all(
      (["follow_up_imagens", "fotos_setor", "almox_fotos"] as const).map((t) =>
        admin.from(t).select("midia_sha256", { count: "exact", head: true }).eq("midia_sha256", sha),
      ),
    );
    if (usos.every((u) => !u.error && !u.count)) await admin.from("follow_up_midias").delete().eq("sha256", sha);
  }
  return NextResponse.json({ ok: true });
}
