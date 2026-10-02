"use client";

// Blocos 1, 2, 3 e 5 da Visão Geral (Coletas, KPIs, Atenção hoje, Esteira das
// obras). Regras e cálculos ficam no servidor (app/painel.py); aqui só exibe.

import { useState } from "react";
import { Bloco, TabelaPedidos, Vazio, useBloco, type ListaAberta } from "@/components/VisaoGeralComum";
import {
  COR_SEVERIDADE,
  ddmm,
  kg,
  linkObra,
  type ObraResumo,
  type RespostaAtencao,
  type RespostaColetas,
  type RespostaEsteira,
  type RespostaKpis,
} from "@/lib/painel";

type Props = { params: Record<string, string>; tick: number; abrir: (l: ListaAberta) => void };

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function diaSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return DIAS_SEMANA[new Date(a, m - 1, d).getDay()];
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
        dados && dados.coletas_em_texto > 0 ? (
          <span
            className="text-amber-700 dark:text-amber-300"
            title="Esses pedidos têm a Coleta escrita como texto (ex.: 'Permanece prazo contratual', '3009/2026') — só datas entram no painel."
          >
            {dados.coletas_em_texto} pedido(s) com coleta em texto não entram
          </span>
        ) : null
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

// --- 2. KPIs ------------------------------------------------------------------

function Comparacao({ atual, anterior, rotulo, melhorMaior = true }: { atual: number | null; anterior: number | null; rotulo: string; melhorMaior?: boolean }) {
  if (atual === null || anterior === null) return <span className="text-stone-400 dark:text-slate-500">sem {rotulo} para comparar</span>;
  const diff = Math.round((atual - anterior) * 10) / 10;
  if (diff === 0) return <span className="text-stone-500 dark:text-slate-400">= {rotulo}</span>;
  const bom = diff > 0 === melhorMaior;
  return (
    <span className={bom ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
      {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toLocaleString("pt-BR")} vs {rotulo} ({anterior.toLocaleString("pt-BR")})
    </span>
  );
}

function Cartao({ titulo, valor, detalhe, onClick, pendencia }: {
  titulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  onClick?: () => void;
  pendencia?: string;
}) {
  const classe =
    "flex flex-col rounded-xl border p-3 text-left min-w-0 " +
    (pendencia
      ? "border-dashed border-stone-300 dark:border-slate-700 bg-stone-50 dark:bg-slate-900/50"
      : "border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:ring-2 hover:ring-green-500 dark:hover:ring-cyan-400");
  const corpo = (
    <>
      <span className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">{titulo}</span>
      {pendencia ? (
        <>
          <span className="text-4xl font-black text-stone-300 dark:text-slate-700">—</span>
          <span className="text-xs italic text-stone-500 dark:text-slate-400">{pendencia}</span>
        </>
      ) : (
        <>
          <span className="text-4xl font-black text-stone-900 dark:text-white xl:text-5xl">{valor}</span>
          <span className="text-xs">{detalhe}</span>
        </>
      )}
    </>
  );
  return pendencia || !onClick ? (
    <div className={classe}>{corpo}</div>
  ) : (
    <button type="button" onClick={onClick} className={classe}>
      {corpo}
    </button>
  );
}

function TabelaObras({ obras }: { obras: ObraResumo[] }) {
  if (obras.length === 0) return <Vazio>Nenhuma obra.</Vazio>;
  return (
    <table className="w-full text-sm text-stone-800 dark:text-slate-200">
      <thead className="text-left text-xs uppercase text-stone-500 dark:text-slate-400">
        <tr>
          <th className="py-1">Obra</th>
          <th>Cliente</th>
          <th>Pedidos</th>
          <th>Prazo mais próximo</th>
          <th className="text-right">Peso</th>
        </tr>
      </thead>
      <tbody>
        {obras.map((o) => (
          <tr key={o.obra} className="border-t border-stone-100 dark:border-slate-800">
            <td className="py-1">
              <a href={linkObra(o.obra)} target="_blank" rel="noreferrer" className="font-semibold text-green-700 dark:text-cyan-300 hover:underline">
                {o.obra}
              </a>
            </td>
            <td>{o.cliente || "—"}</td>
            <td>{o.n_pedidos}</td>
            <td>{ddmm(o.prazo)}</td>
            <td className="text-right">{kg(o.kg)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BlocoKpis({ params, tick, abrir }: Props) {
  const { dados, erro, carregando } = useBloco<RespostaKpis>("kpis", params, tick);
  if (erro) return <Bloco titulo="Indicadores" erro={erro}>{null}</Bloco>;
  if (!dados) return <Bloco titulo="Indicadores" carregando={carregando}>{null}</Bloco>;
  const { obras, coletas_semana: cs, otd } = dados;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Cartao
        titulo="Obras ativas / em atraso"
        valor={
          <>
            {obras.ativas}
            <span className="text-2xl text-red-600 dark:text-red-400"> / {obras.em_atraso}</span>
          </>
        }
        detalhe={<span className="text-stone-500 dark:text-slate-400">atraso = coleta depois do prazo ou prazo vencido sem coleta</span>}
        onClick={() =>
          abrir({
            titulo: `Obras em atraso (${obras.em_atraso})`,
            subtitulo: `De ${obras.ativas} obras ativas. Atraso = coleta marcada depois do prazo contratual, ou prazo vencido sem coleta.`,
            conteudo: <TabelaObras obras={obras.lista_atraso} />,
          })
        }
      />
      <Cartao
        titulo="Coletas da semana"
        valor={cs.valor}
        detalhe={<Comparacao atual={cs.valor} anterior={cs.anterior} rotulo="semana passada" />}
        onClick={() =>
          abrir({
            titulo: `Coletas da semana ${ddmm(cs.de)} a ${ddmm(cs.ate)}`,
            subtitulo: "Uma coleta = um cliente num dia.",
            conteudo:
              cs.lista.length === 0 ? (
                <Vazio>Nenhuma coleta marcada na semana.</Vazio>
              ) : (
                <table className="w-full text-sm text-stone-800 dark:text-slate-200">
                  <thead className="text-left text-xs uppercase text-stone-500 dark:text-slate-400">
                    <tr><th className="py-1">Dia</th><th>Cliente</th><th>Pedidos</th><th>Obras</th><th className="text-right">Peso</th></tr>
                  </thead>
                  <tbody>
                    {cs.lista.map((c) => (
                      <tr key={c.data + c.cliente} className="border-t border-stone-100 dark:border-slate-800">
                        <td className="py-1">{ddmm(c.data)}</td>
                        <td className="font-semibold">{c.cliente}</td>
                        <td>{c.n_pedidos}</td>
                        <td className="text-xs">{c.obras.join(", ")}</td>
                        <td className="text-right">{kg(c.kg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ),
          })
        }
      />
      <Cartao titulo="Kg cortados na semana x meta" valor={null} pendencia={dados.kg_corte.pendencia} />
      <Cartao titulo="Materiais críticos" valor={null} pendencia={dados.materiais_criticos.pendencia} />
      <Cartao
        titulo={`OTD ${otd.dias} dias`}
        valor={otd.percentual === null ? "—" : `${otd.percentual.toLocaleString("pt-BR")}%`}
        detalhe={
          otd.base === 0 ? (
            <span className="text-stone-500 dark:text-slate-400">sem entregas (ST=E com coleta) no período</span>
          ) : (
            <span className="flex flex-col">
              <span className="text-stone-500 dark:text-slate-400">{otd.no_prazo} de {otd.base} pedidos entregues até o prazo</span>
              <Comparacao atual={otd.percentual} anterior={otd.anterior} rotulo={`${otd.dias} dias anteriores`} />
            </span>
          )
        }
        onClick={() =>
          abrir({
            titulo: `Entregas fora do prazo — últimos ${otd.dias} dias (${otd.atrasados.length})`,
            subtitulo: "Entregue = ST E; data da entrega = Coleta; comparada ao prazo contratual.",
            conteudo: <TabelaPedidos pedidos={otd.atrasados} />,
          })
        }
      />
    </div>
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

function CelulaEtapa({ valor, nome }: { valor: number; nome: string }) {
  const titulo = `${nome}: ${valor.toLocaleString("pt-BR")}%`;
  if (valor >= 100) return <div title={titulo} className="h-5 rounded bg-green-600 dark:bg-cyan-500" />;
  if (valor <= 0) return <div title={titulo} className="h-5 rounded border border-stone-300 dark:border-slate-600" />;
  return (
    <div title={titulo} className="relative h-5 overflow-hidden rounded border border-green-600/60 dark:border-cyan-500/60">
      <div className="h-full bg-green-600/40 dark:bg-cyan-500/40" style={{ width: `${valor}%` }} />
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-stone-800 dark:text-white">
        {Math.round(valor)}%
      </span>
    </div>
  );
}

export function BlocoEsteira({ params, tick }: Omit<Props, "abrir">) {
  const { dados, erro, carregando } = useBloco<RespostaEsteira>("esteira", params, tick);
  const etapas = dados?.etapas ?? [];
  return (
    <Bloco
      titulo={`Esteira das obras${dados ? ` · ${dados.linhas.length} ativas` : ""}`}
      carregando={carregando}
      erro={erro}
      extra={
        <span className="flex items-center gap-2 text-stone-500 dark:text-slate-400" title={dados?.pendencias.join("\n")}>
          <span className="inline-block h-3 w-5 rounded bg-green-600 dark:bg-cyan-500" /> concluída
          <span className="inline-block h-3 w-5 rounded border border-green-600/60 bg-green-600/40 dark:border-cyan-500/60 dark:bg-cyan-500/40" /> em andamento (% por kg)
          <span className="inline-block h-3 w-5 rounded border border-stone-300 dark:border-slate-600" /> não iniciada
        </span>
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-y-1 text-sm">
          <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900 text-left text-xs uppercase text-stone-500 dark:text-slate-400">
            <tr>
              <th className="pl-2">Obra</th>
              <th>Cliente</th>
              {etapas.map((e) => (
                <th key={e.campo} className="px-1 text-center">{e.nome}</th>
              ))}
              <th className="px-1">Prazo</th>
              <th className="px-1">Coleta</th>
            </tr>
          </thead>
          <tbody>
            {dados?.linhas.map((l) => (
              <tr key={l.obra} className="text-stone-800 dark:text-slate-200">
                <td className={`border-l-4 pl-2 ${l.semaforo === "vermelho" ? "border-red-500" : l.semaforo === "amarelo" ? "border-amber-400" : "border-green-500"}`}>
                  <a href={linkObra(l.obra)} target="_blank" rel="noreferrer" className="font-bold text-stone-900 dark:text-white hover:underline" title={`${l.n_pedidos} pedido(s), ${l.n_prontos} pronto(s) · ${kg(l.kg)}`}>
                    {l.obra}
                  </a>
                </td>
                <td className="text-xs">{l.cliente}</td>
                {etapas.map((e) => (
                  <td key={e.campo} className="min-w-[4.5rem] px-1">
                    <CelulaEtapa valor={l.etapas[e.campo] ?? 0} nome={e.nome} />
                  </td>
                ))}
                <td className={`px-1 font-semibold ${l.semaforo === "vermelho" ? "text-red-600 dark:text-red-400" : l.semaforo === "amarelo" ? "text-amber-700 dark:text-amber-300" : ""}`}>
                  {ddmm(l.prazo)}
                </td>
                <td className="px-1 text-stone-500 dark:text-slate-400">{ddmm(l.proxima_coleta)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {dados && dados.linhas.length === 0 && <Vazio>Nenhuma obra ativa com esses filtros.</Vazio>}
      </div>
    </Bloco>
  );
}
