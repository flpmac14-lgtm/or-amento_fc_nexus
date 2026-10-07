"use client";

// Visão Geral — tela inicial / torre de controle da fábrica (pedido do
// usuário). Cada bloco busca o seu endpoint /painel/... (app/painel.py) e tem
// o seu próprio carregamento/erro. Atualiza sozinha a cada 5 min + botão.
// Em telas ≥ 1280px (TV 1920×1080) cabe sem rolagem; menor, rola normal.
// Só o admin e a conta marcelo chegam aqui (proxy.ts). Cabeçalho e menu: components/AppShell.tsx.

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell, { classeBotaoCabecalho } from "@/components/AppShell";
import { BlocoEsteira } from "@/components/VisaoGeralBlocos";
import VisaoGeralCompras from "@/components/VisaoGeralCompras";
import VisaoGeralCorte from "@/components/VisaoGeralCorte";
import VisaoGeralFinanceiro from "@/components/VisaoGeralFinanceiro";
import { Janela, useBloco, type ListaAberta } from "@/components/VisaoGeralComum";
import VisaoGeralProjeto from "@/components/VisaoGeralProjeto";
import VisaoGeralRegistros from "@/components/VisaoGeralRegistros";
import VisaoGeralUsinagem from "@/components/VisaoGeralUsinagem";
import { podeVerFinanceiro } from "@/lib/financeiro";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
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
  // Financeiro (pedido do usuário): só a conta flpmac14 — /api/financeiro confere de novo no servidor.
  const [comFinanceiro, setComFinanceiro] = useState(false);
  useEffect(() => {
    let ativo = true;
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => ativo && setComFinanceiro(podeVerFinanceiro(data.user?.email)));
    return () => {
      ativo = false;
    };
  }, []);

  const campo =
    "rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-stone-800 dark:text-slate-200";
  const filtrando = Object.values(filtros).some(Boolean);

  return (
    <AppShell
      titulo="Visão Geral"
      subtitulo={
        <span title={opcoes?.planilha_sincronizada_em ? `Planilha sincronizada às ${horaMinuto(opcoes.planilha_sincronizada_em)}` : undefined}>
          atualizado às {horaMinuto(atualizadoEm)}
          {opcoes?.planilha_sincronizada_em && ` · planilha ${horaMinuto(opcoes.planilha_sincronizada_em)}`}
        </span>
      }
      acoes={
        <>
          <button type="button" onClick={atualizar} className={classeBotaoCabecalho} title="Atualizar agora">
            ⟳<span className="hidden sm:inline"> Atualizar</span>
          </button>
          <button
            type="button"
            onClick={() => setRegistrosAbertos(true)}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-green-500 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
          >
            📋<span className="hidden sm:inline"> Registros do dia</span>
            {registros.dados ? ` · ${registros.dados.eventos.length}` : ""}
          </button>
        </>
      }
    >
    {/* Em telas ≥ 1280px (TV 1920×1080) cabe sem rolagem: altura da tela menos o cabeçalho (~61px).
        xl:flex-none: com flex-1 a altura era ignorada e a página crescia (bug de 07/10, dentro do AppShell). */}
    <div className="flex flex-1 flex-col xl:h-[calc(100dvh-4rem)] xl:flex-none xl:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60 sm:px-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Filtros</span>
        <select value={filtros.cliente} onChange={(e) => setFiltros((f) => ({ ...f, cliente: e.target.value }))} className={`${campo} max-w-[12rem]`}>
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
        <label className="flex flex-wrap items-center gap-1 text-xs text-stone-500 dark:text-slate-400" title="Filtra pelo prazo contratual (KPIs de obras e Esteira)">
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
      </div>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-3 p-3 xl:grid-rows-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid min-h-[22rem] grid-cols-[minmax(0,1fr)] gap-3 xl:min-h-0 xl:grid-cols-[repeat(4,minmax(0,1fr))]">
          {/* Pedido do usuário: Usinagem no lugar do "Atenção hoje" (BlocoAtencao segue em VisaoGeralBlocos). */}
          <VisaoGeralUsinagem tick={tick} />
          <VisaoGeralCorte tick={tick} />
          <VisaoGeralCompras tick={tick} />
        </div>
        {/* Com o Financeiro (só flpmac14), ele fica embaixo da Usinagem e a Esteira estreita. */}
        <div
          className="grid min-h-[24rem] grid-cols-[minmax(0,1fr)] gap-3 xl:min-h-0 xl:grid-cols-(--colunas-baixo)"
          style={
            {
              "--colunas-baixo": comFinanceiro
                ? "minmax(0,0.85fr) minmax(0,1.55fr) minmax(0,1fr) minmax(0,1fr)"
                : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)",
            } as React.CSSProperties
          }
        >
          {comFinanceiro && <VisaoGeralFinanceiro tick={tick} />}
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
    </AppShell>
  );
}
