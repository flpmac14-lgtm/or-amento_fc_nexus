"use client";

import type { ModoFormulario } from "@/components/FormularioUpload";

interface Props {
  modo: ModoFormulario;
  setModo: (modo: ModoFormulario) => void;
}

const ABAS: { valor: ModoFormulario; rotulo: string }[] = [
  { valor: "arquivo", rotulo: "Enviar desenho (PDF)" },
  { valor: "manual", rotulo: "Cálculo manual" },
  { valor: "itens", rotulo: "Itens do orçamento" },
  { valor: "referencia", rotulo: "Referência de preços" },
  { valor: "salvos", rotulo: "Orçamentos salvos" },
];

// Pedido explícito do usuário: essa barra de abas sobe pro cabeçalho fixo
// (logo abaixo de "nome do orçamento"/"Novo orçamento"), em vez de rolar
// junto com o conteúdo — trocar de aba (ex.: ir olhar "Referência de
// preços" no meio de um cálculo longo) sem precisar voltar ao topo.
export default function AbasFormulario({ modo, setModo }: Props) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-1 text-sm">
      {ABAS.map((aba) => (
        <button
          key={aba.valor}
          type="button"
          onClick={() => setModo(aba.valor)}
          className={`flex-1 shrink-0 rounded-md py-2 px-3 font-medium transition-colors ${
            modo === aba.valor
              ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950"
              : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
          }`}
        >
          {aba.rotulo}
        </button>
      ))}
    </div>
  );
}
