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
export const ROTA_FOLLOW_UP = "/follow-up";

// Conta presa à rota /follow-up (Follow up ou Projeto).
export function acessoSoFollowUp(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  const acesso = user?.app_metadata?.acesso;
  return acesso === ACESSO_SO_FOLLOW_UP || acesso === ACESSO_PROJETO;
}

export function acessoProjeto(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.acesso === ACESSO_PROJETO;
}
