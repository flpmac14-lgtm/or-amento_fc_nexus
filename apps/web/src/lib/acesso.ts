// Acesso restrito por módulo — pedido explícito do usuário: a conta
// "marcelo" só abre o módulo Follow up. A marca fica em
// `app_metadata.acesso` do usuário no Supabase Auth: esse campo só pode ser
// gravado com a service_role (servidor), então o próprio usuário não
// consegue se "promover". Contas sem essa marca têm acesso total.
import type { User } from "@supabase/supabase-js";

export const ACESSO_SO_FOLLOW_UP = "follow_up";
export const ROTA_FOLLOW_UP = "/follow-up";

export function acessoSoFollowUp(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.acesso === ACESSO_SO_FOLLOW_UP;
}
