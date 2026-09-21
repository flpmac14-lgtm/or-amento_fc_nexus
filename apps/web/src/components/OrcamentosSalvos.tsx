"use client";

import { useEffect, useState } from "react";
import {
  anexarDesenhoOrcamento,
  buscarOrcamentoSalvo,
  enviarDesenhoParaStorage,
  excluirOrcamentoSalvo,
  listarOrcamentosSalvos,
} from "@/lib/api";
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

// Pedido explícito do usuário: ícone vermelho quando o orçamento tem pelo
// menos um PDF anexado, cinza quando não tem — e clicável direto na
// lista (sem precisar abrir o orçamento) pra anexar um desenho, inclusive
// mais um quando já tem algum (ver components/OrcamentosSalvos.tsx ->
// handleAnexar / lib/api.ts -> anexarDesenhoOrcamento).
function IconeDesenhoAnexado({ anexado, anexando }: { anexado: boolean; anexando: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`h-4 w-4 ${anexando ? "animate-pulse text-stone-400 dark:text-slate-500" : anexado ? "text-red-600 dark:text-red-500" : "text-stone-300 dark:text-slate-700"}`}
    >
      <title>
        {anexando ? "Enviando…" : anexado ? "Desenho anexado — clique pra anexar mais um" : "Clique pra anexar um desenho"}
      </title>
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
  const [anexandoId, setAnexandoId] = useState<string | null>(null);

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

  async function anexar(id: string, arquivo: File) {
    setAnexandoId(id);
    setErro("");
    try {
      const path = await enviarDesenhoParaStorage(id, arquivo);
      await anexarDesenhoOrcamento(id, path, arquivo.name);
      setLista((atual) =>
        atual.map((o) =>
          o.id === id ? { ...o, resumo: { ...o.resumo, tem_desenho_anexado: true } } : o,
        ),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao anexar o desenho.");
    } finally {
      setAnexandoId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-stone-600 dark:text-slate-400">
          Orçamentos salvos — clique em &quot;Abrir&quot; pra continuar de onde parou. Só os de{" "}
          <span className="text-stone-700 dark:text-slate-300">cálculo manual</span> reabrem com a lista de itens
          editável; os de PDF/texto reabrem só o resultado já calculado. Clique no ícone de desenho pra
          anexar um PDF direto (dá pra anexar mais de um).
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
                  <label className="cursor-pointer">
                    <IconeDesenhoAnexado
                      anexado={o.resumo.tem_desenho_anexado}
                      anexando={anexandoId === o.id}
                    />
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      disabled={anexandoId === o.id}
                      onChange={(e) => {
                        const arquivo = e.target.files?.[0];
                        e.target.value = "";
                        if (arquivo) anexar(o.id, arquivo);
                      }}
                    />
                  </label>
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
