"use client";

// Relatório semanal de desempenho do Data book — pedido do usuário (17/10/2026):
// quanto cada um da Qualidade (ana, carol, pedro, lailto…) iniciou, entregou
// (book PRONTO) e rastreou na semana, tempo médio (só a jornada, lib/jornada.ts),
// gráfico de colunas e observações. Botão só pro flpmac14 e o lailto
// (podeVerRelatorioSemanal). Folha A4 retrato pra imprimir / salvar em PDF.
// Parâmetro: ?semana=AAAA-MM-DD (qualquer dia da semana; vazio = semana atual).
// Base: databook_itens (quem/quando iniciou, finalizou e rastreou — o último
// apontamento de cada pedido).

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { listarDatabook } from "@/lib/api";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import { emailParaLogin } from "@/lib/loginInterno";
import { minutosUteis } from "@/lib/jornada";
import { podeVerRelatorioSemanal } from "@/lib/databookRelatorio";
import type { ItemDatabook } from "@/lib/types";

const SEMANAS_GRAFICO = 8;
const BOOK_PRONTO = new Set(["PRONTO", "PRONTO AGUARDANDO COLETA"]);
const DIA = 86400000;
const CORES = ["#16a34a", "#2563eb", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#4d7c0f", "#be185d"];

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
function duracao(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  return h ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
}
// Mesma pessoa com outro login — pedido do usuário (17/10/2026): "inspecao" é o Pedro.
const APELIDOS: Record<string, string> = { inspecao: "pedro" };
// Nome uniforme: login ("ana") ou nome da planilha ("Ana Paula") → "ana".
function pessoa(v: string | null): string | null {
  const s = (v ?? "").trim();
  if (!s || s === "—") return null;
  const login = s.includes("@") ? emailParaLogin(s) : s;
  const p = login.split(/[\s@.]/)[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return p ? (APELIDOS[p] ?? p) : null;
}
const nomeBonito = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);
const dentro = (iso: string | null, ini: number, fim: number) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= ini && t < fim;
};

interface Desempenho {
  pessoa: string;
  iniciados: number;
  entregues: ItemDatabook[];
  rastreabIni: number;
  rastreabFim: number;
  tempoBook: number | null; // média (min de jornada) dos entregues que têm início
  tempoRastreab: number | null;
  emAndamento: number; // agora: FAZENDO / RASTREABILIDADE dessa pessoa
}

function media(v: number[]): number | null {
  return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : null;
}

function calcular(itens: ItemDatabook[], ini: number, fim: number): Desempenho[] {
  const m = new Map<string, Desempenho>();
  const de = (p: string) => {
    let d = m.get(p);
    if (!d) {
      d = { pessoa: p, iniciados: 0, entregues: [], rastreabIni: 0, rastreabFim: 0, tempoBook: null, tempoRastreab: null, emAndamento: 0 };
      m.set(p, d);
    }
    return d;
  };
  const temposBook = new Map<string, number[]>();
  const temposRastreab = new Map<string, number[]>();
  for (const i of itens) {
    const pIni = pessoa(i.fazendo_por);
    const pFim = pessoa(i.finalizado_por);
    const pRi = pessoa(i.rastreab_inicio_por);
    const pRf = pessoa(i.rastreab_fim_por);
    if (pIni && dentro(i.fazendo_em, ini, fim)) de(pIni).iniciados++;
    if (pFim && dentro(i.finalizado_em, ini, fim)) {
      de(pFim).entregues.push(i);
      if (i.fazendo_em) temposBook.set(pFim, [...(temposBook.get(pFim) ?? []), minutosUteis(i.fazendo_em, i.finalizado_em!)]);
    }
    if (pRi && dentro(i.rastreab_inicio_em, ini, fim)) de(pRi).rastreabIni++;
    if (pRf && dentro(i.rastreab_fim_em, ini, fim)) {
      de(pRf).rastreabFim++;
      if (i.rastreab_inicio_em) temposRastreab.set(pRf, [...(temposRastreab.get(pRf) ?? []), minutosUteis(i.rastreab_inicio_em, i.rastreab_fim_em!)]);
    }
  }
  for (const d of m.values()) {
    d.tempoBook = media(temposBook.get(d.pessoa) ?? []);
    d.tempoRastreab = media(temposRastreab.get(d.pessoa) ?? []);
  }
  return [...m.values()].sort((a, b) => b.entregues.length - a.entregues.length || a.pessoa.localeCompare(b.pessoa));
}

// Gráfico de colunas agrupadas (SVG): uma categoria por grupo, uma coluna por série.
function GraficoColunas({
  categorias,
  series,
  altura = 190,
}: {
  categorias: string[];
  series: { nome: string; cor: string; valores: number[] }[];
  altura?: number;
}) {
  const largura = 700;
  const margem = { esq: 28, dir: 8, topo: 16, base: 30 };
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const passo = Math.max(1, Math.ceil(max / 4));
  const topo = passo * Math.ceil(max / passo);
  const areaH = altura - margem.topo - margem.base;
  const grupoW = (largura - margem.esq - margem.dir) / Math.max(1, categorias.length);
  const colW = Math.min(34, (grupoW * 0.8) / Math.max(1, series.length));
  const y = (v: number) => margem.topo + areaH - (v / topo) * areaH;
  const linhas = Array.from({ length: Math.floor(topo / passo) + 1 }, (_, k) => k * passo);
  return (
    <div>
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" role="img">
        {linhas.map((v) => (
          <g key={v}>
            <line x1={margem.esq} x2={largura - margem.dir} y1={y(v)} y2={y(v)} stroke="#e7e5e4" />
            <text x={margem.esq - 4} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#78716c">
              {v}
            </text>
          </g>
        ))}
        {categorias.map((c, ci) => {
          const x0 = margem.esq + ci * grupoW + (grupoW - colW * series.length) / 2;
          return (
            <g key={c}>
              {series.map((s, si) => {
                const v = s.valores[ci] ?? 0;
                const x = x0 + si * colW;
                return (
                  <g key={s.nome}>
                    <rect x={x + 1} y={y(v)} width={colW - 2} height={Math.max(0, margem.topo + areaH - y(v))} fill={s.cor} rx="2">
                      <title>{`${s.nome} — ${c}: ${v}`}</title>
                    </rect>
                    {v > 0 && (
                      <text x={x + colW / 2} y={y(v) - 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#292524">
                        {v}
                      </text>
                    )}
                  </g>
                );
              })}
              <text x={margem.esq + ci * grupoW + grupoW / 2} y={altura - 12} textAnchor="middle" fontSize="10" fill="#44403c">
                {c}
              </text>
            </g>
          );
        })}
        <line x1={margem.esq} x2={largura - margem.dir} y1={margem.topo + areaH} y2={margem.topo + areaH} stroke="#a8a29e" />
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-3 text-[11px] text-stone-600">
        {series.map((s) => (
          <span key={s.nome} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.cor }} />
            {s.nome}
          </span>
        ))}
      </div>
    </div>
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
  const fim = ini + 7 * DIA;
  const [itens, setItens] = useState<ItemDatabook[] | null>(null);
  const [erro, setErro] = useState("");
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));
  const chaveObs = `fcnexus.databook.semanal.obs.${isoDia(inicio)}`;
  // Observações da semana (salvas neste navegador); recarrega ao trocar de semana.
  const [obsEstado, setObsEstado] = useState<{ chave: string; v: Record<string, string> }>({ chave: "", v: {} });
  if (typeof window !== "undefined" && obsEstado.chave !== chaveObs) {
    let v: Record<string, string> = {};
    try {
      v = JSON.parse(localStorage.getItem(chaveObs) ?? "{}");
    } catch {
      // sem persistência
    }
    setObsEstado({ chave: chaveObs, v });
  }
  const obs = obsEstado.v;

  useEffect(() => {
    document.title = `Desempenho Data book - semana ${dm(inicio).replace("/", ".")} a ${dm(new Date(fim - DIA)).replace("/", ".")}`;
  }, [inicio, fim]);

  useEffect(() => {
    let ativo = true;
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => ativo && setPermitido(podeVerRelatorioSemanal(data.user?.email)));
    listarDatabook()
      .then((r) => ativo && setItens(r.itens))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  function mudarObs(chave: string, texto: string) {
    const novo = { ...obs, [chave]: texto };
    try {
      localStorage.setItem(chaveObs, JSON.stringify(novo));
    } catch {
      // sem persistência: vale só nesta folha
    }
    setObsEstado({ chave: chaveObs, v: novo });
  }

  function irSemana(delta: number) {
    router.replace(`/follow-up/databook-semanal?semana=${isoDia(new Date(ini + delta * 7 * DIA + DIA / 2))}`);
  }

  const semana = useMemo(() => (itens ? calcular(itens, ini, fim) : []), [itens, ini, fim]);
  // Evolução: entregas (book PRONTO) por pessoa nas últimas 8 semanas até a escolhida.
  const evolucao = useMemo(() => {
    if (!itens) return null;
    const semanas = Array.from({ length: SEMANAS_GRAFICO }, (_, k) => ini - (SEMANAS_GRAFICO - 1 - k) * 7 * DIA);
    const porSemana = semanas.map((s) => calcular(itens, s, s + 7 * DIA));
    const pessoas = [...new Set(porSemana.flatMap((l) => l.filter((d) => d.entregues.length).map((d) => d.pessoa)))].sort();
    return {
      categorias: semanas.map((s) => dm(new Date(s))),
      pessoas,
      valores: (p: string) => porSemana.map((l) => l.find((d) => d.pessoa === p)?.entregues.length ?? 0),
    };
  }, [itens, ini]);

  if (permitido === false) return <p className="p-8 text-stone-600">Este relatório é só para o flpmac14 e o Lailto.</p>;
  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens || !evolucao || permitido === null)
    return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  const corDe = (p: string) => CORES[Math.max(0, evolucao.pessoas.indexOf(p)) % CORES.length];
  const totais = {
    iniciados: semana.reduce((s, d) => s + d.iniciados, 0),
    entregues: semana.reduce((s, d) => s + d.entregues.length, 0),
    rastreabIni: semana.reduce((s, d) => s + d.rastreabIni, 0),
    rastreabFim: semana.reduce((s, d) => s + d.rastreabFim, 0),
  };
  const andamentoAgora = new Map<string, number>();
  for (const i of itens) {
    const p = i.st_book === "FAZENDO" ? pessoa(i.fazendo_por) : i.st_book === "RASTREABILIDADE" ? pessoa(i.rastreab_inicio_por) : null;
    if (p) andamentoAgora.set(p, (andamentoAgora.get(p) ?? 0) + 1);
  }
  const pendencias = itens
    .filter((i) => i.falta?.trim() && !BOOK_PRONTO.has((i.st_book ?? "").trim().toUpperCase()))
    .sort((a, b) => (a.cliente ?? "").localeCompare(b.cliente ?? "") || a.po.localeCompare(b.po, "pt-BR", { numeric: true }));
  const th = "border border-stone-300 bg-stone-100 px-2 py-1 text-[11px] font-semibold";
  const td = "border border-stone-300 px-2 py-1 text-center text-xs";

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2 px-4 print:hidden">
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

      <main className="folha-obra mx-auto flex max-w-[210mm] flex-col gap-4 bg-white p-6 text-stone-900 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-green-700 pb-2">
          <div>
            <h1 className="text-lg font-extrabold">Desempenho semanal — Data book (Qualidade)</h1>
            <p className="text-sm text-stone-600">
              Semana de {inicio.toLocaleDateString("pt-BR")} a {new Date(fim - DIA).toLocaleDateString("pt-BR")}
            </p>
          </div>
          <p className="text-right text-[10px] text-stone-500">
            FC Nexus — MACFAB
            <br />
            Gerado em {geradoEm}
          </p>
        </header>

        <section className="grid grid-cols-4 gap-2">
          {[
            ["Books iniciados", totais.iniciados],
            ["Books entregues (PRONTO)", totais.entregues],
            ["Rastreab. iniciadas", totais.rastreabIni],
            ["Rastreab. finalizadas", totais.rastreabFim],
          ].map(([rotulo, valor]) => (
            <div key={rotulo} className="rounded border border-stone-300 p-2 text-center">
              <p className="text-[10px] font-semibold uppercase text-stone-500">{rotulo}</p>
              <p className="font-mono text-2xl font-bold text-green-700">{valor}</p>
            </div>
          ))}
        </section>

        <section>
          <h2 className="mb-1 text-sm font-bold">Por pessoa na semana</h2>
          {semana.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum apontamento no Data book nesta semana.</p>
          ) : (
            <GraficoColunas
              categorias={semana.map((d) => nomeBonito(d.pessoa))}
              series={[
                { nome: "Books iniciados", cor: "#a8a29e", valores: semana.map((d) => d.iniciados) },
                { nome: "Books entregues (PRONTO)", cor: "#16a34a", valores: semana.map((d) => d.entregues.length) },
                { nome: "Rastreab. finalizadas", cor: "#7c3aed", valores: semana.map((d) => d.rastreabFim) },
              ]}
            />
          )}
        </section>

        {semana.length > 0 && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Pessoa</th>
                <th className={th}>Iniciados</th>
                <th className={th}>Entregues</th>
                <th className={th} title="Média FAZENDO → PRONTO dos entregues, só a jornada (seg–sex 7:30–17:18, sem o almoço)">Tempo médio book</th>
                <th className={th}>Rastreab. inic.</th>
                <th className={th}>Rastreab. final.</th>
                <th className={th} title="Média do início ao fim da rastreabilidade, só a jornada">Tempo médio rastreab.</th>
                <th className={th} title="Hoje: books em FAZENDO ou RASTREABILIDADE dessa pessoa">Em andamento agora</th>
              </tr>
            </thead>
            <tbody>
              {semana.map((d) => (
                <tr key={d.pessoa}>
                  <td className={`${td} text-left font-semibold`}>
                    <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: corDe(d.pessoa) }} />
                    {nomeBonito(d.pessoa)}
                  </td>
                  <td className={td}>{d.iniciados}</td>
                  <td className={`${td} font-bold text-green-700`}>{d.entregues.length}</td>
                  <td className={td}>{duracao(d.tempoBook)}</td>
                  <td className={td}>{d.rastreabIni}</td>
                  <td className={td}>{d.rastreabFim}</td>
                  <td className={td}>{duracao(d.tempoRastreab)}</td>
                  <td className={td}>{andamentoAgora.get(d.pessoa) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <section className="break-inside-avoid">
          <h2 className="mb-1 text-sm font-bold">Entregas por semana (books PRONTO) — últimas {SEMANAS_GRAFICO} semanas</h2>
          {evolucao.pessoas.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhuma entrega no período.</p>
          ) : (
            <GraficoColunas
              categorias={evolucao.categorias}
              series={evolucao.pessoas.map((p) => ({ nome: nomeBonito(p), cor: corDe(p), valores: evolucao.valores(p) }))}
            />
          )}
        </section>

        {semana.some((d) => d.entregues.length) && (
          <section>
            <h2 className="mb-1 text-sm font-bold">Books entregues na semana</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Pessoa</th>
                  <th className={th}>PO</th>
                  <th className={th}>Cliente</th>
                  <th className={th}>MAC</th>
                  <th className={`${th} text-left`}>Descrição</th>
                  <th className={th}>Entregue em</th>
                  <th className={th}>Tempo</th>
                </tr>
              </thead>
              <tbody>
                {semana.flatMap((d) =>
                  [...d.entregues]
                    .sort((a, b) => (a.finalizado_em ?? "").localeCompare(b.finalizado_em ?? ""))
                    .map((i) => (
                      <tr key={i.id} className="break-inside-avoid">
                        <td className={`${td} text-left`}>{nomeBonito(d.pessoa)}</td>
                        <td className={`${td} font-mono`}>{i.po}</td>
                        <td className={td}>{i.cliente ?? ""}</td>
                        <td className={`${td} font-mono`}>{i.mac ?? ""}</td>
                        <td className={`${td} max-w-[16rem] truncate text-left`}>{i.descricao ?? ""}</td>
                        <td className={td}>
                          {new Date(i.finalizado_em!).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className={td}>{i.fazendo_em ? duracao(minutosUteis(i.fazendo_em, i.finalizado_em!)) : "—"}</td>
                      </tr>
                    )),
                )}
              </tbody>
            </table>
          </section>
        )}

        <section className="break-inside-avoid">
          <h2 className="mb-1 text-sm font-bold">Observações</h2>
          <div className="flex flex-col gap-2">
            {[...semana.map((d) => d.pessoa), "geral"].map((p) => (
              <label key={p} className="flex flex-col gap-0.5 text-xs font-semibold text-stone-600">
                {p === "geral" ? "Geral" : nomeBonito(p)}
                <textarea
                  value={obs[p] ?? ""}
                  onChange={(e) => mudarObs(p, e.target.value)}
                  rows={2}
                  placeholder="Escreva aqui (fica salvo neste computador)…"
                  className="resize-y rounded border border-stone-300 px-2 py-1 text-sm font-normal text-stone-900 print:resize-none print:border-stone-400"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Pendências anotadas no "Falta p/ finalizar" — pedido do usuário (17/10/2026), no fim do relatório.
            Mesma regra do Data book: some quando o book fica PRONTO / Pronto Aguardando Coleta. */}
        <section>
          <h2 className="mb-1 text-sm font-bold">Pendências anotadas (Falta p/ finalizar) — {pendencias.length}</h2>
          {pendencias.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhuma pendência anotada.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>PO</th>
                  <th className={th}>Cliente</th>
                  <th className={th}>MAC</th>
                  <th className={th}>ST</th>
                  <th className={th}>ST.BOOK</th>
                  <th className={`${th} text-left`}>Falta p/ finalizar</th>
                  <th className={`${th} text-left`}>Obs.</th>
                  <th className={th} title="Quem mexeu por último no pedido do Data book">Última edição</th>
                </tr>
              </thead>
              <tbody>
                {pendencias.map((i) => (
                  <tr key={i.id} className="break-inside-avoid">
                    <td className={`${td} font-mono`}>{i.po}</td>
                    <td className={td}>{i.cliente ?? ""}</td>
                    <td className={`${td} font-mono`}>{i.mac ?? ""}</td>
                    <td className={td}>{i.st ?? ""}</td>
                    <td className={td}>{i.st_book ?? "—"}</td>
                    <td className={`${td} text-left font-semibold text-amber-800`}>{i.falta}</td>
                    <td className={`${td} text-left`}>{i.observacao ?? ""}</td>
                    <td className={td}>
                      {i.editado_por ? nomeBonito(pessoa(i.editado_por) ?? i.editado_por) : ""}
                      {i.editado_em && (
                        <span className="block text-[10px] text-stone-500">
                          {new Date(i.editado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="text-[10px] text-stone-500">
          Tempos contam só a jornada (seg–sex 7:30–17:18, sem o almoço 12–13). Base: último apontamento de cada pedido no Data book
          (quem iniciou, entregou e rastreou); status desfeitos não entram.
        </p>
      </main>
    </div>
  );
}

export default function RelatorioDatabookSemanal() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
