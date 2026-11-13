"use client";

// Painel gerencial — sub-aba de Ordens de produção, pedido do usuário (13/11/2026):
// "tela de visual gerencial, mostrando os recursos em operação, setup, parada,
// etc? Tempo em aberto". Cada recurso (centro produtivo do Sectra usado no
// apontamento) vira um quadradinho colorido pelo que está acontecendo nele agora.
// Parada não tem etapa: cai no recurso da produção que ela pausou (retoma_ap_id)
// ou, sem isso, no setor do operador no Sectra. Tempo = minutosApontamento
// (só a jornada da Macfab, sem fim de semana e feriados do calendário), então um
// apontamento esquecido aberto de um dia pro outro não soma a noite.

import { useMemo, useState } from "react";
import { classeCartao } from "@/components/ProducaoComum";
import { recursosDoApontamento } from "@/components/OrdensProducaoRecursos";
import { fmtMin, minutosApontamento, numeroOP, type Apontamento, type Cadastros, type Centro, type OP } from "@/lib/producao";

type Estado = "producao" | "setup" | "parada" | "livre";
type Ocupacao = { a: Apontamento; estado: Exclude<Estado, "livre">; op: OP | null; texto: string; min: number };

const COR: Record<Estado, { fundo: string; borda: string; texto: string; rotulo: string }> = {
  producao: { fundo: "bg-emerald-500/15", borda: "border-emerald-500", texto: "text-emerald-700 dark:text-emerald-300", rotulo: "Em operação" },
  setup: { fundo: "bg-amber-400/20", borda: "border-amber-500", texto: "text-amber-700 dark:text-amber-300", rotulo: "Setup" },
  parada: { fundo: "bg-red-500/15", borda: "border-red-500", texto: "text-red-700 dark:text-red-300", rotulo: "Parada" },
  livre: { fundo: "bg-stone-50 dark:bg-slate-900", borda: "border-stone-200 dark:border-slate-700", texto: "text-stone-400", rotulo: "Livre" },
};
// Prioridade do estado do recurso quando tem mais de um operador nele.
const PESO: Record<Estado, number> = { parada: 3, setup: 2, producao: 1, livre: 0 };

export default function OrdensProducaoGerencial({
  cad,
  ops,
  apontamentos,
  abertos,
  agora,
}: {
  cad: Cadastros;
  ops: OP[];
  apontamentos: Apontamento[];
  abertos: Apontamento[];
  agora: Date;
}) {
  const [filtro, setFiltro] = useState<Estado | "todos">("todos");
  const grupos = useMemo(() => recursosDoApontamento(cad.centros), [cad.centros]);

  const { porCentro, semRecurso } = useMemo(() => {
    const etapaDe = new Map<string, { op: OP; centro: string | null; texto: string }>();
    for (const op of ops) for (const e of op.etapas) etapaDe.set(e.id, { op, centro: e.centro, texto: `${e.posicao} ${e.operacao_desc ?? e.descricao ?? ""}`.trim() });
    const apDe = new Map(apontamentos.map((a) => [a.id, a]));
    const setorDe = new Map(cad.operadores.map((o) => [o.codigo, o.centro]));
    const porCentro = new Map<string, Ocupacao[]>();
    const semRecurso: Ocupacao[] = [];
    for (const a of abertos) {
      const min = minutosApontamento(a.inicio, agora);
      let centro: string | null = null;
      let oc: Ocupacao;
      if (a.tipo === "parada") {
        const pausado = a.retoma_ap_id ? apDe.get(a.retoma_ap_id) : null;
        const e = pausado?.etapa_id ? etapaDe.get(pausado.etapa_id) : null;
        centro = e?.centro ?? setorDe.get(a.operador_codigo) ?? null;
        oc = { a, estado: "parada", op: e?.op ?? null, texto: `${(a.motivo ?? "parada").toLowerCase()}${e ? ` · pausou ${numeroOP(e.op.numero)} et. ${e.texto}` : ""}`, min };
      } else {
        const e = a.etapa_id ? etapaDe.get(a.etapa_id) : null;
        centro = e?.centro ?? null;
        oc = { a, estado: a.tipo === "setup" ? "setup" : "producao", op: e?.op ?? null, texto: e ? `${numeroOP(e.op.numero)} · et. ${e.texto}` : "OP", min };
      }
      if (centro) porCentro.set(centro, [...(porCentro.get(centro) ?? []), oc]);
      else semRecurso.push(oc);
    }
    return { porCentro, semRecurso };
  }, [ops, apontamentos, abertos, cad.operadores, agora]);

  const estadoDe = (c: Centro): Estado => (porCentro.get(c.codigo) ?? []).reduce<Estado>((m, o) => (PESO[o.estado] > PESO[m] ? o.estado : m), "livre");
  const todos = grupos.flatMap((g) => g.recursos);
  const conta: Record<Estado, number> = { producao: 0, setup: 0, parada: 0, livre: 0 };
  for (const r of todos) conta[estadoDe(r)]++;
  const todasOcup = abertos.length;
  const minParado = [...porCentro.values(), semRecurso].flat().filter((o) => o.estado === "parada").reduce((s, o) => s + o.min, 0);
  const esquecidos = abertos.filter((a) => new Date(a.inicio).toDateString() !== agora.toDateString());

  function telaCheia() {
    const el = document.getElementById("painel-gerencial");
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el?.requestFullscreen?.().catch(() => {});
  }

  return (
    <div id="painel-gerencial" className="flex flex-col gap-3 overflow-y-auto bg-white p-1 dark:bg-slate-950">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {(["producao", "setup", "parada", "livre"] as Estado[]).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => setFiltro(filtro === e ? "todos" : e)}
            className={`rounded-xl border-2 px-3 py-2 text-left ${COR[e].borda} ${COR[e].fundo} ${filtro === e ? "ring-2 ring-offset-1 ring-stone-400" : ""}`}
          >
            <p className={`text-[11px] font-bold uppercase tracking-wide ${COR[e].texto}`}>{COR[e].rotulo}</p>
            <p className="text-2xl font-black text-stone-800 dark:text-slate-100">{conta[e]}</p>
          </button>
        ))}
        <div className="rounded-xl border-2 border-stone-200 px-3 py-2 dark:border-slate-700">
          <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Operadores apontando</p>
          <p className="text-2xl font-black text-stone-800 dark:text-slate-100">{todasOcup}</p>
        </div>
        <div className="rounded-xl border-2 border-stone-200 px-3 py-2 dark:border-slate-700">
          <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500">Improdutivo em aberto</p>
          <p className="text-2xl font-black text-red-600">{fmtMin(minParado)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span>Tempo conta só no horário da Macfab (seg–sex 7:30–12:00 e 13:00–17:18), sem feriados do calendário · atualiza a cada minuto</span>
        <button type="button" onClick={telaCheia} className="ml-auto rounded-lg border border-stone-300 px-2 py-1 text-stone-600 dark:border-slate-700 dark:text-slate-300">
          ⛶ Tela cheia (TV)
        </button>
      </div>

      {esquecidos.length > 0 && (
        <div className="rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
          ⚠ {esquecidos.length} apontamento(s) aberto(s) desde outro dia:{" "}
          {esquecidos.map((a) => `${a.operador_nome ?? a.operador_codigo} (desde ${new Date(a.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`).join(", ")}
          {" "}— confira se esqueceram de fechar.
        </div>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {grupos.map((g) => {
          const recursos = g.recursos.filter((r) => filtro === "todos" || estadoDe(r) === filtro);
          const naArea = porCentro.get(g.area.codigo) ?? [];
          if (!recursos.length && !(naArea.length && filtro === "todos")) return null;
          return (
            <section key={g.area.codigo} className={`${classeCartao} p-2`}>
              <h3 className="mb-2 flex items-baseline gap-2 px-1 text-sm font-bold text-stone-700 dark:text-slate-200">
                {g.area.descricao ?? g.area.codigo}
                <span className="font-mono text-[11px] font-normal text-stone-400">{g.area.codigo}</span>
              </h3>
              {naArea.length > 0 && (
                <div className="mb-2 flex flex-col gap-1">
                  {naArea.map((o) => (
                    <LinhaOcupacao key={o.a.id} o={o} />
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
                {recursos.map((r) => {
                  const est = estadoDe(r);
                  const oc = porCentro.get(r.codigo) ?? [];
                  return (
                    <div key={r.codigo} className={`flex min-h-[5.5rem] flex-col rounded-xl border-2 p-2 ${COR[est].borda} ${COR[est].fundo}`}>
                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-sm font-black text-stone-800 dark:text-slate-100">{r.codigo}</span>
                        <span className={`ml-auto text-[10px] font-bold uppercase ${COR[est].texto}`}>{COR[est].rotulo}</span>
                      </div>
                      <p className="line-clamp-1 text-[11px] text-stone-500 dark:text-slate-400">{r.descricao}</p>
                      {oc.map((o) => (
                        <div key={o.a.id} className="mt-1 text-xs leading-tight">
                          <p className="flex items-baseline gap-1 font-semibold text-stone-800 dark:text-slate-100">
                            <span className="truncate">{o.a.operador_nome ?? `cód. ${o.a.operador_codigo}`}</span>
                            <span className={`ml-auto font-mono font-black ${COR[o.estado].texto}`}>{fmtMin(o.min)}</span>
                          </p>
                          <p className="line-clamp-2 text-[11px] text-stone-600 dark:text-slate-300">{o.texto}</p>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {semRecurso.length > 0 && filtro !== "livre" && (
        <section className={`${classeCartao} p-2`}>
          <h3 className="mb-2 px-1 text-sm font-bold text-stone-700 dark:text-slate-200">Sem recurso definido</h3>
          <div className="flex flex-col gap-1">
            {semRecurso.filter((o) => filtro === "todos" || o.estado === filtro).map((o) => (
              <LinhaOcupacao key={o.a.id} o={o} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function LinhaOcupacao({ o }: { o: Ocupacao }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border-l-4 px-2 py-1 text-xs ${COR[o.estado].borda} ${COR[o.estado].fundo}`}>
      <span className={`w-20 shrink-0 text-[10px] font-bold uppercase ${COR[o.estado].texto}`}>{COR[o.estado].rotulo}</span>
      <span className="font-semibold text-stone-800 dark:text-slate-100">{o.a.operador_nome ?? `cód. ${o.a.operador_codigo}`}</span>
      <span className="min-w-0 flex-1 truncate text-stone-600 dark:text-slate-300">{o.texto}</span>
      <span className={`font-mono font-black ${COR[o.estado].texto}`}>{fmtMin(o.min)}</span>
    </div>
  );
}
