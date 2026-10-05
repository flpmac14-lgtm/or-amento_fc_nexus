"use client";

// Blocos da Visão Geral: Coletas, Atenção hoje e Esteira das obras. Regras e cálculos ficam no servidor (app/painel.py); aqui só exibe.

import { useState } from "react";
import { Bloco, TabelaPedidos, Vazio, useBloco, type ListaAberta } from "@/components/VisaoGeralComum";
import { urlImagemFollowUp } from "@/lib/api";
import {
  COR_SEVERIDADE,
  ddmm,
  kg,
  linkObra,
  type RespostaAtencao,
  type RespostaColetas,
  type RespostaEsteira,
} from "@/lib/painel";

type Props = { params: Record<string, string>; tick: number; abrir: (l: ListaAberta) => void };

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function diaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return DIAS_SEMANA[new Date(a, m - 1, d).getDay()];
}

function Comparacao({ atual, anterior }: { atual: number; anterior: number }) {
  const diff = atual - anterior;
  if (diff === 0) return <span className="text-stone-500 dark:text-slate-400">= semana passada</span>;
  return (
    <span className={diff > 0 ? "text-green-700 dark:text-green-400" : "text-stone-500 dark:text-slate-400"}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff)} vs semana passada ({anterior})
    </span>
  );
}

function Ponto({ cor, titulo }: { cor: string; titulo?: string }) {
  return <span title={titulo} className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cor}`} />;
}

// --- 1. Coletas ---------------------------------------------------------------

export function BlocoColetas({ params, tick, abrir }: Props) {
  const filtros = { cliente: params.cliente, obra: params.obra };
  const { dados, erro, carregando } = useBloco<RespostaColetas>("coletas", filtros, tick);
  return (
    <Bloco
      titulo="🚚 Coletas — próximos dias úteis"
      carregando={carregando}
      erro={erro}
      extra={
        <>
          {dados && (
            <span className="flex items-center gap-2 text-sm">
              <span className="font-bold text-stone-800 dark:text-slate-200">{dados.semana.valor} coleta(s) nesta semana</span>
              <Comparacao atual={dados.semana.valor} anterior={dados.semana.anterior} />
            </span>
          )}
          {dados && dados.coletas_em_texto > 0 ? (
          <span
            className="text-amber-700 dark:text-amber-300"
            title="Esses pedidos têm a Coleta escrita como texto (ex.: 'Permanece prazo contratual', '3009/2026') — só datas entram no painel."
          >
            {dados.coletas_em_texto} pedido(s) com coleta em texto não entram
          </span>
          ) : null}
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {(dados?.dias ?? []).map((d) => (
          <div
            key={d.data}
            className={`flex min-h-[5.5rem] flex-col rounded-lg border p-2 ${
              d.hoje
                ? "border-green-600 bg-green-50 dark:border-cyan-400 dark:bg-cyan-950/40"
                : "border-stone-200 dark:border-slate-700"
            }`}
          >
            <p className={`text-xs font-bold uppercase ${d.hoje ? "text-green-700 dark:text-cyan-300" : "text-stone-500 dark:text-slate-400"}`}>
              {d.hoje ? "Hoje" : diaSemana(d.data)} · {ddmm(d.data)}
            </p>
            {d.clientes.length === 0 ? (
              <p className="mt-1 text-lg text-stone-400 dark:text-slate-600">—</p>
            ) : (
              <div className="mt-1 flex flex-col gap-1">
                {d.clientes.map((c) => (
                  <button
                    key={c.cliente}
                    type="button"
                    onClick={() =>
                      abrir({
                        titulo: `Coleta ${ddmm(d.data)} — ${c.cliente}`,
                        subtitulo: `${c.pedidos.length} pedido(s) · ${kg(c.kg)} · obras ${c.obras.join(", ") || "—"}${
                          c.motivo.length ? ` · ${c.motivo.length} não pronto(s)` : ""
                        }`,
                        conteudo: <TabelaPedidos pedidos={c.pedidos} />,
                      })
                    }
                    title={c.motivo.length ? `Não pronto:\n${c.motivo.join("\n")}` : `${c.pedidos.length} pedido(s) · ${kg(c.kg)}`}
                    className="flex items-center gap-1.5 rounded-md bg-stone-100 dark:bg-slate-800 px-2 py-1 text-left text-base font-bold text-stone-900 dark:text-white hover:ring-2 hover:ring-green-500 dark:hover:ring-cyan-400"
                  >
                    {c.alerta && <Ponto cor={COR_SEVERIDADE[c.alerta]} />}
                    <span className="truncate">{c.cliente}</span>
                    <span className="ml-auto text-xs font-normal text-stone-500 dark:text-slate-400">
                      {c.entregue ? "entregue" : `${c.pedidos.length} ped.`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Bloco>
  );
}

// --- 3. Atenção hoje ----------------------------------------------------------

export function BlocoAtencao({ params, tick, abrir }: Props) {
  const { dados, erro, carregando } = useBloco<RespostaAtencao>("atencao", params, tick);
  const [todas, setTodas] = useState(false);
  const linhas = dados?.linhas ?? [];
  const visiveis = todas ? linhas : linhas.slice(0, dados?.max ?? 10);
  const vermelhas = linhas.filter((l) => l.severidade === "vermelho").length;
  return (
    <Bloco
      titulo={`⚠️ Atenção hoje${dados ? ` · ${vermelhas} 🔴 · ${linhas.length - vermelhas} 🟡` : ""}`}
      carregando={carregando}
      erro={erro}
      extra={
        linhas.length > (dados?.max ?? 10) ? (
          <button type="button" onClick={() => setTodas((t) => !t)} className="font-semibold text-green-700 dark:text-cyan-300 hover:underline">
            {todas ? "ver menos" : `ver todas (${linhas.length})`}
          </button>
        ) : null
      }
    >
      <ul className="min-h-0 flex-1 overflow-auto">
        {dados && linhas.length === 0 && <Vazio>Nenhuma exceção. 👍</Vazio>}
        {visiveis.map((l) => (
          <li key={l.obra + l.regra}>
            <button
              type="button"
              onClick={() =>
                abrir({
                  titulo: `${l.severidade === "vermelho" ? "🔴" : "🟡"} ${l.titulo} — obra ${l.obra}`,
                  subtitulo: `Critério: ${l.criterio}. ${l.cliente}`,
                  conteudo: <TabelaPedidos pedidos={l.pedidos} />,
                })
              }
              className="flex w-full items-center gap-2 border-b border-stone-100 dark:border-slate-800 px-1 py-1.5 text-left text-sm hover:bg-stone-50 dark:hover:bg-slate-800/60"
              title={`Critério: ${l.criterio}`}
            >
              <Ponto cor={COR_SEVERIDADE[l.severidade]} />
              <span className="w-16 shrink-0 font-bold text-stone-900 dark:text-white">{l.obra}</span>
              <span className="w-10 shrink-0 text-stone-500 dark:text-slate-400">{l.cliente}</span>
              <span className="min-w-0 flex-1 truncate text-stone-800 dark:text-slate-200">
                {l.titulo}
                <span className="text-stone-500 dark:text-slate-400"> · {l.n_pedidos} pedido(s)</span>
              </span>
              <span className={`shrink-0 text-xs font-semibold ${l.severidade === "vermelho" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-300"}`}>
                {l.texto_dias}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {dados && dados.pendencias.length > 0 && (
        <p className="mt-1 shrink-0 text-[11px] italic text-stone-400 dark:text-slate-500" title={dados.pendencias.join("\n")}>
          Regras ainda sem dados: material travando corte, peças paradas (passe o mouse).
        </p>
      )}
    </Bloco>
  );
}

// --- 5. Esteira das obras -----------------------------------------------------
// Uma linha por obra ativa, do prazo mais próximo ao mais adiante, com a foto
// do pedido mais urgente que tiver foto (pedido do usuário).

const BORDA_SEMAFORO: Record<string, string> = {
  vermelho: "border-l-red-500",
  amarelo: "border-l-amber-400",
  verde: "border-l-green-500",
};

const PILULA_PRAZO: Record<string, string> = {
  vermelho: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  amarelo: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  verde: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
};

function textoPrazo(dias: number | null): string {
  if (dias === null) return "sem prazo";
  if (dias < 0) return `vencido ${-dias}d`;
  if (dias === 0) return "vence hoje";
  return `em ${dias}d`;
}

function CelulaEtapa({ valor, nome }: { valor: number; nome: string }) {
  const titulo = `${nome}: ${valor.toLocaleString("pt-BR")}%`;
  if (valor >= 100) {
    return (
      <div title={titulo} className="flex h-6 items-center justify-center rounded-md bg-green-600 text-xs font-bold text-white dark:bg-cyan-500 dark:text-slate-950">
        ✓
      </div>
    );
  }
  if (valor <= 0) return <div title={titulo} className="h-6 rounded-md border border-dashed border-stone-300 dark:border-slate-600" />;
  return (
    <div title={titulo} className="relative h-6 overflow-hidden rounded-md bg-stone-100 dark:bg-slate-800">
      <div className="h-full bg-green-500/50 dark:bg-cyan-500/50" style={{ width: `${valor}%` }} />
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-stone-800 dark:text-white">
        {Math.round(valor)}%
      </span>
    </div>
  );
}

const GRADE_ESTEIRA = "grid grid-cols-[4rem_10rem_repeat(8,minmax(0,1fr))_6.5rem_4rem] items-center gap-x-1.5";

export function BlocoEsteira({ params, tick }: Omit<Props, "abrir">) {
  const { dados, erro, carregando } = useBloco<RespostaEsteira>("esteira", params, tick);
  const etapas = dados?.etapas ?? [];
  return (
    <Bloco
      titulo={`🏭 Esteira das obras${dados ? ` · ${dados.linhas.length} ativas · prazo mais próximo primeiro` : ""}`}
      carregando={carregando}
      erro={erro}
      extra={
        <span className="flex items-center gap-2 text-stone-500 dark:text-slate-400" title={dados?.pendencias.join("\n")}>
          <span className="inline-flex h-4 w-5 items-center justify-center rounded bg-green-600 text-[9px] text-white dark:bg-cyan-500 dark:text-slate-950">✓</span> concluída
          <span className="inline-block h-4 w-5 rounded bg-green-500/50 dark:bg-cyan-500/50" /> em andamento (% por kg)
          <span className="inline-block h-4 w-5 rounded border border-dashed border-stone-300 dark:border-slate-600" /> não iniciada
        </span>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <div className={`${GRADE_ESTEIRA} sticky top-0 z-10 bg-white pb-1 text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:bg-slate-900 dark:text-slate-400`}>
          <span className="pl-2">Foto</span>
          <span>Obra</span>
          {etapas.map((e) => (
            <span key={e.campo} className="truncate text-center">
              {e.nome}
            </span>
          ))}
          <span className="text-center">Prazo</span>
          <span className="text-center">Coleta</span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {dados?.linhas.map((l) => (
            <li
              key={l.obra}
              className={`${GRADE_ESTEIRA} rounded-lg border border-l-4 border-stone-200 bg-stone-50/60 py-1 pr-1 dark:border-slate-800 dark:bg-slate-800/30 ${BORDA_SEMAFORO[l.semaforo]}`}
            >
              <a
                href={linkObra(l.obra)}
                target="_blank"
                rel="noreferrer"
                className="ml-1 block h-12 w-14 overflow-hidden rounded-md bg-white dark:bg-slate-950"
                title="Abrir o relatório da obra"
              >
                {l.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine (cache imutável)
                  <img src={urlImagemFollowUp(l.foto)} alt="" loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <span className="flex h-full items-center justify-center text-[10px] text-stone-400">sem foto</span>
                )}
              </a>
              <a href={linkObra(l.obra)} target="_blank" rel="noreferrer" className="min-w-0 leading-tight hover:underline">
                <span className="block text-base font-black text-stone-900 dark:text-white">{l.obra}</span>
                <span className="block truncate text-[11px] text-stone-500 dark:text-slate-400">
                  <span className="font-semibold text-stone-700 dark:text-slate-300">{l.cliente}</span> · {l.n_pedidos} ped. · {l.n_prontos} pronto(s) · {kg(l.kg)}
                </span>
              </a>
              {etapas.map((e) => (
                <CelulaEtapa key={e.campo} valor={l.etapas[e.campo] ?? 0} nome={e.nome} />
              ))}
              <span className={`mx-auto flex flex-col items-center rounded-md px-2 py-0.5 leading-tight ${PILULA_PRAZO[l.semaforo]}`}>
                <span className="text-sm font-bold">{ddmm(l.prazo)}</span>
                <span className="text-[10px] font-semibold">{textoPrazo(l.dias_prazo)}</span>
              </span>
              <span className="text-center text-sm text-stone-600 dark:text-slate-300">{ddmm(l.proxima_coleta)}</span>
            </li>
          ))}
        </ul>
        {dados && dados.linhas.length === 0 && <Vazio>Nenhuma obra ativa com esses filtros.</Vazio>}
      </div>
    </Bloco>
  );
}
