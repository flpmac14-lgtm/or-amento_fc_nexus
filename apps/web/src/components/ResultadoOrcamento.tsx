"use client";

import { useState } from "react";
import type { RespostaOrcamentoDePdf } from "@/lib/types";
import {
  corConfianca,
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
  NOMES_PROCESSO,
} from "@/lib/format";

function Confianca({ valor }: { valor: number }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${corConfianca(valor)}`}
    >
      {valor > 0 ? `${Math.round(valor * 100)}%` : "não identificado"}
    </span>
  );
}

function CampoIdentificado({
  rotulo,
  campo,
}: {
  rotulo: string;
  campo: { valor: unknown; confianca: number };
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-800 py-2 text-sm last:border-0">
      <span className="text-slate-400">{rotulo}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-100">
          {campo.valor !== null && campo.valor !== undefined && campo.valor !== ""
            ? String(campo.valor)
            : "—"}
        </span>
        <Confianca valor={campo.confianca} />
      </div>
    </div>
  );
}

function LinhaDeCusto({ linha }: { linha: RespostaOrcamentoDePdf["orcamento"]["linhas"][number] }) {
  const [aberta, setAberta] = useState(false);
  return (
    <div className="border-b border-slate-800 last:border-0">
      <button
        type="button"
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-3 text-left"
      >
        <div>
          <p className="font-medium text-slate-100">
            {NOMES_PROCESSO[linha.codigo] ?? linha.descricao}
          </p>
          {linha.horas !== null && (
            <p className="text-xs text-slate-500">{formatarNumero(linha.horas)} h</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-slate-100">
            {formatarMoeda(linha.valor_liquido)}
          </span>
          <span className="text-xs text-cyan-400">{aberta ? "▲" : "▼"} Ver cálculo</span>
        </div>
      </button>
      {aberta && (
        <div className="mb-3 rounded-md border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
          <ul className="list-inside list-disc space-y-1">
            {linha.memoria_calculo.map((m, i) => (
              <li key={i} className="font-mono">{m}</li>
            ))}
          </ul>
          {(linha.aliquota_icms > 0 || linha.aliquota_pis_cofins > 0) && (
            <p className="mt-2">
              Bruto {formatarMoeda(linha.valor_bruto)} − ICMS{" "}
              {formatarPercentual(linha.aliquota_icms)} − PIS/COFINS{" "}
              {formatarPercentual(linha.aliquota_pis_cofins)} = líquido{" "}
              {formatarMoeda(linha.valor_liquido)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResultadoOrcamento({ resultado }: { resultado: RespostaOrcamentoDePdf }) {
  const { extracao, itens_para_revisao, orcamento } = resultado;
  const id = extracao.identificacao;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-white">Identificação</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Confiança geral</span>
            <Confianca valor={extracao.confianca_geral} />
          </div>
        </div>
        <CampoIdentificado rotulo="Cliente" campo={id.cliente} />
        <CampoIdentificado rotulo="Número do desenho" campo={id.numero_desenho} />
        <CampoIdentificado rotulo="Revisão" campo={id.revisao} />
        <CampoIdentificado rotulo="Código do equipamento" campo={id.codigo_equipamento} />
        <CampoIdentificado rotulo="Pedido/PO" campo={id.pedido_po} />
        <p className="mt-3 text-xs text-slate-500">
          {extracao.paginas_total} página(s) — {extracao.paginas_com_texto_nativo} com texto
          nativo, {extracao.paginas_via_ocr} via OCR · {extracao.bom_itens_extraidos} item(ns) de
          BOM extraído(s)
        </p>
      </section>

      {itens_para_revisao.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
          <h2 className="mb-2 font-semibold text-amber-300">
            Itens para revisão ({itens_para_revisao.length})
          </h2>
          <ul className="space-y-1 text-sm text-amber-200/90">
            {itens_para_revisao.map((item, i) => (
              <li key={i}>
                {item.item_numero && <span className="font-medium">Item {item.item_numero}: </span>}
                {item.motivo}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-5">
        <h2 className="mb-2 font-semibold text-white">
          Custo por processo
        </h2>
        <div>
          {orcamento.linhas.map((linha) => (
            <LinhaDeCusto key={linha.codigo} linha={linha} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border-2 border-cyan-500/40 bg-slate-900/60 p-5 shadow-[0_0_40px_-15px_rgba(34,211,238,0.4)]">
        <h2 className="mb-4 font-semibold text-white">Resumo comercial</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Peso líquido</dt>
            <dd className="font-medium text-slate-100">{formatarNumero(orcamento.comercial.peso_liquido_kg)} kg</dd>
          </div>
          <div>
            <dt className="text-slate-500">Custo industrial</dt>
            <dd className="font-medium text-slate-100">{formatarMoeda(orcamento.comercial.custo_industrial)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Margem</dt>
            <dd className="font-medium text-slate-100">
              {formatarMoeda(orcamento.comercial.margem_lucro)} (
              {formatarPercentual(orcamento.comercial.margem_percentual)})
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Impostos</dt>
            <dd className="font-medium text-slate-100">{formatarMoeda(orcamento.comercial.imposto_a_pagar)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Venda (s/ impostos)</dt>
            <dd className="font-medium text-slate-100">
              {formatarMoeda(orcamento.comercial.preco_venda_sem_impostos)}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-slate-500">R$/kg</dt>
            <dd className="font-medium text-slate-100">{formatarMoeda(orcamento.comercial.preco_venda_por_kg)}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t border-slate-800 pt-4">
          <span className="text-slate-400">Preço de venda (c/ impostos)</span>
          <span className="text-2xl font-bold text-cyan-400">
            {formatarMoeda(orcamento.comercial.preco_venda_com_impostos)}
          </span>
        </div>
      </section>
    </div>
  );
}
