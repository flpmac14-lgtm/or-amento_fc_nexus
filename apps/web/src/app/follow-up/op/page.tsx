"use client";

// Impressão da Ordem de Produção (A4) — pedido do usuário (07/11/2026): no
// mesmo formato da OP do Sectra (cabeçalho, roteiro com código de barras por
// etapa), mais um quadro pra anotação manual. O código de barras de cada etapa
// ("OP12-30") é lido pelo leitor do totem e abre a etapa direto.
// Parâmetro: ?id=<id da OP>. Vem da aba Ordens de produção.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CodigoBarras } from "@/components/ProducaoComum";
import { codigoEtapa, fmtData, fmtHoras, fmtQtd, horasPrevistas, numeroOP, ROTULO_PRIORIDADE, ROTULO_STATUS_OP, type OP } from "@/lib/producao";

function Folha() {
  const id = useSearchParams().get("id") ?? "";
  const [op, setOp] = useState<OP | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch(`/api/follow-up/producao?tipo=op&id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
        setOp(j.op);
      })
      .catch((e: Error) => setErro(e.message));
  }, [id]);

  useEffect(() => {
    if (op) document.title = `${numeroOP(op.numero)} - ${op.descricao ?? ""}`;
  }, [op]);

  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!op) return <p className="p-8 text-stone-500">Carregando…</p>;
  const total = op.etapas.reduce((s, e) => s + horasPrevistas(e, op.quantidade), 0);
  const cel = "border border-stone-400 px-1.5 py-1";
  const rot = "block text-[8px] font-bold uppercase tracking-wide text-stone-500";

  return (
    <div data-sem-botao-tema className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-3 print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-600">
          🖨️ Imprimir / Salvar PDF
        </button>
      </div>
      <main className="mx-auto flex max-w-[210mm] flex-col gap-2 bg-white p-[10mm] text-[10px] text-stone-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {/* Cabeçalho */}
        <div className="flex items-center gap-3 border-b-2 border-stone-800 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/macfab-logo.png" alt="MACFAB" className="h-10 w-auto" />
          <div className="flex-1">
            <p className="text-base font-black">ORDEM DE PRODUÇÃO</p>
            <p className="text-[9px] text-stone-500">MACFAB · emitida pelo FC Nexus em {new Date().toLocaleString("pt-BR")}</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-2xl font-black">{numeroOP(op.numero)}</p>
            <p className="text-[9px]">{ROTULO_STATUS_OP[op.status]} · Prioridade {ROTULO_PRIORIDADE[op.prioridade]}</p>
          </div>
        </div>

        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={cel}><span className={rot}>Cliente</span>{op.cliente ?? "—"}</td>
              <td className={cel}><span className={rot}>Pedido (PO)</span><span className="font-mono">{op.po ?? "—"}</span></td>
              <td className={cel}><span className={rot}>MAC / Obra</span>{op.mac ?? "—"}</td>
              <td className={cel}><span className={rot}>Desenho</span><span className="font-mono">{op.desenho ?? "—"}</span></td>
            </tr>
            <tr>
              <td className={cel} colSpan={2}><span className={rot}>Descrição</span><b className="text-[11px]">{op.descricao}</b></td>
              <td className={cel}><span className={rot}>Quantidade</span><b className="text-[13px]">{fmtQtd(op.quantidade)} pç</b></td>
              <td className={cel}><span className={rot}>Prazo de entrega</span><b className="text-[13px]">{fmtData(op.prazo)}</b></td>
            </tr>
            {op.observacao && (
              <tr>
                <td className={cel} colSpan={4}><span className={rot}>Observação do PCP</span>{op.observacao}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Roteiro */}
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-stone-100" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
              <th className={`${cel} w-8`}>Nº</th>
              <th className={`${cel} w-20`}>Máq./Centro</th>
              <th className={cel}>Operação / Descrição</th>
              <th className={`${cel} w-12`}>Prep.</th>
              <th className={`${cel} w-12`}>Unit.</th>
              <th className={`${cel} w-12`}>Total</th>
              <th className={`${cel} w-28`}>Operador / Data</th>
              <th className={`${cel} w-[34mm]`}>Código de barras</th>
            </tr>
          </thead>
          <tbody>
            {op.etapas.map((e) => (
              <tr key={e.id} className="break-inside-avoid">
                <td className={`${cel} text-center font-mono font-bold`}>{e.posicao}</td>
                <td className={`${cel} text-center`}><b className="font-mono">{e.centro}</b><span className="block text-[8px] text-stone-500">{e.centro_desc}</span></td>
                <td className={cel}><b>{e.operacao_desc}</b>{e.descricao && <span className="block text-[9px] text-stone-600">{e.descricao}</span>}</td>
                <td className={`${cel} text-center`}>{fmtHoras(e.hr_preparo)}</td>
                <td className={`${cel} text-center`}>{fmtHoras(e.hr_unitario)}</td>
                <td className={`${cel} text-center font-semibold`}>{fmtHoras(horasPrevistas(e, op.quantidade))}</td>
                <td className={cel} />
                <td className={`${cel} py-1.5`}>
                  <CodigoBarras valor={codigoEtapa(op.numero, e.posicao)} altura={26} modulo={0.9} />
                </td>
              </tr>
            ))}
            <tr>
              <td className={`${cel} text-right font-bold`} colSpan={5}>Total previsto</td>
              <td className={`${cel} text-center font-bold`}>{fmtHoras(total)}</td>
              <td className={cel} colSpan={2} />
            </tr>
          </tbody>
        </table>

        <div className="mt-1 grid grid-cols-3 gap-3">
          <div className="col-span-2 rounded border border-stone-400 p-1.5">
            <span className={rot}>Anotações da fábrica (não conformidade, refugo, medidas)</span>
            <div className="h-16" />
          </div>
          <div className="flex flex-col gap-3 rounded border border-stone-400 p-1.5">
            <span className={rot}>Liberação final / Inspeção</span>
            <div className="mt-auto border-t border-stone-500 pt-0.5 text-center text-[8px]">Assinatura · Data</div>
          </div>
        </div>
        <p className="text-[8px] text-stone-500">
          Aponte cada etapa no totem: digite seu crachá → bipe o código de barras da etapa → Preparação ou Produção. Ao terminar: Finalizar e informe as peças boas.
          {op.roteiro_origem && ` · Roteiro: ${op.roteiro_origem}`}
        </p>
      </main>
    </div>
  );
}

export default function PaginaOP() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando…</p>}>
      <Folha />
    </Suspense>
  );
}
