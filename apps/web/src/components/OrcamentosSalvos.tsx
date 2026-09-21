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

// Pedido explícito do usuário: ícone vermelho quando o orçamento tem um
// PDF anexado (ver "Anexar desenho" em RelatorioTecnicoIA.tsx), cinza
// quando não tem (ex.: orçamentos feitos só no Cálculo manual).
function IconeDesenhoAnexado({ anexado }: { anexado: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 ${anexado ? "text-red-600 dark:text-red-500" : "text-stone-300 dark:text-slate-700"}`}
    >
      <title>{anexado ? "Desenho anexado" : "Sem desenho anexado"}</title>
      <path
        d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        fill="currentColor"
      />
      <path d="M14 3v4h4" fill="none" stroke="white" strokeOpacity="0.6" strokeWidth="1" />
    </svg>
  );
}

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
        <p className="text-sm text-stone-600 dark:text-slate-400">
          Orçamentos salvos — clique em &quot;Abrir&quot; pra continuar de onde parou. Só os de{" "}
          <span className="text-stone-700 dark:text-slate-300">cálculo manual</span> reabrem com a lista de itens
          editável; os de PDF/texto reabrem só o resultado já calculado.
        </p>
        <button
          type="button"
          onClick={buscar}
          disabled={carregando}
          className="shrink-0 rounded border border-stone-300 dark:border-slate-700 px-2 py-1 text-xs text-stone-700 dark:text-slate-300 hover:border-green-600 dark:hover:border-cyan-500 hover:text-green-700 dark:hover:text-cyan-300 disabled:opacity-50"
        >
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

      <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-slate-800">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-white dark:bg-slate-900/60 text-left text-xs uppercase tracking-wide text-stone-500 dark:text-slate-500">
            <tr>
              <th className="px-3 py-2" title="Desenho anexado?" />
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
              <tr key={o.id} className="text-stone-800 dark:text-slate-200">
                <td className="px-3 py-2">
                  <IconeDesenhoAnexado anexado={o.resumo.tem_desenho_anexado} />
                </td>
                <td className="px-3 py-2">{o.nome}</td>
                <td className="px-3 py-2 text-stone-600 dark:text-slate-400">{ORIGEM_ROTULO[o.origem] ?? o.origem}</td>
                <td className="px-3 py-2 text-stone-600 dark:text-slate-400">
                  {[o.resumo.cliente, o.resumo.numero_desenho].filter(Boolean).join(" — ") || "—"}
                </td>
                <td className="px-3 py-2 font-mono">
                  {o.resumo.peso_liquido_kg != null ? `${formatarNumero(o.resumo.peso_liquido_kg, 2)} kg` : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-green-700 dark:text-cyan-300">
                  {formatarMoeda(o.resumo.preco_venda_com_impostos)}
                </td>
                <td className="px-3 py-2 text-stone-600 dark:text-slate-400">{new Date(o.updated_at).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => abrir(o.id)}
                      disabled={abrindoId === o.id}
                      className="rounded border border-green-600/40 dark:border-cyan-500/40 px-2 py-1 text-xs text-green-700 dark:text-cyan-300 hover:bg-green-600/10 dark:hover:bg-cyan-500/10 disabled:opacity-50"
                    >
                      {abrindoId === o.id ? "Abrindo…" : "Abrir"}
                    </button>
                    <button
                      type="button"
                      onClick={() => excluir(o.id)}
                      disabled={excluindoId === o.id}
                      className="rounded border border-red-400/40 dark:border-red-500/30 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-500/10 dark:hover:bg-red-500/10 disabled:opacity-50"
                    >
                      {excluindoId === o.id ? "Excluindo…" : "Excluir"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-stone-500 dark:text-slate-500">
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
