"use client";

// Relatório semanal de desempenho do Data book — pedido do usuário (17/10/2026),
// refeito em 22/10/2026 sobre o apontamento por etapa (databook_etapas): o que
// cada um da Qualidade fez na semana — qual relatório (caldeiraria, usinagem,
// solda, pintura, rastreabilidade, montando/fim de book), quando iniciou,
// quando finalizou, pausas e tempo (só a jornada, lib/jornada.ts) —, a
// comparação com a semana anterior e o crescimento de cada um em 8 semanas.
// Botão só pro flpmac14 e o lailto (podeVerRelatorioSemanal). A4 retrato.
// Parâmetro: ?semana=AAAA-MM-DD (qualquer dia da semana; vazio = semana atual).
// Base: histórico de apontamentos (GET /databook/historico-geral, até 90 dias)
// + o que já estava no Data book antes das etapas (item.etapas sem id = legado).

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { listarDatabook, listarHistoricoGeralDatabook, type EventoHistoricoDatabook } from "@/lib/api";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import { emailParaLogin } from "@/lib/loginInterno";
import { minutosUteis } from "@/lib/jornada";
import { podeVerRelatorioSemanal } from "@/lib/databookRelatorio";
import { ETAPAS } from "@/components/DataBookApontar";
import type { ItemDatabook } from "@/lib/types";

const SEMANAS_GRAFICO = 8;
const MAX_DIAS_HISTORICO = 90; // limite do servidor
const BOOK_PRONTO = new Set(["PRONTO", "PRONTO AGUARDANDO COLETA"]);
const DIA = 86400000;
const CORES = ["#16a34a", "#2563eb", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#4d7c0f", "#be185d"];
// Cor de cada tipo de relatório (barras empilhadas e etiquetas).
const COR_ETAPA: Record<string, string> = {
  rel_caldeiraria: "#64748b",
  rel_usinagem: "#0891b2",
  rel_solda: "#ea580c",
  rel_pintura: "#db2777",
  rastreabilidade: "#7c3aed",
  montando_book: "#2563eb",
  fim_book: "#16a34a",
};
const NOME_ETAPA = new Map(ETAPAS.map((e) => [e.chave, e]));
const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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
function dataHora(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function duracao(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  return h ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min} min`;
}
// Mesma pessoa com outro login — pedido do usuário (17/10/2026): "inspecao" é o Pedro.
const APELIDOS: Record<string, string> = { inspecao: "pedro" };
// Nome uniforme: login ("ana") ou nome da planilha ("Carol - Qualidade") → "carol".
function pessoa(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s || s === "—") return null;
  const login = s.includes("@") ? emailParaLogin(s) : s;
  const p = login.split(/[\s@.]/)[0].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return p ? (APELIDOS[p] ?? p) : null;
}
const nomeBonito = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);
const dentro = (iso: string | null, ini: number, fim: number) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= ini && t < fim;
};

// Um ciclo de uma etapa num pedido: início → (pausas) → finalizado.
interface Ciclo {
  itemId: string;
  etapa: string;
  inicioEm: string | null;
  inicioPor: string | null;
  fimEm: string | null;
  fimPor: string | null;
  pausas: [string, string | null][];
  pausado: boolean;
  obs: string | null;
  legado: boolean; // veio do Data book antigo (antes do apontamento por etapa)
}

// Tempo de jornada do ciclo sem as pausas (só se tem início e fim).
function tempoCiclo(c: Ciclo): number | null {
  if (!c.inicioEm || !c.fimEm) return null;
  let t = minutosUteis(c.inicioEm, c.fimEm);
  for (const [p0, p1] of c.pausas) t -= minutosUteis(p0, p1 ?? c.fimEm);
  return Math.max(0, t);
}

// Mesma regra do servidor (app/databook_etapas.py::situacao), mas guardando todos os ciclos.
function montarCiclos(eventos: EventoHistoricoDatabook[], itens: ItemDatabook[]): Ciclo[] {
  const ciclos: Ciclo[] = [];
  const aberto = new Map<string, Ciclo>();
  const etapas = eventos
    .filter((e): e is Extract<EventoHistoricoDatabook, { tipo: "etapa" }> => e.tipo === "etapa" && !e.desfeito)
    .sort((a, b) => a.em.localeCompare(b.em) || a.id - b.id);
  for (const e of etapas) {
    const chave = `${e.item_id}|${e.etapa}`;
    const c = aberto.get(chave);
    if (e.acao === "inicio") {
      if (c && c.pausado && !c.fimEm) {
        c.pausas[c.pausas.length - 1][1] = e.em; // retomou: mesmo ciclo
        c.pausado = false;
      } else {
        const novo: Ciclo = {
          itemId: e.item_id, etapa: e.etapa, inicioEm: e.em, inicioPor: e.por, fimEm: null, fimPor: null,
          pausas: [], pausado: false, obs: null, legado: false,
        };
        ciclos.push(novo);
        aberto.set(chave, novo);
      }
    } else if (e.acao === "pausa") {
      if (c && c.inicioEm && !c.fimEm && !c.pausado) {
        c.pausas.push([e.em, null]);
        c.pausado = true;
      }
    } else if (c && !c.fimEm) {
      if (c.pausado) c.pausas[c.pausas.length - 1][1] = e.em;
      c.pausado = false;
      c.fimEm = e.em;
      c.fimPor = e.por;
    } else {
      // Finalizou sem início apontado.
      const novo: Ciclo = {
        itemId: e.item_id, etapa: e.etapa, inicioEm: null, inicioPor: null, fimEm: e.em, fimPor: e.por,
        pausas: [], pausado: false, obs: null, legado: false,
      };
      ciclos.push(novo);
      aberto.set(chave, novo);
    }
    if (e.observacao) {
      const alvo = aberto.get(chave);
      if (alvo) alvo.obs = e.observacao;
    }
  }
  // Legado: o que o Data book já tinha antes das etapas (sem apontamento por trás).
  // No legado, "montando book" (FAZENDO) termina junto com o "fim de book" (PRONTO):
  // vira um ciclo só — fim de book com o início da montagem — pra não contar o book duas vezes.
  const legado = (s: { fim_id?: number | null; inicio_id?: number | null } | undefined) => !!s && !s.fim_id && !s.inicio_id;
  for (const i of itens) {
    const et = i.etapas ?? {};
    const juntar = legado(et.montando_book) && legado(et.fim_book) && !!et.fim_book?.fim_em && et.montando_book?.fim_em === et.fim_book.fim_em;
    for (const [etapa, s] of Object.entries(et)) {
      if (!legado(s)) continue;
      if (!s.fim_em && !s.inicio_em) continue;
      if (juntar && etapa === "montando_book") continue;
      const ini = juntar && etapa === "fim_book" ? et.montando_book! : s;
      ciclos.push({
        itemId: i.id, etapa, inicioEm: ini.inicio_em, inicioPor: ini.inicio_por, fimEm: s.fim_em, fimPor: s.fim_por,
        pausas: [], pausado: false, obs: s.obs, legado: true,
      });
    }
  }
  return ciclos;
}

interface Desempenho {
  pessoa: string;
  finalizadas: Ciclo[];
  iniciadas: number;
  porEtapa: Record<string, number>;
  minutos: number; // soma do tempo das finalizadas que têm início
  comTempo: number;
  porDia: number[]; // finalizadas seg..sáb
}

function calcular(ciclos: Ciclo[], ini: number, fim: number): Map<string, Desempenho> {
  const m = new Map<string, Desempenho>();
  const de = (p: string) => {
    let d = m.get(p);
    if (!d) {
      d = { pessoa: p, finalizadas: [], iniciadas: 0, porEtapa: {}, minutos: 0, comTempo: 0, porDia: [0, 0, 0, 0, 0, 0] };
      m.set(p, d);
    }
    return d;
  };
  for (const c of ciclos) {
    const pIni = pessoa(c.inicioPor);
    const pFim = pessoa(c.fimPor);
    if (pIni && dentro(c.inicioEm, ini, fim)) de(pIni).iniciadas++;
    if (pFim && dentro(c.fimEm, ini, fim)) {
      const d = de(pFim);
      d.finalizadas.push(c);
      d.porEtapa[c.etapa] = (d.porEtapa[c.etapa] ?? 0) + 1;
      const t = tempoCiclo(c);
      if (t !== null) {
        d.minutos += t;
        d.comTempo++;
      }
      const dia = Math.floor((new Date(c.fimEm!).getTime() - ini) / DIA);
      if (dia >= 0 && dia < 6) d.porDia[dia]++;
    }
  }
  return m;
}

// Seta de crescimento em relação à semana anterior.
function Variacao({ atual, anterior }: { atual: number; anterior: number }) {
  const dif = atual - anterior;
  if (dif === 0) return <span className="text-[10px] font-semibold text-stone-400">= sem. anterior</span>;
  const pct = anterior ? Math.round((dif / anterior) * 100) : null;
  return (
    <span className={`text-[10px] font-bold ${dif > 0 ? "text-green-700" : "text-red-600"}`}>
      {dif > 0 ? "▲" : "▼"} {dif > 0 ? "+" : ""}
      {dif}
      {pct !== null ? ` (${dif > 0 ? "+" : ""}${pct}%)` : ""} vs sem. anterior
    </span>
  );
}

// Gráfico de linhas (SVG): crescimento de cada pessoa nas últimas semanas.
function GraficoLinhas({
  categorias,
  series,
  altura = 200,
}: {
  categorias: string[];
  series: { nome: string; cor: string; valores: number[] }[];
  altura?: number;
}) {
  const largura = 700;
  const margem = { esq: 30, dir: 14, topo: 14, base: 24 };
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const passo = Math.max(1, Math.ceil(max / 4));
  const topo = passo * Math.ceil(max / passo);
  const areaH = altura - margem.topo - margem.base;
  const areaW = largura - margem.esq - margem.dir;
  const x = (i: number) => margem.esq + (categorias.length > 1 ? (i / (categorias.length - 1)) * areaW : areaW / 2);
  const y = (v: number) => margem.topo + areaH - (v / topo) * areaH;
  const linhas = Array.from({ length: Math.floor(topo / passo) + 1 }, (_, k) => k * passo);
  return (
    <div>
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" role="img">
        {linhas.map((v) => (
          <g key={v}>
            <line x1={margem.esq} x2={largura - margem.dir} y1={y(v)} y2={y(v)} stroke="#e7e5e4" />
            <text x={margem.esq - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#78716c">
              {v}
            </text>
          </g>
        ))}
        {categorias.map((c, i) => (
          <text key={c} x={x(i)} y={altura - 8} textAnchor="middle" fontSize="9.5" fill={i === categorias.length - 1 ? "#1e3a5f" : "#57534e"} fontWeight={i === categorias.length - 1 ? 700 : 400}>
            {c}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.nome}>
            <polyline
              points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
              fill="none"
              stroke={s.cor}
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.valores.map((v, i) => (
              <g key={i}>
                <circle cx={x(i)} cy={y(v)} r="3" fill="#fff" stroke={s.cor} strokeWidth="2">
                  <title>{`${s.nome} — semana ${categorias[i]}: ${v}`}</title>
                </circle>
                {i === s.valores.length - 1 && v > 0 && (
                  <text x={x(i) + 6} y={y(v) + 3} fontSize="9" fontWeight="700" fill={s.cor}>
                    {v}
                  </text>
                )}
              </g>
            ))}
          </g>
        ))}
        <line x1={margem.esq} x2={largura - margem.dir} y1={margem.topo + areaH} y2={margem.topo + areaH} stroke="#a8a29e" />
      </svg>
      <div className="mt-1 flex flex-wrap justify-center gap-3 text-[11px] text-stone-600">
        {series.map((s) => (
          <span key={s.nome} className="inline-flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: s.cor }} />
            {s.nome}
          </span>
        ))}
      </div>
    </div>
  );
}

// Barra empilhada horizontal: quantos relatórios de cada tipo a pessoa finalizou.
function BarraTipos({ porEtapa, max }: { porEtapa: Record<string, number>; max: number }) {
  const total = Object.values(porEtapa).reduce((s, v) => s + v, 0);
  return (
    <div className="flex h-4 w-full overflow-hidden rounded bg-stone-100" style={{ width: `${Math.max(4, (total / Math.max(1, max)) * 100)}%` }}>
      {ETAPAS.filter((e) => porEtapa[e.chave]).map((e) => (
        <div
          key={e.chave}
          className="flex items-center justify-center text-[9px] font-bold text-white"
          style={{ width: `${(porEtapa[e.chave] / total) * 100}%`, backgroundColor: COR_ETAPA[e.chave] }}
          title={`${e.nome}: ${porEtapa[e.chave]}`}
        >
          {porEtapa[e.chave]}
        </div>
      ))}
    </div>
  );
}

function SeloEtapa({ etapa }: { etapa: string }) {
  const e = NOME_ETAPA.get(etapa);
  return (
    <span
      className="inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
      style={{ backgroundColor: COR_ETAPA[etapa] ?? "#78716c" }}
    >
      {e ? e.nome.replace("Relatório de ", "Rel. ") : etapa}
    </span>
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
  const inicioGrafico = ini - (SEMANAS_GRAFICO - 1) * 7 * DIA;
  const [itens, setItens] = useState<ItemDatabook[] | null>(null);
  const [eventos, setEventos] = useState<EventoHistoricoDatabook[] | null>(null);
  const [erro, setErro] = useState("");
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));
  const [agora] = useState(() => Date.now());
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
    // Dias de histórico pra cobrir as 8 semanas do gráfico (o servidor dá até 90).
    const dias = Math.min(MAX_DIAS_HISTORICO, Math.ceil((Date.now() - inicioGrafico) / DIA) + 1);
    Promise.all([listarDatabook(), listarHistoricoGeralDatabook(dias)])
      .then(([r, ev]) => {
        if (!ativo) return;
        setItens(r.itens);
        setEventos(ev);
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [inicioGrafico]);

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

  const ciclos = useMemo(() => (itens && eventos ? montarCiclos(eventos, itens) : null), [itens, eventos]);
  const porItem = useMemo(() => new Map((itens ?? []).map((i) => [i.id, i])), [itens]);
  const semana = useMemo(() => (ciclos ? calcular(ciclos, ini, fim) : new Map<string, Desempenho>()), [ciclos, ini, fim]);
  const anterior = useMemo(
    () => (ciclos ? calcular(ciclos, ini - 7 * DIA, ini) : new Map<string, Desempenho>()),
    [ciclos, ini],
  );
  // Crescimento: relatórios finalizados por pessoa nas 8 semanas até a escolhida.
  const evolucao = useMemo(() => {
    if (!ciclos) return null;
    const semanas = Array.from({ length: SEMANAS_GRAFICO }, (_, k) => inicioGrafico + k * 7 * DIA);
    const porSemana = semanas.map((s) => calcular(ciclos, s, s + 7 * DIA));
    const pessoas = [...new Set(porSemana.flatMap((m) => [...m.values()].filter((d) => d.finalizadas.length).map((d) => d.pessoa)))].sort();
    return {
      categorias: semanas.map((s) => dm(new Date(s))),
      pessoas,
      valores: (p: string) => porSemana.map((m) => m.get(p)?.finalizadas.length ?? 0),
    };
  }, [ciclos, inicioGrafico]);

  if (permitido === false) return <p className="p-8 text-stone-600">Este relatório é só para o flpmac14 e o Lailto.</p>;
  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens || !ciclos || !evolucao || permitido === null)
    return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  // Quem aparece: quem finalizou ou iniciou algo na semana (ou na anterior, pra comparar).
  const pessoasSemana = [...new Set([...semana.keys()])].sort(
    (a, b) => (semana.get(b)?.finalizadas.length ?? 0) - (semana.get(a)?.finalizadas.length ?? 0) || a.localeCompare(b),
  );
  const corDe = (p: string) => {
    const lista = [...new Set([...evolucao.pessoas, ...pessoasSemana])].sort();
    return CORES[Math.max(0, lista.indexOf(p)) % CORES.length];
  };
  const soma = (m: Map<string, Desempenho>, f: (d: Desempenho) => number) => [...m.values()].reduce((s, d) => s + f(d), 0);
  const totais = {
    finalizadas: soma(semana, (d) => d.finalizadas.length),
    finalizadasAnt: soma(anterior, (d) => d.finalizadas.length),
    books: soma(semana, (d) => d.porEtapa.fim_book ?? 0),
    booksAnt: soma(anterior, (d) => d.porEtapa.fim_book ?? 0),
    iniciadas: soma(semana, (d) => d.iniciadas),
    iniciadasAnt: soma(anterior, (d) => d.iniciadas),
  };
  const maxFinalizadas = Math.max(1, ...[...semana.values()].map((d) => d.finalizadas.length));

  // Em andamento agora (estado atual de cada etapa, com o legado).
  const andamento = new Map<string, { item: ItemDatabook; etapa: string; desde: string; pausado: boolean }[]>();
  for (const i of itens) {
    for (const [etapa, s] of Object.entries(i.etapas ?? {})) {
      if (!s.inicio_em || s.fim_em) continue;
      const p = pessoa(s.inicio_por);
      if (!p) continue;
      andamento.set(p, [...(andamento.get(p) ?? []), { item: i, etapa, desde: s.inicio_em, pausado: !!s.pausado_em }]);
    }
  }

  const totalAndamento = [...andamento.values()].reduce((s, l) => s + l.length, 0);
  const totalPausadas = [...andamento.values()].reduce((s, l) => s + l.filter((a) => a.pausado).length, 0);

  // O que cada um fez: ciclos que a pessoa iniciou ou finalizou na semana.
  const atividades = (p: string) =>
    ciclos
      .filter(
        (c) =>
          (pessoa(c.fimPor) === p && dentro(c.fimEm, ini, fim)) || (pessoa(c.inicioPor) === p && dentro(c.inicioEm, ini, fim)),
      )
      .sort((a, b) => (a.fimEm ?? a.inicioEm ?? "").localeCompare(b.fimEm ?? b.inicioEm ?? ""));

  const pendencias = itens
    .filter((i) => i.falta?.trim() && !BOOK_PRONTO.has((i.st_book ?? "").trim().toUpperCase()))
    .sort((a, b) => (a.cliente ?? "").localeCompare(b.cliente ?? "") || a.po.localeCompare(b.po, "pt-BR", { numeric: true }));
  const diasAteHoje = Math.max(1, Math.min(DIAS_SEMANA.length, Math.floor((agora - ini) / DIA) + 1));
  const historicoCurto = agora - inicioGrafico > MAX_DIAS_HISTORICO * DIA;
  const th = "border-b-2 border-[#1e3a5f] bg-stone-50 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[#1e3a5f]";
  const td = "border-b border-stone-200 px-2 py-1 text-center text-xs";
  const tituloSecao = (n: number, texto: string, detalhe?: string) => (
    <h2 className="mb-2 flex items-baseline gap-2 border-l-4 border-[#1e3a5f] pl-2 text-sm font-extrabold text-[#1e3a5f]">
      <span className="text-stone-400">{String(n).padStart(2, "0")}</span> {texto}
      {detalhe && <span className="text-[11px] font-normal text-stone-500">{detalhe}</span>}
    </h2>
  );

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
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-bold text-white hover:bg-[#14213a]">
          Imprimir / Salvar PDF
        </button>
        <button type="button" onClick={() => window.close()} className="rounded-lg border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100">
          Fechar
        </button>
      </div>

      <main className="folha-obra mx-auto flex max-w-[210mm] flex-col gap-5 bg-white p-6 text-stone-900 shadow print:max-w-none print:p-0 print:shadow-none">
        {/* Cabeçalho */}
        <header className="flex items-stretch justify-between gap-4 rounded-lg bg-gradient-to-r from-[#1e3a5f] to-[#14213a] px-5 py-4 text-white">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-200">Qualidade · Data book</p>
            <h1 className="text-xl font-extrabold leading-tight">Relatório semanal de desempenho</h1>
            <p className="mt-0.5 text-sm text-white/80">
              Semana de <strong>{inicio.toLocaleDateString("pt-BR")}</strong> a <strong>{new Date(fim - DIA).toLocaleDateString("pt-BR")}</strong>
            </p>
          </div>
          <div className="flex flex-col items-end justify-between text-right text-[10px] text-white/70">
            <span className="text-sm font-bold tracking-tight text-white">
              FC <span className="font-light text-cyan-200">Nexus</span> <span className="text-white/50">— MACFAB</span>
            </span>
            <span>Gerado em {geradoEm}</span>
          </div>
        </header>

        {/* 01 Resumo */}
        <section>
          {tituloSecao(1, "Resumo da semana")}
          <div className="grid grid-cols-4 gap-2">
            {[
              { rotulo: "Relatórios finalizados", valor: String(totais.finalizadas), a: totais.finalizadas, b: totais.finalizadasAnt, cor: "text-[#1e3a5f]" },
              { rotulo: "Books entregues", valor: String(totais.books), a: totais.books, b: totais.booksAnt, cor: "text-green-700" },
              { rotulo: "Etapas iniciadas", valor: String(totais.iniciadas), a: totais.iniciadas, b: totais.iniciadasAnt, cor: "text-stone-800" },
            ].map((k) => (
              <div key={k.rotulo} className="rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{k.rotulo}</p>
                <p className={`font-mono text-2xl font-extrabold leading-tight ${k.cor}`}>{k.valor}</p>
                <Variacao atual={k.a} anterior={k.b} />
              </div>
            ))}
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Em andamento agora</p>
              <p className="font-mono text-2xl font-extrabold leading-tight text-blue-700">{totalAndamento}</p>
              <span className="text-[10px] font-semibold text-amber-700">{totalPausadas} pausada(s)</span>
            </div>
          </div>
        </section>

        {/* 02 Ranking por pessoa */}
        <section className="break-inside-avoid">
          {tituloSecao(2, "Desempenho por pessoa", "relatórios finalizados na semana, por tipo")}
          {pessoasSemana.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum apontamento no Data book nesta semana.</p>
          ) : (
            <>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={`${th} text-left`}>Pessoa</th>
                    <th className={`${th} w-[34%] text-left`}>Finalizados por tipo</th>
                    <th className={th}>Final.</th>
                    <th className={th}>Iniciad.</th>
                    <th className={th}>Books</th>
                    <th className={th} title="Tempo médio de cada relatório, do início ao fim (só a jornada, sem as pausas) — só os que têm início apontado">Tempo médio</th>
                    <th className={th} title="Agora: etapas iniciadas e ainda não finalizadas">Em andam.</th>
                  </tr>
                </thead>
                <tbody>
                  {pessoasSemana.map((p, n) => {
                    const d = semana.get(p)!;
                    const ant = anterior.get(p)?.finalizadas.length ?? 0;
                    return (
                      <tr key={p} className="break-inside-avoid">
                        <td className={`${td} text-left`}>
                          <span className="flex items-center gap-1.5">
                            <span className="w-4 text-[10px] font-bold text-stone-400">{n + 1}º</span>
                            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: corDe(p) }} />
                            <span className="font-bold">{nomeBonito(p)}</span>
                          </span>
                        </td>
                        <td className={`${td} text-left`}>
                          <BarraTipos porEtapa={d.porEtapa} max={maxFinalizadas} />
                        </td>
                        <td className={td}>
                          <span className="font-mono text-sm font-extrabold text-[#1e3a5f]">{d.finalizadas.length}</span>
                          <span className={`block text-[9px] font-bold ${d.finalizadas.length > ant ? "text-green-700" : d.finalizadas.length < ant ? "text-red-600" : "text-stone-400"}`}>
                            {d.finalizadas.length > ant ? "▲" : d.finalizadas.length < ant ? "▼" : "="} ant. {ant}
                          </span>
                        </td>
                        <td className={td}>{d.iniciadas}</td>
                        <td className={`${td} font-bold text-green-700`}>{d.porEtapa.fim_book ?? 0}</td>
                        <td className={td}>{d.comTempo ? duracao(Math.round(d.minutos / d.comTempo)) : "—"}</td>
                        <td className={td}>{andamento.get(p)?.length ?? 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-stone-600">
                {ETAPAS.map((e) => (
                  <span key={e.chave} className="inline-flex items-center gap-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COR_ETAPA[e.chave] }} />
                    {e.nome}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        {/* 03 Por dia */}
        {pessoasSemana.length > 0 && (
          <section className="break-inside-avoid">
            {tituloSecao(3, "Ritmo por dia", "relatórios finalizados em cada dia")}
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Pessoa</th>
                  {DIAS_SEMANA.map((d, k) => (
                    <th key={d} className={th}>
                      {d} <span className="font-normal text-stone-500">{dm(new Date(ini + k * DIA + DIA / 2))}</span>
                    </th>
                  ))}
                  <th className={th}>Total</th>
                </tr>
              </thead>
              <tbody>
                {pessoasSemana.map((p) => {
                  const d = semana.get(p)!;
                  const max = Math.max(1, ...d.porDia);
                  return (
                    <tr key={p}>
                      <td className={`${td} text-left font-semibold`}>{nomeBonito(p)}</td>
                      {d.porDia.map((v, k) => (
                        <td key={k} className={td}>
                          <span
                            className="mx-auto flex h-6 w-10 items-center justify-center rounded font-mono text-xs font-bold"
                            style={{
                              backgroundColor: v ? `color-mix(in srgb, ${corDe(p)} ${20 + Math.round((v / max) * 60)}%, white)` : "#f5f5f4",
                              color: v ? "#1c1917" : "#a8a29e",
                            }}
                          >
                            {v || "·"}
                          </span>
                        </td>
                      ))}
                      <td className={`${td} font-bold`}>{d.finalizadas.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* 04 Crescimento — dia a dia na semana (acumulado) + as últimas 8 semanas em tabela */}
        {pessoasSemana.length > 0 && (
          <section className="break-inside-avoid">
            {tituloSecao(4, "Crescimento na semana", "relatórios finalizados acumulados, dia a dia")}
            <GraficoLinhas
              // Semana atual: só até hoje (os dias que ainda não chegaram não entram).
              categorias={DIAS_SEMANA.slice(0, diasAteHoje).map((d, k) => `${d} ${dm(new Date(ini + k * DIA + DIA / 2))}`)}
              series={pessoasSemana.map((p) => {
                let acc = 0;
                return { nome: nomeBonito(p), cor: corDe(p), valores: semana.get(p)!.porDia.slice(0, diasAteHoje).map((v) => (acc += v)) };
              })}
              altura={180}
            />
          </section>
        )}
        <section className="break-inside-avoid">
          {tituloSecao(pessoasSemana.length > 0 ? 5 : 4, "Comparativo das últimas semanas", `relatórios finalizados por semana — ${SEMANAS_GRAFICO} semanas`)}
          {evolucao.pessoas.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum relatório finalizado no período.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Pessoa</th>
                  {evolucao.categorias.map((c, k) => (
                    <th key={c} className={`${th} ${k === evolucao.categorias.length - 1 ? "!bg-[#1e3a5f] !text-white" : ""}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {evolucao.pessoas.map((p) => {
                  const v = evolucao.valores(p);
                  const max = Math.max(1, ...v);
                  return (
                    <tr key={p}>
                      <td className={`${td} text-left font-semibold`}>
                        <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ backgroundColor: corDe(p) }} />
                        {nomeBonito(p)}
                      </td>
                      {v.map((n, k) => (
                        <td key={k} className={`${td} font-mono ${k === v.length - 1 ? "font-extrabold" : ""}`}>
                          <span className="flex flex-col items-center gap-0.5">
                            {n || <span className="text-stone-300">·</span>}
                            <span className="h-1 rounded-full" style={{ width: `${(n / max) * 100}%`, minWidth: n ? 3 : 0, backgroundColor: corDe(p) }} />
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="mt-1 text-[10px] text-stone-500">
            Até 17/10/2026 os números vêm do Data book antigo (datas da planilha, muitas lançadas de uma vez); depois, do apontamento por etapa.
            {historicoCurto && ` O servidor guarda o histórico detalhado dos últimos ${MAX_DIAS_HISTORICO} dias.`}
          </p>
        </section>

        {/* 06 O que cada um fez */}
        <section>
          {tituloSecao(6, "O que cada um fez", "cada relatório: início, finalização, pausas e tempo")}
          {pessoasSemana.length === 0 && <p className="text-sm text-stone-500">Nada apontado nesta semana.</p>}
          <div className="flex flex-col gap-4">
            {pessoasSemana.map((p) => {
              const d = semana.get(p)!;
              const lista = atividades(p);
              return (
                <div key={p} className="overflow-hidden rounded-lg border border-stone-200">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-stone-200 bg-stone-50 px-3 py-2 break-after-avoid">
                    <span className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white" style={{ backgroundColor: corDe(p) }}>
                        {p.charAt(0).toUpperCase()}
                      </span>
                      <span className="text-sm font-extrabold">{nomeBonito(p)}</span>
                    </span>
                    <span className="text-xs text-stone-600">
                      <strong className="text-[#1e3a5f]">{d.finalizadas.length}</strong> finalizados · <strong>{d.iniciadas}</strong> iniciados · tempo médio{" "}
                      <strong>{d.comTempo ? duracao(Math.round(d.minutos / d.comTempo)) : "—"}</strong>
                    </span>
                    <span className="ml-auto">
                      <Variacao atual={d.finalizadas.length} anterior={anterior.get(p)?.finalizadas.length ?? 0} />
                    </span>
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className={`${th} !border-b !bg-white text-left`}>Relatório</th>
                        <th className={`${th} !border-b !bg-white text-left`}>PO / Cliente</th>
                        <th className={`${th} !border-b !bg-white`}>Início</th>
                        <th className={`${th} !border-b !bg-white`}>Finalizado</th>
                        <th className={`${th} !border-b !bg-white`}>Tempo</th>
                        <th className={`${th} !border-b !bg-white text-left`}>Situação / Obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((c, k) => {
                        const item = porItem.get(c.itemId);
                        const outroIni = c.inicioPor && pessoa(c.inicioPor) !== p ? nomeBonito(pessoa(c.inicioPor) ?? "") : null;
                        const outroFim = c.fimPor && pessoa(c.fimPor) !== p ? nomeBonito(pessoa(c.fimPor) ?? "") : null;
                        return (
                          <tr key={`${c.itemId}-${c.etapa}-${k}`} className="break-inside-avoid">
                            <td className={`${td} text-left`}>
                              <SeloEtapa etapa={c.etapa} />
                            </td>
                            <td className={`${td} text-left`}>
                              <span className="font-mono font-semibold">{item?.po ?? "—"}</span>
                              <span className="block max-w-[14rem] truncate text-[10px] text-stone-500">
                                {[item?.cliente, item?.mac, item?.descricao].filter(Boolean).join(" · ")}
                              </span>
                            </td>
                            <td className={`${td} whitespace-nowrap`}>
                              {dataHora(c.inicioEm)}
                              {outroIni && <span className="block text-[9px] text-stone-500">por {outroIni}</span>}
                            </td>
                            <td className={`${td} whitespace-nowrap`}>
                              {c.fimEm ? (
                                <span className="font-semibold text-green-700">{dataHora(c.fimEm)}</span>
                              ) : (
                                "—"
                              )}
                              {outroFim && <span className="block text-[9px] text-stone-500">por {outroFim}</span>}
                            </td>
                            <td className={`${td} whitespace-nowrap font-mono`}>
                              {duracao(tempoCiclo(c))}
                              {c.pausas.length > 0 && <span className="block text-[9px] text-amber-700">{c.pausas.length} pausa(s)</span>}
                            </td>
                            <td className={`${td} text-left`}>
                              {c.fimEm ? (
                                <span className="text-[10px] font-bold text-green-700">✓ Concluído</span>
                              ) : c.pausado ? (
                                <span className="text-[10px] font-bold text-amber-700">⏸ Pausado</span>
                              ) : (
                                <span className="text-[10px] font-bold text-blue-700">▶ Em andamento</span>
                              )}
                              {c.legado && <span className="ml-1 text-[9px] text-stone-400">(Data book antigo)</span>}
                              {c.obs && <span className="block text-[10px] italic text-stone-600">{c.obs}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </section>

        {/* 06 Em andamento agora */}
        {andamento.size > 0 && (
          <section className="break-inside-avoid">
            {tituloSecao(7, "Em andamento agora", "etapas iniciadas e ainda não finalizadas (hoje)")}
            <div className="grid grid-cols-2 gap-2">
              {[...andamento.entries()]
                .sort((a, b) => b[1].length - a[1].length)
                .map(([p, lista]) => (
                  <div key={p} className="rounded-lg border border-stone-200 p-2">
                    <p className="mb-1 text-xs font-bold">
                      {nomeBonito(p)} <span className="font-normal text-stone-500">— {lista.length}</span>
                    </p>
                    <ul className="flex flex-col gap-0.5 text-[11px]">
                      {lista
                        .sort((a, b) => a.desde.localeCompare(b.desde))
                        .slice(0, 8)
                        .map((a) => (
                          <li key={`${a.item.id}-${a.etapa}`} className="flex items-center gap-1.5">
                            <SeloEtapa etapa={a.etapa} />
                            <span className="font-mono">{a.item.po}</span>
                            <span className="ml-auto whitespace-nowrap text-stone-500">
                              {a.pausado ? "⏸ " : ""}desde {dataHora(a.desde)}
                            </span>
                          </li>
                        ))}
                      {lista.length > 8 && <li className="text-stone-500">+ {lista.length - 8}…</li>}
                    </ul>
                  </div>
                ))}
            </div>
          </section>
        )}

        {/* 07 Observações */}
        <section className="break-inside-avoid">
          {tituloSecao(8, "Observações")}
          <div className="flex flex-col gap-2">
            {[...pessoasSemana, "geral"].map((p) => (
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

        {/* 08 Pendências — mesma regra do Data book: somem quando o book fica PRONTO / Pronto Aguardando Coleta. */}
        <section>
          {tituloSecao(9, "Pendências anotadas", `Falta p/ finalizar — ${pendencias.length}`)}
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

        <p className="border-t border-stone-200 pt-2 text-[10px] text-stone-500">
          Tempos contam só a jornada (seg–sex 7:30–17:18, sem o almoço 12–13) e descontam as pausas. Cada relatório conta para quem
          o <strong>finalizou</strong>; “iniciados” conta para quem deu o início. Base: apontamento por etapa do Data book (apontamentos
          excluídos não entram) e, antes dele, o que já estava registrado no Data book.
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
