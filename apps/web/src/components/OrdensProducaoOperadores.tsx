"use client";

// Operadores (crachás) — sub-aba de Ordens de produção, pedido do usuário
// (07/11/2026): ver os funcionários cadastrados no Sectra com o nº do crachá
// que digitam no totem, quem está apontando agora, e imprimir a lista (pra
// deixar ao lado do totem) ou cartõezinhos com código de barras do crachá.

import { useState } from "react";
import { classeBotao, classeCampo, classeCartao, CodigoBarras } from "@/components/ProducaoComum";
import { baixarPdf, gerarPdfCartoesCracha } from "@/lib/cartoesCrachaPdf";
import { minutosUteis } from "@/lib/jornada";
import { fmtDataHora, fmtMin, numeroOP, type Apontamento, type Cadastros, type OP } from "@/lib/producao";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export default function OrdensProducaoOperadores({
  cad,
  ops,
  abertos,
  agora,
}: {
  cad: Cadastros;
  ops: OP[];
  abertos: Apontamento[];
  agora: Date;
}) {
  const [busca, setBusca] = useState("");
  const [modo, setModo] = useState<"lista" | "cartoes">("lista");
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [erroPdf, setErroPdf] = useState("");
  const abertoDe = new Map(abertos.map((a) => [a.operador_codigo, a]));
  const opDe = new Map(ops.map((o) => [o.id, o]));
  const centroDesc = (c: string | null) => cad.centros.find((x) => x.codigo === c)?.descricao ?? null;
  const t = busca.trim().toUpperCase();
  const lista = cad.operadores
    .filter((o) => !t || [o.nome, o.apelido, o.cracha, String(o.codigo)].some((v) => v.toUpperCase().includes(t)))
    .sort((a, b) => Number(a.cracha) - Number(b.cracha) || a.nome.localeCompare(b.nome));

  // PDF só com os cartões (85,6 × 54 mm, um por página) pra gráfica — pedido do usuário (13/11/2026).
  // Vão os da lista filtrada, menos os inativos no Sectra.
  async function gerarPdf() {
    setGerandoPdf(true);
    setErroPdf("");
    try {
      const bytes = await gerarPdfCartoesCracha(lista.filter((o) => o.ativo));
      baixarPdf(bytes, "Cartoes cracha MACFAB.pdf");
    } catch (e) {
      setErroPdf(e instanceof Error ? e.message : "Não consegui gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  }

  function imprimirLista() {
    const w = window.open("", "_blank");
    if (!w) return;
    const linhas = lista
      .map(
        (o) =>
          `<tr><td class="c">${esc(o.cracha)}</td><td>${esc(o.nome)}</td><td>${esc(o.apelido)}</td><td class="m">${o.codigo}</td><td class="m">${o.ativo ? "" : "inativo"}</td></tr>`,
      )
      .join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Crachás dos operadores</title>
<style>body{font-family:Arial,sans-serif;margin:0;color:#111}h1{font-size:18px;margin:0}p{font-size:11px;color:#555;margin:2px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid #999;padding:5px 8px;text-align:left}th{background:#eee}
td.c{font-size:20px;font-weight:bold;text-align:center;width:80px;font-family:monospace}td.m{color:#666;width:70px}@page{size:A4;margin:10mm}</style></head>
<body><h1>Apontamento de produção — nº do crachá</h1><p>Digite o nº do crachá no totem. Lista do Sectra em ${new Date().toLocaleString("pt-BR")} · ${lista.length} operadores</p>
<table><thead><tr><th>Crachá</th><th>Nome</th><th>Apelido</th><th>Cód. Sectra</th><th></th></tr></thead><tbody>${linhas}</tbody></table>
<script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <input className={`${classeCampo} max-w-xs`} placeholder="Buscar nome, apelido ou nº…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="flex overflow-hidden rounded-lg border border-stone-300 text-sm dark:border-slate-700">
          {(["lista", "cartoes"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModo(m)}
              className={`px-3 py-1.5 ${modo === m ? "bg-stone-800 text-white dark:bg-cyan-600" : "bg-white text-stone-600 dark:bg-slate-900 dark:text-slate-300"}`}
            >
              {m === "lista" ? "Lista" : "Cartões com código de barras"}
            </button>
          ))}
        </div>
        <button type="button" className={classeBotao} onClick={modo === "lista" ? imprimirLista : () => window.print()}>
          🖨️ Imprimir {modo === "lista" ? "lista" : "cartões"}
        </button>
        {modo === "cartoes" && (
          <button
            type="button"
            className={classeBotao}
            onClick={gerarPdf}
            disabled={gerandoPdf || !lista.some((o) => o.ativo)}
            title="PDF só com os cartões, tamanho padrão de cartão (85,6 × 54 mm), um por página — pra mandar pra gráfica"
          >
            📄 {gerandoPdf ? "Gerando PDF…" : `PDF pra gráfica (${lista.filter((o) => o.ativo).length})`}
          </button>
        )}
        {erroPdf && <span className="text-xs text-red-600">{erroPdf}</span>}
        <span className="ml-auto text-xs text-stone-500">
          {lista.length} operador(es) do Sectra · atualizado {cad.gerado_em ? fmtDataHora(cad.gerado_em) : "—"} · no totem o operador digita o <b>nº do crachá</b>
        </span>
      </div>

      {modo === "lista" ? (
        <div className={`${classeCartao} overflow-x-auto`}>
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 text-center">Crachá</th>
                <th className="px-2 py-2">Nome</th>
                <th className="px-2 py-2">Apelido</th>
                <th className="px-2 py-2">Cód. Sectra</th>
                <th className="px-2 py-2">Setor (Sectra)</th>
                <th className="px-2 py-2">Agora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
              {lista.map((o) => {
                const a = abertoDe.get(o.codigo);
                const op = a?.op_id ? opDe.get(a.op_id) : null;
                const et = a?.etapa_id ? op?.etapas.find((e) => e.id === a.etapa_id) : null;
                return (
                  <tr key={o.codigo} className={o.ativo ? "" : "opacity-50"}>
                    <td className="px-3 py-1.5 text-center">
                      <span className="inline-block min-w-[3.5rem] rounded-lg bg-stone-800 px-2 py-1 font-mono text-lg font-bold text-white dark:bg-cyan-600">{o.cracha}</span>
                    </td>
                    <td className="px-2 py-1.5 font-medium text-stone-800 dark:text-slate-100">
                      {o.nome}
                      {!o.ativo && <span className="ml-2 text-xs text-red-600">inativo no Sectra</span>}
                    </td>
                    <td className="px-2 py-1.5">{o.apelido}</td>
                    <td className="px-2 py-1.5 font-mono text-stone-500">{o.codigo}</td>
                    <td className="px-2 py-1.5 text-xs text-stone-500">{o.centro ? `${o.centro} · ${centroDesc(o.centro) ?? ""}` : "—"}</td>
                    <td className="px-2 py-1.5 text-xs">
                      {a ? (
                        <span className={a.tipo === "parada" ? "font-semibold text-red-600" : "font-semibold text-emerald-600 dark:text-emerald-400"}>
                          ● {a.tipo === "parada" ? `Parada: ${a.motivo}` : `${op ? numeroOP(op.numero) : "OP"} · ${et?.posicao ?? ""} ${et?.operacao_desc ?? ""}`} (
                          {fmtMin(minutosUteis(a.inicio, agora))})
                        </span>
                      ) : (
                        <span className="text-stone-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 print:grid-cols-3">
          {lista.map((o) => (
            <div key={o.codigo} className="flex break-inside-avoid flex-col items-center gap-1 rounded-xl border-2 border-dashed border-stone-300 bg-white p-3 text-center text-stone-900">
              {/* Logo da Macfab no cartão — pedido do usuário (13/11/2026). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/macfab-logo-alta.png" alt="MACFAB" className="h-7 w-auto" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-500">Apontamento</p>
              <p className="font-mono text-4xl font-black">{o.cracha}</p>
              <p className="text-sm font-bold leading-tight">{o.apelido}</p>
              <p className="line-clamp-1 text-[10px] text-stone-500">{o.nome}</p>
              <CodigoBarras valor={o.cracha} altura={30} modulo={1.6} comTexto={false} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
