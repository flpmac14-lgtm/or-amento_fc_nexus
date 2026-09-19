"use client";

import { useState } from "react";
import { buscarCnpj } from "@/lib/api";
import type { IdentificacaoCliente } from "@/lib/types";

interface Props {
  valor: IdentificacaoCliente;
  onChange: (atualizacao: Partial<IdentificacaoCliente>) => void;
}

// Pedido explícito do usuário: primeira etapa de automação — hoje essa
// identificação é toda digitada à mão numa planilha Excel; aqui o CNPJ já
// busca nome e endereço sozinho (Receita Federal via BrasilAPI), o resto
// (revisão, condição de pagamento, pedido) continua manual por enquanto.
// Uma etapa futura vai trocar a origem desses campos por uma extração
// automática do desenho — o formato dos campos já fica pronto pra isso
// ("jogar os dados nesses campos" e revisar em Cálculo manual).
export default function PainelIdentificacaoCliente({ valor, onChange }: Props) {
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");

  async function buscar() {
    if (!valor.cnpj.trim()) return;
    setBuscando(true);
    setErro("");
    try {
      const dados = await buscarCnpj(valor.cnpj);
      onChange({ cnpj: dados.cnpj, nomeCliente: dados.nome, endereco: dados.endereco });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao buscar o CNPJ.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
      <h2 className="mb-3 font-semibold text-stone-900 dark:text-white">Identificação do cliente</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">CNPJ</span>
          <div className="flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={valor.cnpj}
              onChange={(e) => onChange({ cnpj: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  buscar();
                }
              }}
              placeholder="00.000.000/0000-00"
              className="w-full rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={buscar}
              disabled={buscando || !valor.cnpj.trim()}
              className="shrink-0 rounded-md border border-green-600/40 dark:border-cyan-500/40 px-2 py-1.5 text-xs text-green-700 dark:text-cyan-300 hover:bg-green-600/10 dark:hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {buscando ? "Buscando…" : "Buscar"}
            </button>
          </div>
        </label>

        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="text-stone-600 dark:text-slate-400">Nome do cliente</span>
          <input
            type="text"
            value={valor.nomeCliente}
            onChange={(e) => onChange({ nomeCliente: e.target.value })}
            placeholder="preenchido pela busca de CNPJ, ou digite direto"
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs sm:col-span-2 lg:col-span-3">
          <span className="text-stone-600 dark:text-slate-400">Endereço</span>
          <input
            type="text"
            value={valor.endereco}
            onChange={(e) => onChange({ endereco: e.target.value })}
            placeholder="preenchido pela busca de CNPJ, ou digite direto"
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">Revisão</span>
          <input
            type="text"
            value={valor.revisao}
            onChange={(e) => onChange({ revisao: e.target.value })}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">Condição de pagamento</span>
          <input
            type="text"
            value={valor.condicaoPagamento}
            onChange={(e) => onChange({ condicaoPagamento: e.target.value })}
            placeholder="ex: 30/60/90 dias"
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-stone-600 dark:text-slate-400">Pedido</span>
          <input
            type="text"
            value={valor.pedido}
            onChange={(e) => onChange({ pedido: e.target.value })}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        </label>
      </div>

      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </section>
  );
}
