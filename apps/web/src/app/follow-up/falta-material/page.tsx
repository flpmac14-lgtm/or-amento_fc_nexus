"use client";

// Relatório de falta de material — pedido do usuário (21/10/2026): outro
// "sub" do Relatório de coleta, com os pedidos que estão com o tique
// F.Material (e sem o M.Chegou), agrupados por obra (MAC com 2 partes:
// 573.26.01 → obra 573.26). Folha A4 paisagem pra imprimir / salvar em PDF.
// Parâmetros: ?cliente=W1&obra=573.26 (vazios = todos).

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { listarFollowUp, urlImagemFollowUp } from "@/lib/api";
import { nomeClienteRelatorio } from "@/lib/clientes";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { faltaMaterial, normalizarBusca, obraDoItem } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

const COLUNAS = ["Foto", "PO", "MAC", "Desenho", "Descrição", "Qtd", "Peso (kg)", "Coleta", "Fabricação", "Obs. Felipe / Marcelo", "Obs. Diretoria"];

// Mesma regra do Relatório por obra: Fornecedor / Terceirizado vazio (ou "macfab") = Macfab.
function localFabricacao(i: ItemFollowUp): string {
  const f = (i.fornecedor ?? "").trim();
  return !f || normalizarBusca(f).startsWith("macfa") ? "Macfab" : f;
}

interface Obra {
  obra: string;
  clientes: string[];
  itens: ItemFollowUp[];
  peso: number;
}

function Relatorio() {
  const params = useSearchParams();
  const [cliente, setCliente] = useState(params.get("cliente") ?? "");
  const [obraFiltro, setObraFiltro] = useState(params.get("obra") ?? "");
  const [todos, setTodos] = useState<ItemFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));

  useEffect(() => {
    let ativo = true;
    listarFollowUp()
      .then((r) => {
        // Só pedidos que estão na planilha e ainda esperando material.
        if (ativo) setTodos(r.itens.filter((i) => i.presente_na_ultima_importacao && faltaMaterial(i)));
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  useEffect(() => {
    document.title = `Falta de material${cliente ? ` - ${cliente}` : ""}${obraFiltro ? ` - obra ${obraFiltro}` : ""}`;
  }, [cliente, obraFiltro]);

  const clientes = useMemo(
    () => [...new Set((todos ?? []).map((i) => i.cliente ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [todos],
  );
  const doCliente = useMemo(() => (todos ?? []).filter((i) => !cliente || i.cliente === cliente), [todos, cliente]);
  const obrasDisponiveis = useMemo(
    () => [...new Set(doCliente.map((i) => obraDoItem(i, "mac") || "Sem MAC"))].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })),
    [doCliente],
  );

  const obras = useMemo(() => {
    const m = new Map<string, Obra>();
    for (const i of doCliente) {
      const obra = obraDoItem(i, "mac") || "Sem MAC";
      if (obraFiltro && obra !== obraFiltro) continue;
      let o = m.get(obra);
      if (!o) {
        o = { obra, clientes: [], itens: [], peso: 0 };
        m.set(obra, o);
      }
      o.itens.push(i);
      o.peso += i.peso_total ?? 0;
      if (i.cliente && !o.clientes.includes(i.cliente)) o.clientes.push(i.cliente);
    }
    const lista = [...m.values()];
    for (const o of lista) {
      o.itens.sort((a, b) => (a.prazo_contratual ?? "9999").localeCompare(b.prazo_contratual ?? "9999") || a.po.localeCompare(b.po, "pt-BR", { numeric: true }));
    }
    // Obras com mais pedidos parados primeiro.
    return lista.sort((a, b) => b.itens.length - a.itens.length || a.obra.localeCompare(b.obra, "pt-BR", { numeric: true }));
  }, [doCliente, obraFiltro]);

  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!todos) return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  const itens = obras.flatMap((o) => o.itens);
  const peso = obras.reduce((s, o) => s + o.peso, 0);
  const terceirizados = itens.filter((i) => localFabricacao(i) !== "Macfab").length;
  const classeCampo = "rounded-lg border border-stone-400 bg-white px-2 py-1.5 text-sm text-stone-800";

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center justify-end gap-2 px-4 print:hidden">
        <select value={cliente} onChange={(e) => { setCliente(e.target.value); setObraFiltro(""); }} className={`mr-auto ${classeCampo}`} aria-label="Cliente">
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c} value={c}>
              {nomeClienteRelatorio(c)}
            </option>
          ))}
        </select>
        <select value={obraFiltro} onChange={(e) => setObraFiltro(e.target.value)} className={classeCampo} aria-label="Obra">
          <option value="">Todas as obras</option>
          {obrasDisponiveis.map((o) => (
            <option key={o} value={o}>
              Obra {o}
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
            <p className="text-xs font-semibold uppercase tracking-widest text-red-700">FC Nexus · Follow up de obras</p>
            <h1 className="text-2xl font-bold">
              Falta de material por obra
              {cliente && <span className="font-normal text-stone-600"> — {nomeClienteRelatorio(cliente)}</span>}
              {obraFiltro && <span className="font-normal text-stone-600"> — Obra {obraFiltro}</span>}
            </h1>
            <p className="text-xs text-stone-500">Pedidos com o tique F.Material marcado e o M.Chegou ainda sem marcar.</p>
          </div>
          <div className="flex gap-5 text-right text-xs text-stone-500">
            <p>
              Obras <span className="block font-mono text-base font-bold text-stone-900">{obras.length}</span>
            </p>
            <p>
              Pedidos <span className="block font-mono text-base font-bold text-red-700">{itens.length}</span>
            </p>
            <p>
              Em terceirizado <span className="block font-mono text-base font-bold text-stone-900">{terceirizados}</span>
            </p>
            <p>
              Peso parado <span className="block font-mono text-base font-bold text-stone-900">{formatarNumero(peso, 2)} kg</span>
            </p>
            <p>
              Gerado em <span className="block font-medium text-stone-700">{geradoEm}</span>
            </p>
          </div>
        </header>

        {obras.length === 0 ? (
          <p className="py-10 text-center text-stone-500">Nenhum pedido esperando material{cliente ? ` do cliente ${cliente}` : ""}. 🎉</p>
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
            {obras.map((o) => (
              <tbody key={o.obra}>
                <tr className="break-after-avoid bg-red-50">
                  <td colSpan={COLUNAS.length} className="border border-stone-400 border-l-8 border-l-red-600 px-2 py-1 text-[11px]">
                    <strong className="text-[12px]">Obra {o.obra}</strong>
                    {o.clientes.length > 0 && <span className="text-stone-600"> · {o.clientes.map(nomeClienteRelatorio).join(", ")}</span>}
                    <span className="float-right text-stone-600">
                      {o.itens.length} pedido(s) · {formatarNumero(o.itens.reduce((s, i) => s + (i.quantidade ?? 0), 0), 0)} peça(s) ·{" "}
                      {formatarNumero(o.peso, 2)} kg
                    </span>
                  </td>
                </tr>
                {o.itens.map((i) => {
                  const local = localFabricacao(i);
                  return (
                    <tr key={i.id} className="break-inside-avoid text-center">
                      <td className="w-[22mm] border border-stone-400 p-0.5">
                        {i.imagens[0] && (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine
                          <img src={urlImagemFollowUp(i.imagens[0].sha256)} alt="" className="mx-auto h-[11mm] w-[20mm] object-contain" />
                        )}
                      </td>
                      <td className="border border-stone-400 px-1 font-mono text-[11px]">{i.po}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.mac}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.desenho}</td>
                      <td className="border border-stone-400 px-1 text-left text-[9px]">{i.descricao}</td>
                      <td className="border border-stone-400 px-1">{i.quantidade ?? ""}</td>
                      <td className={`border border-stone-400 px-1 ${(i.peso_total ?? 0) > 100 ? "font-bold text-red-700" : ""}`}>
                        {i.peso_total !== null ? formatarNumero(i.peso_total, 2) : ""}
                      </td>
                      <td className="border border-stone-400 px-1">{i.coleta_data ? formatarDataBr(i.coleta_data) : (i.coleta ?? "")}</td>
                      <td className={`border border-stone-400 px-1 ${local === "Macfab" ? "" : "font-semibold text-amber-800"}`}>{local}</td>
                      <td className="border border-stone-400 px-1 text-left text-[9px]">{i.obs_felipe_marcelo}</td>
                      <td className="border border-stone-400 px-1 text-left text-[9px]">{i.obs_alisson}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        )}
        <p className="text-[9px] text-stone-500">
          Peso acima de 100 kg em vermelho. Fabricação diferente de Macfab = falta levar o material pro terceirizado. Quando o
          material chegar, marque o tique M.Chegou no Follow up e o pedido sai deste relatório.
        </p>
      </main>
    </div>
  );
}

export default function RelatorioFaltaMaterial() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
