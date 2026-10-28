// Acesso restrito por módulo — pedido explícito do usuário: a conta
// "marcelo" só abre o módulo Follow up. A marca fica em
// `app_metadata.acesso` do usuário no Supabase Auth: esse campo só pode ser
// gravado com a service_role (servidor), então o próprio usuário não
// consegue se "promover". Contas sem essa marca têm acesso total.
import type { User } from "@supabase/supabase-js";
import type { PerfilModulo } from "@/lib/abasFollowUp";
import { EMAIL_FINANCEIRO } from "@/lib/financeiro";

export const ACESSO_SO_FOLLOW_UP = "follow_up";
// Projetistas (joao, honorio) — pedido explícito do usuário: dentro do
// módulo Follow up, só as abas Material de compra e Croqui de corte.
export const ACESSO_PROJETO = "projeto";
// Operador do corte a laser — pedido explícito do usuário: só a aba Corte.
export const ACESSO_CORTE = "corte";
// Líder da Usinagem (saymon) — pedido explícito do usuário: só a aba Usinagem
// (apontamento por pedido do Follow up, ver components/ApontamentoSetor.tsx).
export const ACESSO_USINAGEM = "usinagem";
// Qualidade (ana, carol, pedro, lailto) — pedido explícito do usuário: só a aba
// QUALIDADE (certificados de matéria-prima pra data book).
export const ACESSO_QUALIDADE = "qualidade";
// Consulta (jeferson, diego) — pedido explícito do usuário: só a aba Consulta,
// pelo celular: o que está sendo cortado e a sequência, pesquisar pedido
// ativo (MAC/PO/desenho) e abrir os relatórios de coleta (só olha). Depois
// (pedido do usuário): também a aba Caldeiraria, onde apontam a fabricação.
export const ACESSO_CONSULTA = "consulta";
// Pintura (felipe) — pedido do usuário (13/10/2026): igual ao jeferson/diego,
// mas aponta a Pintura (fundo, acabamento, finalização…) em vez da Caldeiraria.
export const ACESSO_PINTURA = "pintura";
// Financeiro (gabriele) — pedido do usuário (15/10/2026): SÓ o painel
// /financeiro (sem Budget), pelo celular. Não é "só Follow up": o proxy prende
// essa conta em /financeiro (ver perfilFinanceiro em lib/financeiro.ts).
export const ACESSO_FINANCEIRO = "financeiro";
// Almoxarifado (leandro) — pedido do usuário (28/10/2026): aba Almoxarifado
// (digita a MAC/pedido, vê a lista do Compras, confere o que chegou e tira foto)
// + a Consulta dos pedidos, pelo celular.
export const ACESSO_ALMOXARIFADO = "almoxarifado";
export const ROTA_FOLLOW_UP = "/follow-up";
// Visão Geral — pedido explícito do usuário: só ele (e-mail em ADMIN_EMAILS,
// conferido no proxy) e o marcelo (acesso "follow_up") abrem.
export const ROTA_VISAO_GERAL = "/visao-geral";

// Conta presa à rota /follow-up (Follow up ou Projeto).
export function acessoSoFollowUp(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  const acesso = user?.app_metadata?.acesso;
  return (
    acesso === ACESSO_SO_FOLLOW_UP ||
    acesso === ACESSO_PROJETO ||
    acesso === ACESSO_CORTE ||
    acesso === ACESSO_USINAGEM ||
    acesso === ACESSO_QUALIDADE ||
    acesso === ACESSO_CONSULTA ||
    acesso === ACESSO_PINTURA ||
    acesso === ACESSO_ALMOXARIFADO
  );
}

// Perfil dentro do módulo Follow up (quais abas aparecem).
export function perfilModulo(
  user: Pick<User, "app_metadata"> | null | undefined,
): PerfilModulo {
  const acesso = user?.app_metadata?.acesso;
  if (acesso === ACESSO_ALMOXARIFADO) return "almoxarifado";
  if (acesso === ACESSO_PINTURA) return "pintura";
  if (acesso === ACESSO_CONSULTA) return "consulta";
  if (acesso === ACESSO_QUALIDADE) return "qualidade";
  if (acesso === ACESSO_USINAGEM) return "usinagem";
  if (acesso === ACESSO_CORTE) return "corte";
  if (acesso === ACESSO_PROJETO) return "projeto";
  if (acesso === ACESSO_SO_FOLLOW_UP) return "follow_up";
  return "total";
}

// Aba QUALIDADE e os dados dela (/api/qualidade/*): a conta flpmac14, o
// perfil "qualidade" e o marcelo (PCP, só consulta — pedido do usuário,
// 19/10/2026). Conferido no servidor (rotas e proxy.ts).
export function podeVerQualidade(user: Pick<User, "app_metadata" | "email"> | null | undefined): boolean {
  const acesso = user?.app_metadata?.acesso;
  return (user?.email ?? "").trim().toLowerCase() === EMAIL_FINANCEIRO || acesso === ACESSO_QUALIDADE || acesso === ACESSO_SO_FOLLOW_UP;
}

// Painel /registro (apontamentos por área): a conta flpmac14 e o marcelo
// (PCP, só consulta — pedido do usuário, 19/10/2026). Liberado no proxy.ts.
export const ROTA_REGISTRO = "/registro";
export function podeVerRegistro(user: Pick<User, "app_metadata" | "email"> | null | undefined): boolean {
  return (user?.email ?? "").trim().toLowerCase() === EMAIL_FINANCEIRO || user?.app_metadata?.acesso === ACESSO_SO_FOLLOW_UP;
}

export function acessoProjeto(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  return user?.app_metadata?.acesso === ACESSO_PROJETO;
}

// Aba Funcionários / Solicitação de hora extra — pedido do usuário (26/10/2026):
// só ele (flpmac14), o Jeferson e o Diego (perfil "consulta"). Conferido também
// na rota /api/follow-up/hora-extra.
export function podeSolicitarHoraExtra(user: Pick<User, "app_metadata" | "email"> | null | undefined): boolean {
  return (user?.email ?? "").trim().toLowerCase() === EMAIL_FINANCEIRO || user?.app_metadata?.acesso === ACESSO_CONSULTA;
}

// Aba Almoxarifado e /api/follow-up/almoxarifado: o flpmac14 e o perfil
// "almoxarifado" (leandro) — pedido do usuário (28/10/2026).
export function podeVerAlmoxarifado(user: Pick<User, "app_metadata" | "email"> | null | undefined): boolean {
  return (user?.email ?? "").trim().toLowerCase() === EMAIL_FINANCEIRO || user?.app_metadata?.acesso === ACESSO_ALMOXARIFADO;
}
