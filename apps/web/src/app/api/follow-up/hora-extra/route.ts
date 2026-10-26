import { NextResponse, type NextRequest } from "next/server";
import { podeSolicitarHoraExtra } from "@/lib/acesso";
import { EMAIL_FINANCEIRO } from "@/lib/financeiro";
import { diaValido, nomeSolicitante, type DiaHoraExtra } from "@/lib/horaExtra";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Aba Funcionários / Solicitação de hora extra — pedido do usuário (26/10/2026).
// Tabelas funcionarios e horas_extras (migration 0059, RLS sem policy): só esta
// rota lê e grava, e só pro flpmac14, o Jeferson e o Diego.
// GET: nomes + solicitações (ou uma só com ?n=); POST: nova; DELETE ?n=: apaga
// (quem pediu ou o flpmac14).

async function usuario() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return podeSolicitarHoraExtra(user) ? user : null;
}

const CAMPOS = "numero, criado_em, criado_por, solicitante, funcionarios, dias, motivo";

export async function GET(request: NextRequest) {
  if (!(await usuario())) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
  const admin = criarClienteSupabaseAdmin();
  const n = Number(request.nextUrl.searchParams.get("n"));
  if (n) {
    const { data, error } = await comRetentativa(() => admin.from("horas_extras").select(CAMPOS).eq("numero", n).maybeSingle());
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ erro: `Solicitação nº ${n} não encontrada.` }, { status: 404 });
    return NextResponse.json({ solicitacao: data }, { headers: { "Cache-Control": "no-store" } });
  }
  const [nomes, lista] = await Promise.all([
    comRetentativa(() => admin.from("funcionarios").select("nome").eq("ativo", true).order("nome")),
    comRetentativa(() => admin.from("horas_extras").select(CAMPOS).order("numero", { ascending: false }).limit(100)),
  ]);
  const erro = nomes.error ?? lista.error;
  if (erro) return NextResponse.json({ erro: erro.message }, { status: 500 });
  return NextResponse.json(
    { funcionarios: (nomes.data ?? []).map((f) => f.nome as string), solicitacoes: lista.data ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const user = await usuario();
  if (!user) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
  const corpo = (await request.json().catch(() => null)) as { funcionarios?: unknown; dias?: unknown; motivo?: unknown } | null;
  const escolhidos = Array.isArray(corpo?.funcionarios) ? [...new Set(corpo.funcionarios.filter((x): x is string => typeof x === "string"))] : [];
  const dias = Array.isArray(corpo?.dias) ? (corpo.dias as Partial<DiaHoraExtra>[]) : [];
  if (!escolhidos.length) return NextResponse.json({ erro: "Escolha pelo menos um funcionário." }, { status: 400 });
  if (!dias.length || !dias.every(diaValido)) {
    return NextResponse.json({ erro: "Confira os dias: cada um precisa de data, hora de início e hora de fim (diferentes)." }, { status: 400 });
  }

  const admin = criarClienteSupabaseAdmin();
  // Só nomes da lista (a planilha do acordo).
  const { data: validos, error: e1 } = await comRetentativa(() => admin.from("funcionarios").select("nome").in("nome", escolhidos));
  if (e1) return NextResponse.json({ erro: e1.message }, { status: 500 });
  const conhecidos = new Set((validos ?? []).map((f) => f.nome as string));
  const fora = escolhidos.filter((x) => !conhecidos.has(x));
  if (fora.length) return NextResponse.json({ erro: `Fora da lista de funcionários: ${fora.join(", ")}` }, { status: 400 });

  const ordenados = [...dias].sort((a, b) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio));
  const { data, error } = await comRetentativa(() =>
    admin
      .from("horas_extras")
      .insert({
        criado_por: user.email ?? "",
        solicitante: nomeSolicitante(emailParaLogin(user.email ?? "")),
        funcionarios: escolhidos.sort((a, b) => a.localeCompare(b, "pt-BR")),
        dias: ordenados.map(({ data, inicio, fim }) => ({ data, inicio, fim })),
        motivo: typeof corpo?.motivo === "string" && corpo.motivo.trim() ? corpo.motivo.trim().slice(0, 500) : null,
      })
      .select("numero")
      .single(),
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ numero: data.numero });
}

export async function DELETE(request: NextRequest) {
  const user = await usuario();
  if (!user) return NextResponse.json({ erro: "Acesso restrito." }, { status: 403 });
  const n = Number(request.nextUrl.searchParams.get("n"));
  if (!n) return NextResponse.json({ erro: "Informe o número." }, { status: 400 });
  const admin = criarClienteSupabaseAdmin();
  let consulta = admin.from("horas_extras").delete().eq("numero", n);
  if ((user.email ?? "").toLowerCase() !== EMAIL_FINANCEIRO) consulta = consulta.eq("criado_por", user.email ?? "");
  const { data, error } = await comRetentativa(() => consulta.select("numero"));
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ erro: "Só quem pediu (ou o Felipe) pode excluir." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
