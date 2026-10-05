// Acesso restrito por módulo — pedido explícito do usuário: a conta
// "marcelo" só abre o módulo Follow up. A marca fica em
// `app_metadata.acesso` do usuário no Supabase Auth: esse campo só pode ser
// gravado com a service_role (servidor), então o próprio usuário não
// consegue se "promover". Contas sem essa marca têm acesso total.
import type { User } from "@supabase/supabase-js";

export const ACESSO_SO_FOLLOW_UP = "follow_up";
// Projetistas (joao, honorio) — pedido explícito do usuário: dentro do
// módulo Follow up, só as abas Material de compra e Croqui de corte.
export const ACESSO_PROJETO = "projeto";
// Operador do corte a laser — pedido explícito do usuário: só a aba Corte.
export const ACESSO_CORTE = "corte";
// Líder da Usinagem (saymon) — pedido explícito do usuário: só a aba Usinagem
// (apontamento por pedido do Follow up, ver components/ApontamentoSetor.tsx).
export const ACESSO_USINAGEM = "usinagem";
export const ROTA_FOLLOW_UP = "/follow-up";
// Visão Geral — pedido explícito do usuário: só ele (e-mail em ADMIN_EMAILS,
// conferido no proxy) e o marcelo (acesso "follow_up") abrem.
export const ROTA_VISAO_GERAL = "/visao-geral";

// Conta presa à rota /follow-up (Follow up ou Projeto).
export function acessoSoFollowUp(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  const acesso = user?.app_metadata?.acesso;
  return acesso === ACESSO_SO_FOLLOW_UP || acesso === ACESSO_PROJETO || acesso === ACESSO_CORTE || acesso === ACESSO_USINAGEM;
}

// Perfil dentro do módulo Follow up (quais abas aparecem).
export function perfilModulo(
  user: Pick<User, "app_metadata"> | null | undefined,
): "total" | "follow_up" | "projeto" | "corte" | "usinagem" {
  const acesso = user?.app_metadata?.acesso;
  if (acesso === ACESSO_USINAGEM) return "usinagem";
  if (acesso === ACESSO_CORTE) return "corte";
  if (acesso === ACESSO_PROJETO) return "projeto";
  if (acesso === ACESSO_SO_FOLLOW_UP) return "follow_up";
  return "total";
}

export function acessoProjeto(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.acesso === ACESSO_PROJETO;
}
