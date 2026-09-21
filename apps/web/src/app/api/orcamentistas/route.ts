import { NextResponse } from "next/server";
import { ehEmailAdmin } from "@/lib/admin";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Cadastro de orçamentista — pedido explícito do usuário: só o admin
// (ver ADMIN_EMAILS) cria a conta, com e-mail + senha; ninguém se
// cadastra sozinho (não existe tela de "criar conta" pública, só /login).
// Usa a Admin API do Supabase (service_role) com email_confirm=true, pra
// o orçamentista já conseguir entrar direto, sem precisar confirmar
// e-mail.

async function exigirAdmin() {
  const supabase = await criarClienteSupabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!ehEmailAdmin(user?.email)) {
    return NextResponse.json({ erro: "Acesso restrito ao administrador." }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const negado = await exigirAdmin();
  if (negado) return negado;

  const admin = criarClienteSupabaseAdmin();
  const { data, error } = await admin.auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  const usuarios = data.users
    .map((u) => ({
      id: u.id,
      email: u.email,
      criado_em: u.created_at,
      ultimo_login_em: u.last_sign_in_at,
    }))
    .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1));

  return NextResponse.json({ usuarios });
}

export async function POST(request: Request) {
  const negado = await exigirAdmin();
  if (negado) return negado;

  const corpo = await request.json().catch(() => null);
  const email = typeof corpo?.email === "string" ? corpo.email.trim() : "";
  const senha = typeof corpo?.senha === "string" ? corpo.senha : "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ erro: "Informe um e-mail válido." }, { status: 400 });
  }
  if (senha.length < 6) {
    return NextResponse.json({ erro: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
  }

  const admin = criarClienteSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.user.id, email: data.user.email });
}
