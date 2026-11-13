"use client";

// Recursos (máquinas) — sub-aba de Ordens de produção, pedido do usuário
// (13/11/2026): "traz os recursos do Sectra, o que vamos usar para apontamento".
// No Sectra os recursos são os centros produtivos (PR_CENTROPROD: bancadas,
// máquinas, soldas…) — o mesmo campo que o Sectra grava no apontamento
// (PR_OPAPONTAMENTO.CENTROPROD). Já vêm no sync de 15 min (prod_cadastros.centros).
// Aqui ficam só os que entram no apontamento da OP: sem Corte, Pintura,
// Jateamento, Engenharia e PCP (lib/producao.ts::centroForaDaOP) e sem o
// Almoxarifado (não é posto de fabricação). Mostra quem está em cada um agora
// e quantas etapas de OP em aberto estão programadas nele.

import { useState } from "react";
import { classeBotao, classeCampo, classeCartao } from "@/components/ProducaoComum";
import { centroForaDaOP, fmtDataHora, fmtMin, minutosApontamento, numeroOP, type Apontamento, type Cadastros, type Centro, type OP } from "@/lib/producao";

const NIVEL_ALMOXARIFADO = "01";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function recursosDoApontamento(centros: Centro[]): { area: Centro; recursos: Centro[] }[] {
  const raiz = (c: Centro) => (c.nivel ?? "").split(".")[0];
  const usados = centros.filter((c) => c.nivel && raiz(c) !== NIVEL_ALMOXARIFADO && !centroForaDaOP(centros, c.codigo));
  const areas = usados.filter((c) => !c.pai);
  return areas
    .map((area) => ({
      area,
      recursos: usados
        .filter((c) => c.pai && raiz(c) === area.nivel)
        .sort((a, b) => (a.nivel ?? "").localeCompare(b.nivel ?? "", "pt-BR", { numeric: true })),
    }))
    .sort((a, b) => (a.area.nivel ?? "").localeCompare(b.area.nivel ?? "", "pt-BR", { numeric: true }));
}

export default function OrdensProducaoRecursos({
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
  const [soEmUso, setSoEmUso] = useState(false);
  const grupos = recursosDoApontamento(cad.centros);

  // Etapa → OP, pra saber em que recurso cada apontamento aberto está.
  const etapaDe = new Map<string, { op: OP; centro: string | null; texto: string }>();
  for (const op of ops)
    for (const e of op.etapas) etapaDe.set(e.id, { op, centro: e.centro, texto: `${e.posicao} ${e.operacao_desc ?? e.descricao ?? ""}`.trim() });

  const emUso = new Map<string, { a: Apontamento; op: OP; texto: string }[]>();
  for (const a of abertos) {
    if (a.tipo === "parada" || !a.etapa_id) continue;
    const e = etapaDe.get(a.etapa_id);
    if (!e?.centro) continue;
    emUso.set(e.centro, [...(emUso.get(e.centro) ?? []), { a, op: e.op, texto: e.texto }]);
  }

  // Etapas de OP em aberto (aguardando/em produção, não concluídas) programadas em cada recurso.
  const fila = new Map<string, number>();
  for (const op of ops) {
    if (op.status !== "aguardando" && op.status !== "liberada") continue;
    for (const e of op.etapas) if (e.centro && !e.concluido_em) fila.set(e.centro, (fila.get(e.centro) ?? 0) + 1);
  }
  // A área (CALD, USIN…) também pode estar direto na etapa: soma na própria área.

  const t = busca.trim().toUpperCase();
  const visiveis = grupos
    .map((g) => ({
      ...g,
      recursos: g.recursos.filter(
        (r) =>
          (!soEmUso || emUso.has(r.codigo)) &&
          (!t || [r.codigo, r.descricao ?? "", g.area.descricao ?? ""].some((v) => v.toUpperCase().includes(t))),
      ),
    }))
    .filter((g) => g.recursos.length || (!soEmUso && !t));
  const total = grupos.reduce((s, g) => s + g.recursos.length, 0);
  const ocupados = grupos.reduce((s, g) => s + g.recursos.filter((r) => emUso.has(r.codigo)).length, 0);

  function imprimir() {
    const w = window.open("", "_blank");
    if (!w) return;
    const corpo = grupos
      .map(
        (g) =>
          `<tr class="g"><td colspan="3">${esc(g.area.nivel ?? "")} · ${esc(g.area.descricao ?? g.area.codigo)} <span>(${esc(g.area.codigo)})</span></td></tr>` +
          g.recursos
            .map((r) => `<tr><td class="c">${esc(r.codigo)}</td><td>${esc(r.descricao ?? "")}</td><td class="m">${esc(r.nivel ?? "")}${r.ativo ? "" : " · inativo"}</td></tr>`)
            .join(""),
      )
      .join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recursos do apontamento</title>
<style>body{font-family:Arial,sans-serif;margin:0;color:#111}h1{font-size:18px;margin:0}p{font-size:11px;color:#555;margin:2px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}td{border:1px solid #999;padding:5px 8px}tr.g td{background:#eee;font-weight:bold}tr.g span{font-weight:normal;color:#666}
td.c{font-family:monospace;font-weight:bold;width:90px}td.m{color:#666;width:110px}@page{size:A4;margin:10mm}</style></head>
<body><h1>Recursos do apontamento (centros produtivos do Sectra)</h1><p>${total} recursos · Sectra atualizado ${cad.gerado_em ? fmtDataHora(cad.gerado_em) : "—"} · sem Corte, Pintura, Jateamento, Engenharia, PCP e Almoxarifado</p>
<table><tbody>${corpo}</tbody></table><script>window.onload=function(){window.print()}</script></body></html>`);
    w.document.close();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${classeCampo} max-w-xs`} placeholder="Buscar máquina, bancada ou código…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm text-stone-600 dark:text-slate-300">
          <input type="checkbox" checked={soEmUso} onChange={(e) => setSoEmUso(e.target.checked)} /> Só os em uso agora
        </label>
        <button type="button" className={classeBotao} onClick={imprimir}>
          🖨️ Imprimir lista
        </button>
        <span className="ml-auto text-xs text-stone-500">
          {total} recursos do Sectra · {ocupados} em uso agora · atualizado {cad.gerado_em ? fmtDataHora(cad.gerado_em) : "—"} · sem Corte, Pintura, Jateamento,
          Engenharia, PCP e Almoxarifado
        </span>
      </div>

      {!visiveis.length && <p className="text-sm text-stone-500">Nenhum recurso com esse filtro.</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        {visiveis.map((g) => (
          <section key={g.area.codigo} className={`${classeCartao} overflow-hidden`}>
            <header className="flex items-baseline gap-2 border-b border-stone-200 bg-stone-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
              <span className="font-mono text-xs text-stone-400">{g.area.nivel}</span>
              <h3 className="font-bold text-stone-800 dark:text-slate-100">{g.area.descricao ?? g.area.codigo}</h3>
              <span className="font-mono text-xs text-stone-500">{g.area.codigo}</span>
              {!!fila.get(g.area.codigo) && (
                <span className="ml-auto text-[11px] text-stone-500">{fila.get(g.area.codigo)} etapa(s) na área sem máquina definida</span>
              )}
            </header>
            {g.recursos.length ? (
              <ul className="divide-y divide-stone-100 dark:divide-slate-800">
                {g.recursos.map((r) => {
                  const uso = emUso.get(r.codigo) ?? [];
                  const n = fila.get(r.codigo) ?? 0;
                  return (
                    <li key={r.codigo} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${r.ativo ? "" : "opacity-50"}`}>
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${uso.length ? "bg-emerald-500" : "bg-stone-300 dark:bg-slate-600"}`} title={uso.length ? "Em uso agora" : "Livre"} />
                      <span className="w-14 shrink-0 font-mono font-bold text-stone-800 dark:text-slate-100">{r.codigo}</span>
                      <span className="min-w-0 flex-1 text-stone-700 dark:text-slate-200">
                        {r.descricao}
                        {!r.ativo && <span className="ml-2 text-xs text-red-600">inativo no Sectra</span>}
                      </span>
                      {n > 0 && (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-500/15 dark:text-sky-300" title="Etapas de OP em aberto programadas neste recurso">
                          {n} na fila
                        </span>
                      )}
                      {uso.map(({ a, op, texto }) => (
                        <span key={a.id} className="basis-full pl-[4.6rem] text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          ● {a.operador_nome ?? `cód. ${a.operador_codigo}`} · {numeroOP(op.numero)} · {texto} ({fmtMin(minutosApontamento(a.inicio, agora))})
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-3 py-2 text-xs text-stone-500">Sem máquinas cadastradas abaixo desta área no Sectra — aponta na própria área ({g.area.codigo}).</p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
