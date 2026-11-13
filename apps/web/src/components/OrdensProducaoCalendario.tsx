"use client";

// Calendário de apontamento — sub-aba de Ordens de produção, pedido do usuário
// (13/11/2026): "calendário de apontamento; caso eu clique alguma data e
// determine ela como feriado, também não contabilizar". Dia marcado como
// feriado não conta hora no apontamento (igual sábado/domingo) — tabela
// prod_feriados (migration 0071), aplicado em lib/producao.ts::minutosApontamento.
// Marcar/tirar: podePlanejarOP (flpmac14 e marcelo/PCP); os outros só olham.

import { useMemo, useState } from "react";
import { api, classeBotao, classeBotaoPerigo, classeBotaoPrimario, classeCampo, classeCartao } from "@/components/ProducaoComum";
import { chaveDia } from "@/lib/jornada";
import type { Feriado } from "@/lib/producao";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Domingo de Páscoa (algoritmo de Meeus/Butcher). */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

/** Feriados nacionais do ano (+ Carnaval e Corpus Christi, que a maioria das fábricas não trabalha). */
export function feriadosNacionais(ano: number): Feriado[] {
  const p = pascoa(ano);
  const mais = (dias: number) => chaveDia(new Date(p.getFullYear(), p.getMonth(), p.getDate() + dias));
  const fixo = (mm: number, dd: number) => `${ano}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  return [
    { data: fixo(1, 1), descricao: "Confraternização Universal" },
    { data: mais(-48), descricao: "Carnaval (segunda)" },
    { data: mais(-47), descricao: "Carnaval (terça)" },
    { data: mais(-2), descricao: "Sexta-feira Santa" },
    { data: fixo(4, 21), descricao: "Tiradentes" },
    { data: fixo(5, 1), descricao: "Dia do Trabalho" },
    { data: mais(60), descricao: "Corpus Christi" },
    { data: fixo(9, 7), descricao: "Independência do Brasil" },
    { data: fixo(10, 12), descricao: "Nossa Senhora Aparecida" },
    { data: fixo(11, 2), descricao: "Finados" },
    { data: fixo(11, 15), descricao: "Proclamação da República" },
    { data: fixo(11, 20), descricao: "Dia da Consciência Negra" },
    { data: fixo(12, 25), descricao: "Natal" },
  ].sort((a, b) => a.data.localeCompare(b.data));
}

const fmtData = (k: string) => {
  const [a, m, d] = k.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
};

export default function OrdensProducaoCalendario({
  feriados,
  podeEditar,
  aoMudar,
}: {
  feriados: Feriado[];
  podeEditar: boolean;
  aoMudar: () => void;
}) {
  const hoje = new Date();
  const [mes, setMes] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  // Mudança otimista: aparece na hora, antes do recarregar da tela trazer do banco.
  const [local, setLocal] = useState<Record<string, Feriado | null>>({});

  const mapa = useMemo(() => {
    const m = new Map(feriados.map((f) => [f.data, f]));
    for (const [k, v] of Object.entries(local)) {
      if (v) m.set(k, v);
      else m.delete(k);
    }
    return m;
  }, [feriados, local]);

  const ano = mes.getFullYear();
  const dias = useMemo(() => {
    const primeiro = new Date(mes.getFullYear(), mes.getMonth(), 1);
    const ini = new Date(primeiro);
    ini.setDate(1 - primeiro.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i));
  }, [mes]);
  const doMes = dias.filter((d) => d.getMonth() === mes.getMonth());
  const uteisMes = doMes.filter((d) => d.getDay() >= 1 && d.getDay() <= 5 && !mapa.has(chaveDia(d))).length;
  const feriadosAno = [...mapa.values()].filter((f) => f.data.startsWith(`${ano}-`)).sort((a, b) => a.data.localeCompare(b.data));
  const nacionaisFaltando = feriadosNacionais(ano).filter((f) => !mapa.has(f.data));

  async function enviar(corpo: Record<string, unknown>, otimista: Record<string, Feriado | null>) {
    setSalvando(true);
    setErro("");
    try {
      await api("/api/follow-up/producao", corpo);
      setLocal((l) => ({ ...l, ...otimista }));
      setEscolhido(null);
      setDescricao("");
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const marcar = (data: string) => {
    const f = { data, descricao: descricao.trim() || "Feriado" };
    return enviar({ acao: "marcar_feriados", feriados: [f] }, { [data]: f });
  };
  const tirar = (data: string) => enviar({ acao: "tirar_feriado", data }, { [data]: null });
  const marcarNacionais = () =>
    enviar({ acao: "marcar_feriados", feriados: nacionaisFaltando }, Object.fromEntries(nacionaisFaltando.map((f) => [f.data, f])));

  const sel = escolhido ? mapa.get(escolhido) ?? null : null;
  const selFimDeSemana = escolhido ? [0, 6].includes(new Date(`${escolhido}T12:00:00`).getDay()) : false;

  return (
    <div className="flex flex-col gap-3">
      <div className={`${classeCartao} flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs text-stone-600 dark:text-slate-300`}>
        <span>
          <b>Conta no apontamento:</b> segunda a sexta, 7:30–12:00 e 13:00–17:18 (8h48 por dia).
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-300 dark:bg-emerald-500/20" /> dia útil
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-red-100 ring-1 ring-red-300 dark:bg-red-500/20" /> feriado (não conta)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-stone-200 dark:bg-slate-700" /> sábado/domingo (não conta)
        </span>
        {podeEditar && <span className="text-stone-500">Clique num dia pra marcar ou tirar o feriado.</span>}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* Calendário do mês */}
        <section className={`${classeCartao} p-3`}>
          <div className="mb-2 flex items-center gap-2">
            <button type="button" className={classeBotao} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} aria-label="Mês anterior">
              ‹
            </button>
            <h3 className="min-w-[10rem] text-center text-lg font-bold text-stone-800 dark:text-slate-100">
              {MESES[mes.getMonth()]} {ano}
            </h3>
            <button type="button" className={classeBotao} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} aria-label="Próximo mês">
              ›
            </button>
            <button type="button" className={classeBotao} onClick={() => setMes(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}>
              Hoje
            </button>
            <span className="ml-auto text-xs text-stone-500">
              {uteisMes} dias úteis · {Math.floor((uteisMes * 528) / 60)}h{String((uteisMes * 528) % 60).padStart(2, "0")} de jornada
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-stone-500">
            {SEMANA.map((s) => (
              <div key={s} className="py-1">
                {s}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {dias.map((d) => {
              const k = chaveDia(d);
              const fora = d.getMonth() !== mes.getMonth();
              const fds = d.getDay() === 0 || d.getDay() === 6;
              const fer = mapa.get(k);
              const ehHoje = k === chaveDia(hoje);
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!podeEditar && !fer}
                  onClick={() => {
                    setEscolhido(k === escolhido ? null : k);
                    setDescricao("");
                    setErro("");
                  }}
                  title={fer ? `${fer.descricao ?? "Feriado"} — não conta no apontamento` : fds ? "Fim de semana — não conta" : "Dia útil — conta 8h48"}
                  className={`flex min-h-[4.2rem] flex-col items-start rounded-lg p-1.5 text-left text-xs transition-colors ${fora ? "opacity-40" : ""} ${
                    fer
                      ? "bg-red-50 text-red-800 ring-1 ring-red-300 hover:bg-red-100 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-500/40"
                      : fds
                        ? "bg-stone-100 text-stone-400 hover:bg-stone-200 dark:bg-slate-800/60 dark:text-slate-500"
                        : "bg-emerald-50/60 text-stone-700 ring-1 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/5 dark:text-slate-200 dark:ring-emerald-500/20"
                  } ${escolhido === k ? "outline outline-2 outline-offset-1 outline-sky-500" : ""}`}
                >
                  <span className={`text-sm font-bold ${ehHoje ? "rounded-full bg-sky-600 px-1.5 text-white" : ""}`}>{d.getDate()}</span>
                  {fer ? (
                    <span className="mt-0.5 line-clamp-2 text-[10px] font-semibold leading-tight">{fer.descricao ?? "Feriado"}</span>
                  ) : (
                    !fds && <span className="mt-auto text-[10px] text-emerald-700/70 dark:text-emerald-400/70">8h48</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Dia escolhido */}
          {escolhido && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/60 p-2.5 text-sm dark:border-sky-500/30 dark:bg-sky-500/5">
              <b className="capitalize">{fmtData(escolhido)}</b>
              {sel ? (
                <>
                  <span className="text-red-700 dark:text-red-300">Feriado: {sel.descricao ?? "Feriado"} — não conta no apontamento.</span>
                  {podeEditar && (
                    <button type="button" className={`${classeBotaoPerigo} ml-auto`} disabled={salvando} onClick={() => tirar(escolhido)}>
                      {salvando ? "Salvando…" : "Tirar feriado (volta a contar)"}
                    </button>
                  )}
                </>
              ) : podeEditar ? (
                <>
                  {selFimDeSemana && <span className="text-xs text-stone-500">(fim de semana já não conta)</span>}
                  <input
                    autoFocus
                    className={`${classeCampo} max-w-xs`}
                    placeholder="Nome do feriado (ex.: Aniversário da cidade)"
                    value={descricao}
                    maxLength={120}
                    onChange={(e) => setDescricao(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !salvando && marcar(escolhido)}
                  />
                  <button type="button" className={classeBotaoPrimario} disabled={salvando} onClick={() => marcar(escolhido)}>
                    {salvando ? "Salvando…" : "Marcar como feriado"}
                  </button>
                  <button type="button" className={classeBotao} onClick={() => setEscolhido(null)}>
                    Cancelar
                  </button>
                </>
              ) : null}
              {erro && <p className="basis-full text-sm text-red-600">{erro}</p>}
            </div>
          )}
        </section>

        {/* Feriados do ano */}
        <section className={`${classeCartao} flex flex-col`}>
          <header className="flex items-center gap-2 border-b border-stone-200 px-3 py-2 dark:border-slate-800">
            <h3 className="font-bold text-stone-800 dark:text-slate-100">Feriados de {ano}</h3>
            <span className="text-xs text-stone-500">({feriadosAno.length})</span>
          </header>
          {podeEditar && nacionaisFaltando.length > 0 && (
            <div className="border-b border-stone-100 px-3 py-2 dark:border-slate-800">
              <button type="button" className={classeBotao} disabled={salvando} onClick={marcarNacionais} title={nacionaisFaltando.map((f) => `${fmtData(f.data)} · ${f.descricao}`).join("\n")}>
                ＋ Marcar os feriados nacionais de {ano} ({nacionaisFaltando.length})
              </button>
              <p className="mt-1 text-[11px] text-stone-500">Inclui Carnaval e Corpus Christi. Os municipais/estaduais, marque clicando no dia.</p>
            </div>
          )}
          {feriadosAno.length ? (
            <ul className="divide-y divide-stone-100 text-sm dark:divide-slate-800">
              {feriadosAno.map((f) => (
                <li key={f.data} className="flex items-center gap-2 px-3 py-1.5">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => {
                      const [a, m] = f.data.split("-").map(Number);
                      setMes(new Date(a, m - 1, 1));
                      setEscolhido(f.data);
                    }}
                  >
                    <span className="block text-xs capitalize text-stone-500">{fmtData(f.data)}</span>
                    <span className="block font-medium text-stone-800 dark:text-slate-100">{f.descricao ?? "Feriado"}</span>
                  </button>
                  {podeEditar && (
                    <button type="button" className="rounded px-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10" disabled={salvando} onClick={() => tirar(f.data)} title="Tirar feriado (volta a contar)">
                      ✕
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-4 text-sm text-stone-500">Nenhum feriado marcado em {ano}.</p>
          )}
        </section>
      </div>
    </div>
  );
}
