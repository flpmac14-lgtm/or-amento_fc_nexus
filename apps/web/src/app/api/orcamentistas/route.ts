import { NextResponse } from "next/server";
import { ehEmailAdmin } from "@/lib/admin";
import { emailParaLogin, loginParaEmail } from "@/lib/loginInterno";
import { criarClienteSupabaseAdmin } from "@/lib/supabase/admin";
import { criarClienteSupabaseServidor } from "@/lib/supabase/server";

// Cadastro de orçamentista — pedido explícito do usuário: só o admin
// (ver ADMIN_EMAILS) cria a conta, com login + senha; ninguém se
// cadastra sozinho (não existe tela de "criar conta" pública, só /login).
// Usa a Admin API do Supabase (service_role) com email_confirm=true, pra
// o orçamentista já conseguir entrar direto, sem precisar confirmar
// e-mail. Supabase Auth exige um e-mail por baixo — "login" vira um
// e-mail interno fixo (ver lib/loginInterno.ts), nunca aparece na tela.

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
      login: u.email ? emailParaLogin(u.email) : null,
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
  const login = typeof corpo?.login === "string" ? corpo.login.trim() : "";
  const senha = typeof corpo?.senha === "string" ? corpo.senha : "";

  if (!login || /\s/.test(login)) {
    return NextResponse.json({ erro: "Informe um login (sem espaços)." }, { status: 400 });
  }
  if (senha.length < 6) {
    return NextResponse.json({ erro: "A senha precisa ter pelo menos 6 caracteres." }, { status: 400 });
  }

  const admin = criarClienteSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: loginParaEmail(login),
    password: senha,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.user.id, login: data.user.email ? emailParaLogin(data.user.email) : login });
}
