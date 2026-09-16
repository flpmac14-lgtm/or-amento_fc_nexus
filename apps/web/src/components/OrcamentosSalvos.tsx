"use client";

import { useEffect, useState } from "react";
import { buscarOrcamentoSalvo, excluirOrcamentoSalvo, listarOrcamentosSalvos } from "@/lib/api";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import type { OrcamentoSalvoCompleto, OrcamentoSalvoResumo } from "@/lib/types";

interface Props {
  onAbrir: (salvo: OrcamentoSalvoCompleto) => void;
}

const ORIGEM_ROTULO: Record<string, string> = {
  manual: "Cálculo manual (editável)",
  pdf: "Desenho (PDF)",
  texto: "Itens digitados",
};

export default function OrcamentosSalvos({ onAbrir }: Props) {
  const [lista, setLista] = useState<OrcamentoSalvoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);

  function buscar() {
    setCarregando(true);
    setErro("");
    listarOrcamentosSalvos()
      .then(setLista)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar orçamentos salvos."))
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    buscar();
  }, []);

  async function abrir(id: string) {
    setAbrindoId(id);
    setErro("");
    try {
      const salvo = await buscarOrcamentoSalvo(id);
      onAbrir(salvo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao abrir o orçamento.");
    } finally {
      setAbrindoId(null);
    }
  }

  async function excluir(id: string) {
    setExcluindoId(id);
    setErro("");
    try {
      await excluirOrcamentoSalvo(id);
      setLista((atual) => atual.filter((o) => o.id !== id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao excluir o orçamento.");
    } finally {
      setExcluindoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-400">
          Orçamentos salvos — clique em &quot;Abrir&quot; pra continuar de onde parou. Só os de{" "}
          <span className="text-slate-300">cálculo manual</span> reabrem com a lista de itens
          editável; os de PDF/texto reabrem só o resultado já calculado.
        </p>
        <button
          type="button"
          onClick={buscar}
          disabled={carregando}
          className="shrink-0 rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
        >
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Origem</th>
              <th className="px-3 py-2">Cliente / desenho</th>
              <th className="px-3 py-2">Peso líq.</th>
              <th className="px-3 py-2">Venda (c/ impostos)</th>
              <th className="px-3 py-2">Atualizado em</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {lista.map((o) => (
              <tr key={o.id} className="text-slate-200">
                <td className="px-3 py-2">{o.nome}</td>
                <td className="px-3 py-2 text-slate-400">{ORIGEM_ROTULO[o.origem] ?? o.origem}</td>
                <td className="px-3 py-2 text-slate-400">
                  {[o.resumo.cliente, o.resumo.numero_desenho].filter(Boolean).join(" — ") || "—"}
                </td>
                <td className="px-3 py-2 font-mono">
                  {o.resumo.peso_liquido_kg != null ? `${formatarNumero(o.resumo.peso_liquido_kg, 2)} kg` : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-cyan-300">
                  {formatarMoeda(o.resumo.preco_venda_com_impostos)}
                </td>
                <td className="px-3 py-2 text-slate-400">{new Date(o.updated_at).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => abrir(o.id)}
                      disabled={abrindoId === o.id}
                      className="rounded border border-cyan-500/40 px-2 py-1 text-xs text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
                    >
                      {abrindoId === o.id ? "Abrindo…" : "Abrir"}
                    </button>
                    <button
                      type="button"
                      onClick={() => excluir(o.id)}
                      disabled={excluindoId === o.id}
                      className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {excluindoId === o.id ? "Excluindo…" : "Excluir"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  {carregando ? "Carregando…" : "Nenhum orçamento salvo ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
