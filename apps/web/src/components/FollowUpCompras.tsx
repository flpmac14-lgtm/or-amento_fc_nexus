"use client";

// Coluna "Compra / Retorno" do Follow up — pedido do usuário (24/10/2026): do
// Sectra (ERP), o pedido de compra vinculado ao item (serviço terceirizado), a
// nossa remessa e as notas de entrada (serviço / retorno) que o Financeiro já
// lançou. O vínculo é pelo nº do desenho escrito no ERP — ver
// services/calc_engine/scripts/sincronizar_financeiro.py::montar_compras.
// Dados em /api/follow-up/compras (migration 0058), atualizados a cada 15 min.

import { useEffect, useState } from "react";
import { formatarDataBr, formatarNumero } from "@/lib/format";

export interface PedidoCompra {
  pc: number;
  it: string; // item do pedido ("002")
  d: string | null;
  f: string; // fornecedor
  q: number;
  s: string; // status do item: A aberto, V confirmado, ? parcial, E encerrado, C cancelado
}
export interface RemessaCompra {
  nf: string; // nossa NF de remessa (saída)
  d: string | null;
  q: number;
}
export interface EntradaCompra {
  nf: string; // NF do fornecedor lançada na entrada
  d: string | null;
  f: string;
  q: number;
  t: "S" | "R"; // S = serviço, R = retorno do material (DEVOLUCAO DA NF…)
  pc: number[];
  rem?: string; // remessa que voltou
}
export interface ComprasItem {
  pc?: PedidoCompra[];
  rem?: RemessaCompra[];
  ent?: EntradaCompra[];
}
export type ComprasPorItem = Record<string, ComprasItem>;

const STATUS_PC: Record<string, { rotulo: string; classe: string }> = {
  A: { rotulo: "Aberto", classe: "text-amber-700 dark:text-amber-300" },
  V: { rotulo: "Confirmado", classe: "text-blue-700 dark:text-sky-300" },
  "?": { rotulo: "Entrega parcial", classe: "text-orange-700 dark:text-orange-300" },
  E: { rotulo: "Encerrado", classe: "text-green-700 dark:text-green-400" },
  C: { rotulo: "Cancelado", classe: "text-stone-400 line-through dark:text-slate-500" },
};

// Uma vez por tela (os dados só mudam a cada 15 min).
export function useComprasFollowUp(): ComprasPorItem {
  const [compras, setCompras] = useState<ComprasPorItem>({});
  useEffect(() => {
    let ativo = true;
    fetch("/api/follow-up/compras", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => ativo && j?.compras && setCompras(j.compras as ComprasPorItem))
      .catch(() => {}); // sem os dados a coluna só fica vazia
    return () => {
      ativo = false;
    };
  }, []);
  return compras;
}

const unicos = (lista: string[]) => [...new Set(lista)];
const pcsValidos = (c: ComprasItem) => (c.pc ?? []).filter((p) => p.s !== "C");

// NFs de entrada agrupadas por número (a mesma NF traz a linha de serviço e a de retorno).
function notasEntrada(c: ComprasItem): { nf: string; d: string | null; f: string; q: number; retorno: boolean }[] {
  const m = new Map<string, { nf: string; d: string | null; f: string; q: number; retorno: boolean; qs: number }>();
  for (const e of c.ent ?? []) {
    const n = m.get(e.nf) ?? { nf: e.nf, d: e.d, f: e.f, q: 0, qs: 0, retorno: false };
    if (e.t === "R") {
      n.q += e.q;
      n.retorno = true;
    } else n.qs += e.q;
    m.set(e.nf, n);
  }
  return [...m.values()].map((n) => ({ ...n, q: n.retorno ? n.q : n.qs }));
}

// Texto pra filtrar / ordenar a coluna ("PC 8688 USINA … NF 40828").
export function resumoCompra(c: ComprasItem | undefined): string {
  if (!c) return "";
  return [
    ...(c.pc ?? []).map((p) => `PC ${p.pc} ${p.f} ${STATUS_PC[p.s]?.rotulo ?? p.s}`),
    ...(c.rem ?? []).map((r) => `REM ${r.nf}`),
    ...(c.ent ?? []).map((e) => `NF ${e.nf} ${e.f}`),
    c.ent?.length ? "retornou" : c.pc?.length ? "aguardando" : "",
  ].join(" ");
}

function dica(c: ComprasItem): string {
  const linhas: string[] = [];
  for (const p of c.pc ?? [])
    linhas.push(`Pedido de compra ${p.pc} item ${p.it} — ${p.f} — ${formatarNumero(p.q, 0)} — ${formatarDataBr(p.d)} — ${STATUS_PC[p.s]?.rotulo ?? p.s}`);
  for (const r of c.rem ?? []) linhas.push(`Remessa NF ${r.nf} — ${formatarDataBr(r.d)} — ${formatarNumero(r.q, 0)} pç`);
  for (const n of notasEntrada(c))
    linhas.push(`Entrada NF ${n.nf} — ${n.f} — ${formatarDataBr(n.d)} — ${formatarNumero(n.q, 0)} ${n.retorno ? "pç retornadas" : "(serviço)"}`);
  return linhas.join("\n");
}

// Célula da tabela: linha 1 = pedidos de compra; linha 2 = NFs de entrada (ou "aguardando").
export function CelulaCompra({ compras }: { compras: ComprasItem | undefined }) {
  if (!compras || (!compras.pc?.length && !compras.ent?.length))
    return <span className="text-xs text-stone-300 dark:text-slate-600">—</span>;
  const notas = notasEntrada(compras);
  const pcs = compras.pc ?? [];
  return (
    <span className="block whitespace-nowrap text-[11px] leading-tight" title={dica(compras)}>
      {pcs.length > 0 && (
        <span className="block font-mono">
          PC{" "}
          {unicos(pcs.map((p) => `${p.pc}|${p.s}`)).map((chave, n) => {
            const [pc, s] = chave.split("|");
            return (
              <span key={chave} className={`font-semibold ${STATUS_PC[s]?.classe ?? ""}`}>
                {n > 0 && <span className="font-normal text-stone-400">/</span>}
                {pc}
              </span>
            );
          })}
        </span>
      )}
      {notas.length > 0 ? (
        <span className="block font-mono text-green-700 dark:text-green-400">
          ↩ NF {notas.map((n) => n.nf).join("/")}{" "}
          <span className="text-stone-500 dark:text-slate-400">{formatarDataBr(notas[notas.length - 1].d).slice(0, 5)}</span>
        </span>
      ) : (
        pcsValidos(compras).length > 0 && <span className="block text-amber-700 dark:text-amber-300">aguardando retorno</span>
      )}
    </span>
  );
}

// Quadro no card do item (FollowUpDetalhe).
export function QuadroCompras({ compras }: { compras: ComprasItem | undefined }) {
  const th = "px-2 py-1 text-left font-semibold";
  const td = "border-t border-stone-100 px-2 py-1 dark:border-slate-800";
  if (!compras)
    return (
      <p className="text-xs text-stone-500 dark:text-slate-400">
        Nenhum pedido de compra nem nota de entrada no Sectra com o desenho deste item.
      </p>
    );
  const notas = notasEntrada(compras);
  return (
    <div className="flex flex-col gap-3 text-xs">
      {!!compras.pc?.length && (
        <table className="w-full">
          <thead className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-slate-500">
            <tr>
              <th className={th}>Pedido de compra</th>
              <th className={th}>Data</th>
              <th className={th}>Fornecedor</th>
              <th className={th}>Qtd</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {compras.pc.map((p) => (
              <tr key={`${p.pc}-${p.it}`}>
                <td className={`${td} font-mono font-semibold`}>
                  {p.pc} <span className="font-normal text-stone-400">it. {p.it}</span>
                </td>
                <td className={td}>{formatarDataBr(p.d)}</td>
                <td className={td}>{p.f}</td>
                <td className={td}>{formatarNumero(p.q, 0)}</td>
                <td className={`${td} font-semibold ${STATUS_PC[p.s]?.classe ?? ""}`}>{STATUS_PC[p.s]?.rotulo ?? p.s}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!!compras.rem?.length && (
        <p>
          <span className="font-semibold">Remessa (nossa NF):</span>{" "}
          {compras.rem.map((r) => `NF ${r.nf} de ${formatarDataBr(r.d)} (${formatarNumero(r.q, 0)} pç)`).join(" · ")}
        </p>
      )}
      {notas.length > 0 ? (
        <table className="w-full">
          <thead className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-slate-500">
            <tr>
              <th className={th}>NF de entrada</th>
              <th className={th}>Entrada</th>
              <th className={th}>Fornecedor</th>
              <th className={th}>Qtd</th>
              <th className={th}>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {notas.map((n) => (
              <tr key={n.nf}>
                <td className={`${td} font-mono font-semibold text-green-700 dark:text-green-400`}>{n.nf}</td>
                <td className={td}>{formatarDataBr(n.d)}</td>
                <td className={td}>{n.f}</td>
                <td className={td}>{formatarNumero(n.q, 0)}</td>
                <td className={td}>{n.retorno ? "Retorno do material" : "Serviço"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="font-semibold text-amber-700 dark:text-amber-300">Nenhuma nota de entrada ainda — aguardando retorno.</p>
      )}
      <p className="text-[10px] text-stone-400 dark:text-slate-500">
        Do Sectra, pelo nº do desenho escrito no pedido / nota (atualiza a cada 15 min). A quantidade é a do pedido de compra
        inteiro, que pode juntar vários POs do mesmo desenho.
      </p>
    </div>
  );
}
