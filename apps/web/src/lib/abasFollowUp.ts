// Abas de dentro do Follow up / Produção (components/ModuloFollowUp.tsx).
// Ficam aqui (arquivo leve) porque o menu lateral (components/AppShell.tsx)
// também lista essas abas — pedido do usuário: clicar no menu e ir direto.
// A aba aberta fica no endereço: /follow-up?aba=corte.

export const VISOES = [
  { valor: "followup", rotulo: "Follow up" },
  { valor: "controle", rotulo: "Controle de obras" },
  // Espelho da aba MACLM do MACLM.xlsx — pedido do usuário (mãe de um projeto novo).
  { valor: "material", rotulo: "Material de compra" },
  // Filha do Material de compra (aba Croqui 2 do Croqui de corte) — pedido do usuário.
  { valor: "croqui", rotulo: "Croqui de corte" },
  // Operador do laser marca Cortando / Finalizado / Falta material por programa.
  { valor: "corte", rotulo: "Corte" },
  // Líder da Usinagem aponta por pedido do Follow up (pedido do usuário).
  { valor: "usinagem", rotulo: "Usinagem" },
  // Certificados de matéria-prima do Recebimento — pedido do usuário (09/10/2026).
  { valor: "qualidade", rotulo: "QUALIDADE" },
  { valor: "referencia", rotulo: "Referência de preços" },
] as const;

export type ValorVisao = (typeof VISOES)[number]["valor"];

// perfil (ver lib/acesso.ts): "projeto" (joao, honorio) = Material de compra,
// Croqui de corte e Corte; "corte" (operador do laser) = só Corte;
// "usinagem" (líder da Usinagem, saymon) = só Usinagem;
// "qualidade" (ana, carol, pedro, lailto) = só QUALIDADE.
export type PerfilModulo = "total" | "follow_up" | "projeto" | "corte" | "usinagem" | "qualidade";

// comReferenciaPrecos: pedido do usuário — a conta restrita (marcelo) também vê
// a aba "Referência de preços" (histórico de compras do ERP), que as contas
// completas já têm na tela principal.
// comQualidade: aba QUALIDADE — a conta flpmac14 e o perfil "qualidade"
// (lib/acesso.ts::podeVerQualidade); o perfil "qualidade" só vê ela.
export function visoesDoPerfil(perfil: PerfilModulo, comReferenciaPrecos: boolean, comQualidade = false) {
  return VISOES.filter((v) =>
    v.valor === "qualidade"
      ? comQualidade || perfil === "qualidade"
      : perfil === "qualidade"
        ? false
        : perfil === "corte"
        ? v.valor === "corte"
        : perfil === "usinagem"
          ? v.valor === "usinagem"
          : perfil === "projeto"
            ? v.valor === "material" || v.valor === "croqui" || v.valor === "corte"
            : v.valor === "usinagem"
              ? perfil === "total"
              : v.valor !== "referencia" || comReferenciaPrecos,
  );
}

export const ROTA_FOLLOW_UP = "/follow-up";
// Evento entre o menu lateral e o módulo (mesma página, sem recarregar).
export const EVENTO_IR_PARA_ABA = "fcnexus-ir-para-aba"; // menu → módulo
export const EVENTO_ABA_MUDOU = "fcnexus-aba-mudou"; // módulo → menu

export function hrefAba(valor: ValorVisao): string {
  return `${ROTA_FOLLOW_UP}?aba=${valor}`;
}

/** Aba pedida no endereço (?aba=...), se for uma aba que existe. */
export function abaDoEndereco(): ValorVisao | null {
  if (typeof window === "undefined") return null;
  const a = new URLSearchParams(window.location.search).get("aba");
  return VISOES.some((v) => v.valor === a) ? (a as ValorVisao) : null;
}
