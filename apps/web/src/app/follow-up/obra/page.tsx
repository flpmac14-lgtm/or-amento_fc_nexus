"use client";

// Relatório por obra — pedido explícito do usuário: resumo estilo o card do
// item, de todos os itens de uma obra (por PO ou por MAC, ver itensDaObra),
// numa folha A4 pra imprimir / salvar em PDF (Ctrl+P). Fica sob /follow-up,
// então a conta restrita também acessa.
// Parâmetros: ?tipo=po|mac&valor=4501743280

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { listarFollowUp, urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { ETAPAS, ROTULO_PRAZO, itensDaObra, normalizarBusca, situacaoPrazo, type TipoObra } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

function v(valor: string | number | null | undefined): string {
  return valor === null || valor === undefined || valor === "" ? "—" : String(valor);
}

function pronto(i: ItemFollowUp): boolean {
  return normalizarBusca(i.status ?? "") === "pronto";
}

// Onde o item está sendo fabricado — pedido do usuário (08/10): segue a coluna
// Fornecedor / Terceirizado; vazio (ou "macfab") = Macfab, que somos nós.
const MACFAB = "Macfab";
function localFabricacao(i: ItemFollowUp): string {
  const f = (i.fornecedor ?? "").trim();
  return !f || normalizarBusca(f).startsWith("macfa") ? MACFAB : f; // "MACFA" digitado errado também
}

// Pontos de atenção do item (pedido do usuário): falta material — se é de um
// terceirizado, falta levar o material pra ele; e falta cortar (Corte < 100%).
function alertas(i: ItemFollowUp): string[] {
  if (pronto(i)) return [];
  const local = localFabricacao(i);
  const lista: string[] = [];
  if (i.falta_material) {
    lista.push(local === MACFAB ? "Falta material pra fabricar" : `Falta levar material pro terceirizado (${local})`);
  }
  if (i.cor !== 100) lista.push("Falta cortar");
  return lista;
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[8px] font-medium uppercase tracking-wide text-stone-500">{rotulo}</p>
      <p className="truncate text-[10px] font-semibold">{children}</p>
    </div>
  );
}

function CardItem({ i }: { i: ItemFollowUp }) {
  const sit = situacaoPrazo(i.prazo_contratual);
  const avisos = alertas(i);
  const local = localFabricacao(i);
  return (
    <article
      className={`flex break-inside-avoid gap-2 rounded border p-1.5 ${
        i.falta_material && !pronto(i) ? "border-red-500 bg-red-50" : "border-stone-300"
      }`}
    >
      <div className="flex h-[24mm] w-[30mm] shrink-0 items-center justify-center rounded border border-stone-200 bg-white">
        {i.imagens[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine
          <img src={urlImagemFollowUp(i.imagens[0].sha256)} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[9px] text-stone-400">sem foto</span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate">
            <span className="font-mono text-[12px] font-bold">{i.po}</span>
            <span className="ml-2 text-[10px] text-stone-700">{v(i.descricao)}</span>
          </p>
          <span className="ml-auto shrink-0 text-[9px] text-stone-600">
            Fabricação: <strong className={local === MACFAB ? "text-green-800" : "text-sky-800"}>{local}</strong>
          </span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${
              pronto(i) ? "bg-green-600 text-white" : "border border-stone-400 text-stone-800"
            }`}
          >
            {v(i.status)}
          </span>
        </div>
        <div className="grid grid-cols-6 gap-x-2">
          <Dado rotulo="MAC">{v(i.mac)}</Dado>
          <Dado rotulo="Desenho">{v(i.desenho)}</Dado>
          <Dado rotulo="Qtd / Peso">
            {v(i.quantidade)} · {i.peso_total !== null ? `${formatarNumero(i.peso_total, 1)} kg` : "—"}
          </Dado>
          <Dado rotulo="Prazo">
            <span className={sit === "atrasado" && !pronto(i) ? "text-red-700" : ""}>
              {i.prazo_contratual ? formatarDataBr(i.prazo_contratual) : "—"}
              {i.prazo_contratual && !pronto(i) && ` · ${ROTULO_PRAZO[sit]}`}
            </span>
          </Dado>
          <Dado rotulo="Coleta">{i.coleta_data ? formatarDataBr(i.coleta_data) : v(i.coleta)}</Dado>
          <Dado rotulo="NF">{v(i.nf)}</Dado>
        </div>
        {/* Etapas: mesma barra do card, em miniatura */}
        <div className="grid grid-cols-8 gap-1">
          {ETAPAS.map((e) => {
            const valor = i[e.campo] as number | null;
            const pct = Math.max(0, Math.min(100, valor ?? 0));
            return (
              <div key={e.campo}>
                <div className="flex justify-between text-[8px] text-stone-600">
                  <span className="font-semibold">{e.rotulo}</span>
                  <span className="font-mono">{valor === null ? "—" : `${formatarNumero(valor, 0)}%`}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded bg-stone-200">
                  <div className="h-full bg-[#63C384]" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="truncate text-[9px] text-stone-700">
          <span className="font-semibold">Pintura:</span> {v(i.cor2)} · {v(i.cor_2)} · {v(i.plano_pintura)}
        </p>
        {(avisos.length > 0 || i.obs_felipe_marcelo) && (
          <div className="flex flex-wrap items-center gap-1">
            {avisos.map((a) => (
              <span
                key={a}
                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                  a === "Falta cortar" ? "border border-orange-500 bg-orange-50 text-orange-800" : "bg-red-600 text-white"
                }`}
              >
                ⚠ {a}
              </span>
            ))}
            {i.obs_felipe_marcelo && (
              <span className="min-w-0 flex-1 rounded border-l-4 border-amber-500 bg-amber-50 px-1.5 py-0.5 text-[9px] text-stone-900">
                <strong>Obs.:</strong> {i.obs_felipe_marcelo}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// Gráfico de colunas: quantos itens estão sendo fabricados em cada lugar
// (Macfab primeiro, depois os terceirizados do maior pro menor).
function GraficoFabricacao({ itens }: { itens: ItemFollowUp[] }) {
  const grupos = new Map<string, { nome: string; itens: number; prontos: number; pecas: number }>();
  for (const i of itens) {
    const nome = localFabricacao(i);
    const chave = normalizarBusca(nome);
    const g = grupos.get(chave) ?? { nome, itens: 0, prontos: 0, pecas: 0 };
    g.itens++;
    if (pronto(i)) g.prontos++;
    g.pecas += i.quantidade ?? 0;
    grupos.set(chave, g);
  }
  const lista = [...grupos.values()].sort((a, b) =>
    a.nome === MACFAB ? -1 : b.nome === MACFAB ? 1 : b.itens - a.itens || a.nome.localeCompare(b.nome, "pt-BR"),
  );
  const max = Math.max(1, ...lista.map((g) => g.itens));
  return (
    <section className="break-inside-avoid rounded border border-stone-300 p-2">
      <h2 className="text-[10px] font-bold uppercase tracking-wide text-stone-700">Onde está sendo fabricado (nº de itens)</h2>
      <div className="mt-1 flex h-[30mm] items-end gap-3 border-b border-stone-400 px-1" role="img" aria-label="Itens por local de fabricação">
        {lista.map((g) => (
          <div
            key={g.nome}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            title={`${g.nome}: ${g.itens} item(ns), ${g.prontos} pronto(s), ${formatarNumero(g.pecas, 0)} peça(s)`}
          >
            <span className="text-[10px] font-bold text-stone-900">{g.itens}</span>
            <div
              className={`w-full max-w-[14mm] rounded-t ${g.nome === MACFAB ? "bg-green-700" : "bg-sky-700"}`}
              style={{ height: `${(g.itens / max) * 85}%`, minHeight: 2, printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-3 px-1 pt-0.5">
        {lista.map((g) => (
          <p key={g.nome} className="min-w-0 flex-1 text-center text-[8px] leading-tight text-stone-700">
            <span className="block truncate font-semibold text-stone-900" title={g.nome}>
              {g.nome}
            </span>
            {g.prontos}/{g.itens} prontos · {formatarNumero(g.pecas, 0)} pç
          </p>
        ))}
      </div>
    </section>
  );
}

// Destaques: falta material (Macfab ou levar pro terceirizado), falta cortar e observações.
function PontosAtencao({ itens }: { itens: ItemFollowUp[] }) {
  const comAviso = itens.map((i) => ({ i, avisos: alertas(i) })).filter((x) => x.avisos.length || x.i.obs_felipe_marcelo);
  if (!comAviso.length) return null;
  const abertos = itens.filter((i) => !pronto(i));
  const levar = abertos.filter((i) => i.falta_material && localFabricacao(i) !== MACFAB).length;
  const material = abertos.filter((i) => i.falta_material && localFabricacao(i) === MACFAB).length;
  const cortar = abertos.filter((i) => i.cor !== 100).length;
  const obs = itens.filter((i) => i.obs_felipe_marcelo).length;
  return (
    <section className="break-inside-avoid rounded border-2 border-red-500 p-2">
      <h2 className="text-[10px] font-bold uppercase tracking-wide text-red-700">⚠ Pontos de atenção</h2>
      <div className="mt-1 flex flex-wrap gap-2 text-[10px]">
        {levar > 0 && <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white">{levar} falta levar material pro terceirizado</span>}
        {material > 0 && <span className="rounded bg-red-600 px-1.5 py-0.5 font-bold text-white">{material} falta material na Macfab</span>}
        {cortar > 0 && (
          <span className="rounded border border-orange-500 bg-orange-50 px-1.5 py-0.5 font-bold text-orange-800">{cortar} falta cortar</span>
        )}
        {obs > 0 && <span className="rounded border border-amber-500 bg-amber-50 px-1.5 py-0.5 font-bold text-amber-900">{obs} com observação</span>}
      </div>
      <table className="mt-1 w-full text-[9px]">
        <thead>
          <tr className="border-b border-stone-300 text-left text-[8px] uppercase text-stone-500">
            <th className="py-0.5 pr-2">PO</th>
            <th className="pr-2">Descrição</th>
            <th className="pr-2">Fabricação</th>
            <th className="pr-2">Atenção</th>
            <th>Obs. Felipe / Marcelo</th>
          </tr>
        </thead>
        <tbody>
          {comAviso.map(({ i, avisos }) => (
            <tr key={i.id} className="border-b border-stone-100 align-top">
              <td className="whitespace-nowrap py-0.5 pr-2 font-mono font-semibold">{i.po}</td>
              <td className="max-w-[45mm] truncate pr-2">{v(i.descricao)}</td>
              <td className="pr-2 font-semibold">{localFabricacao(i)}</td>
              <td className="pr-2 font-bold text-red-700">{avisos.join(" · ") || "—"}</td>
              <td className={i.obs_felipe_marcelo ? "bg-amber-50 font-medium" : ""}>{i.obs_felipe_marcelo ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Relatorio() {
  const params = useSearchParams();
  const tipo: TipoObra = params.get("tipo") === "mac" ? "mac" : "po";
  const valor = params.get("valor") ?? "";
  const [itens, setItens] = useState<ItemFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));

  useEffect(() => {
    document.title = `Obra ${tipo.toUpperCase()} ${valor}`; // nome sugerido do PDF
    let ativo = true;
    listarFollowUp()
      .then((r) => {
        if (!ativo) return;
        const lista = itensDaObra(r.itens, tipo, valor);
        lista.sort((a, b) => a.po.localeCompare(b.po, "pt-BR", { numeric: true }));
        setItens(lista);
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [tipo, valor]);

  if (!valor) return <p className="p-8 text-red-600">Informe o PO ou a MAC da obra.</p>;
  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens) return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  const clientes = [...new Set(itens.map((i) => i.cliente).filter(Boolean))].join(", ");
  const pecas = itens.reduce((s, i) => s + (i.quantidade ?? 0), 0);
  const peso = itens.reduce((s, i) => s + (i.peso_total ?? 0), 0);
  const prontos = itens.filter(pronto).length;
  // Avanço = média de todas as etapas preenchidas de todos os itens.
  const etapas = itens.flatMap((i) => ETAPAS.map((e) => i[e.campo] as number | null)).filter((x): x is number => x !== null);
  const avanco = etapas.length ? etapas.reduce((s, x) => s + x, 0) / etapas.length : null;
  const prazos = itens.map((i) => i.prazo_contratual).filter((p): p is string => !!p).sort();

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 print:hidden">
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

      <main className="folha-obra mx-auto flex max-w-[210mm] flex-col gap-2 bg-white p-[10mm] text-stone-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between gap-4 border-b-4 border-green-700 pb-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-green-800">FC Nexus · Follow up de obras</p>
            <h1 className="text-xl font-bold">
              Obra — {tipo === "po" ? "PO" : "MAC"} <span className="font-mono">{valor}</span>
            </h1>
            <p className="text-xs text-stone-600">Cliente: {clientes || "—"}</p>
          </div>
          <p className="text-right text-[10px] text-stone-500">
            Gerado em
            <span className="block font-medium text-stone-700">{geradoEm}</span>
          </p>
        </header>

        <div className="grid grid-cols-5 gap-2">
          {[
            { r: "Itens", v: `${itens.length}` },
            { r: "Prontos", v: `${prontos} de ${itens.length}` },
            { r: "Peças / Peso", v: `${formatarNumero(pecas, 0)} · ${formatarNumero(peso, 1)} kg` },
            { r: "Avanço médio", v: avanco === null ? "—" : `${formatarNumero(avanco, 0)}%` },
            {
              r: "Prazos",
              v: prazos.length
                ? prazos[0] === prazos[prazos.length - 1]
                  ? formatarDataBr(prazos[0])
                  : `${formatarDataBr(prazos[0])} a ${formatarDataBr(prazos[prazos.length - 1])}`
                : "—",
            },
          ].map((k) => (
            <div key={k.r} className="rounded border border-stone-300 p-1.5">
              <p className="text-[8px] uppercase tracking-wide text-stone-500">{k.r}</p>
              <p className="text-[11px] font-bold">{k.v}</p>
            </div>
          ))}
        </div>

        {itens.length > 0 && <GraficoFabricacao itens={itens} />}
        {itens.length > 0 && <PontosAtencao itens={itens} />}

        {itens.length === 0 ? (
          <p className="py-10 text-center text-stone-500">Nenhum item com {tipo.toUpperCase()} começando em “{valor}”.</p>
        ) : (
          itens.map((i) => <CardItem key={i.id} i={i} />)
        )}
      </main>
    </div>
  );
}

export default function RelatorioObra() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
