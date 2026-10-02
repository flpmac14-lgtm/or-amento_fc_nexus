"use client";

// Peças comuns da Visão Geral: hook de carga por bloco (cada bloco tem o seu
// estado de carregamento/erro — um bloco lento não trava a tela), moldura do
// bloco e a janela com a lista de pedidos (destino dos cliques).

import { useEffect, useState } from "react";
import { buscarPainel } from "@/lib/api";
import { ddmm, kg, linkObra, type PedidoPainel } from "@/lib/painel";

export function useBloco<T>(bloco: string, params: Record<string, string>, tick: number) {
  const chave = JSON.stringify(params);
  const pedido = `${bloco}|${chave}|${tick}`;
  // "carregando" = a última resposta não é do pedido atual (filtro/tick mudou).
  const [estado, setEstado] = useState<{ dados: T | null; erro: string; de: string }>({ dados: null, erro: "", de: "" });
  useEffect(() => {
    let ativo = true;
    buscarPainel<T>(bloco, JSON.parse(chave))
      .then((dados) => ativo && setEstado({ dados, erro: "", de: pedido }))
      .catch((e: Error) => ativo && setEstado((s) => ({ ...s, erro: e.message, de: pedido })));
    return () => {
      ativo = false;
    };
  }, [bloco, chave, pedido]);
  return { dados: estado.dados, erro: estado.erro, carregando: estado.de !== pedido };
}

export function Bloco({
  titulo,
  extra,
  carregando,
  erro,
  className = "",
  children,
}: {
  titulo: React.ReactNode;
  extra?: React.ReactNode;
  carregando?: boolean;
  erro?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`flex min-h-0 flex-col rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 ${className}`}
    >
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700 dark:text-slate-300">{titulo}</h2>
        <div className="flex items-center gap-2 text-xs">
          {carregando && <span className="text-stone-400 dark:text-slate-500">atualizando…</span>}
          {extra}
        </div>
      </div>
      {erro ? (
        <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-300">
          {erro}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      )}
    </section>
  );
}

/** Estado vazio claro — dado que não existe hoje (nunca inventar). */
export function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm italic text-stone-500 dark:text-slate-400">{children}</p>;
}

/** O que um clique abre: título + conteúdo (normalmente uma TabelaPedidos). */
export interface ListaAberta {
  titulo: string;
  subtitulo?: string;
  conteudo: React.ReactNode;
}

export function Janela({ lista, fechar }: { lista: ListaAberta; fechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={fechar}>
      <div
        className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-xl bg-white dark:bg-slate-900 p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-stone-900 dark:text-white">{lista.titulo}</h3>
            {lista.subtitulo && <p className="text-sm text-stone-600 dark:text-slate-400">{lista.subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={fechar}
            className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1 text-sm text-stone-700 dark:text-slate-300"
          >
            Fechar (Esc)
          </button>
        </div>
        <div className="min-h-0 overflow-auto">{lista.conteudo}</div>
      </div>
    </div>
  );
}

export function TabelaPedidos({ pedidos }: { pedidos: PedidoPainel[] }) {
  if (pedidos.length === 0) return <Vazio>Nenhum pedido.</Vazio>;
  return (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-900 text-left text-xs uppercase text-stone-500 dark:text-slate-400">
              <tr>
                <th className="py-1 pr-2">Obra</th>
                <th className="py-1 pr-2">PO</th>
                <th className="py-1 pr-2">Cliente</th>
                <th className="py-1 pr-2">Descrição</th>
                <th className="py-1 pr-2">Prazo</th>
                <th className="py-1 pr-2">Coleta</th>
                <th className="py-1 pr-2">Status</th>
                <th className="py-1 text-right">Peso</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id} className="border-t border-stone-100 dark:border-slate-800 text-stone-800 dark:text-slate-200">
                  <td className="py-1 pr-2">
                    {p.obra ? (
                      <a href={linkObra(p.obra)} target="_blank" rel="noreferrer" className="font-semibold text-green-700 dark:text-cyan-300 hover:underline">
                        {p.obra}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1 pr-2 font-mono text-xs">{p.po}</td>
                  <td className="py-1 pr-2">{p.cliente ?? "—"}</td>
                  <td className="max-w-[20rem] truncate py-1 pr-2" title={p.descricao ?? ""}>
                    {p.descricao ?? "—"}
                  </td>
                  <td className="py-1 pr-2">{ddmm(p.prazo)}</td>
                  <td className="py-1 pr-2">{ddmm(p.coleta)}</td>
                  <td className="py-1 pr-2 text-xs">{p.st === "E" ? "Entregue" : p.status ?? "—"}</td>
                  <td className="py-1 text-right">{kg(p.kg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
  );
}
