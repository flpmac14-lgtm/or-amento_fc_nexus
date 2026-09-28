"use client";

// Módulo Follow up = duas visões lado a lado (pedido explícito do usuário:
// "pode ser junto com a do follow up"): o Follow up importado da aba
// Gerencia e o Controle de obras sincronizado sozinho a cada 15 min.
// Usado na aba "Follow up" da tela principal e na página /follow-up.

import { useState } from "react";
import ControleObras from "@/components/ControleObras";
import FollowUp from "@/components/FollowUp";

const VISOES = [
  { valor: "followup", rotulo: "Follow up (Gerencia)" },
  { valor: "controle", rotulo: "Controle de obras" },
] as const;

export default function ModuloFollowUp() {
  const [visao, setVisao] = useState<(typeof VISOES)[number]["valor"]>("followup");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex w-fit gap-1 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-1 text-sm">
        {VISOES.map((v) => (
          <button
            key={v.valor}
            type="button"
            onClick={() => setVisao(v.valor)}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
              visao === v.valor
                ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950"
                : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
            }`}
          >
            {v.rotulo}
          </button>
        ))}
      </div>
      {/* As duas ficam montadas (só escondidas) pra não recarregar/perder filtros ao alternar. */}
      <div className={visao === "followup" ? "" : "hidden"}>
        <FollowUp />
      </div>
      <div className={visao === "controle" ? "" : "hidden"}>
        <ControleObras />
      </div>
    </div>
  );
}
