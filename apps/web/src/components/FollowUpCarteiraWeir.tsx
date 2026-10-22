"use client";

// Botão "Carteira WEIR" — pedido do usuário (20/10/2026): escolhe o Follow up
// Report que a WEIR manda e baixa a mesma planilha com a coluna "Fornecedor
// Confirmação" preenchida (coleta marcada, entregue/faturado com NF, "À
// confirmar" em vermelho, "Não consta em nossa carteira Macfab") —
// services/calc_engine/app/carteira_weir.py.

import { useRef, useState } from "react";
import { preencherCarteiraWeir, type ResumoCarteiraWeir } from "@/lib/api";

export default function FollowUpCarteiraWeir() {
  const entrada = useRef<HTMLInputElement>(null);
  const [gerando, setGerando] = useState(false);
  const [resumo, setResumo] = useState<ResumoCarteiraWeir | null>(null);
  const [erro, setErro] = useState("");

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setGerando(true);
    setErro("");
    setResumo(null);
    try {
      setResumo(await preencherCarteiraWeir(arquivo));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <span className="relative inline-flex items-center">
      <input
        ref={entrada}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => escolher(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={gerando}
        title="Envie o Follow up Report da WEIR (.xlsx): volta a mesma planilha com a coluna Fornecedor Confirmação preenchida — coleta, entregue/NF, À confirmar e Não consta"
        className="rounded-md border border-green-600/60 dark:border-cyan-500/60 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-cyan-300 hover:bg-green-50 dark:hover:bg-cyan-950/30 disabled:opacity-40"
      >
        {gerando ? "Preenchendo…" : "Carteira WEIR"}
      </button>
      {(resumo || erro) && (
        <span
          onClick={() => {
            setResumo(null);
            setErro("");
          }}
          className={`absolute left-0 top-full z-30 mt-1 w-80 cursor-pointer rounded-lg border p-2 text-xs shadow-lg ${
            erro
              ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
              : "border-green-300 bg-white text-stone-700 dark:border-cyan-800 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          {erro || (
            <>
              <strong className="block text-green-700 dark:text-cyan-300">✓ Planilha baixada — {resumo!.linhas} linhas</strong>
              {resumo!.com_coleta} com previsão de coleta · {resumo!.faturados} faturados · {resumo!.entregues} entregues
              {resumo!.cancelados > 0 && ` · ${resumo!.cancelados} cancelados`}
              <span className="block font-semibold text-red-600">
                {resumo!.a_confirmar} “À confirmar” (sem coleta marcada) · {resumo!.nao_consta} não constam na carteira
              </span>
            </>
          )}
        </span>
      )}
    </span>
  );
}
