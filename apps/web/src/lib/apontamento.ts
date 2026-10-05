// Configuração da tela de apontamento por setor (components/ApontamentoSetor.tsx).
// Pra criar outro setor (Solda, Montagem...): uma entrada aqui + uma em
// SETORES de services/calc_engine/app/apontamentos_setor.py.
import type { StatusApontamento } from "@/lib/api";

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
};
