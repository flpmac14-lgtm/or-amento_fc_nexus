"use client";

// Diagrama de coleta — pedido do usuário (19/10/2026): no período, só as
// coletas (coluna COLETA do Follow up) de cada cliente e a quantidade de
// itens (pedidos) de cada uma. Calendário (uma linha por semana, seg–sex e
// sáb/dom se tiver coleta) com um bloco por cliente em cada dia + gráfico de
// colunas empilhadas por cliente + tabela. Folha A4 paisagem pra imprimir /
// salvar em PDF. Parâmetros: ?de=AAAA-MM-DD&ate=AAAA-MM-DD (período escolhido)
// ou ?semana=AAAA-MM-DD (qualquer dia da semana); vazio = semana atual.
// Aberto pela janela "Relatório de coleta".

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { listarFollowUp } from "@/lib/api";
import type { ItemFollowUp } from "@/lib/types";

const MAX_DIAS = 366;
const DIAS_GRAFICO_DIARIO = 31; // acima disso o gráfico agrupa por semana
const NOMES_DIA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const CORES = ["#16a34a", "#2563eb", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#4d7c0f", "#be185d", "#57534e", "#0f766e"];

// Segunda-feira 00:00 (hora local) da semana do dia.
function segunda(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}
function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function deIso(iso: string | null): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}
function somarDias(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function dm(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
// 0 = segunda … 6 = domingo.
const diaSemana = (d: Date) => (d.getDay() + 6) % 7;
const ehMesInteiro = (de: Date, ate: Date) =>
  de.getDate() === 1 && de.getMonth() === ate.getMonth() && de.getFullYear() === ate.getFullYear() && somarDias(ate, 1).getDate() === 1;

// Gráfico de colunas empilhadas (SVG): uma coluna por dia/semana, um pedaço por cliente.
function GraficoEmpilhado({
  categorias,
  series,
  altura = 200,
}: {
  categorias: string[];
  series: { nome: string; cor: string; valores: number[] }[];
  altura?: number;
}) {
  const largura = 900;
  const margem = { esq: 28, dir: 8, topo: 16, base: 30 };
  const totais = categorias.map((_, ci) => series.reduce((s, x) => s + (x.valores[ci] ?? 0), 0));
  const max = Math.max(1, ...totais);
  const passo = Math.max(1, Math.ceil(max / 4));
  const topo = passo * Math.ceil(max / passo);
  const areaH = altura - margem.topo - margem.base;
  const grupoW = (largura - margem.esq - margem.dir) / Math.max(1, categorias.length);
  const colW = Math.min(70, grupoW * 0.6);
  const fonteEixo = categorias.length > 16 ? 7 : 10;
  const h = (v: number) => (v / topo) * areaH;
  const base = margem.topo + areaH;
  const linhas = Array.from({ length: Math.floor(topo / passo) + 1 }, (_, k) => k * passo);
  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" role="img">
      {linhas.map((v) => (
        <g key={v}>
          <line x1={margem.esq} x2={largura - margem.dir} y1={base - h(v)} y2={base - h(v)} stroke="#e7e5e4" />
          <text x={margem.esq - 4} y={base - h(v) + 3} textAnchor="end" fontSize="9" fill="#78716c">
            {v}
          </text>
        </g>
      ))}
      {categorias.map((c, ci) => {
        const x = margem.esq + ci * grupoW + (grupoW - colW) / 2;
        let acumulado = 0;
        return (
          <g key={c}>
            {series.map((s) => {
              const v = s.valores[ci] ?? 0;
              if (!v) return null;
              const y = base - h(acumulado + v);
              acumulado += v;
              return (
                <g key={s.nome}>
                  <rect x={x} y={y} width={colW} height={h(v)} fill={s.cor} stroke="#fff" strokeWidth="1">
                    <title>{`${s.nome} — ${c}: ${v} item(ns)`}</title>
                  </rect>
                  {h(v) >= 12 && colW >= 14 && (
                    <text x={x + colW / 2} y={y + h(v) / 2 + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
                      {v}
                    </text>
                  )}
                </g>
              );
            })}
            {totais[ci] > 0 && (
              <text x={x + colW / 2} y={base - h(totais[ci]) - 4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#292524">
                {totais[ci]}
              </text>
            )}
            <text x={margem.esq + ci * grupoW + grupoW / 2} y={altura - 12} textAnchor="middle" fontSize={fonteEixo} fill="#44403c">
              {c}
            </text>
          </g>
        );
      })}
      <line x1={margem.esq} x2={largura - margem.dir} y1={base} y2={base} stroke="#a8a29e" />
    </svg>
  );
}

function Relatorio() {
  const params = useSearchParams();
  const router = useRouter();
  // Período: ?de/?ate; senão a semana (seg–dom) de ?semana ou de hoje.
  const { de, ate } = useMemo(() => {
    const d1 = deIso(params.get("de"));
    const d2 = deIso(params.get("ate"));
    if (d1 && d2) {
      const [a, b] = d1 <= d2 ? [d1, d2] : [d2, d1];
      return { de: a, ate: somarDias(a, Math.min(MAX_DIAS - 1, Math.round((b.getTime() - a.getTime()) / 86400000))) };
    }
    const s = segunda(deIso(params.get("semana")) ?? new Date());
    s.setHours(12);
    return { de: s, ate: somarDias(s, 6) };
  }, [params]);
  const deIsoStr = isoDia(de);
  const ateIsoStr = isoDia(ate);
  const ehSemana = diaSemana(de) === 0 && Math.round((ate.getTime() - de.getTime()) / 86400000) === 6;
  const [itens, setItens] = useState<ItemFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));

  useEffect(() => {
    document.title = `Coletas ${dm(de).replace("/", ".")} a ${dm(ate).replace("/", ".")}`;
  }, [de, ate]);

  useEffect(() => {
    let ativo = true;
    listarFollowUp()
      .then((r) => ativo && setItens(r.itens))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  function irPeriodo(a: Date, b: Date) {
    router.replace(`/follow-up/coleta-semanal?de=${isoDia(a)}&ate=${isoDia(b)}`);
  }
  // Anterior / próximo: mês inteiro anda de mês em mês; o resto anda o tamanho do período.
  function andar(delta: number) {
    if (ehMesInteiro(de, ate)) {
      const a = new Date(de.getFullYear(), de.getMonth() + delta, 1, 12);
      irPeriodo(a, new Date(a.getFullYear(), a.getMonth() + 1, 0, 12));
      return;
    }
    const n = Math.round((ate.getTime() - de.getTime()) / 86400000) + 1;
    irPeriodo(somarDias(de, delta * n), somarDias(ate, delta * n));
  }
  function estaSemana() {
    const s = segunda(new Date());
    s.setHours(12);
    irPeriodo(s, somarDias(s, 6));
  }
  function esteMes() {
    const h = new Date();
    irPeriodo(new Date(h.getFullYear(), h.getMonth(), 1, 12), new Date(h.getFullYear(), h.getMonth() + 1, 0, 12));
  }

  // Dias do período (AAAA-MM-DD) e, em cada um, itens por cliente.
  const periodo = useMemo(() => {
    const n = Math.round((ate.getTime() - de.getTime()) / 86400000) + 1;
    const dias = Array.from({ length: n }, (_, k) => somarDias(de, k));
    const indice = new Map(dias.map((d, k) => [isoDia(d), k]));
    const porDia = dias.map(() => new Map<string, number>());
    for (const i of itens ?? []) {
      const k = i.coleta_data ? indice.get(i.coleta_data) : undefined;
      if (k === undefined) continue;
      const c = i.cliente?.trim() || "Sem cliente";
      porDia[k].set(c, (porDia[k].get(c) ?? 0) + 1);
    }
    const clientes = [...new Set(porDia.flatMap((m) => [...m.keys()]))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { dias, porDia, clientes };
  }, [itens, de, ate]);

  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens) return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  const { dias, porDia, clientes } = periodo;
  const corDe = (c: string) => CORES[Math.max(0, clientes.indexOf(c)) % CORES.length];
  const totalDia = porDia.map((m) => [...m.values()].reduce((s, n) => s + n, 0));
  const totalItens = totalDia.reduce((s, n) => s + n, 0);
  const coletas = porDia.reduce((s, m) => s + m.size, 0);
  const totalCliente = (c: string) => porDia.reduce((s, m) => s + (m.get(c) ?? 0), 0);

  // Calendário: colunas seg–sex, e sábado/domingo só se algum tiver coleta no período.
  const colunasSemana = [0, 1, 2, 3, 4, 5, 6].filter((ds) => ds < 5 || dias.some((d, k) => diaSemana(d) === ds && totalDia[k] > 0));
  const semanas: (number | null)[][] = [];
  const iniciosSemana: Date[] = [];
  for (let s = segunda(de); s <= ate; s = somarDias(s, 7)) {
    iniciosSemana.push(s);
    semanas.push(
      colunasSemana.map((ds) => {
        const d = somarDias(s, ds);
        d.setHours(12);
        const k = Math.round((d.getTime() - de.getTime()) / 86400000);
        return k >= 0 && k < dias.length ? k : null;
      }),
    );
  }

  // Gráfico e tabela: por dia até 31 dias (sem sáb/dom vazios); acima disso, por semana.
  const porSemana = dias.length > DIAS_GRAFICO_DIARIO;
  const baldes: { rotulo: string; ks: number[] }[] = porSemana
    ? iniciosSemana.map((ini) => ({
        rotulo: `Sem ${dm(ini)}`,
        ks: dias.map((_, k) => k).filter((k) => segunda(dias[k]).getTime() === ini.getTime()),
      }))
    : dias
        .map((d, k) => ({ d, k }))
        .filter(({ d, k }) => diaSemana(d) < 5 || totalDia[k] > 0)
        .map(({ d, k }) => ({ rotulo: dias.length > 7 ? dm(d) : `${NOMES_DIA[diaSemana(d)].slice(0, 3)} ${dm(d)}`, ks: [k] }));
  const somaBalde = (ks: number[], c?: string) => ks.reduce((s, k) => s + (c ? (porDia[k].get(c) ?? 0) : totalDia[k]), 0);
  // Na tabela, colunas sem nenhuma coleta não ajudam (período longo).
  const baldesTabela = dias.length > 7 ? baldes.filter((b) => somaBalde(b.ks) > 0) : baldes;

  const th = "border border-stone-300 bg-stone-100 px-1.5 py-1 text-[10px] font-semibold";
  const td = "border border-stone-300 px-1.5 py-1 text-center text-xs";
  const botao = "rounded-lg border border-stone-400 bg-white px-3 py-2 text-sm hover:bg-stone-100";
  const compacto = semanas.length > 2;

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] flex-wrap items-end gap-2 px-4 print:hidden">
        <button type="button" onClick={() => andar(-1)} className={botao} title="Período anterior">
          ◀
        </button>
        <button type="button" onClick={() => andar(1)} className={botao} title="Próximo período">
          ▶
        </button>
        <label className="flex flex-col text-[11px] text-stone-600">
          De
          <input
            type="date"
            value={deIsoStr}
            onChange={(e) => deIso(e.target.value) && irPeriodo(deIso(e.target.value)!, ate)}
            className="rounded-lg border border-stone-400 bg-white px-2 py-1.5 text-sm text-stone-900"
          />
        </label>
        <label className="flex flex-col text-[11px] text-stone-600">
          Até
          <input
            type="date"
            value={ateIsoStr}
            onChange={(e) => deIso(e.target.value) && irPeriodo(de, deIso(e.target.value)!)}
            className="rounded-lg border border-stone-400 bg-white px-2 py-1.5 text-sm text-stone-900"
          />
        </label>
        <button type="button" onClick={estaSemana} className={botao}>
          Esta semana
        </button>
        <button type="button" onClick={esteMes} className={botao}>
          Este mês
        </button>
        <span className="mr-auto" />
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-600">
          Imprimir / Salvar PDF
        </button>
        <button type="button" onClick={() => window.close()} className="rounded-lg border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100">
          Fechar
        </button>
      </div>

      <main className="folha-coleta mx-auto flex max-w-[297mm] flex-col gap-4 bg-white p-[8mm] text-stone-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between gap-4 border-b-4 border-green-700 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-green-800">FC Nexus · Follow up de obras</p>
            <h1 className="text-2xl font-bold">{ehSemana ? "Coletas da semana" : ehMesInteiro(de, ate) ? "Coletas do mês" : "Coletas do período"}</h1>
            <p className="text-sm text-stone-600">
              {de.toLocaleDateString("pt-BR")} a {ate.toLocaleDateString("pt-BR")}
            </p>
          </div>
          <div className="flex gap-5 text-right text-xs text-stone-500">
            <p>
              Coletas <span className="block font-mono text-base font-bold text-stone-900">{coletas}</span>
            </p>
            <p>
              Itens <span className="block font-mono text-base font-bold text-stone-900">{totalItens}</span>
            </p>
            <p>
              Gerado em <span className="block font-medium text-stone-700">{geradoEm}</span>
            </p>
          </div>
        </header>

        {totalItens === 0 ? (
          <p className="py-10 text-center text-stone-500">Nenhuma coleta marcada neste período.</p>
        ) : (
          <>
            {/* Calendário: uma linha por semana, um bloco por cliente em cada dia. */}
            <section className="flex flex-col gap-1">
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${colunasSemana.length}, minmax(0, 1fr))` }}>
                {colunasSemana.map((ds) => (
                  <p key={ds} className="rounded bg-stone-100 py-0.5 text-center text-xs font-bold">
                    {NOMES_DIA[ds]}
                  </p>
                ))}
              </div>
              {semanas.map((linha, si) => (
                <div
                  key={si}
                  className="grid break-inside-avoid gap-1"
                  style={{ gridTemplateColumns: `repeat(${colunasSemana.length}, minmax(0, 1fr))` }}
                >
                  {linha.map((k, ci) =>
                    k === null ? (
                      <div key={ci} className="rounded border border-dashed border-stone-200" />
                    ) : (
                      <div key={ci} className={`flex flex-col rounded border border-stone-300 ${compacto ? "min-h-[16mm]" : "min-h-[40mm]"}`}>
                        <p className="border-b border-stone-200 px-1.5 py-0.5 text-[11px] text-stone-600">
                          <strong className="text-stone-900">{dm(dias[k])}</strong>
                          {totalDia[k] > 0 && <span className="float-right">Total: <strong>{totalDia[k]}</strong></span>}
                        </p>
                        <div className="flex flex-1 flex-col gap-0.5 p-1">
                          {porDia[k].size === 0 ? (
                            !compacto && <p className="m-auto text-[11px] text-stone-400">Sem coleta</p>
                          ) : (
                            [...porDia[k].entries()]
                              .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
                              .map(([c, n]) => (
                                <div
                                  key={c}
                                  className={`flex items-center justify-between rounded px-1.5 text-white ${compacto ? "py-0 text-[11px]" : "py-1 text-sm"}`}
                                  style={{ backgroundColor: corDe(c) }}
                                >
                                  <span className="font-bold">{c}</span>
                                  <span className="font-mono font-bold">
                                    {n} <span className="text-[9px] font-normal">{n === 1 ? "item" : "itens"}</span>
                                  </span>
                                </div>
                              ))
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ))}
            </section>

            <section className="break-inside-avoid">
              <h2 className="mb-1 text-sm font-bold">Itens por {porSemana ? "semana" : "dia"} de coleta</h2>
              <GraficoEmpilhado
                categorias={baldes.map((b) => b.rotulo)}
                series={clientes.map((c) => ({ nome: c, cor: corDe(c), valores: baldes.map((b) => somaBalde(b.ks, c)) }))}
              />
              <div className="mt-1 flex flex-wrap justify-center gap-3 text-[11px] text-stone-600">
                {clientes.map((c) => (
                  <span key={c} className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: corDe(c) }} />
                    {c}
                  </span>
                ))}
              </div>
            </section>

            <table className="w-full break-inside-avoid border-collapse">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Cliente</th>
                  {baldesTabela.map((b) => (
                    <th key={b.rotulo} className={th}>
                      {b.rotulo}
                    </th>
                  ))}
                  <th className={th}>Total de itens</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c}>
                    <td className={`${td} text-left font-semibold`}>
                      <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: corDe(c) }} />
                      {c}
                    </td>
                    {baldesTabela.map((b) => (
                      <td key={b.rotulo} className={td}>
                        {somaBalde(b.ks, c) || ""}
                      </td>
                    ))}
                    <td className={`${td} font-bold text-green-700`}>{totalCliente(c)}</td>
                  </tr>
                ))}
                <tr>
                  <td className={`${td} text-left font-bold`}>Total</td>
                  {baldesTabela.map((b) => (
                    <td key={b.rotulo} className={`${td} font-bold`}>
                      {somaBalde(b.ks) || ""}
                    </td>
                  ))}
                  <td className={`${td} font-bold text-green-700`}>{totalItens}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        <p className="text-[10px] text-stone-500">
          Base: data da coluna COLETA do Follow up (inclusive pedidos que já saíram da planilha). Item = pedido (linha do Follow up).
        </p>
      </main>
    </div>
  );
}

export default function RelatorioColetaSemanal() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
