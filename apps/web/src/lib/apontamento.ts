// Configuração da tela de apontamento por setor (components/ApontamentoSetor.tsx).
// Pra criar outro setor (Solda, Montagem...): uma entrada aqui + uma em
// SETORES de services/calc_engine/app/apontamentos_setor.py.
import type { StatusApontamento } from "@/lib/api";

// "Fazendo agora" (o operador está nele) — a Pintura tem etapas (fundo, acabamento).
export const ATIVOS = new Set<StatusApontamento>(["em_andamento", "fundo", "acabamento"]);
export function emAndamento(s: StatusApontamento | undefined): boolean {
  return !!s && ATIVOS.has(s);
}

export interface OpcaoApontamento {
  status: StatusApontamento;
  rotulo: string;
  icone: string;
  // Botão escolhido / não escolhido / selo na lista (mesmas cores do Corte).
  ligado: string;
  desligado: string;
  selo: string;
}

export interface ConfigSetor {
  setor: string;
  nome: string;
  opcoes: OpcaoApontamento[];
  // Toque rápido no campo de observação (pedido do usuário: exemplos do dia a dia).
  sugestoes: string[];
  // Textos da tela: "Cesar está usinando…", "nada usinando" e o que é serviço interno.
  fazendo: string;
  servicoInterno: string;
  // Pintura: plano de pintura e cores bem visíveis nos cartões e no apontamento.
  comPintura?: boolean;
  // false = marcar "fazendo" NÃO pausa o que o operador já estava fazendo
  // (Pintura: vários pedidos ao mesmo tempo). Igual a SETORES no backend.
  pausaAutomatica?: boolean;
  // ✏️/🗑️ em cada apontamento do histórico, pra corrigir o que foi apontado errado.
  corrigir?: boolean;
}

export const CONFIG_USINAGEM: ConfigSetor = {
  setor: "usinagem",
  nome: "Usinagem",
  opcoes: [
    {
      status: "em_andamento",
      rotulo: "USINANDO",
      icone: "▶",
      ligado: "bg-amber-400 text-stone-900 border-amber-500",
      desligado: "border-amber-400 text-amber-700 dark:text-amber-300",
      selo: "bg-amber-400 text-stone-900",
    },
    {
      // Pedido do usuário: o operador parou esse pra começar outra coisa.
      status: "pausado",
      rotulo: "PAUSADO",
      icone: "⏸",
      ligado: "bg-sky-600 text-white border-sky-700",
      desligado: "border-sky-500 text-sky-700 dark:text-sky-300",
      selo: "bg-sky-600 text-white",
    },
    {
      status: "finalizado",
      rotulo: "FIM DE USINAGEM",
      icone: "✔",
      ligado: "bg-green-600 text-white border-green-700",
      desligado: "border-green-600 text-green-700 dark:text-green-400",
      selo: "bg-green-600 text-white",
    },
    {
      status: "falta_material",
      rotulo: "FALTA MATERIAL",
      icone: "⚠",
      ligado: "bg-red-600 text-white border-red-700",
      desligado: "border-red-500 text-red-600 dark:text-red-400",
      selo: "bg-red-600 text-white",
    },
  ],
  sugestoes: [
    "Aguardando ferramenta",
    "Máquina parada",
    "Material chegou parcialmente",
    "Problema no desenho",
    "Aguardando liberação da Engenharia",
    "Previsão de término amanhã",
  ],
  fazendo: "usinando",
  servicoInterno: "Usinagem pra uso da Macfab: manutenção, ferramental, dispositivos…",
};

// Pintura — pedido do usuário (13/10/2026): o felipe aponta pelo celular as
// etapas da pintura, com o plano de pintura e as cores à vista.
export const CONFIG_PINTURA: ConfigSetor = {
  setor: "pintura",
  nome: "Pintura",
  // Pedido do usuário (13/10/2026): só Iniciado, Pausado e Pintura finalizada.
  opcoes: [
    {
      status: "em_andamento",
      rotulo: "INICIADO",
      icone: "▶",
      ligado: "bg-amber-400 text-stone-900 border-amber-500",
      desligado: "border-amber-400 text-amber-700 dark:text-amber-300",
      selo: "bg-amber-400 text-stone-900",
    },
    {
      status: "pausado",
      rotulo: "PAUSADO",
      icone: "⏸",
      ligado: "bg-sky-600 text-white border-sky-700",
      desligado: "border-sky-500 text-sky-700 dark:text-sky-300",
      selo: "bg-sky-600 text-white",
    },
    {
      status: "finalizado",
      rotulo: "PINTURA FINALIZADA",
      icone: "✔",
      ligado: "bg-green-600 text-white border-green-700",
      desligado: "border-green-600 text-green-700 dark:text-green-400",
      selo: "bg-green-600 text-white",
    },
  ],
  sugestoes: [
    "Aguardando jato",
    "Aguardando secagem",
    "Falta tinta",
    "Retoque",
    "Aguardando inspeção de espessura",
    "Previsão de término amanhã",
  ],
  fazendo: "pintando",
  servicoInterno: "Pintura pra uso da Macfab: manutenção, dispositivos, suportes…",
  comPintura: true,
  // Pedido do usuário (15/10/2026): o Felipe pinta vários pedidos juntos — o
  // Iniciado num pedido estava pausando os outros; e dá pra corrigir o status.
  pausaAutomatica: false,
  corrigir: true,
};

// Caldeiraria — pedido do usuário (13/10/2026): jeferson e diego apontam a
// fabricação pelo celular: Início de fabricação, Pausa, Falta material e
// Fabricação finalizada (cada apontamento vira Registro diário do pedido).
export const CONFIG_CALDEIRARIA: ConfigSetor = {
  setor: "caldeiraria",
  nome: "Caldeiraria",
  opcoes: [
    {
      status: "em_andamento",
      rotulo: "INÍCIO DE FABRICAÇÃO",
      icone: "▶",
      ligado: "bg-amber-400 text-stone-900 border-amber-500",
      desligado: "border-amber-400 text-amber-700 dark:text-amber-300",
      selo: "bg-amber-400 text-stone-900",
    },
    {
      status: "pausado",
      rotulo: "PAUSA",
      icone: "⏸",
      ligado: "bg-sky-600 text-white border-sky-700",
      desligado: "border-sky-500 text-sky-700 dark:text-sky-300",
      selo: "bg-sky-600 text-white",
    },
    {
      status: "falta_material",
      rotulo: "FALTA MATERIAL",
      icone: "⚠",
      ligado: "bg-red-600 text-white border-red-700",
      desligado: "border-red-500 text-red-600 dark:text-red-400",
      selo: "bg-red-600 text-white",
    },
    {
      status: "finalizado",
      rotulo: "FABRICAÇÃO FINALIZADA",
      icone: "✔",
      ligado: "bg-green-600 text-white border-green-700",
      desligado: "border-green-600 text-green-700 dark:text-green-400",
      selo: "bg-green-600 text-white",
    },
  ],
  sugestoes: [
    "Aguardando corte",
    "Aguardando material",
    "Montagem concluída, falta solda",
    "Problema no desenho",
    "Aguardando liberação da Engenharia",
    "Previsão de término amanhã",
  ],
  fazendo: "fabricando",
  servicoInterno: "Fabricação pra uso da Macfab: manutenção, dispositivos, suportes…",
};
