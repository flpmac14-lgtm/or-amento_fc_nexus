"use client";

// Follow up no celular — pedido do usuário (22/10/2026): no celular a tabela
// larga não dá pra usar; aqui é pesquisar, ver o status de cada pedido em
// cartões e abrir os relatórios. Tocar no cartão abre o card do item (o mesmo
// do PC, onde dá pra editar). Usa os mesmos filtros/lista do FollowUp.tsx.

import { useState } from "react";
import { urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { ETAPAS, faltaMaterial, situacaoEtapa, type ContextoRegras, type SituacaoPrazo } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";
import { SeloPrazo, SeloStatus } from "@/components/FollowUpDetalhe";

const POR_VEZ = 30;

const CHIPS_PRAZO: { valor: SituacaoPrazo | ""; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "atrasado", rotulo: "Atrasados" },
  { valor: "hoje", rotulo: "Vence hoje" },
  { valor: "proximo", rotulo: "Próx. 7 dias" },
  { valor: "no_prazo", rotulo: "No prazo" },
];

const classeSelect =
  "w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 outline-none focus:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500";

export default function FollowUpCelular({
  itens,
  total,
  carregando,
  busca,
  cliente,
  status,
  prazo,
  opcoesCliente,
  opcoesStatus,
  indicadores,
  ctx,
  corBarra,
  maxBarra,
  filtrosAlterados,
  onBusca,
  onCliente,
  onStatus,
  onPrazo,
  onLimpar,
  onAbrir,
  onRelatorioColeta,
  onRelatorioObra,
  onRelatorioAlivio,
}: {
  itens: ItemFollowUp[];
  total: number;
  carregando: boolean;
  busca: string;
  cliente: string;
  status: string;
  prazo: SituacaoPrazo | "";
  opcoesCliente: string[];
  opcoesStatus: string[];
  indicadores: { peso: number; prontos: number; atrasados: number; vencendo: number };
  ctx: ContextoRegras;
  corBarra: string;
  maxBarra: number;
  filtrosAlterados: boolean;
  onBusca: (v: string) => void;
  onCliente: (v: string) => void;
  onStatus: (v: string) => void;
  onPrazo: (v: SituacaoPrazo | "") => void;
  onLimpar: () => void;
  onAbrir: (item: ItemFollowUp) => void;
  onRelatorioColeta: () => void;
  onRelatorioObra: () => void;
  onRelatorioAlivio: () => void;
}) {
  const [limite, setLimite] = useState(POR_VEZ);
  const visiveis = itens.slice(0, limite);

  // Filtro mudou → volta pros primeiros cartões.
  function filtrar<T>(fn: (v: T) => void) {
    return (v: T) => {
      setLimite(POR_VEZ);
      fn(v);
    };
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Pesquisa + filtros principais */}
      <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40">
        <input
          type="search"
          value={busca}
          onChange={(e) => filtrar(onBusca)(e.target.value)}
          placeholder="🔎 PO, MAC, desenho, descrição ou NF"
          enterKeyHint="search"
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500"
        />
        <div className="grid grid-cols-2 gap-2">
          <select value={cliente} onChange={(e) => filtrar(onCliente)(e.target.value)} className={classeSelect} aria-label="Cliente">
            <option value="">Todos os clientes</option>
            {opcoesCliente.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => filtrar(onStatus)(e.target.value)} className={classeSelect} aria-label="Status">
            <option value="">Todos os status</option>
            {opcoesStatus.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
          {CHIPS_PRAZO.map((c) => (
            <button
              key={c.rotulo}
              type="button"
              onClick={() => filtrar(onPrazo)(c.valor)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
                prazo === c.valor
                  ? "border-green-600 bg-green-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                  : "border-stone-300 bg-white text-stone-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {c.rotulo}
            </button>
          ))}
          {filtrosAlterados && (
            <button
              type="button"
              onClick={filtrar(() => onLimpar())}
              className="shrink-0 rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 dark:border-red-800 dark:text-red-400"
            >
              ✕ Limpar
            </button>
          )}
        </div>
      </div>

      {/* Resumo do que está filtrado */}
      <div className="grid grid-cols-4 gap-1.5 text-center">
        {[
          { rotulo: "Pedidos", valor: String(itens.length), cor: "text-stone-900 dark:text-white" },
          { rotulo: "Peso kg", valor: formatarNumero(indicadores.peso, 0), cor: "text-green-700 dark:text-cyan-300" },
          { rotulo: "Atrasados", valor: String(indicadores.atrasados), cor: "text-red-600 dark:text-red-400" },
          { rotulo: "Vencendo", valor: String(indicadores.vencendo), cor: "text-amber-600 dark:text-amber-400" },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-lg border border-stone-200 bg-white px-1 py-1.5 dark:border-slate-800 dark:bg-slate-900/40">
            <p className={`font-mono text-base font-bold leading-tight ${k.cor}`}>{k.valor}</p>
            <p className="text-[10px] uppercase tracking-wide text-stone-500 dark:text-slate-500">{k.rotulo}</p>
          </div>
        ))}
      </div>

      {/* Relatórios */}
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-0.5">
        {[
          { rotulo: "📋 Relatório de coleta", acao: onRelatorioColeta },
          { rotulo: "🏗️ Relatório por obra", acao: onRelatorioObra },
          { rotulo: "🔥 Alívio de tensão", acao: onRelatorioAlivio },
        ].map((r) => (
          <button
            key={r.rotulo}
            type="button"
            onClick={r.acao}
            disabled={total === 0}
            className="shrink-0 rounded-lg border border-green-600/60 bg-white px-3 py-2 text-sm font-medium text-green-700 disabled:opacity-40 dark:border-cyan-500/60 dark:bg-slate-900 dark:text-cyan-300"
          >
            {r.rotulo}
          </button>
        ))}
      </div>

      {/* Cartões */}
      {visiveis.map((item) => (
        <CartaoPedido key={item.id} item={item} ctx={ctx} corBarra={corBarra} maxBarra={maxBarra} onAbrir={() => onAbrir(item)} />
      ))}
      {itens.length === 0 && (
        <p className="rounded-lg border border-dashed border-stone-300 px-3 py-8 text-center text-sm text-stone-500 dark:border-slate-700 dark:text-slate-500">
          {carregando ? "Carregando… (o servidor pode levar até 1 minuto para acordar)" : "Nenhum pedido com esses filtros."}
        </p>
      )}
      {itens.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + POR_VEZ)}
          className="rounded-lg border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
        >
          Mostrar mais ({itens.length - limite} restantes)
        </button>
      )}
    </div>
  );
}

function CartaoPedido({
  item,
  ctx,
  corBarra,
  maxBarra,
  onAbrir,
}: {
  item: ItemFollowUp;
  ctx: ContextoRegras;
  corBarra: string;
  maxBarra: number;
  onAbrir: () => void;
}) {
  const foto = item.imagens[0];
  const falta = faltaMaterial(item);
  const coleta = item.coleta_data ? formatarDataBr(item.coleta_data) : (item.coleta ?? "").trim();
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`flex w-full flex-col gap-2 rounded-xl border p-3 text-left shadow-sm active:scale-[0.99] ${
        falta
          ? "border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/40"
          : "border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900/60"
      } ${item.presente_na_ultima_importacao ? "" : "opacity-50"}`}
    >
      <div className="flex gap-3">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200 bg-white dark:border-slate-700">
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine
            <img src={urlImagemFollowUp(foto.sha256)} alt="" loading="lazy" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-stone-400">sem foto</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center justify-between gap-1">
            <span className="font-mono text-sm font-bold text-stone-900 dark:text-white">{item.po}</span>
            <SeloPrazo prazo={item.prazo_contratual} compacto />
          </span>
          <span className="mt-0.5 block truncate text-xs text-stone-500 dark:text-slate-400">
            {[item.cliente, item.mac && `MAC ${item.mac}`, item.quantidade !== null && `Qtd ${formatarNumero(item.quantidade, 0)}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
          <span className="mt-0.5 line-clamp-2 text-sm leading-snug text-stone-800 dark:text-slate-200">{item.descricao ?? "—"}</span>
        </span>
      </div>

      <span className="flex flex-wrap items-center gap-1.5">
        <SeloStatus item={item} ctx={ctx} />
        {falta && (
          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">Falta material</span>
        )}
        {item.fornecedor && (
          <span className="truncate rounded border border-stone-300 px-1.5 py-0.5 text-[11px] text-stone-600 dark:border-slate-700 dark:text-slate-300">
            {item.fornecedor}
          </span>
        )}
      </span>

      {/* Etapas: 8 quadradinhos com o avanço */}
      <span className="grid grid-cols-8 gap-1">
        {ETAPAS.map((e) => {
          const valor = item[e.campo] as number | null;
          const s = situacaoEtapa(valor);
          const pct = valor === null ? 0 : Math.max(0, Math.min(100, (valor / (maxBarra || 100)) * 100));
          return (
            <span key={e.campo} className="flex flex-col items-center gap-0.5" title={`${e.nome}: ${valor ?? 0}%`}>
              <span className="relative h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
                {pct > 0 && <span className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: corBarra }} />}
              </span>
              <span
                className={`text-[9px] font-semibold ${
                  s === "concluida" ? "text-green-700 dark:text-green-400" : s === "parcial" ? "text-stone-800 dark:text-slate-200" : "text-stone-400 dark:text-slate-600"
                }`}
              >
                {e.rotulo}
              </span>
            </span>
          );
        })}
      </span>

      {(coleta || item.obs_felipe_marcelo) && (
        <span className="flex flex-col gap-1 text-xs">
          {coleta && (
            <span className="text-stone-600 dark:text-slate-400">
              🚚 Coleta: <strong className="text-stone-900 dark:text-white">{coleta}</strong>
            </span>
          )}
          {item.obs_felipe_marcelo && (
            <span className="line-clamp-2 rounded bg-amber-100 px-1.5 py-1 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              {item.obs_felipe_marcelo}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
