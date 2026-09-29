"use client";

// Relatório de coleta — pedido explícito do usuário: igual ao PDF que ele
// tirava da planilha ("Coleta para o dia 29.09"), com os pedidos de um
// cliente cuja COLETA é a data escolhida, agrupados por pintura igual
// (Plano + COR2 + COR-2). Folha A4 paisagem pra imprimir / salvar em PDF
// (Ctrl+P). Fica sob /follow-up, então a conta restrita também acessa.
// Parâmetros: ?data=AAAA-MM-DD&cliente=W1 (cliente vazio = todos).

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { listarFollowUp, urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { corGrupoPintura } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

const COLUNAS = ["Foto", "PO", "Prazo contratual", "Cliente", "Qtd", "MAC", "Desenho", "Descrição", "Coleta", "NF", "Tipagem"];

interface Grupo {
  chave: string;
  indice: number | null;
  cor2: string | null;
  cor_2: string | null;
  plano: string | null;
  itens: ItemFollowUp[];
}

function chavePintura(i: ItemFollowUp): string {
  return [i.plano_pintura, i.cor2, i.cor_2].map((v) => (v ?? "").replace(/\s+/g, " ").trim().toUpperCase()).join("|");
}

// Grupos com mais pedidos primeiro; dentro do grupo, pelo prazo.
function agrupar(itens: ItemFollowUp[]): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const i of itens) {
    const chave = chavePintura(i);
    let g = m.get(chave);
    if (!g) {
      g = { chave, indice: i.grupo_pintura, cor2: i.cor2, cor_2: i.cor_2, plano: i.plano_pintura, itens: [] };
      m.set(chave, g);
    }
    g.itens.push(i);
  }
  const grupos = [...m.values()];
  for (const g of grupos)
    g.itens.sort((a, b) => (a.prazo_contratual ?? "9999").localeCompare(b.prazo_contratual ?? "9999") || a.po.localeCompare(b.po));
  return grupos.sort((a, b) => b.itens.length - a.itens.length || a.chave.localeCompare(b.chave));
}

function Relatorio() {
  const params = useSearchParams();
  const data = params.get("data") ?? "";
  const cliente = params.get("cliente") ?? "";
  const [itens, setItens] = useState<ItemFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));

  useEffect(() => {
    document.title = `Coleta ${formatarDataBr(data)}${cliente ? ` - ${cliente}` : ""}`; // nome sugerido do PDF
    let ativo = true;
    listarFollowUp()
      .then((r) => {
        if (!ativo) return;
        // Todos os pedidos com essa coleta (mesmo os que já saíram da planilha / ST ≠ A).
        setItens(r.itens.filter((i) => i.coleta_data === data && (!cliente || i.cliente === cliente)));
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [data, cliente]);

  if (!data) return <p className="p-8 text-red-600">Informe a data da coleta.</p>;
  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens) return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  const grupos = agrupar(itens);
  const pecas = itens.reduce((s, i) => s + (i.quantidade ?? 0), 0);
  const peso = itens.reduce((s, i) => s + (i.peso_total ?? 0), 0);

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] justify-end gap-2 print:hidden">
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
              Coleta para o dia {formatarDataBr(data)}
              {cliente && <span className="font-normal text-stone-600"> — Cliente {cliente}</span>}
            </h1>
          </div>
          <div className="flex gap-5 text-right text-xs text-stone-500">
            <p>
              Pedidos <span className="block font-mono text-base font-bold text-stone-900">{itens.length}</span>
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
            Nenhum pedido{cliente ? ` do cliente ${cliente}` : ""} com coleta em {formatarDataBr(data)}.
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
              const cor = g.indice ? corGrupoPintura(g.indice) : "#d6d3d1";
              const fundo = `color-mix(in srgb, ${cor} 30%, white)`;
              return (
                <tbody key={g.chave}>
                  <tr className="break-after-avoid" style={{ backgroundColor: fundo }}>
                    <td colSpan={COLUNAS.length} className="border border-stone-400 px-2 py-1 text-[11px]">
                      <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ backgroundColor: cor }} />
                      <strong>Pintura:</strong> COR2 <strong>{g.cor2 || "—"}</strong> · COR-2 <strong>{g.cor_2 || "—"}</strong> ·
                      Plano <strong>{g.plano || "—"}</strong>
                      <span className="float-right text-stone-600">
                        {g.itens.length} pedido(s) · {formatarNumero(g.itens.reduce((s, i) => s + (i.quantidade ?? 0), 0), 0)} peça(s)
                      </span>
                    </td>
                  </tr>
                  {g.itens.map((i) => (
                    <tr key={i.id} className="break-inside-avoid text-center">
                      <td className="w-[22mm] border border-stone-400 p-0.5">
                        {i.imagens[0] && (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine
                          <img src={urlImagemFollowUp(i.imagens[0].sha256)} alt="" className="mx-auto h-[11mm] w-[20mm] object-contain" />
                        )}
                      </td>
                      <td className="border border-stone-400 px-1 font-mono text-[11px]">{i.po}</td>
                      <td className="border border-stone-400 px-1">{formatarDataBr(i.prazo_contratual)}</td>
                      <td className="border border-stone-400 px-1">{i.cliente}</td>
                      <td className="border border-stone-400 px-1">{i.quantidade ?? ""}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.mac}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.desenho}</td>
                      <td className="border border-stone-400 px-1 text-[9px]">{i.descricao}</td>
                      <td className="border border-stone-400 px-1 text-[9px]">{formatarDataBr(i.coleta_data)}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.nf}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.tipagem}</td>
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

export default function RelatorioColeta() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
