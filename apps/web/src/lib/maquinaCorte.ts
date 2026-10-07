// Máquinas do Corte — pedido do usuário: programa com 4 algarismos ou mais
// (1416, 1417…) é do Laser; com até 3 (321, 322…) é do Oxicorte. O operador
// pode trocar (às vezes um corta o do outro) — app/corte.py::trocar_maquina.
import type { MaquinaCorte } from "@/lib/types";

export function maquinaPadrao(programa: string): MaquinaCorte {
  return programa.length >= 4 ? "laser" : "oxicorte";
}

export const MAQUINAS: {
  maquina: MaquinaCorte;
  rotulo: string;
  icone: string;
  regra: string;
  borda: string;
  titulo: string;
  barra: string; // barrinhas da Visão Geral
  etiqueta: string;
}[] = [
  {
    maquina: "laser",
    rotulo: "Laser",
    icone: "⚡",
    regra: "programa com 4 algarismos",
    borda: "border-sky-400 dark:border-sky-700",
    titulo: "text-sky-700 dark:text-sky-300",
    barra: "bg-sky-500 dark:bg-sky-400",
    etiqueta: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  },
  {
    maquina: "oxicorte",
    rotulo: "Oxicorte",
    icone: "🔥",
    regra: "programa com 3 algarismos",
    borda: "border-orange-400 dark:border-orange-700",
    titulo: "text-orange-700 dark:text-orange-300",
    barra: "bg-orange-500 dark:bg-orange-400",
    etiqueta: "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
  },
];

export function infoMaquina(m: MaquinaCorte) {
  return MAQUINAS.find((x) => x.maquina === m) ?? MAQUINAS[0];
}
