"use client";

// Visão Geral — tela inicial / torre de controle da fábrica (pedido do
// usuário). Cada bloco busca o seu endpoint /painel/... (app/painel.py) e tem
// o seu próprio carregamento/erro. Atualiza sozinha a cada 5 min + botão.
// Em telas ≥ 1280px (TV 1920×1080) cabe sem rolagem; menor, rola normal.
// Contas restritas nem chegam aqui (proxy.ts manda pra /follow-up).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BlocoAtencao, BlocoEsteira } from "@/components/VisaoGeralBlocos";
import VisaoGeralCompras from "@/components/VisaoGeralCompras";
import VisaoGeralCorte from "@/components/VisaoGeralCorte";
import { Janela, useBloco, type ListaAberta } from "@/components/VisaoGeralComum";
import VisaoGeralProjeto from "@/components/VisaoGeralProjeto";
import VisaoGeralRegistros from "@/components/VisaoGeralRegistros";
import {
  FILTROS_PAINEL_VAZIOS,
  horaMinuto,
  type FiltrosPainel,
  type OpcoesPainel,
  type RespostaRegistros,
} from "@/lib/painel";

const ATUALIZAR_A_CADA_MS = 5 * 60 * 1000;

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PaginaVisaoGeral() {
  const [tick, setTick] = useState(0);
  const [atualizadoEm, setAtualizadoEm] = useState(() => new Date());
  const [filtros, setFiltros] = useState<FiltrosPainel>(FILTROS_PAINEL_VAZIOS);
  const [lista, setLista] = useState<ListaAberta | null>(null);
  const [registrosAbertos, setRegistrosAbertos] = useState(false);
  const [dataRegistros, setDataRegistros] = useState(hojeIso);

  const atualizar = useCallback(() => {
    setTick((t) => t + 1);
    setAtualizadoEm(new Date());
  }, []);
  useEffect(() => {
    const id = setInterval(atualizar, ATUALIZAR_A_CADA_MS);
    return () => clearInterval(id);
  }, [atualizar]);

  const params = useMemo(
    () => ({ cliente: filtros.cliente, obra: filtros.obra, prazo_de: filtros.prazoDe, prazo_ate: filtros.prazoAte }),
    [filtros],
  );
  const { dados: opcoes } = useBloco<OpcoesPainel>("opcoes", {}, tick);
  const registros = useBloco<RespostaRegistros>("registros", { data: dataRegistros }, tick);
  const fecharLista = useCallback(() => setLista(null), []);

  const campo =
    "rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-stone-800 dark:text-slate-200";
  const filtrando = Object.values(filtros).some(Boolean);

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 dark:bg-slate-950 xl:h-screen xl:overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 pl-16 pr-4">
        <h1 className="text-xl font-bold text-stone-900 dark:text-white">
          FC Nexus <span className="text-green-600 dark:text-cyan-400">·</span> Visão Geral
        </h1>
        <span
          className="text-sm text-stone-500 dark:text-slate-400"
          title={opcoes?.planilha_sincronizada_em ? `Planilha sincronizada às ${horaMinuto(opcoes.planilha_sincronizada_em)}` : undefined}
        >
          atualizado às {horaMinuto(atualizadoEm)}
          {opcoes?.planilha_sincronizada_em && ` · planilha ${horaMinuto(opcoes.planilha_sincronizada_em)}`}
        </span>
        <button type="button" onClick={atualizar} className={`${campo} hover:border-green-600 dark:hover:border-cyan-400`} title="Atualizar agora">
          ⟳ Atualizar
        </button>

        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <select value={filtros.cliente} onChange={(e) => setFiltros((f) => ({ ...f, cliente: e.target.value }))} className={campo}>
            <option value="">Todos os clientes</option>
            {opcoes?.clientes.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input
            list="painel-obras"
            value={filtros.obra}
            onChange={(e) => setFiltros((f) => ({ ...f, obra: e.target.value.trim() }))}
            placeholder="Obra (MAC)"
            className={`${campo} w-28`}
          />
          <datalist id="painel-obras">
            {opcoes?.obras.map((o) => <option key={o} value={o} />)}
          </datalist>
          <label className="flex items-center gap-1 text-xs text-stone-500 dark:text-slate-400" title="Filtra pelo prazo contratual (KPIs de obras, Atenção e Esteira)">
            Prazo
            <input type="date" value={filtros.prazoDe} onChange={(e) => setFiltros((f) => ({ ...f, prazoDe: e.target.value }))} className={campo} />
            até
            <input type="date" value={filtros.prazoAte} onChange={(e) => setFiltros((f) => ({ ...f, prazoAte: e.target.value }))} className={campo} />
          </label>
          {filtrando && (
            <button type="button" onClick={() => setFiltros(FILTROS_PAINEL_VAZIOS)} className={`${campo} hover:border-red-400`}>
              Limpar
            </button>
          )}
          <button
            type="button"
            onClick={() => setRegistrosAbertos(true)}
            className="rounded-lg bg-green-600 dark:bg-cyan-500 px-3 py-1.5 text-sm font-bold text-white dark:text-slate-950 hover:bg-green-500 dark:hover:bg-cyan-400"
          >
            📋 Registros do dia{registros.dados ? ` · ${registros.dados.eventos.length}` : ""}
          </button>
          <Link href="/" className={`${campo} hover:border-green-600 dark:hover:border-cyan-400`}>
            Orçamentos
          </Link>
          <Link href="/follow-up" className={`${campo} hover:border-green-600 dark:hover:border-cyan-400`}>
            Follow up
          </Link>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 p-3 xl:grid-rows-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid min-h-[22rem] grid-cols-[minmax(0,1fr)] gap-3 xl:min-h-0 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          <BlocoAtencao params={params} tick={tick} abrir={setLista} />
          <VisaoGeralCorte tick={tick} />
          <VisaoGeralCompras tick={tick} />
        </div>
        <div className="grid min-h-[24rem] grid-cols-[minmax(0,1fr)] gap-3 xl:min-h-0 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <BlocoEsteira params={params} tick={tick} />
          <VisaoGeralProjeto tick={tick} />
        </div>
      </main>

      {lista && <Janela lista={lista} fechar={fecharLista} />}
      {registrosAbertos && (
        <VisaoGeralRegistros
          dados={registros.dados}
          erro={registros.erro}
          carregando={registros.carregando}
          data={dataRegistros}
          setData={setDataRegistros}
          fechar={() => setRegistrosAbertos(false)}
        />
      )}
    </div>
  );
}
