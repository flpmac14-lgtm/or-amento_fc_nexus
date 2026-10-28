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
  // Mesma tela, pasta "BACKUP RECEBIMENTO 20260828" — pedido do usuário; mesmo acesso da QUALIDADE.
  { valor: "backup", rotulo: "Backup Recebimento" },
  // Aba "Geral Data book" do Controle de databook.xlsm, filha da Controle de obras — pedido do usuário (13/10/2026).
  { valor: "databook", rotulo: "Data book" },
  // Aba GERAL do CONTROLE DE RECEBIMENTO E ESTOQUE, só consulta — pedido do usuário (13/10/2026).
  { valor: "recebimento", rotulo: "Recebimento" },
  { valor: "referencia", rotulo: "Referência de preços" },
  // Só olhar, pelo celular (jeferson, diego) — pedido do usuário (13/10/2026).
  { valor: "consulta", rotulo: "Consulta" },
  // Jeferson e Diego apontam a fabricação (mesma tela da Usinagem) — pedido do usuário (13/10/2026).
  { valor: "caldeiraria", rotulo: "Caldeiraria" },
  // Felipe aponta as etapas da pintura (mesma tela da Caldeiraria) — pedido do usuário (13/10/2026).
  { valor: "pintura", rotulo: "Pintura" },
  // Só a tela Coletas da Consulta — pedido do usuário (13/10/2026) pra Qualidade (ana, pedro, carol, lailto).
  { valor: "coletas", rotulo: "Coletas" },
  // Programas já cortados com o NRI anotado no Corte, pro data book — pedido do usuário (14/10/2026).
  { valor: "cortados", rotulo: "Cortados (NRI)" },
  // Funcionários + Solicitação de hora extra (PDF) — pedido do usuário (26/10/2026):
  // só o flpmac14, o Jeferson e o Diego (lib/acesso.ts::podeSolicitarHoraExtra).
  { valor: "funcionarios", rotulo: "Funcionários" },
  // Conferência do que chegou por MAC/pedido (lista do Compras + Sectra + fotos) —
  // pedido do usuário (28/10/2026): o leandro (perfil almoxarifado) e o flpmac14.
  { valor: "almoxarifado", rotulo: "Almoxarifado" },
] as const;

export type ValorVisao = (typeof VISOES)[number]["valor"];

// perfil (ver lib/acesso.ts): "projeto" (joao, honorio) = Material de compra,
// Croqui de corte e Corte; "corte" (operador do laser) = só Corte;
// "usinagem" (líder da Usinagem, saymon) = Usinagem + Consulta (coletas e previsões);
// "qualidade" (ana, carol, pedro, lailto) = QUALIDADE + Data book + Coletas + Cortados (NRI) + Pintura (só consulta);
// "consulta" (jeferson, diego) = Consulta + Caldeiraria (apontam a fabricação);
// total e follow_up também veem a Consulta; a Caldeiraria, só o total.
// "pintura" (felipe) = Consulta + Pintura.
// "follow_up" (marcelo, PCP) — pedido do usuário (19/10/2026): tudo pra consulta
// (Usinagem, Caldeiraria, Pintura, Data book, Recebimento, Cortados, QUALIDADE),
// sem apontar (ver somenteLeitura em components/ModuloFollowUp.tsx); Financeiro não.
// "almoxarifado" (leandro) = Almoxarifado + Consulta (pedidos).
export type PerfilModulo = "total" | "follow_up" | "projeto" | "corte" | "usinagem" | "qualidade" | "consulta" | "pintura" | "almoxarifado";

// comReferenciaPrecos: pedido do usuário — a conta restrita (marcelo) também vê
// a aba "Referência de preços" (histórico de compras do ERP), que as contas
// completas já têm na tela principal.
// comQualidade: aba QUALIDADE — a conta flpmac14 e o perfil "qualidade"
// (lib/acesso.ts::podeVerQualidade); o perfil "qualidade" só vê ela.
export function visoesDoPerfil(perfil: PerfilModulo, comReferenciaPrecos: boolean, comQualidade = false, comHoraExtra = false) {
  const lista = visoesSemHoraExtra(perfil, comReferenciaPrecos, comQualidade);
  return comHoraExtra ? lista : lista.filter((v) => v.valor !== "funcionarios");
}

function visoesSemHoraExtra(perfil: PerfilModulo, comReferenciaPrecos: boolean, comQualidade: boolean) {
  if (perfil === "almoxarifado") return VISOES.filter((v) => v.valor === "almoxarifado" || v.valor === "consulta");
  if (perfil === "consulta") return VISOES.filter((v) => v.valor === "consulta" || v.valor === "caldeiraria" || v.valor === "funcionarios");
  if (perfil === "pintura") return VISOES.filter((v) => v.valor === "consulta" || v.valor === "pintura");
  return VISOES.filter((v) =>
    v.valor === "almoxarifado"
      ? perfil === "total" && comQualidade // total + QUALIDADE = só o flpmac14
      : v.valor === "coletas"
      ? perfil === "qualidade"
      : v.valor === "databook" || v.valor === "recebimento" || v.valor === "cortados"
        ? perfil === "qualidade" || perfil === "total" || perfil === "follow_up"
      : v.valor === "qualidade" || v.valor === "backup"
      ? comQualidade || perfil === "qualidade"
      : perfil === "qualidade"
        ? v.valor === "pintura" // só consulta: conferir status, histórico e lotes (pedido do usuário, 15/10/2026)
        : perfil === "corte"
        ? v.valor === "corte"
        : perfil === "usinagem"
          ? v.valor === "usinagem" || v.valor === "consulta" // saymon vê as coletas/previsões (pedido do usuário)
          : perfil === "projeto"
            ? v.valor === "material" || v.valor === "croqui" || v.valor === "corte"
            : v.valor === "usinagem" || v.valor === "caldeiraria" || v.valor === "pintura"
              ? perfil === "total" || perfil === "follow_up"
              : v.valor === "consulta"
                ? perfil === "total" || perfil === "follow_up"
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
