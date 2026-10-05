"use client";

// Bloco 4 — Entregas do mês por cliente: colunas empilhadas (entregue escuro,
// programado claro), top N + "Outros", seletor de mês e métrica Pedidos/Kg.
// SVG próprio (o projeto não tem biblioteca de gráficos).

import { useMemo, useState } from "react";
import { Bloco, TabelaPedidos, Vazio, useBloco, type ListaAberta } from "@/components/VisaoGeralComum";
import { kg, type ClienteEntregas, type RespostaEntregas } from "@/lib/painel";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function mesAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function somarMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nomeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]}/${a}`;
}

type Metrica = "pedidos" | "kg";

function valores(c: ClienteEntregas, metrica: Metrica): [number, number] {
  return metrica === "kg" ? [c.kg_entregue, c.kg_programado] : [c.entregues, c.programados];
}

function formatar(v: number, metrica: Metrica): string {
  return metrica === "kg" ? kg(v) : v.toLocaleString("pt-BR");
}

export default function VisaoGeralEntregas({
  params,
  tick,
  abrir,
}: {
  params: Record<string, string>;
  tick: number;
  abrir: (l: ListaAberta) => void;
}) {
  const [mes, setMes] = useState(mesAtual);
  const [metrica, setMetrica] = useState<Metrica>("pedidos");
  const [foco, setFoco] = useState<number | null>(null);
  const { dados, erro, carregando } = useBloco<RespostaEntregas>(
    "entregas",
    { mes, cliente: params.cliente, obra: params.obra },
    tick,
  );

  const colunas = useMemo(() => {
    if (!dados) return [];
    const ordenados = [...dados.clientes].sort((a, b) => {
      const [ea, pa] = valores(a, metrica);
      const [eb, pb] = valores(b, metrica);
      return eb + pb - (ea + pa);
    });
    const top = ordenados.slice(0, dados.top);
    const resto = ordenados.slice(dados.top);
    if (resto.length) {
      top.push({
        cliente: `Outros (${resto.length})`,
        entregues: resto.reduce((s, c) => s + c.entregues, 0),
        programados: resto.reduce((s, c) => s + c.programados, 0),
        kg_entregue: resto.reduce((s, c) => s + c.kg_entregue, 0),
        kg_programado: resto.reduce((s, c) => s + c.kg_programado, 0),
        pedidos: resto.flatMap((c) => c.pedidos),
      });
    }
    return top;
  }, [dados, metrica]);

  const maximo = Math.max(1, ...colunas.map((c) => valores(c, metrica)[0] + valores(c, metrica)[1]));
  const L = 100 / Math.max(colunas.length, 1);
  const focado = foco !== null ? colunas[foco] : null;

  const botao =
    "rounded-md border border-stone-300 dark:border-slate-700 px-2 py-0.5 text-stone-700 dark:text-slate-300 hover:border-green-600 dark:hover:border-cyan-400";
  return (
    <Bloco
      titulo="📦 Entregas"
      carregando={carregando}
      erro={erro}
      extra={
        <>
          <button type="button" className={botao} onClick={() => setMes((m) => somarMes(m, -1))} aria-label="Mês anterior">‹</button>
          <span className="w-28 text-center font-semibold text-stone-800 dark:text-slate-200">{nomeMes(mes)}</span>
          <button type="button" className={botao} onClick={() => setMes((m) => somarMes(m, 1))} aria-label="Próximo mês">›</button>
          <select
            value={metrica}
            onChange={(e) => setMetrica(e.target.value as Metrica)}
            className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1 py-0.5 text-stone-700 dark:text-slate-300"
          >
            <option value="pedidos">Nº de pedidos</option>
            <option value="kg">Kg</option>
          </select>
        </>
      }
    >
      <div className="mb-1 flex shrink-0 items-center gap-4 text-xs text-stone-600 dark:text-slate-400">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-green-700 dark:bg-cyan-500" /> entregue (ST E)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-green-300 dark:bg-cyan-900" /> programado no mês (ST A com coleta)</span>
        {focado && (
          <span className="ml-auto font-semibold text-stone-800 dark:text-slate-200">
            {focado.cliente}: {formatar(valores(focado, metrica)[0], metrica)} entregue · {formatar(valores(focado, metrica)[1], metrica)} programado ·
            total {formatar(valores(focado, metrica)[0] + valores(focado, metrica)[1], metrica)}
          </span>
        )}
      </div>
      {dados && colunas.length === 0 ? (
        <Vazio>Nenhuma coleta com data em {nomeMes(mes)}.</Vazio>
      ) : (
        <div className="relative min-h-[10rem] flex-1">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 top-0 h-[calc(100%-1.5rem)] w-full">
            {colunas.map((c, idx) => {
              const [e, p] = valores(c, metrica);
              const he = (e / maximo) * 92;
              const hp = (p / maximo) * 92;
              const x = idx * L + L * 0.18;
              const w = L * 0.64;
              return (
                <g
                  key={c.cliente}
                  className="cursor-pointer"
                  onMouseEnter={() => setFoco(idx)}
                  onMouseLeave={() => setFoco(null)}
                  onClick={() =>
                    abrir({
                      titulo: `Entregas de ${c.cliente} — ${nomeMes(mes)}`,
                      subtitulo: `${c.entregues} entregue(s) (${kg(c.kg_entregue)}) · ${c.programados} programado(s) (${kg(c.kg_programado)})`,
                      conteudo: <TabelaPedidos pedidos={c.pedidos} />,
                    })
                  }
                >
                  <rect x={idx * L} y={0} width={L} height={100} fill="transparent" />
                  <rect x={x} y={100 - he} width={w} height={he} className="fill-green-700 dark:fill-cyan-500" />
                  <rect x={x} y={100 - he - hp} width={w} height={hp} className="fill-green-300 dark:fill-cyan-900" />
                </g>
              );
            })}
          </svg>
          {/* rótulos fora do SVG (preserveAspectRatio="none" deformaria o texto) */}
          {colunas.map((c, idx) => {
            const total = valores(c, metrica)[0] + valores(c, metrica)[1];
            const topo = (total / maximo) * 92;
            return (
              <div key={c.cliente} className="pointer-events-none absolute flex flex-col items-center" style={{ left: `${idx * L}%`, width: `${L}%`, top: 0, bottom: 0 }}>
                <span
                  className="absolute text-sm font-bold text-stone-900 dark:text-white"
                  style={{ bottom: `calc(1.5rem + (100% - 1.5rem) * ${topo / 100})` }}
                >
                  {formatar(total, metrica)}
                </span>
                <span className="absolute bottom-0 truncate text-sm font-semibold text-stone-700 dark:text-slate-300">{c.cliente}</span>
              </div>
            );
          })}
        </div>
      )}
    </Bloco>
  );
}
