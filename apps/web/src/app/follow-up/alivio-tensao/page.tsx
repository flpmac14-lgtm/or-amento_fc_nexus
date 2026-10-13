"use client";

// Relatório de alívio de tensão — pedido explícito do usuário: no mesmo
// padrão do relatório de coleta (app/follow-up/coleta), com os pedidos que
// têm "alívio de tensão" anotado na Obs. Felipe/Marcelo, agrupados por MAC.
// Folha A4 paisagem pra imprimir / salvar em PDF (Ctrl+P). Fica sob
// /follow-up, então a conta restrita também acessa.
// Parâmetros: ?cliente=W1 ou cliente=A1,W1 (2+ clientes juntos — o alívio é
// feito de uma vez; vazio = todos)&fracionado=1.
// Envio fracionado: igual à coleta, a Qtd fica editável só neste relatório;
// Qtd 0 tira o pedido da folha.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { listarFollowUp, urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { temAlivioTensao } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

// No fim, colunas em branco pra anotar o envio pro forno e o certificado.
const COLUNAS = ["Foto", "PO", "Qtd", "MAC", "Desenho", "Descrição", "Tipagem", "Peso (kg)", "Coleta", "Data envio", "Data retorno", "N° Certificado"];

interface Grupo {
  mac: string;
  itens: ItemFollowUp[];
}

// Por MAC (obra), na ordem da MAC; dentro do grupo, em sequência pelo PO.
function agrupar(itens: ItemFollowUp[]): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const i of itens) {
    const mac = (i.mac ?? "").trim();
    let g = m.get(mac);
    if (!g) {
      g = { mac, itens: [] };
      m.set(mac, g);
    }
    g.itens.push(i);
  }
  const grupos = [...m.values()];
  for (const g of grupos) g.itens.sort((a, b) => a.po.localeCompare(b.po, "pt-BR", { numeric: true }));
  return grupos.sort((a, b) => (!a.mac ? 1 : !b.mac ? -1 : a.mac.localeCompare(b.mac, "pt-BR", { numeric: true })));
}

function clientesDoGrupo(g: Grupo): string[] {
  return [...new Set(g.itens.map((i) => i.cliente ?? "").filter(Boolean))].sort();
}

function Relatorio() {
  const params = useSearchParams();
  const cliente = params.get("cliente") ?? "";
  const clientes = cliente.split(",").map((c) => c.trim()).filter(Boolean);
  const rotuloClientes = clientes.join(" + ");
  const [itens, setItens] = useState<ItemFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));
  const [fracionado, setFracionado] = useState(() => params.get("fracionado") === "1");
  const [qtdEnvio, setQtdEnvio] = useState<Record<string, number>>({});

  useEffect(() => {
    const lista = cliente.split(",").map((c) => c.trim()).filter(Boolean);
    document.title = `Alívio de tensão ${new Date().toLocaleDateString("pt-BR").replace(/\//g, ".")}${lista.length ? ` - ${lista.join(" + ")}` : ""}`; // nome sugerido do PDF
    let ativo = true;
    listarFollowUp()
      .then((r) => {
        if (!ativo) return;
        setItens(r.itens.filter((i) => temAlivioTensao(i) && (!lista.length || lista.includes(i.cliente ?? ""))));
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [cliente]);

  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens) return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  // Quantidade que vai pro alívio (fracionada ou a do pedido inteiro).
  const qtd = (i: ItemFollowUp) => (fracionado && i.id in qtdEnvio ? qtdEnvio[i.id] : (i.quantidade ?? 0));
  const pesoEnvio = (i: ItemFollowUp) =>
    !fracionado || !i.quantidade ? (i.peso_total ?? 0) : ((i.peso_total ?? 0) * qtd(i)) / i.quantidade;
  const naFolha = fracionado ? itens.filter((i) => qtd(i) > 0) : itens;
  const grupos = agrupar(itens);
  const pecas = naFolha.reduce((s, i) => s + qtd(i), 0);
  const peso = naFolha.reduce((s, i) => s + pesoEnvio(i), 0);
  const algumParcial = fracionado && itens.some((i) => qtd(i) !== (i.quantidade ?? 0));

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] items-center justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setFracionado((f) => !f)}
          title="Editar a quantidade que vai de cada pedido neste envio (só neste relatório)"
          className={`mr-auto rounded-lg px-3 py-2 text-xs ${
            fracionado
              ? "border border-amber-500 bg-amber-50 font-semibold text-amber-800"
              : "text-stone-500 hover:bg-stone-300/60 hover:text-stone-800"
          }`}
        >
          {fracionado ? "✓ Envio fracionado (Qtd editável)" : "Envio fracionado"}
        </button>
        {fracionado && Object.keys(qtdEnvio).length > 0 && (
          <button
            type="button"
            onClick={() => setQtdEnvio({})}
            className="rounded-lg px-3 py-2 text-xs text-stone-500 hover:bg-stone-300/60 hover:text-stone-800"
          >
            Voltar às quantidades inteiras
          </button>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-600"
        >
          Imprimir / Salvar PDF
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          Fechar
        </button>
      </div>

      <main className="folha-coleta mx-auto flex max-w-[297mm] flex-col gap-3 bg-white p-[8mm] text-stone-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between gap-4 border-b-4 border-green-700 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-green-800">FC Nexus · Follow up de obras</p>
            <h1 className="text-2xl font-bold">
              Alívio de tensão
              {clientes.length > 0 && (
                <span className="font-normal text-stone-600">
                  {" "}
                  — {clientes.length > 1 ? "Clientes" : "Cliente"} {rotuloClientes}
                </span>
              )}
              {algumParcial && <span className="font-normal text-amber-700"> (parcial)</span>}
            </h1>
          </div>
          <div className="flex gap-5 text-right text-xs text-stone-500">
            <p>
              Pedidos <span className="block font-mono text-base font-bold text-stone-900">{naFolha.length}</span>
            </p>
            <p>
              Peças <span className="block font-mono text-base font-bold text-stone-900">{formatarNumero(pecas, 0)}</span>
            </p>
            <p>
              Peso total <span className="block font-mono text-base font-bold text-stone-900">{formatarNumero(peso, 2)} kg</span>
            </p>
            <p>
              Gerado em <span className="block font-medium text-stone-700">{geradoEm}</span>
            </p>
          </div>
        </header>

        {itens.length === 0 ? (
          <p className="py-10 text-center text-stone-500">
            Nenhum pedido{clientes.length ? ` de ${rotuloClientes}` : ""} com “alívio de tensão” na Obs. Felipe/Marcelo.
          </p>
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
            {grupos.map((g) => {
              const doGrupo = fracionado ? g.itens.filter((i) => qtd(i) > 0) : g.itens;
              return (
                <tbody key={g.mac} className={doGrupo.length === 0 ? "print:hidden" : undefined}>
                  <tr className="break-after-avoid bg-green-50">
                    <td colSpan={COLUNAS.length} className="border border-stone-400 px-2 py-1 text-[11px]">
                      <strong>MAC:</strong> <strong className="font-mono">{g.mac || "—"}</strong>
                      {/* Com 2+ clientes juntos, mostra de quem é cada MAC. */}
                      {clientesDoGrupo(g).length > 0 && (
                        <span className="ml-2 text-stone-700">· Cliente {clientesDoGrupo(g).join(" / ")}</span>
                      )}
                      <span className="float-right text-stone-600">
                        {doGrupo.length} pedido(s) · {formatarNumero(doGrupo.reduce((s, i) => s + qtd(i), 0), 0)} peça(s) ·{" "}
                        {formatarNumero(doGrupo.reduce((s, i) => s + pesoEnvio(i), 0), 2)} kg
                      </span>
                    </td>
                  </tr>
                  {g.itens.map((i) => (
                    <tr
                      key={i.id}
                      className={`break-inside-avoid text-center ${fracionado && qtd(i) <= 0 ? "opacity-40 print:hidden" : ""}`}
                    >
                      <td className="w-[22mm] border border-stone-400 p-0.5">
                        {i.imagens[0] && (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine
                          <img src={urlImagemFollowUp(i.imagens[0].sha256)} alt="" className="mx-auto h-[11mm] w-[20mm] object-contain" />
                        )}
                      </td>
                      <td className="border border-stone-400 px-1 font-mono text-[11px]">{i.po}</td>
                      <td className="border border-stone-400 px-1">
                        {fracionado ? (
                          <>
                            <input
                              type="number"
                              min={0}
                              value={qtd(i)}
                              onChange={(e) => {
                                const v = Math.max(0, Number(e.target.value) || 0);
                                setQtdEnvio((q) => ({ ...q, [i.id]: v }));
                              }}
                              className="w-12 rounded border border-amber-400 bg-amber-50 px-1 text-center print:hidden"
                            />
                            <span className="hidden print:inline">{qtd(i)}</span>
                            {qtd(i) !== (i.quantidade ?? 0) && (
                              <span className="block text-[8px] text-stone-500">de {i.quantidade ?? 0}</span>
                            )}
                          </>
                        ) : (
                          (i.quantidade ?? "")
                        )}
                      </td>
                      <td className="border border-stone-400 px-1 font-mono">{i.mac}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.desenho}</td>
                      <td className="border border-stone-400 px-1 text-[9px]">{i.descricao}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.tipagem}</td>
                      <td className="border border-stone-400 px-1 font-mono">{formatarNumero(pesoEnvio(i), 2)}</td>
                      <td className="border border-stone-400 px-1 font-mono">
                        {i.coleta_data ? formatarDataBr(i.coleta_data) : (i.coleta ?? "")}
                      </td>
                      <td className="w-[20mm] border border-stone-400" />
                      <td className="w-[20mm] border border-stone-400" />
                      <td className="w-[24mm] border border-stone-400" />
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        )}
      </main>
    </div>
  );
}

export default function RelatorioAlivioTensao() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
