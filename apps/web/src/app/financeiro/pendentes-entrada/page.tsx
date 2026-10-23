"use client";

// Relatório "Pendentes de dar entrada" — pedido do usuário (23/10/2026): só os
// pedidos ATIVOS do Follow up (ST = A) que ainda não foram achados no Sectra
// (situação "sem_entrada" do comparativo da aba Financeiro → Pedido - ativo),
// agrupados por cliente, prazo mais curto primeiro. Folha A4 paisagem pra
// imprimir / salvar em PDF. Fica sob /financeiro, então o proxy.ts já barra
// quem não pode abrir o Financeiro.
// Parâmetros: ?cliente=W1 (vazio = todos).

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { ItemComparativo } from "@/components/FinanceiroPedidoAtivo";
import { nomeClienteRelatorio } from "@/lib/clientes";
import { formatarDataBr } from "@/lib/format";

const COLUNAS = ["#", "PO / item", "MAC", "Desenho", "Descrição", "Qtd", "Prazo", "Status Follow up", "Alertas", "Entrada dada ✓"];

interface Grupo {
  cliente: string;
  itens: ItemComparativo[];
}

function Relatorio() {
  const params = useSearchParams();
  const [cliente, setCliente] = useState(params.get("cliente") ?? "");
  const [todos, setTodos] = useState<ItemComparativo[] | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));
  const hoje = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let ativo = true;
    fetch("/api/financeiro/pedidos", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro ?? `Falha ao carregar (${r.status}).`);
        return j as { pedidos: { comparativo?: { itens: ItemComparativo[] } } | null; gerado_em: string | null };
      })
      .then((j) => {
        if (!ativo) return;
        setTodos((j.pedidos?.comparativo?.itens ?? []).filter((i) => i.situacao === "sem_entrada"));
        setAtualizadoEm(j.gerado_em);
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    document.title = `Pendentes de dar entrada${cliente ? ` - ${cliente}` : ""}`;
  }, [cliente]);

  const clientes = useMemo(() => [...new Set((todos ?? []).map((i) => i.cliente ?? "—"))].sort((a, b) => a.localeCompare(b, "pt-BR")), [todos]);

  const grupos = useMemo(() => {
    const m = new Map<string, Grupo>();
    for (const i of todos ?? []) {
      const c = i.cliente ?? "—";
      if (cliente && c !== cliente) continue;
      let g = m.get(c);
      if (!g) {
        g = { cliente: c, itens: [] };
        m.set(c, g);
      }
      g.itens.push(i);
    }
    const lista = [...m.values()];
    // Prazo mais curto primeiro (sem prazo no fim), igual à tela.
    for (const g of lista) g.itens.sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999") || a.po.localeCompare(b.po, "pt-BR", { numeric: true }));
    // Clientes com mais pendências primeiro.
    return lista.sort((a, b) => b.itens.length - a.itens.length || a.cliente.localeCompare(b.cliente, "pt-BR"));
  }, [todos, cliente]);

  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!todos) return <p className="p-8 text-stone-500">Carregando relatório…</p>;

  const itens = grupos.flatMap((g) => g.itens);
  const vencidos = itens.filter((i) => i.prazo && i.prazo.slice(0, 10) < hoje).length;
  const classeCampo = "rounded-lg border border-stone-400 bg-white px-2 py-1.5 text-sm text-stone-800";
  // Numeração corrida pela folha toda (início de cada grupo).
  const inicio = grupos.map((_, k) => grupos.slice(0, k).reduce((s, g) => s + g.itens.length, 0));

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center justify-end gap-2 px-4 print:hidden">
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={`mr-auto ${classeCampo}`} aria-label="Cliente">
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c} value={c}>
              {nomeClienteRelatorio(c)}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-600">
          Imprimir / Salvar PDF
        </button>
        <button type="button" onClick={() => window.close()} className="rounded-lg border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100">
          Fechar
        </button>
      </div>

      <main className="mx-auto flex max-w-[297mm] flex-col gap-3 bg-white p-[8mm] text-stone-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between gap-4 border-b-4 border-red-600 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-red-700">FC Nexus · Financeiro</p>
            <h1 className="text-2xl font-bold">
              Pedidos pendentes de dar entrada
              {cliente && <span className="font-normal text-stone-600"> — {nomeClienteRelatorio(cliente)}</span>}
            </h1>
            <p className="text-xs text-stone-500">Ativos no Follow up (ST = A) que não foram achados no Sectra pelo pedido do cliente + item.</p>
          </div>
          <div className="flex gap-5 text-right text-xs text-stone-500">
            <p>
              Clientes <span className="block font-mono text-base font-bold text-stone-900">{grupos.length}</span>
            </p>
            <p>
              Pendentes <span className="block font-mono text-base font-bold text-red-700">{itens.length}</span>
            </p>
            <p>
              Prazo vencido <span className="block font-mono text-base font-bold text-red-700">{vencidos}</span>
            </p>
            <p>
              Dados do ERP{" "}
              <span className="block font-medium text-stone-700">
                {atualizadoEm ? new Date(atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
              </span>
            </p>
            <p>
              Gerado em <span className="block font-medium text-stone-700">{geradoEm}</span>
            </p>
          </div>
        </header>

        {grupos.length === 0 ? (
          <p className="py-10 text-center text-stone-500">Nenhum pedido pendente de dar entrada{cliente ? ` do cliente ${cliente}` : ""}. 🎉</p>
        ) : (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-stone-100">
                {COLUNAS.map((c) => (
                  <th key={c} className="border border-stone-400 px-1 py-1 text-center font-bold uppercase">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            {grupos.map((g, k) => (
              <tbody key={g.cliente}>
                <tr className="break-after-avoid bg-red-50">
                  <td colSpan={COLUNAS.length} className="border border-stone-400 border-l-8 border-l-red-600 px-2 py-1 text-[11px]">
                    <strong className="text-[12px]">{g.cliente === "—" ? "Sem cliente" : nomeClienteRelatorio(g.cliente)}</strong>
                    <span className="float-right text-stone-600">{g.itens.length} pedido(s)</span>
                  </td>
                </tr>
                {g.itens.map((i, j) => {
                  const vencido = !!i.prazo && i.prazo.slice(0, 10) < hoje;
                  const n = inicio[k] + j + 1;
                  return (
                    <tr key={`${i.po}-${n}`} className="break-inside-avoid text-center">
                      <td className="border border-stone-400 px-1 text-stone-500">{n}</td>
                      <td className="border border-stone-400 px-1 font-mono text-[11px] font-semibold">{i.po}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.mac ?? ""}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.desenho ?? ""}</td>
                      <td className="border border-stone-400 px-1 text-left text-[9px]">{i.descricao}</td>
                      <td className="border border-stone-400 px-1">{i.qtd ?? ""}</td>
                      <td className={`border border-stone-400 px-1 ${vencido ? "font-bold text-red-700" : ""}`}>{i.prazo ? formatarDataBr(i.prazo.slice(0, 10)) : ""}</td>
                      <td className="border border-stone-400 px-1 text-[9px]">{i.status_fu ?? ""}</td>
                      <td className="border border-stone-400 px-1 text-left text-[9px] text-violet-700">
                        {[i.duplicado ? "DUPLICADO" : "", ...i.alertas].filter(Boolean).join(" · ")}
                      </td>
                      <td className="w-[18mm] border border-stone-400 px-1" />
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        )}
        <p className="text-[9px] text-stone-500">
          Prazo vencido em vermelho. Depois de dar entrada no Sectra, o pedido sai deste relatório na próxima atualização do ERP (até 15 min).
        </p>
      </main>
    </div>
  );
}

export default function RelatorioPendentesEntrada() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
