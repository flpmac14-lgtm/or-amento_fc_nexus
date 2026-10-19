"use client";

// Diagrama semanal de coleta — pedido do usuário (19/10/2026): na semana, só
// as coletas (coluna COLETA do Follow up) de cada cliente e a quantidade de
// itens (pedidos) de cada uma. Quadro seg–dom com um bloco por cliente em cada
// dia + gráfico de colunas empilhadas por cliente. Folha A4 paisagem pra
// imprimir / salvar em PDF. Parâmetro: ?semana=AAAA-MM-DD (qualquer dia da
// semana; vazio = semana atual). Aberto pela janela "Relatório de coleta".

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { listarFollowUp } from "@/lib/api";
import type { ItemFollowUp } from "@/lib/types";

const DIA = 86400000;
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
function dm(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Gráfico de colunas empilhadas (SVG): uma coluna por dia, um pedaço por cliente.
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
                  {h(v) >= 12 && (
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
            <text x={margem.esq + ci * grupoW + grupoW / 2} y={altura - 12} textAnchor="middle" fontSize="10" fill="#44403c">
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
  const inicio = useMemo(() => {
    const p = params.get("semana");
    const d = p ? new Date(`${p}T12:00:00`) : new Date();
    return segunda(isNaN(d.getTime()) ? new Date() : d);
  }, [params]);
  const ini = inicio.getTime();
  const [itens, setItens] = useState<ItemFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));

  useEffect(() => {
    document.title = `Coletas da semana ${dm(inicio).replace("/", ".")} a ${dm(new Date(ini + 6 * DIA)).replace("/", ".")}`;
  }, [inicio, ini]);

  useEffect(() => {
    let ativo = true;
    listarFollowUp()
      .then((r) => ativo && setItens(r.itens))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  function irSemana(delta: number) {
    router.replace(`/follow-up/coleta-semanal?semana=${isoDia(new Date(ini + delta * 7 * DIA + DIA / 2))}`);
  }

  // Dias da semana (AAAA-MM-DD) e, em cada um, itens por cliente.
  const semana = useMemo(() => {
    const dias = Array.from({ length: 7 }, (_, k) => isoDia(new Date(ini + k * DIA + DIA / 2)));
    const porDia = dias.map(() => new Map<string, number>());
    for (const i of itens ?? []) {
      const k = i.coleta_data ? dias.indexOf(i.coleta_data) : -1;
      if (k < 0) continue;
      const c = i.cliente?.trim() || "Sem cliente";
      porDia[k].set(c, (porDia[k].get(c) ?? 0) + 1);
    }
    const clientes = [...new Set(porDia.flatMap((m) => [...m.keys()]))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { dias, porDia, clientes };
  }, [itens, ini]);

  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens) return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  const corDe = (c: string) => CORES[Math.max(0, semana.clientes.indexOf(c)) % CORES.length];
  const totalDia = semana.porDia.map((m) => [...m.values()].reduce((s, n) => s + n, 0));
  const totalItens = totalDia.reduce((s, n) => s + n, 0);
  const coletas = semana.porDia.reduce((s, m) => s + m.size, 0);
  const totalCliente = (c: string) => semana.porDia.reduce((s, m) => s + (m.get(c) ?? 0), 0);
  // Sábado e domingo só aparecem se tiverem coleta.
  const visiveis = semana.dias.map((_, k) => k).filter((k) => k < 5 || totalDia[k] > 0);
  const th = "border border-stone-300 bg-stone-100 px-2 py-1 text-[11px] font-semibold";
  const td = "border border-stone-300 px-2 py-1 text-center text-xs";

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] flex-wrap items-center gap-2 px-4 print:hidden">
        <button type="button" onClick={() => irSemana(-1)} className="rounded-lg border border-stone-400 bg-white px-3 py-2 text-sm hover:bg-stone-100">
          ◀ Semana anterior
        </button>
        <button type="button" onClick={() => irSemana(1)} className="rounded-lg border border-stone-400 bg-white px-3 py-2 text-sm hover:bg-stone-100">
          Próxima semana ▶
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
            <h1 className="text-2xl font-bold">Coletas da semana</h1>
            <p className="text-sm text-stone-600">
              {inicio.toLocaleDateString("pt-BR")} a {new Date(ini + 6 * DIA).toLocaleDateString("pt-BR")}
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
          <p className="py-10 text-center text-stone-500">Nenhuma coleta marcada nesta semana.</p>
        ) : (
          <>
            {/* Quadro da semana: um bloco por cliente em cada dia. */}
            <section className="grid gap-2" style={{ gridTemplateColumns: `repeat(${visiveis.length}, minmax(0, 1fr))` }}>
              {visiveis.map((k) => {
                const dia = new Date(ini + k * DIA + DIA / 2);
                const clientes = [...semana.porDia[k].entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
                return (
                  <div key={k} className="flex min-h-[40mm] flex-col rounded border border-stone-300">
                    <div className="border-b border-stone-300 bg-stone-100 px-2 py-1 text-center">
                      <p className="text-xs font-bold">{NOMES_DIA[k]}</p>
                      <p className="text-[11px] text-stone-600">{dm(dia)}</p>
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-1.5">
                      {clientes.length === 0 ? (
                        <p className="m-auto text-[11px] text-stone-400">Sem coleta</p>
                      ) : (
                        clientes.map(([c, n]) => (
                          <div
                            key={c}
                            className="flex items-center justify-between rounded px-2 py-1 text-white"
                            style={{ backgroundColor: corDe(c) }}
                          >
                            <span className="text-sm font-bold">{c}</span>
                            <span className="font-mono text-sm font-bold">
                              {n} <span className="text-[10px] font-normal">{n === 1 ? "item" : "itens"}</span>
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                    {totalDia[k] > 0 && (
                      <p className="border-t border-stone-300 px-2 py-0.5 text-right text-[11px] text-stone-600">
                        Total: <strong>{totalDia[k]}</strong>
                      </p>
                    )}
                  </div>
                );
              })}
            </section>

            <section className="break-inside-avoid">
              <h2 className="mb-1 text-sm font-bold">Itens por dia de coleta</h2>
              <GraficoEmpilhado
                categorias={visiveis.map((k) => `${NOMES_DIA[k].slice(0, 3)} ${dm(new Date(ini + k * DIA + DIA / 2))}`)}
                series={semana.clientes.map((c) => ({ nome: c, cor: corDe(c), valores: visiveis.map((k) => semana.porDia[k].get(c) ?? 0) }))}
              />
              <div className="mt-1 flex flex-wrap justify-center gap-3 text-[11px] text-stone-600">
                {semana.clientes.map((c) => (
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
                  {visiveis.map((k) => (
                    <th key={k} className={th}>
                      {NOMES_DIA[k].slice(0, 3)} {dm(new Date(ini + k * DIA + DIA / 2))}
                    </th>
                  ))}
                  <th className={th}>Total de itens</th>
                </tr>
              </thead>
              <tbody>
                {semana.clientes.map((c) => (
                  <tr key={c}>
                    <td className={`${td} text-left font-semibold`}>
                      <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: corDe(c) }} />
                      {c}
                    </td>
                    {visiveis.map((k) => (
                      <td key={k} className={td}>
                        {semana.porDia[k].get(c) ?? ""}
                      </td>
                    ))}
                    <td className={`${td} font-bold text-green-700`}>{totalCliente(c)}</td>
                  </tr>
                ))}
                <tr>
                  <td className={`${td} text-left font-bold`}>Total</td>
                  {visiveis.map((k) => (
                    <td key={k} className={`${td} font-bold`}>
                      {totalDia[k] || ""}
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
