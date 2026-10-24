"use client";

// Coluna "Compra / Retorno" do Follow up — pedido do usuário (24/10/2026): do
// Sectra (ERP), o pedido de compra vinculado ao item (serviço terceirizado), a
// nossa remessa e as notas de entrada (cobrança do serviço) que o Financeiro já
// lançou. O vínculo é pelo nº do desenho escrito no ERP — ver
// services/calc_engine/scripts/sincronizar_financeiro.py::montar_compras.
// Dados em /api/follow-up/compras (migration 0058), atualizados a cada 15 min.

import { useEffect, useState } from "react";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { normalizarBusca } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

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
  nf: string; // NF do fornecedor lançada na entrada (só a que cobra o serviço)
  d: string | null;
  f: string;
  q: number; // peças do desenho na NF
  t: "S" | "R";
  pc: number[];
}
export interface ComprasItem {
  pc?: PedidoCompra[];
  rem?: RemessaCompra[];
  ent?: EntradaCompra[];
}
export type ComprasPorItem = Record<string, ComprasItem>;

// Compra do Valdir pra MAC (solicitação de compra → pedido vinculado) — pedido
// do usuário (24/10/2026). Material da obra, vale pra todos os itens da MAC.
export interface CompraValdir {
  rq: number; // solicitação de compra (CO_REQUISICAO)
  d: string | null; // data/hora da solicitação
  m: string; // material
  q: number;
  u: string;
  pc: number; // pedido de compra vinculado
  dp: string | null;
  f: string;
  s: string; // status do item do pedido (STATUS_PC)
  nf: [string, string][]; // NFs de entrada do pedido [nº, dia]
}
export type ComprasPorMac = Record<string, CompraValdir[]>; // "723.26" → mais recente primeiro

// "723.26.10" / "0723.26" → "723.26" (igual ao _obra do sincronismo).
export function macBase(mac: string | null): string {
  const m = /(\d{3,4})\.(\d{2})/.exec(mac ?? "");
  return m ? `${Number(m[1])}.${m[2]}` : "";
}

// NF de entrada com a parte dela que ficou pra este item (ver distribuirCompras).
export interface NotaAlocada {
  nf: string;
  d: string | null;
  f: string;
  q: number; // peças desta NF que ficaram pra este PO
  total: number; // peças do desenho na NF
}
export interface CompraDoItem {
  c: ComprasItem;
  notas: NotaAlocada[];
  falta: number; // peças do PO que ainda não voltaram (0 = completo)
  grupo: { po: string; qtd: number; notas: string[] }[]; // POs do mesmo desenho/MAC e o que coube pra cada um
  valdir: CompraValdir[]; // compras do Valdir pra MAC do item, a última lançada primeiro
}

const STATUS_PC: Record<string, { rotulo: string; classe: string }> = {
  A: { rotulo: "Aberto", classe: "text-amber-700 dark:text-amber-300" },
  V: { rotulo: "Confirmado", classe: "text-blue-700 dark:text-sky-300" },
  "?": { rotulo: "Entrega parcial", classe: "text-orange-700 dark:text-orange-300" },
  E: { rotulo: "Encerrado", classe: "text-green-700 dark:text-green-400" },
  C: { rotulo: "Cancelado", classe: "text-stone-400 line-through dark:text-slate-500" },
};

// Uma vez por tela (os dados só mudam a cada 15 min).
export function useComprasFollowUp(): { itens: ComprasPorItem; macs: ComprasPorMac } {
  const [compras, setCompras] = useState<{ itens: ComprasPorItem; macs: ComprasPorMac }>({ itens: {}, macs: {} });
  useEffect(() => {
    let ativo = true;
    fetch("/api/follow-up/compras", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => ativo && j?.compras && setCompras({ itens: j.compras as ComprasPorItem, macs: (j.macs ?? {}) as ComprasPorMac }))
      .catch(() => {}); // sem os dados a coluna só fica vazia
    return () => {
      ativo = false;
    };
  }, []);
  return compras;
}

const unicos = (lista: string[]) => [...new Set(lista)];
const pcsValidos = (c: ComprasItem) => (c.pc ?? []).filter((p) => p.s !== "C");

// NFs de entrada somadas por número (a mesma NF pode ter 2+ linhas do desenho), em ordem de entrada.
function notasEntrada(c: ComprasItem): { nf: string; d: string | null; f: string; q: number }[] {
  const m = new Map<string, { nf: string; d: string | null; f: string; q: number }>();
  for (const e of c.ent ?? []) {
    const n = m.get(e.nf) ?? { nf: e.nf, d: e.d, f: e.f, q: 0 };
    n.q += e.q;
    m.set(e.nf, n);
  }
  return [...m.values()].sort((a, b) => (a.d ?? "").localeCompare(b.d ?? "") || a.nf.localeCompare(b.nf, "pt-BR", { numeric: true }));
}

// Distribui as peças de cada NF entre os POs do mesmo desenho e MAC — pedido
// do usuário (24/10/2026): a 40718 trouxe 3 peças do 11500057900 e são 4 POs
// de 1 peça; o que não coube fica sem NF ("aguardando retorno") até a próxima
// nota. Primeiro os marcados com M.Chegou, depois os encerrados (ST ≠ A),
// depois em ordem de PO; as NFs em ordem de entrada.
export function distribuirCompras(
  itens: ItemFollowUp[],
  compras: ComprasPorItem,
  macs: ComprasPorMac,
): Record<string, CompraDoItem> {
  const grupos = new Map<string, ItemFollowUp[]>();
  const saida: Record<string, CompraDoItem> = {};
  for (const i of itens) {
    if (!compras[i.id]) {
      // Sem compra pelo desenho: só as do Valdir pra MAC (se tiver).
      const valdir = macs[macBase(i.mac)];
      if (valdir?.length) saida[i.id] = { c: {}, notas: [], falta: 0, grupo: [], valdir };
      continue;
    }
    const chave = `${normalizarBusca(i.desenho ?? "")}|${macBase(i.mac)}`;
    grupos.set(chave, [...(grupos.get(chave) ?? []), i]);
  }
  for (const doGrupo of grupos.values()) {
    doGrupo.sort(
      (a, b) =>
        Number(!!b.material_chegou) - Number(!!a.material_chegou) ||
        Number(a.st === "A") - Number(b.st === "A") ||
        a.po.localeCompare(b.po, "pt-BR", { numeric: true }),
    );
    // Os itens do grupo acham as mesmas NFs (mesmo desenho e MAC).
    const estoque = notasEntrada(compras[doGrupo[0].id]).map((n) => ({ ...n, resta: n.q }));
    for (const i of doGrupo) {
      let precisa = i.quantidade ?? 1;
      const notas: NotaAlocada[] = [];
      for (const n of estoque) {
        if (precisa <= 0) break;
        const pega = Math.min(precisa, n.resta);
        if (pega <= 0) continue;
        n.resta -= pega;
        precisa -= pega;
        notas.push({ nf: n.nf, d: n.d, f: n.f, q: pega, total: n.q });
      }
      saida[i.id] = { c: compras[i.id], notas, falta: Math.max(0, precisa), grupo: [], valdir: macs[macBase(i.mac)] ?? [] };
    }
    const resumo = doGrupo.map((i) => ({ po: i.po, qtd: i.quantidade ?? 1, notas: saida[i.id].notas.map((n) => n.nf) }));
    for (const i of doGrupo) saida[i.id].grupo = resumo;
  }
  return saida;
}

// Texto pra filtrar / ordenar a coluna ("PC 8688 USINA … NF 40718").
export function resumoCompra(compra: CompraDoItem | undefined): string {
  if (!compra) return "";
  const c = compra.c;
  return [
    ...(c.pc ?? []).map((p) => `PC ${p.pc} ${p.f} ${STATUS_PC[p.s]?.rotulo ?? p.s}`),
    ...(c.rem ?? []).map((r) => `REM ${r.nf}`),
    ...compra.notas.map((n) => `NF ${n.nf} ${n.f}`),
    compra.notas.length && !compra.falta ? "retornou" : pcsValidos(c).length || compra.notas.length ? "aguardando" : "",
    ...compra.valdir.map((v) => `VALDIR PC ${v.pc} ${v.m} ${v.f}`),
  ].join(" ");
}

// "23/10/2026 15:47" — data e hora da solicitação.
function dataHora(iso: string | null): string {
  return iso ? `${formatarDataBr(iso.slice(0, 10))}${iso.length > 10 ? ` ${iso.slice(11, 16)}` : ""}` : "—";
}

function dica(compra: CompraDoItem): string {
  const c = compra.c;
  const linhas: string[] = [];
  for (const p of c.pc ?? [])
    linhas.push(`Pedido de compra ${p.pc} item ${p.it} — ${p.f} — ${formatarNumero(p.q, 0)} — ${formatarDataBr(p.d)} — ${STATUS_PC[p.s]?.rotulo ?? p.s}`);
  for (const r of c.rem ?? []) linhas.push(`Remessa NF ${r.nf} — ${formatarDataBr(r.d)} — ${formatarNumero(r.q, 0)} pç`);
  for (const n of compra.notas)
    linhas.push(`Entrada NF ${n.nf} — ${n.f} — ${formatarDataBr(n.d)} — ${formatarNumero(n.q, 0)} pç deste PO (de ${formatarNumero(n.total, 0)} na NF)`);
  if (compra.falta) linhas.push(`Faltam ${formatarNumero(compra.falta, 0)} pç — aguardando outra nota`);
  const v = compra.valdir[0];
  if (v)
    linhas.push(
      `Última compra do Valdir pra MAC (${compra.valdir.length} no total): solicitação ${v.rq} de ${dataHora(v.d)} — ${v.m} — ` +
        `${formatarNumero(v.q, 0)} ${v.u} — pedido ${v.pc} ${v.f} — ${STATUS_PC[v.s]?.rotulo ?? v.s}` +
        (v.nf.length ? ` — NF ${v.nf.map((n) => n[0]).join("/")}` : ""),
    );
  return linhas.join("\n");
}

// Célula da tabela: linha 1 = pedidos de compra; linha 2 = NFs que couberam pra este PO; linha 3 = o que falta.
export function CelulaCompra({ compra }: { compra: CompraDoItem | undefined }) {
  const c = compra?.c;
  if (!compra || !c || (!c.pc?.length && !c.ent?.length && !compra.valdir.length))
    return <span className="text-xs text-stone-300 dark:text-slate-600">—</span>;
  const pcs = c.pc ?? [];
  const ultimaValdir = compra.valdir[0];
  return (
    <span className="block whitespace-nowrap text-[11px] leading-tight" title={dica(compra)}>
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
      {compra.notas.length > 0 && (
        <span className="block font-mono text-green-700 dark:text-green-400">
          ↩ NF {compra.notas.map((n) => n.nf).join("/")}{" "}
          <span className="text-stone-500 dark:text-slate-400">{formatarDataBr(compra.notas[compra.notas.length - 1].d).slice(0, 5)}</span>
        </span>
      )}
      {compra.falta > 0 && (compra.notas.length > 0 || pcsValidos(c).length > 0) && (
        <span className="block text-amber-700 dark:text-amber-300">
          {compra.notas.length ? `falta ${formatarNumero(compra.falta, 0)} pç` : "aguardando retorno"}
        </span>
      )}
      {ultimaValdir && (
        <span className="block text-violet-700 dark:text-violet-300">
          Valdir {formatarDataBr(ultimaValdir.d?.slice(0, 10) ?? null).slice(0, 5)} · PC{" "}
          <span className={`font-mono font-semibold ${STATUS_PC[ultimaValdir.s]?.classe ?? ""}`}>{ultimaValdir.pc}</span>
          {compra.valdir.length > 1 && <span className="text-stone-500 dark:text-slate-400"> (+{compra.valdir.length - 1})</span>}
        </span>
      )}
    </span>
  );
}

// Quadro no card do item (FollowUpDetalhe).
export function QuadroCompras({ compra }: { compra: CompraDoItem | undefined }) {
  const th = "px-2 py-1 text-left font-semibold";
  const td = "border-t border-stone-100 px-2 py-1 dark:border-slate-800";
  if (!compra)
    return (
      <p className="text-xs text-stone-500 dark:text-slate-400">
        Nenhum pedido de compra nem nota de entrada no Sectra com o desenho deste item.
      </p>
    );
  const c = compra.c;
  return (
    <div className="flex flex-col gap-3 text-xs">
      {!!c.pc?.length && (
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
            {c.pc.map((p) => (
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
      {!!c.rem?.length && (
        <p>
          <span className="font-semibold">Remessa (nossa NF):</span>{" "}
          {c.rem.map((r) => `NF ${r.nf} de ${formatarDataBr(r.d)} (${formatarNumero(r.q, 0)} pç)`).join(" · ")}
        </p>
      )}
      {compra.notas.length > 0 && (
        <table className="w-full">
          <thead className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-slate-500">
            <tr>
              <th className={th}>NF de entrada</th>
              <th className={th}>Entrada</th>
              <th className={th}>Fornecedor</th>
              <th className={th}>Deste PO</th>
              <th className={th}>Na NF</th>
            </tr>
          </thead>
          <tbody>
            {compra.notas.map((n) => (
              <tr key={n.nf}>
                <td className={`${td} font-mono font-semibold text-green-700 dark:text-green-400`}>{n.nf}</td>
                <td className={td}>{formatarDataBr(n.d)}</td>
                <td className={td}>{n.f}</td>
                <td className={td}>{formatarNumero(n.q, 0)}</td>
                <td className={td}>{formatarNumero(n.total, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {compra.falta > 0 && (
        <p className="font-semibold text-amber-700 dark:text-amber-300">
          {compra.notas.length ? `Faltam ${formatarNumero(compra.falta, 0)} pç` : "Nenhuma nota de entrada pra este PO"} — aguardando
          retorno em outra nota.
        </p>
      )}
      {compra.grupo.length > 1 && (
        <div>
          <p className="mb-1 font-semibold">Mesmo desenho nesta MAC — como as peças das NFs foram repartidas:</p>
          <ul className="flex flex-col gap-0.5 font-mono">
            {compra.grupo.map((g) => (
              <li key={g.po} className={g.notas.length ? "" : "text-amber-700 dark:text-amber-300"}>
                {g.po} ({formatarNumero(g.qtd, 0)} pç) → {g.notas.length ? `NF ${g.notas.join("/")}` : "aguardando"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {compra.valdir.length > 0 && (
        <div>
          <p className="mb-1 font-semibold text-violet-700 dark:text-violet-300">
            Compras do Valdir pra esta MAC ({compra.valdir.length}) — a última lançada primeiro
          </p>
          <div className="max-h-64 overflow-auto">
            <table className="w-full">
              <thead className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-slate-500">
                <tr>
                  <th className={th}>Solicitação</th>
                  <th className={th}>Material</th>
                  <th className={th}>Qtd</th>
                  <th className={th}>Pedido</th>
                  <th className={th}>Fornecedor</th>
                  <th className={th}>Status</th>
                  <th className={th}>NF entrada</th>
                </tr>
              </thead>
              <tbody>
                {compra.valdir.map((v) => (
                  <tr key={`${v.rq}-${v.pc}`}>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="font-mono font-semibold">{v.rq}</span>
                      <span className="block text-[10px] text-stone-500 dark:text-slate-400">{dataHora(v.d)}</span>
                    </td>
                    <td className={td}>{v.m}</td>
                    <td className={`${td} whitespace-nowrap`}>
                      {formatarNumero(v.q, 0)} {v.u}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <span className="font-mono font-semibold">{v.pc}</span>
                      <span className="block text-[10px] text-stone-500 dark:text-slate-400">{formatarDataBr(v.dp)}</span>
                    </td>
                    <td className={td}>{v.f}</td>
                    <td className={`${td} font-semibold ${STATUS_PC[v.s]?.classe ?? ""}`}>{STATUS_PC[v.s]?.rotulo ?? v.s}</td>
                    <td className={`${td} whitespace-nowrap font-mono`}>
                      {v.nf.length ? v.nf.map((n) => `${n[0]} (${formatarDataBr(n[1]).slice(0, 5)})`).join(" / ") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="text-[10px] text-stone-400 dark:text-slate-500">
        Compras do Valdir: solicitações de compra com a MAC no campo Obra do Sectra que viraram pedido lançado por ele. Do Sectra, pelo nº do desenho escrito no pedido / nota de serviço (atualiza a cada 15 min). As peças de cada NF vão
        primeiro pros POs marcados com M.Chegou, depois os encerrados, depois em ordem de PO. A Qtd do pedido de compra é a do
        pedido inteiro.
      </p>
    </div>
  );
}
