"use client";

import { useState } from "react";
import { classeAbaSublinhada } from "@/components/AppShell";
import type { ModoFormulario } from "@/components/FormularioUpload";

interface Props {
  modo: ModoFormulario;
  setModo: (modo: ModoFormulario) => void;
}

// Pedido explícito do usuário: agrupar como no Follow up — as abas do
// orçamento ficam dentro de "Vendas" (segunda fileira), e em cima só os grupos.
const VENDAS: { valor: ModoFormulario; rotulo: string }[] = [
  { valor: "arquivo", rotulo: "Enviar desenho (PDF)" },
  { valor: "extracaoPedidos", rotulo: "Extração de Pedidos" },
  { valor: "manual", rotulo: "Cálculo manual" },
  { valor: "itens", rotulo: "Itens do orçamento" },
  { valor: "proposta", rotulo: "Proposta" },
  { valor: "referencia", rotulo: "Referência de preços" },
  { valor: "salvos", rotulo: "Orçamentos salvos" },
];

const GRUPOS: { valor: "vendas" | ModoFormulario; rotulo: string }[] = [
  { valor: "vendas", rotulo: "Vendas" },
  { valor: "followup", rotulo: "Follow up" },
];

// Subabas de Vendas: "pílulas" pequenas, abaixo das abas sublinhadas dos
// grupos (padrão do FC Nexus ERP — components/AppShell.tsx).
const classeSubaba = (ativa: boolean) =>
  `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
    ativa
      ? "bg-green-600 text-white dark:bg-cyan-500 dark:text-slate-950"
      : "text-stone-600 hover:bg-white hover:text-stone-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
  }`;

// Pedido explícito do usuário: essa barra de abas sobe pro cabeçalho fixo
// (logo abaixo de "nome do orçamento"/"Novo orçamento"), em vez de rolar
// junto com o conteúdo — trocar de aba (ex.: ir olhar "Referência de
// preços" no meio de um cálculo longo) sem precisar voltar ao topo.
export default function AbasFormulario({ modo, setModo }: Props) {
  const emVendas = VENDAS.some((a) => a.valor === modo);
  // Volta pra última aba de Vendas usada ao clicar em "Vendas".
  const [ultimaVendas, setUltimaVendas] = useState<ModoFormulario>(emVendas ? modo : "arquivo");
  const vendasAtual = emVendas ? modo : ultimaVendas;

  return (
    <div className="flex flex-col">
      <div className="-mb-px flex overflow-x-auto">
        {GRUPOS.map((g) => {
          const ativa = g.valor === "vendas" ? emVendas : modo === g.valor;
          return (
            <button
              key={g.valor}
              type="button"
              onClick={() => {
                if (g.valor === "vendas") return setModo(vendasAtual);
                if (emVendas) setUltimaVendas(modo); // lembra onde estava em Vendas
                setModo(g.valor);
              }}
              className={classeAbaSublinhada(ativa)}
            >
              {g.rotulo}
            </button>
          );
        })}
      </div>
      {emVendas && (
        <div className="flex gap-1 overflow-x-auto border-t border-stone-200 py-2 dark:border-slate-800">
          {VENDAS.map((aba) => (
            <button
              key={aba.valor}
              type="button"
              onClick={() => {
                setUltimaVendas(aba.valor);
                setModo(aba.valor);
              }}
              className={classeSubaba(modo === aba.valor)}
            >
              {aba.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
