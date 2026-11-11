import { NextResponse, type NextRequest } from "next/server";
import { BUCKET_DOCUMENTOS, MAX_BYTES_DOCUMENTO, podeVerDocumentos } from "@/lib/documentos";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Documentos — tela /documentos (pedido do usuário, 11/11/2026): pastas + PDFs.
// Tabelas documentos_pastas / documentos_arquivos (migration 0069, RLS sem
// policy): só esta rota lê/grava, sempre filtrando pelo e-mail logado (dono).
//
// GET                 → { pastas, arquivos }
// GET ?abrir=<id>     → { url } assinada (1 h) pra abrir/baixar o PDF
// POST { acao }       → criar_pasta {nome} · renomear_pasta {id, nome}
//                       preparar_upload {pasta_id, nome, tamanho} → {objeto, token}
//                       confirmar_upload {pasta_id, nome, tamanho, objeto} → {arquivo}
//   O PDF vai direto do navegador pro Storage (uploadToSignedUrl) — a Vercel
//   não aceita corpo acima de 4,5 MB, e PDF de desenho/certificado passa disso.
// DELETE ?arquivo=<id> | ?pasta=<id> (apaga a pasta com tudo dentro)

async function dono(): Promise<string | null> {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email && podeVerDocumentos(user.email) ? user.email.trim().toLowerCase() : null;
}

const negado = () => NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
const ruim = (erro: string) => NextResponse.json({ erro }, { status: 400 });
const falha = (erro: string) => NextResponse.json({ erro }, { status: 500 });

function nomePasta(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, 120) : "";
}

function nomeArquivo(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/[\\/]/g, "_").slice(0, 250) : "";
}

async function pastaDoDono(admin: ReturnType<typeof criarClienteSupabaseAdmin>, id: string, email: string) {
  const { data } = await comRetentativa(() =>
    admin.from("documentos_pastas").select("id").eq("id", id).eq("dono", email).maybeSingle(),
  );
  return !!data;
}

export async function GET(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const admin = criarClienteSupabaseAdmin();

  const abrir = request.nextUrl.searchParams.get("abrir");
  if (abrir) {
    const { data: arq, error } = await comRetentativa(() =>
      admin.from("documentos_arquivos").select("objeto, nome").eq("id", abrir).eq("dono", email).maybeSingle(),
    );
    if (error) return falha(error.message);
    if (!arq) return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404 });
    const baixar = request.nextUrl.searchParams.get("baixar") === "1";
    const { data: assinada, error: erroUrl } = await admin.storage
      .from(BUCKET_DOCUMENTOS)
      .createSignedUrl(arq.objeto, 3600, baixar ? { download: arq.nome } : undefined);
    if (erroUrl || !assinada) return falha(erroUrl?.message ?? "Falha ao gerar o link.");
    return NextResponse.json({ url: assinada.signedUrl }, { headers: { "Cache-Control": "no-store" } });
  }

  const [pastas, arquivos] = await Promise.all([
    comRetentativa(() =>
      admin.from("documentos_pastas").select("id, nome, criado_em").eq("dono", email).order("nome"),
    ),
    comRetentativa(() =>
      admin
        .from("documentos_arquivos")
        .select("id, pasta_id, nome, tamanho, criado_em")
        .eq("dono", email)
        .order("nome"),
    ),
  ]);
  if (pastas.error) return falha(pastas.error.message);
  if (arquivos.error) return falha(arquivos.error.message);
  return NextResponse.json(
    { pastas: pastas.data ?? [], arquivos: arquivos.data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const corpo = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const admin = criarClienteSupabaseAdmin();

  switch (corpo.acao) {
    case "criar_pasta": {
      const nome = nomePasta(corpo.nome);
      if (!nome) return ruim("Informe o nome da pasta.");
      const { data, error } = await comRetentativa(() =>
        admin.from("documentos_pastas").insert({ dono: email, nome }).select("id, nome, criado_em").single(),
      );
      if (error) return falha(error.message);
      return NextResponse.json({ pasta: data });
    }

    case "renomear_pasta": {
      const nome = nomePasta(corpo.nome);
      const id = typeof corpo.id === "string" ? corpo.id : "";
      if (!id || !nome) return ruim("Informe a pasta e o novo nome.");
      const { data, error } = await comRetentativa(() =>
        admin
          .from("documentos_pastas")
          .update({ nome })
          .eq("id", id)
          .eq("dono", email)
          .select("id, nome, criado_em")
          .maybeSingle(),
      );
      if (error) return falha(error.message);
      if (!data) return NextResponse.json({ erro: "Pasta não encontrada." }, { status: 404 });
      return NextResponse.json({ pasta: data });
    }

    case "preparar_upload": {
      const pastaId = typeof corpo.pasta_id === "string" ? corpo.pasta_id : "";
      const nome = nomeArquivo(corpo.nome);
      const tamanho = Number(corpo.tamanho);
      if (!pastaId || !nome) return ruim("Informe a pasta e o arquivo.");
      if (!/\.pdf$/i.test(nome)) return ruim(`"${nome}" não é PDF — só dá pra anexar PDF.`);
      if (Number.isFinite(tamanho) && tamanho > MAX_BYTES_DOCUMENTO) return ruim(`"${nome}" passa de 50 MB.`);
      if (!(await pastaDoDono(admin, pastaId, email))) return NextResponse.json({ erro: "Pasta não encontrada." }, { status: 404 });
      const objeto = `${pastaId}/${crypto.randomUUID()}.pdf`;
      const { data, error } = await admin.storage.from(BUCKET_DOCUMENTOS).createSignedUploadUrl(objeto);
      if (error || !data) return falha(error?.message ?? "Falha ao preparar o envio.");
      return NextResponse.json({ objeto, token: data.token });
    }

    case "confirmar_upload": {
      const pastaId = typeof corpo.pasta_id === "string" ? corpo.pasta_id : "";
      const objeto = typeof corpo.objeto === "string" ? corpo.objeto : "";
      const nome = nomeArquivo(corpo.nome);
      const tamanho = Number(corpo.tamanho);
      if (!pastaId || !nome || !objeto.startsWith(`${pastaId}/`)) return ruim("Envio inválido.");
      if (!(await pastaDoDono(admin, pastaId, email))) return NextResponse.json({ erro: "Pasta não encontrada." }, { status: 404 });
      const { data, error } = await comRetentativa(() =>
        admin
          .from("documentos_arquivos")
          .insert({ pasta_id: pastaId, dono: email, nome, objeto, tamanho: Number.isFinite(tamanho) ? tamanho : null })
          .select("id, pasta_id, nome, tamanho, criado_em")
          .single(),
      );
      if (error) return falha(error.message);
      return NextResponse.json({ arquivo: data });
    }

    default:
      return ruim("Ação inválida.");
  }
}

export async function DELETE(request: NextRequest) {
  const email = await dono();
  if (!email) return negado();
  const admin = criarClienteSupabaseAdmin();
  const arquivo = request.nextUrl.searchParams.get("arquivo");
  const pasta = request.nextUrl.searchParams.get("pasta");

  if (arquivo) {
    const { data: arq, error } = await comRetentativa(() =>
      admin.from("documentos_arquivos").select("objeto").eq("id", arquivo).eq("dono", email).maybeSingle(),
    );
    if (error) return falha(error.message);
    if (!arq) return NextResponse.json({ ok: true });
    const { error: erroStorage } = await admin.storage.from(BUCKET_DOCUMENTOS).remove([arq.objeto]);
    if (erroStorage) return falha(erroStorage.message);
    const { error: erroDel } = await comRetentativa(() =>
      admin.from("documentos_arquivos").delete().eq("id", arquivo).eq("dono", email),
    );
    if (erroDel) return falha(erroDel.message);
    return NextResponse.json({ ok: true });
  }

  if (pasta) {
    if (!(await pastaDoDono(admin, pasta, email))) return NextResponse.json({ ok: true });
    const { data: arqs, error } = await comRetentativa(() =>
      admin.from("documentos_arquivos").select("objeto").eq("pasta_id", pasta),
    );
    if (error) return falha(error.message);
    const objetos = (arqs ?? []).map((a) => a.objeto);
    for (let i = 0; i < objetos.length; i += 100) {
      const { error: erroStorage } = await admin.storage.from(BUCKET_DOCUMENTOS).remove(objetos.slice(i, i + 100));
      if (erroStorage) return falha(erroStorage.message);
    }
    const { error: erroDel } = await comRetentativa(() =>
      admin.from("documentos_pastas").delete().eq("id", pasta).eq("dono", email),
    );
    if (erroDel) return falha(erroDel.message);
    return NextResponse.json({ ok: true });
  }

  return ruim("Informe o documento ou a pasta.");
}
