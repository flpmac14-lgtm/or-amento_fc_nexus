"use client";

// Romaneio — pedido do usuário (24/10/2026): parecido com o relatório de
// coleta, mas dos pedidos (PO) ou MACs escolhidos, com as notas fiscais
// vinculadas a cada item (vêm do Sectra, o ERP: /api/follow-up/notas-fiscais),
// a quantidade e o peso. Item fracionado em 2+ notas sai "1111/1112".
// Parâmetros: ?tipo=po|mac&valor=4501743280,690.25 (vários, o começo basta —
// igual ao Relatório por obra). A4 paisagem (@page coleta).

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { listarFollowUp, urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { itensDaObra, obraDoItem, type TipoObra } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

interface NotasFiscais {
  po: Record<string, [string, string, number?][]>; // "4501690746-010" → [[NF, emissão AAAA-MM-DD, qtde], …]
  nf: Record<string, string>; // NF → emissão
}
interface NotaItem {
  nf: string;
  emissao: string | null;
  qtde: number | null; // null = NF só do Follow up (sem a quantidade do Sectra)
}

const COLUNAS = ["Foto", "PO", "MAC", "Desenho", "Descrição", "Tipagem", "Qtd pedido", "NF", "Emissão", "Qtd NF", "Peso (kg)"];

// "4501690746-10" / "4501690746-010" → "4501690746-010" (mesma chave do ERP).
function chavePo(po: string): string {
  const s = po.replace(/\s+/g, "").toUpperCase();
  const m = /^(.*?)-0*(\d+)$/.exec(s);
  return m ? `${m[1]}-${m[2].padStart(3, "0")}` : s;
}

// Todas as NFs do item no Sectra; sem nenhuma lá, a NF anotada no Follow up.
function notasDoItem(i: ItemFollowUp, n: NotasFiscais): NotaItem[] {
  const doErp = n.po[chavePo(i.po)] ?? [];
  if (doErp.length) return doErp.map(([nf, emissao, qtde]) => ({ nf, emissao, qtde: qtde ?? null }));
  const doFollowUp = [...new Set((i.nf ?? "").split(/\.0\b|[^\d]+/).map((s) => s.replace(/^0+/, "")).filter(Boolean))];
  return doFollowUp.map((nf) => ({ nf, emissao: n.nf[nf] ?? null, qtde: null }));
}

// Quantidade faturada: soma das NFs do Sectra; NF só do Follow up = o pedido inteiro.
function qtdFaturada(i: ItemFollowUp, notas: NotaItem[]): number {
  if (!notas.length) return 0;
  if (notas.some((n) => n.qtde === null)) return i.quantidade ?? 0;
  return notas.reduce((s, n) => s + (n.qtde ?? 0), 0);
}

function pesoDe(i: ItemFollowUp, qtd: number): number {
  if (i.peso_unid) return i.peso_unid * qtd;
  return i.quantidade ? ((i.peso_total ?? 0) * qtd) / i.quantidade : 0;
}

function Relatorio() {
  const params = useSearchParams();
  const tipo: TipoObra = params.get("tipo") === "mac" ? "mac" : "po";
  const valores = useMemo(
    () => (params.get("valor") ?? "").split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean),
    [params],
  );
  const [itens, setItens] = useState<ItemFollowUp[] | null>(null);
  const [notas, setNotas] = useState<NotasFiscais | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));
  const [comSemNf, setComSemNf] = useState(false);

  useEffect(() => {
    document.title = `Romaneio ${valores.join(", ")}`; // nome sugerido do PDF
    let ativo = true;
    Promise.all([
      listarFollowUp(),
      fetch("/api/follow-up/notas-fiscais", { cache: "no-store" }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(`Não consegui buscar as notas fiscais: ${j.erro ?? `Erro ${r.status}`}`);
        return j.notas as NotasFiscais;
      }),
    ])
      .then(([r, n]) => {
        if (!ativo) return;
        const ids = new Set<string>();
        const achados: ItemFollowUp[] = [];
        for (const v of valores)
          for (const i of itensDaObra(r.itens, tipo, v))
            if (!ids.has(i.id)) {
              ids.add(i.id);
              achados.push(i);
            }
        setItens(achados);
        setNotas(n);
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [tipo, valores]);

  if (!valores.length) return <p className="p-8 text-red-600">Informe o PO ou a MAC.</p>;
  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens || !notas) return <p className="p-8 text-stone-500">Carregando romaneio… (o servidor pode levar até 1 minuto para acordar)</p>;

  const linhas = itens.map((i) => {
    const ns = notasDoItem(i, notas);
    const qtd = qtdFaturada(i, ns);
    return { i, ns, qtd, peso: pesoDe(i, qtd) };
  });
  const naFolha = comSemNf ? linhas : linhas.filter((l) => l.ns.length > 0);
  const semNf = linhas.length - linhas.filter((l) => l.ns.length > 0).length;
  // Agrupado pela obra (PO base ou MAC base), em sequência.
  const grupos = new Map<string, typeof naFolha>();
  for (const l of [...naFolha].sort((a, b) => a.i.po.localeCompare(b.i.po, "pt-BR", { numeric: true }))) {
    const g = obraDoItem(l.i, tipo) || "—";
    grupos.set(g, [...(grupos.get(g) ?? []), l]);
  }
  const ordemGrupos = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true }));
  const totalNfs = new Set(naFolha.flatMap((l) => l.ns.map((n) => n.nf))).size;
  const pecas = naFolha.reduce((s, l) => s + l.qtd, 0);
  const peso = naFolha.reduce((s, l) => s + l.peso, 0);

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] items-center justify-end gap-2 print:hidden">
        {semNf > 0 && (
          <button
            type="button"
            onClick={() => setComSemNf((v) => !v)}
            title="Mostrar também os itens que ainda não têm nota fiscal no Sectra"
            className={`mr-auto rounded-lg px-3 py-2 text-xs ${
              comSemNf
                ? "border border-amber-500 bg-amber-50 font-semibold text-amber-800"
                : "text-stone-500 hover:bg-stone-300/60 hover:text-stone-800"
            }`}
          >
            {comSemNf ? `✓ Com os ${semNf} item(ns) sem NF` : `Mostrar ${semNf} item(ns) sem NF`}
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
              Romaneio <span className="font-normal text-stone-600">— {tipo.toUpperCase()} {valores.join(", ")}</span>
            </h1>
          </div>
          <div className="flex gap-5 text-right text-xs text-stone-500">
            <p>
              Itens <span className="block font-mono text-base font-bold text-stone-900">{naFolha.length}</span>
            </p>
            <p>
              Notas <span className="block font-mono text-base font-bold text-stone-900">{totalNfs}</span>
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

        {naFolha.length === 0 ? (
          <p className="py-10 text-center text-stone-500">
            {itens.length === 0
              ? `Nenhum item com ${tipo.toUpperCase()} ${valores.join(", ")} no Follow up.`
              : `Nenhum dos ${itens.length} item(ns) tem nota fiscal no Sectra ainda.`}
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
            {ordemGrupos.map(([obra, doGrupo]) => (
              <tbody key={obra}>
                <tr className="break-after-avoid bg-green-50">
                  <td colSpan={COLUNAS.length} className="border border-stone-400 px-2 py-1 text-[11px]">
                    <strong>{tipo.toUpperCase()} {obra}</strong>
                    {doGrupo[0].i.cliente && <span className="text-stone-600"> · Cliente {doGrupo[0].i.cliente}</span>}
                    <span className="float-right text-stone-600">
                      {doGrupo.length} item(ns) · {formatarNumero(doGrupo.reduce((s, l) => s + l.qtd, 0), 0)} peça(s) ·{" "}
                      {formatarNumero(doGrupo.reduce((s, l) => s + l.peso, 0), 2)} kg
                    </span>
                  </td>
                </tr>
                {doGrupo.map(({ i, ns, qtd, peso: p }) => {
                  const parcial = ns.length > 0 && qtd !== (i.quantidade ?? 0);
                  return (
                    <tr key={i.id} className={`break-inside-avoid text-center ${ns.length ? "" : "text-stone-400"}`}>
                      <td className="w-[22mm] border border-stone-400 p-0.5">
                        {i.imagens[0] && (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine
                          <img src={urlImagemFollowUp(i.imagens[0].sha256)} alt="" className="mx-auto h-[11mm] w-[20mm] object-contain" />
                        )}
                      </td>
                      <td className="border border-stone-400 px-1 font-mono text-[11px]">{i.po}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.mac}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.desenho}</td>
                      <td className="border border-stone-400 px-1 text-[9px]">{i.descricao}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.tipagem}</td>
                      <td className="border border-stone-400 px-1">{i.quantidade ?? ""}</td>
                      <td className="border border-stone-400 px-1 font-mono text-[11px] font-semibold">
                        {ns.map((n) => n.nf).join("/") || "—"}
                      </td>
                      <td className="border border-stone-400 px-1">
                        {[...new Set(ns.map((n) => formatarDataBr(n.emissao)))].join("/") || "—"}
                      </td>
                      <td className="border border-stone-400 px-1">
                        {ns.length ? formatarNumero(qtd, 0) : "—"}
                        {ns.length > 1 && ns.every((n) => n.qtde !== null) && (
                          <span className="block text-[8px] text-stone-500">({ns.map((n) => formatarNumero(n.qtde ?? 0, 0)).join(" + ")})</span>
                        )}
                        {parcial && <span className="block text-[8px] text-amber-700">de {i.quantidade ?? 0}</span>}
                      </td>
                      <td className="border border-stone-400 px-1 font-mono">{ns.length ? formatarNumero(p, 2) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        )}
      </main>
    </div>
  );
}

export default function Romaneio() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando romaneio…</p>}>
      <Relatorio />
    </Suspense>
  );
}
