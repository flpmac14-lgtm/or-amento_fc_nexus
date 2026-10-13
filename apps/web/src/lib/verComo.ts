// "Ver como usuário" — pedido explícito do usuário (13/10/2026): o admin
// (flpmac14) escolhe uma conta e o app passa a mostrar as abas e telas que
// ela vê, sem entrar na conta dela (sem senha, sem deslogar ninguém).
// É só a tela: os dados são os mesmos e o que for salvo continua no nome do
// admin. Vale só pra conta flpmac14 — pra qualquer outra a marca é ignorada.
import type { User } from "@supabase/supabase-js";
import { podeVerFinanceiro } from "@/lib/financeiro";
import { loginParaEmail } from "@/lib/loginInterno";

export interface VerComo {
  login: string;
  acesso: string | null; // app_metadata.acesso da conta (null = acesso total)
}

const CHAVE = "fcnexus.verComo";
export const EVENTO_VER_COMO = "fcnexus-ver-como";

export function lerVerComo(): VerComo | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
    return v && typeof v.login === "string" ? v : null;
  } catch {
    return null;
  }
}

export function gravarVerComo(v: VerComo | null): void {
  try {
    if (v) localStorage.setItem(CHAVE, JSON.stringify(v));
    else localStorage.removeItem(CHAVE);
  } catch {
    // sem armazenamento: o modo só não fica lembrado
  }
  window.dispatchEvent(new CustomEvent(EVENTO_VER_COMO));
}

/** O usuário "como a tela deve tratar": a conta escolhida, se o admin estiver vendo como alguém. */
export function usuarioEfetivo<T extends Pick<User, "email" | "app_metadata">>(user: T): T {
  if (!podeVerFinanceiro(user.email)) return user;
  const v = lerVerComo();
  if (!v) return user;
  return {
    ...user,
    email: loginParaEmail(v.login),
    app_metadata: { ...user.app_metadata, acesso: v.acesso ?? undefined },
  };
}
