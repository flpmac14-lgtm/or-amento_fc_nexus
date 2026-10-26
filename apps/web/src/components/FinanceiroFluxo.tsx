"use client";

// Aba Financeiro → Fluxo de caixa — pedido do usuário (26/10/2026): conforme as
// coletas são marcadas no Follow up, projetar o caixa semana a semana até mês a
// mês, com filtro. Entradas = A receber do ERP (títulos já faturados) + coletas
// previstas (valor e condição de pagamento do pedido de venda no Sectra, contada
// a partir da coleta); saídas = A pagar do ERP. Coleta de pedido SEM entrada no
// Sectra não tem valor: aparece com ⚠ pra dar entrada (entra no fluxo no ciclo
// seguinte, até 15 min). Coleta já faturada fica de fora — já está no A receber.
// Cores validadas (dataviz): A receber verde, Coletas violeta, A pagar rosa.

import { Fragment, useEffect, useMemo, useState } from "react";
import { compacto } from "@/components/FinanceiroGraficos";
import { moeda } from "@/components/FinanceiroPainel";
import type { ColetaFluxo, RespostaFluxo } from "@/lib/financeiro";
import { normalizarBusca } from "@/lib/followUp";

type Fonte = "receber" | "coletas" | "pagar";
type Escala = "semana" | "mes";

interface Lancamento {
  data: string; // AAAA-MM-DD (vencimento / recebimento previsto)
  valor: number; // sempre positivo; saída pelo tipo da fonte
  fonte: Fonte;
  nome: string;
  ref: string;
  detalhe: string;
  alerta?: string;
}

interface Periodo {
  chave: string;
  rotulo: string;
  sub: string;
  ini: string;
  fim: string;
  receber: number;
  coletas: number;
  pagar: number;
  pendentes: number; // coletas sem entrada no Sectra (coleta neste período)
  lanc: Lancamento[];
}

const FONTES: Record<Fonte, { nome: string; barra: string; ponto: string; texto: string }> = {
  receber: { nome: "A receber (ERP)", barra: "fill-emerald-600", ponto: "bg-emerald-600", texto: "text-emerald-700 dark:text-emerald-400" },
  coletas: { nome: "Coletas previstas", barra: "fill-violet-600 dark:fill-violet-500", ponto: "bg-violet-600 dark:bg-violet-500", texto: "text-violet-700 dark:text-violet-300" },
  pagar: { nome: "A pagar (ERP)", barra: "fill-rose-600 dark:fill-rose-500", ponto: "bg-rose-600 dark:bg-rose-500", texto: "text-rose-700 dark:text-rose-400" },
};

const HORIZONTES: Record<Escala, number[]> = { semana: [4, 8, 12, 16, 26], mes: [3, 6, 9, 12] };
const CHAVE_SALDO = "fcnexus-fluxo-saldo-inicial";
const PRAZO_PADRAO = 60; // pedido em aberto sem condição de pagamento cadastrada

// --- datas (sempre AAAA-MM-DD, meio-dia pra não escorregar no fuso) ---------------

function dataDe(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function somarDias(s: string, n: number): string {
  const d = dataDe(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
function segundaDe(s: string): string {
  const d = dataDe(s);
  return somarDias(s, -((d.getDay() + 6) % 7));
}
function diaMes(s: string): string {
  return `${s.slice(8, 10)}/${s.slice(5, 7)}`;
}
function diaBr(s: string): string {
  return `${diaMes(s)}/${s.slice(2, 4)}`;
}
// Semana ISO (S44).
function semanaIso(s: string): number {
  const d = dataDe(s);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function montarPeriodos(hoje: string, escala: Escala, n: number): Periodo[] {
  const vazio = { receber: 0, coletas: 0, pagar: 0, pendentes: 0 };
  const saida: Periodo[] = [];
  if (escala === "semana") {
    const seg = segundaDe(hoje);
    for (let k = 0; k < n; k++) {
      const ini = somarDias(seg, 7 * k);
      const fim = somarDias(ini, 6);
      saida.push({
        chave: ini,
        rotulo: k === 0 ? "Esta semana" : `S${String(semanaIso(ini)).padStart(2, "0")}`,
        sub: `${diaMes(ini)}–${diaMes(fim)}`,
        ini,
        fim,
        ...vazio,
        lanc: [],
      });
    }
  } else {
    const h = dataDe(hoje);
    for (let k = 0; k < n; k++) {
      const a = new Date(h.getFullYear(), h.getMonth() + k, 1, 12);
      const b = new Date(a.getFullYear(), a.getMonth() + 1, 0, 12);
      saida.push({
        chave: iso(a),
        rotulo: `${MESES[a.getMonth()]}/${String(a.getFullYear()).slice(2)}`,
        sub: k === 0 ? "este mês" : String(a.getFullYear()),
        ini: iso(a),
        fim: iso(b),
        ...vazio,
        lanc: [],
      });
    }
  }
  return saida;
}

// Parcelas de uma coleta em aberto no Sectra: valor × % de cada parcela, no dia
// da coleta + prazo. Coleta que já passou e não faturou conta a partir de hoje.
function parcelasDaColeta(c: ColetaFluxo, hoje: string): Lancamento[] {
  const base = c.coleta < hoje ? hoje : c.coleta;
  const cond = c.condicao && c.condicao.dias.length ? c.condicao : null;
  const dias = cond?.dias ?? [PRAZO_PADRAO];
  const pct = cond?.pct ?? [100];
  const alertas: string[] = [];
  if (!cond) alertas.push(`Pedido sem condição de pagamento — considerado ${PRAZO_PADRAO} dias`);
  if (c.coleta < hoje) alertas.push(`Coleta de ${diaBr(c.coleta)} ainda não faturada`);
  return dias.map((d, k) => ({
    data: somarDias(base, d),
    valor: Math.round((c.valor ?? 0) * pct[k]) / 100,
    fonte: "coletas" as const,
    nome: c.cliente_erp ?? c.cliente ?? "—",
    ref: `PO ${c.po}${c.mac ? ` · MAC ${c.mac}` : ""}`,
    detalhe: `Coleta ${diaBr(c.coleta)} · ${cond?.desc ? `cond. ${cond.desc}` : "sem condição"}${dias.length > 1 ? ` · parcela ${k + 1}/${dias.length}` : ""}${c.pedidos.length ? ` · ped. Sectra ${c.pedidos.join(", ")}` : ""}`,
    alerta: alertas.join(" · ") || undefined,
  }));
}

// --- peças ----------------------------------------------------------------------

function Kpi({ rotulo, valor, detalhe, tom, onClick }: { rotulo: string; valor: string; detalhe: string; tom: string; onClick?: () => void }) {
  const classe = "rounded-xl border border-stone-200 bg-white p-3 text-left dark:border-slate-800 dark:bg-slate-900";
  const miolo = (
    <>
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 truncate text-lg font-black sm:text-2xl ${tom}`}>{valor}</p>
      <p className="text-[11px] text-stone-500 dark:text-slate-400">{detalhe}</p>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={`${classe} hover:border-stone-400 dark:hover:border-slate-600`}>
      {miolo}
    </button>
  ) : (
    <div className={classe}>{miolo}</div>
  );
}

function Segmentado<T extends string | number>({ valor, opcoes, mudar }: { valor: T; opcoes: [T, string][]; mudar: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border-2 border-stone-300 p-0.5 dark:border-slate-600">
      {opcoes.map(([v, r]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => mudar(v)}
          className={`h-9 rounded-md px-3 text-sm font-bold ${
            valor === v ? "bg-green-700 text-white dark:bg-cyan-600" : "text-stone-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

// Entradas (A receber + Coletas empilhadas) ao lado das saídas, por período, e
// o saldo acumulado em linha — tudo em R$ no mesmo eixo.
function GraficoFluxo({
  periodos,
  saldos,
  fontes,
  selecionado,
  selecionar,
}: {
  periodos: Periodo[];
  saldos: number[];
  fontes: Record<Fonte, boolean>;
  selecionado: string | null;
  selecionar: (c: string) => void;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const L = 760;
  const H = 260;
  const topo = 16;
  const baseY = H - 34;
  const entradas = periodos.map((p) => (fontes.receber ? p.receber : 0) + (fontes.coletas ? p.coletas : 0));
  const saidas = periodos.map((p) => (fontes.pagar ? p.pagar : 0));
  const max = Math.max(1, ...entradas, ...saidas, ...saldos) * 1.1;
  const min = Math.min(0, ...saldos) * 1.1;
  const y = (v: number) => topo + ((max - v) / (max - min)) * (baseY - topo);
  const passo = L / periodos.length;
  const larg = Math.min(26, passo * 0.32);
  const passoGrade = (() => {
    const bruto = (max - min) / 4;
    const p10 = 10 ** Math.floor(Math.log10(bruto));
    return [1, 2, 5, 10].map((m) => m * p10).find((s) => s >= bruto) ?? bruto;
  })();
  const grade: number[] = [];
  for (let g = Math.ceil(min / passoGrade) * passoGrade; g <= max; g += passoGrade) grade.push(g);
  const rotuloCada = Math.ceil(periodos.length / 13);

  function barra(x: number, v0: number, v1: number, classe: string, topoArredondado: boolean, k: string) {
    const ya = y(v1);
    const yb = y(v0);
    const h = yb - ya - (topoArredondado ? 0 : 2);
    if (h <= 0.5) return null;
    return topoArredondado ? (
      <path key={k} className={classe} d={`M${x},${yb} V${ya + 3} q0,-3 3,-3 h${larg - 6} q3,0 3,3 V${yb} Z`} />
    ) : (
      <rect key={k} x={x} y={ya} width={larg} height={h} className={classe} />
    );
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${H}`} className="h-auto w-full" role="img" aria-label="Fluxo de caixa: entradas, saídas e saldo acumulado por período">
        {grade.map((g) => (
          <g key={g}>
            <line x1={0} x2={L} y1={y(g)} y2={y(g)} strokeWidth={1} className={g === 0 ? "stroke-stone-400 dark:stroke-slate-600" : "stroke-stone-200 dark:stroke-slate-800"} />
            <text x={2} y={y(g) - 3} className="fill-stone-400 text-[10px] dark:fill-slate-500">
              {compacto(g)}
            </text>
          </g>
        ))}
        {periodos.map((p, i) => {
          const cx = passo * i + passo / 2;
          const xE = cx - larg - 1;
          const xS = cx + 1;
          const rec = fontes.receber ? p.receber : 0;
          const col = fontes.coletas ? p.coletas : 0;
          return (
            <g key={p.chave} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onClick={() => selecionar(p.chave)} className="cursor-pointer">
              <rect
                x={passo * i}
                y={0}
                width={passo}
                height={H}
                className={p.chave === selecionado ? "fill-green-50 dark:fill-cyan-950/50" : foco === i ? "fill-stone-100 dark:fill-slate-800/60" : "fill-transparent"}
              />
              {barra(xE, 0, rec, FONTES.receber.barra, col <= 0, "r")}
              {barra(xE, rec, rec + col, FONTES.coletas.barra, true, "c")}
              {barra(xS, 0, saidas[i], FONTES.pagar.barra, true, "p")}
              {p.pendentes > 0 && (
                <text x={cx} y={baseY + 12} textAnchor="middle" className="fill-amber-600 text-[11px] font-black dark:fill-amber-400">
                  ⚠
                </text>
              )}
              {i % rotuloCada === 0 && (
                <text
                  x={cx}
                  y={H - 6}
                  textAnchor="middle"
                  className={p.chave === selecionado ? "fill-stone-900 text-[10px] font-bold dark:fill-white" : "fill-stone-500 text-[10px] dark:fill-slate-400"}
                >
                  {p.rotulo === "Esta semana" ? "Atual" : p.rotulo}
                </text>
              )}
            </g>
          );
        })}
        <polyline
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          className="stroke-stone-800 dark:stroke-slate-200"
          points={saldos.map((s, i) => `${passo * i + passo / 2},${y(s)}`).join(" ")}
          pointerEvents="none"
        />
        {saldos.map((s, i) => (
          <circle
            key={i}
            cx={passo * i + passo / 2}
            cy={y(s)}
            r={foco === i ? 5 : 3.5}
            strokeWidth={2}
            className={`stroke-white dark:stroke-slate-900 ${s < 0 ? "fill-rose-600 dark:fill-rose-500" : "fill-stone-800 dark:fill-slate-200"}`}
            pointerEvents="none"
          />
        ))}
      </svg>
      {foco !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[12.5rem] rounded-lg border border-stone-200 bg-white p-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900"
          style={{ left: `${Math.min(70, Math.max(0, ((foco + 0.5) / periodos.length) * 100 - 12))}%` }}
        >
          <p className="mb-1 font-bold text-stone-900 dark:text-white">
            {periodos[foco].rotulo} <span className="font-normal text-stone-500 dark:text-slate-400">{periodos[foco].sub}</span>
          </p>
          {(["receber", "coletas", "pagar"] as Fonte[])
            .filter((f) => fontes[f])
            .map((f) => (
              <p key={f} className="flex items-center justify-between gap-3 text-stone-700 dark:text-slate-300">
                <span className="flex items-center gap-1">
                  <span className={`inline-block h-2 w-2 rounded-sm ${FONTES[f].ponto}`} />
                  {FONTES[f].nome}
                </span>
                <span className="font-semibold">
                  {f === "pagar" ? "−" : ""}
                  {moeda(periodos[foco][f])}
                </span>
              </p>
            ))}
          <p className="mt-1 flex justify-between border-t border-stone-200 pt-1 font-bold text-stone-900 dark:border-slate-700 dark:text-white">
            <span>Saldo acumulado</span>
            <span className={saldos[foco] < 0 ? "text-rose-600 dark:text-rose-400" : ""}>{moeda(saldos[foco])}</span>
          </p>
          {periodos[foco].pendentes > 0 && (
            <p className="mt-1 font-semibold text-amber-700 dark:text-amber-300">⚠ {periodos[foco].pendentes} coleta(s) sem entrada no Sectra</p>
          )}
        </div>
      )}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600 dark:text-slate-400">
        {(["receber", "coletas", "pagar"] as Fonte[])
          .filter((f) => fontes[f])
          .map((f) => (
            <span key={f} className="flex items-center gap-1">
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${FONTES[f].ponto}`} />
              {FONTES[f].nome}
            </span>
          ))}
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 border-t-2 border-stone-800 dark:border-slate-200" />
          Saldo acumulado
        </span>
        <span className="flex items-center gap-1 text-amber-700 dark:text-amber-300">⚠ coleta sem entrada no Sectra</span>
      </div>
    </div>
  );
}

// --- tela -----------------------------------------------------------------------

export default function FinanceiroFluxo() {
  const [dados, setDados] = useState<RespostaFluxo | null>(null);
  const [erro, setErro] = useState("");
  const [escala, setEscala] = useState<Escala>("semana");
  const [horizonte, setHorizonte] = useState(12);
  const [fontes, setFontes] = useState<Record<Fonte, boolean>>({ receber: true, coletas: true, pagar: true });
  const [cliente, setCliente] = useState("");
  const [busca, setBusca] = useState("");
  const [comAtrasados, setComAtrasados] = useState(false);
  // Só aparece depois que o painel carrega (no navegador): dá pra ler o localStorage direto.
  const [saldoTexto, setSaldoTexto] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_SALDO) ?? "";
    } catch {
      return "";
    }
  });
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [verPendentes, setVerPendentes] = useState(false);

  useEffect(() => {
    let ativo = true;
    fetch("/api/financeiro/fluxo", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro ?? `Falha ao carregar (${r.status}).`);
        return j as RespostaFluxo;
      })
      .then((j) => ativo && setDados(j))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  function mudarSaldo(v: string) {
    setSaldoTexto(v);
    try {
      localStorage.setItem(CHAVE_SALDO, v);
    } catch {}
  }
  const saldoInicial = Number(saldoTexto.replace(/\./g, "").replace(",", ".")) || 0;
  const hoje = dados?.hoje ?? iso(new Date());
  const termo = normalizarBusca(busca.trim());

  // Coletas únicas por PO (linha repetida no Follow up não soma duas vezes).
  const coletas = useMemo(() => {
    const vistos = new Set<string>();
    return (dados?.coletas ?? []).filter((c) => !vistos.has(c.po) && vistos.add(c.po));
  }, [dados]);

  const nomeColeta = (c: ColetaFluxo) => c.cliente_erp ?? c.cliente ?? "—";
  const clientes = useMemo(() => {
    const s = new Set<string>();
    for (const t of dados?.receber ?? []) s.add(t.nome ?? "—");
    for (const c of coletas) if (c.situacao === "em_aberto" || c.situacao === "sem_entrada") s.add(nomeColeta(c));
    return [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [dados, coletas]);

  // Todos os lançamentos (entradas e saídas) já filtrados por cliente/busca.
  const lancamentos = useMemo(() => {
    if (!dados) return [] as Lancamento[];
    const l: Lancamento[] = [];
    for (const t of dados.receber)
      l.push({
        data: t.vencimento ?? hoje,
        valor: t.valor,
        fonte: "receber",
        nome: t.nome ?? "—",
        ref: t.nota ? `NF ${t.nota}` : (t.documento ?? "—"),
        detalhe: [t.documento, t.forma].filter(Boolean).join(" · "),
      });
    for (const c of coletas) if (c.situacao === "em_aberto" && c.valor) l.push(...parcelasDaColeta(c, hoje));
    for (const t of dados.pagar)
      l.push({
        data: t.vencimento ?? hoje,
        valor: t.valor,
        fonte: "pagar",
        nome: t.nome ?? "—",
        ref: t.documento ?? "—",
        detalhe: t.filial && t.filial !== 1 ? `Filial ${t.filial}` : "",
      });
    return l.filter(
      (x) =>
        (!cliente || (x.fonte !== "pagar" && x.nome === cliente)) &&
        (!termo || normalizarBusca(`${x.nome} ${x.ref} ${x.detalhe}`).includes(termo)),
    );
  }, [dados, coletas, hoje, cliente, termo]);

  const pendentes = useMemo(
    () =>
      coletas
        .filter((c) => c.situacao === "sem_entrada")
        .filter((c) => !cliente || nomeColeta(c) === cliente)
        .filter((c) => !termo || normalizarBusca([c.po, c.mac, c.desenho, c.descricao, c.cliente].filter(Boolean).join(" ")).includes(termo))
        .sort((a, b) => a.coleta.localeCompare(b.coleta) || a.po.localeCompare(b.po)),
    [coletas, cliente, termo],
  );
  const jaFaturadas = coletas.filter((c) => c.situacao === "faturado").length;

  const { periodos, atrasado, alem } = useMemo(() => {
    const ps = montarPeriodos(hoje, escala, horizonte);
    const atr = { receber: 0, coletas: 0, pagar: 0, lanc: [] as Lancamento[] };
    const al = { receber: 0, coletas: 0, pagar: 0 };
    const fim = ps[ps.length - 1].fim;
    for (const x of lancamentos) {
      if (!fontes[x.fonte]) continue;
      if (x.data < hoje) {
        atr[x.fonte] += x.valor;
        atr.lanc.push(x);
        continue;
      }
      if (x.data > fim) {
        al[x.fonte] += x.valor;
        continue;
      }
      const p = ps.find((q) => x.data >= q.ini && x.data <= q.fim);
      if (!p) continue;
      p[x.fonte] += x.valor;
      p.lanc.push(x);
    }
    for (const c of pendentes) {
      const d = c.coleta < hoje ? hoje : c.coleta;
      const p = ps.find((q) => d >= q.ini && d <= q.fim);
      if (p) p.pendentes++;
    }
    for (const p of ps) p.lanc.sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor);
    atr.lanc.sort((a, b) => a.data.localeCompare(b.data));
    return { periodos: ps, atrasado: atr, alem: al };
  }, [lancamentos, pendentes, fontes, hoje, escala, horizonte]);

  const saldos = useMemo(() => {
    const ini = saldoInicial + (comAtrasados ? atrasado.receber + atrasado.coletas - atrasado.pagar : 0);
    return periodos.reduce<number[]>((acc, p) => [...acc, (acc[acc.length - 1] ?? ini) + p.receber + p.coletas - p.pagar], []);
  }, [periodos, atrasado, saldoInicial, comAtrasados]);

  const totEntradas = periodos.reduce((s, p) => s + p.receber + p.coletas, 0);
  const totColetas = periodos.reduce((s, p) => s + p.coletas, 0);
  const totSaidas = periodos.reduce((s, p) => s + p.pagar, 0);
  const iMenor = saldos.reduce((m, s, i) => (s < saldos[m] ? i : m), 0);
  const periodoSel = periodos.find((p) => p.chave === selecionado) ?? null;

  if (erro) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>;
  if (!dados) return <p className="py-10 text-center text-stone-500 dark:text-slate-400">Montando o fluxo de caixa…</p>;

  const linhasTabela: { rotulo: string; valor: (p: Periodo, i: number) => number; atr: number | null; classe: string; fonte?: Fonte }[] = [
    { rotulo: FONTES.receber.nome, valor: (p) => p.receber, atr: atrasado.receber, classe: "", fonte: "receber" },
    { rotulo: FONTES.coletas.nome, valor: (p) => p.coletas, atr: null, classe: "", fonte: "coletas" },
    { rotulo: "Total entradas", valor: (p) => p.receber + p.coletas, atr: atrasado.receber, classe: "font-bold text-emerald-700 dark:text-emerald-400" },
    { rotulo: FONTES.pagar.nome, valor: (p) => -p.pagar, atr: -atrasado.pagar, classe: "text-rose-700 dark:text-rose-400", fonte: "pagar" },
    { rotulo: "Saldo do período", valor: (p) => p.receber + p.coletas - p.pagar, atr: atrasado.receber - atrasado.pagar, classe: "font-bold" },
    { rotulo: "Saldo acumulado", valor: (_p, i) => saldos[i], atr: null, classe: "font-black" },
  ];
  const visiveis = linhasTabela.filter((l) => !l.fonte || fontes[l.fonte]);
  const corValor = (v: number, forte: boolean) => (v < 0 ? "text-rose-600 dark:text-rose-400" : forte ? "text-stone-900 dark:text-white" : "");
  const sticky = "sticky left-0 z-10 bg-white dark:bg-slate-900";

  return (
    <div className="flex flex-col gap-3">
      {/* Controles — uma linha no PC, empilha no celular */}
      <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Segmentado
            valor={escala}
            opcoes={[
              ["semana", "Semanal"],
              ["mes", "Mensal"],
            ]}
            mudar={(e) => {
              setEscala(e);
              setHorizonte(e === "semana" ? 12 : 6);
              setSelecionado(null);
            }}
          />
          <select
            value={horizonte}
            onChange={(e) => {
              setHorizonte(Number(e.target.value));
              setSelecionado(null);
            }}
            className="h-10 rounded-lg border-2 border-stone-300 bg-white px-2 text-sm font-semibold text-stone-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
          >
            {HORIZONTES[escala].map((n) => (
              <option key={n} value={n}>
                Próx. {n} {escala === "semana" ? "semanas" : "meses"}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["receber", "coletas", "pagar"] as Fonte[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFontes((x) => ({ ...x, [f]: !x[f] }))}
              aria-pressed={fontes[f]}
              className={`flex h-10 items-center gap-1.5 rounded-lg border-2 px-2.5 text-sm font-semibold ${
                fontes[f]
                  ? "border-stone-400 bg-stone-100 text-stone-900 dark:border-slate-500 dark:bg-slate-800 dark:text-white"
                  : "border-stone-200 text-stone-400 line-through dark:border-slate-700 dark:text-slate-500"
              }`}
            >
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${fontes[f] ? FONTES[f].ponto : "bg-stone-300 dark:bg-slate-600"}`} />
              {FONTES[f].nome}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          <select
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border-2 border-stone-300 bg-white px-2 text-sm text-stone-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white sm:max-w-[16rem]"
          >
            <option value="">Todos os clientes</option>
            {clientes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            type="search"
            placeholder="🔍 PO, MAC, NF, fornecedor…"
            className="h-10 min-w-[10rem] flex-1 rounded-lg border-2 border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-green-700 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1.5 text-stone-700 dark:text-slate-300">
            Saldo inicial R$
            <input
              value={saldoTexto}
              onChange={(e) => mudarSaldo(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="h-10 w-32 rounded-lg border-2 border-stone-300 bg-white px-2 text-right font-mono text-sm text-stone-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            />
          </label>
          <label className="flex items-center gap-1.5 text-stone-700 dark:text-slate-300">
            <input type="checkbox" checked={comAtrasados} onChange={(e) => setComAtrasados(e.target.checked)} className="h-4 w-4" />
            Somar atrasados no saldo
          </label>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Kpi rotulo="Entradas previstas" valor={moeda(totEntradas)} detalhe={`${moeda(totColetas)} de coletas`} tom="text-emerald-700 dark:text-emerald-400" />
        <Kpi rotulo="Saídas previstas" valor={moeda(totSaidas)} detalhe={`A pagar até ${dados.dias_pagar} dias no ERP`} tom="text-rose-700 dark:text-rose-400" />
        <Kpi
          rotulo="Saldo no fim"
          valor={moeda(saldos[saldos.length - 1] ?? 0)}
          detalhe={`${periodos[periodos.length - 1]?.rotulo} · ${periodos[periodos.length - 1]?.sub}`}
          tom={corValor(saldos[saldos.length - 1] ?? 0, true)}
        />
        <Kpi
          rotulo="Menor saldo"
          valor={moeda(saldos[iMenor] ?? 0)}
          detalhe={`em ${periodos[iMenor]?.rotulo} (${periodos[iMenor]?.sub})`}
          tom={corValor(saldos[iMenor] ?? 0, true)}
          onClick={() => setSelecionado(periodos[iMenor]?.chave ?? null)}
        />
        <Kpi
          rotulo="⚠ Coletas sem entrada"
          valor={String(pendentes.length)}
          detalhe="dar entrada no Sectra pra entrar no fluxo"
          tom={pendentes.length ? "text-amber-600 dark:text-amber-400" : "text-stone-900 dark:text-white"}
          onClick={() => setVerPendentes(true)}
        />
      </div>

      {/* Aviso dos pendentes */}
      {pendentes.length > 0 && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/30">
          <button
            type="button"
            onClick={() => setVerPendentes((v) => !v)}
            className="flex w-full items-center gap-3 p-3 text-left"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xl font-black text-white">!</span>
            <span className="flex-1 text-sm text-amber-900 dark:text-amber-100">
              <b>{pendentes.length} item(ns) com coleta marcada sem entrada no Sectra</b> — sem valor, ficam fora do fluxo. Dê entrada no pedido de venda; ele
              aparece aqui na próxima atualização (até 15 min).
            </span>
            <span className="text-sm font-bold text-amber-800 dark:text-amber-200">{verPendentes ? "▲ Ocultar" : "▼ Ver lista"}</span>
          </button>
          {verPendentes && (
            <ul className="max-h-80 divide-y divide-amber-200 overflow-auto border-t border-amber-200 dark:divide-amber-900 dark:border-amber-900">
              {pendentes.map((c) => (
                <li key={c.po} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${c.coleta < hoje ? "bg-rose-600 text-white" : "bg-amber-500 text-white"}`}>
                    ⚠ Coleta {diaBr(c.coleta)}
                  </span>
                  <span className="font-mono font-semibold text-stone-900 dark:text-white">{c.po}</span>
                  {c.mac && <span className="font-mono text-stone-600 dark:text-slate-300">MAC {c.mac}</span>}
                  <span className="text-stone-600 dark:text-slate-300">{c.cliente ?? "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-500 dark:text-slate-400" title={c.descricao ?? ""}>
                    {c.desenho ? `${c.desenho} · ` : ""}
                    {c.descricao}
                    {c.qtd !== null ? ` · ${c.qtd.toLocaleString("pt-BR")} pç` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Gráfico */}
      <section className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700 dark:text-slate-300">
            Fluxo {escala === "semana" ? "semanal" : "mensal"} — entradas × saídas
          </h2>
          <p className="text-xs text-stone-500 dark:text-slate-400">Toque numa barra para ver os lançamentos</p>
        </div>
        <GraficoFluxo periodos={periodos} saldos={saldos} fontes={fontes} selecionado={selecionado} selecionar={(c) => setSelecionado((s) => (s === c ? null : c))} />
      </section>

      {/* Tabela (PC) */}
      <section className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="text-xs text-stone-600 dark:text-slate-300">
            <tr>
              <th className={`${sticky} border-b border-stone-200 px-3 py-2 text-left uppercase dark:border-slate-800`}>R$</th>
              <th className="border-b border-stone-200 bg-stone-50 px-3 py-2 text-right dark:border-slate-800 dark:bg-slate-800/50">
                <span className="block font-bold uppercase text-rose-700 dark:text-rose-400">Em atraso</span>
                <span className="font-normal text-stone-500 dark:text-slate-400">antes de hoje</span>
              </th>
              {periodos.map((p) => (
                <th
                  key={p.chave}
                  onClick={() => setSelecionado((s) => (s === p.chave ? null : p.chave))}
                  className={`cursor-pointer border-b border-stone-200 px-3 py-2 text-right dark:border-slate-800 ${p.chave === selecionado ? "bg-green-50 dark:bg-cyan-950/50" : "hover:bg-stone-50 dark:hover:bg-slate-800/50"}`}
                >
                  <span className="block font-bold uppercase text-stone-800 dark:text-slate-100">
                    {p.pendentes > 0 && <span className="mr-1 text-amber-600 dark:text-amber-400" title={`${p.pendentes} coleta(s) sem entrada`}>⚠</span>}
                    {p.rotulo}
                  </span>
                  <span className="font-normal text-stone-500 dark:text-slate-400">{p.sub}</span>
                </th>
              ))}
              <th className="border-b border-stone-200 px-3 py-2 text-right uppercase dark:border-slate-800">Total</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => {
              const total = l.rotulo === "Saldo acumulado" ? null : periodos.reduce((s, p, i) => s + l.valor(p, i), 0);
              const destaque = l.rotulo.startsWith("Saldo");
              return (
                <tr key={l.rotulo} className={destaque ? "bg-stone-50/70 dark:bg-slate-800/30" : ""}>
                  <td className={`${sticky} whitespace-nowrap border-b border-stone-100 px-3 py-2 dark:border-slate-800 ${l.classe}`}>
                    {l.fonte && <span className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-sm ${FONTES[l.fonte].ponto}`} />}
                    {l.rotulo}
                  </td>
                  <td className="whitespace-nowrap border-b border-stone-100 bg-stone-50 px-3 py-2 text-right font-mono text-stone-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                    {l.atr === null || !l.atr ? "—" : moeda(l.atr)}
                  </td>
                  {periodos.map((p, i) => {
                    const v = l.valor(p, i);
                    return (
                      <td
                        key={p.chave}
                        className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-right font-mono dark:border-slate-800 ${l.classe} ${corValor(v, destaque)} ${p.chave === selecionado ? "bg-green-50/70 dark:bg-cyan-950/40" : ""}`}
                      >
                        {v ? moeda(v) : "—"}
                      </td>
                    );
                  })}
                  <td className={`whitespace-nowrap border-b border-stone-100 px-3 py-2 text-right font-mono font-bold dark:border-slate-800 ${total !== null ? corValor(total, true) : ""}`}>
                    {total === null ? moeda(saldos[saldos.length - 1] ?? 0) : moeda(total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Cartões por período (celular) */}
      <section className="flex flex-col gap-2 md:hidden">
        {periodos.map((p, i) => {
          const aberto = p.chave === selecionado;
          const liquido = p.receber + p.coletas - p.pagar;
          return (
            <button
              key={p.chave}
              type="button"
              onClick={() => setSelecionado((s) => (s === p.chave ? null : p.chave))}
              className={`rounded-xl border-2 bg-white p-3 text-left dark:bg-slate-900 ${aberto ? "border-green-700 dark:border-cyan-500" : "border-stone-200 dark:border-slate-800"}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-bold text-stone-900 dark:text-white">
                  {p.pendentes > 0 && <span className="mr-1 text-amber-600 dark:text-amber-400">⚠</span>}
                  {p.rotulo} <span className="text-xs font-normal text-stone-500 dark:text-slate-400">{p.sub}</span>
                </p>
                <p className={`font-mono text-sm font-black ${corValor(saldos[i], true)}`}>{moeda(saldos[i])}</p>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-1 text-xs">
                <span className="text-emerald-700 dark:text-emerald-400">↑ {compacto(p.receber + p.coletas)}</span>
                <span className="text-rose-700 dark:text-rose-400">↓ {compacto(p.pagar)}</span>
                <span className={`text-right font-semibold ${corValor(liquido, true)}`}>= {compacto(liquido)}</span>
              </div>
            </button>
          );
        })}
      </section>

      {/* Lançamentos do período escolhido (ou atrasados) */}
      <section className="rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 p-3 dark:border-slate-800">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700 dark:text-slate-300">
            {periodoSel ? `Lançamentos · ${periodoSel.rotulo} (${periodoSel.sub})` : `Em atraso (antes de ${diaBr(hoje)})`}
          </h2>
          {periodoSel ? (
            <button type="button" onClick={() => setSelecionado(null)} className="text-sm font-semibold text-green-700 hover:underline dark:text-cyan-400">
              Ver atrasados
            </button>
          ) : (
            <span className="text-xs text-stone-500 dark:text-slate-400">Escolha um período no gráfico ou na tabela</span>
          )}
        </div>
        <ListaLancamentos lanc={periodoSel ? periodoSel.lanc : atrasado.lanc} hoje={hoje} />
      </section>

      <p className="text-xs text-stone-500 dark:text-slate-400">
        Coletas: valor e condição de pagamento do pedido de venda no Sectra, contados a partir da data de coleta do Follow up (coleta que já passou sem
        faturar conta de hoje). {jaFaturadas > 0 && `${jaFaturadas} coleta(s) já faturada(s) estão no A receber. `}
        Além do período: entradas {moeda(alem.receber + alem.coletas)} · saídas {moeda(alem.pagar)}. Atualizado{" "}
        {dados.gerado_em ? new Date(dados.gerado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}.
      </p>
    </div>
  );
}

function ListaLancamentos({ lanc, hoje }: { lanc: Lancamento[]; hoje: string }) {
  const [fonte, setFonte] = useState<Fonte | "">("");
  const lista = fonte ? lanc.filter((l) => l.fonte === fonte) : lanc;
  if (!lanc.length) return <p className="py-8 text-center text-sm text-stone-500 dark:text-slate-400">Nenhum lançamento.</p>;
  const soma = (f: Fonte) => lanc.filter((l) => l.fonte === f).reduce((s, l) => s + l.valor, 0);
  return (
    <>
      <div className="flex flex-wrap gap-1.5 px-3 pt-3">
        {(["", "receber", "coletas", "pagar"] as const).map((f) => (
          <button
            key={f || "todos"}
            type="button"
            onClick={() => setFonte(f)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              fonte === f
                ? "border-green-700 bg-green-700 text-white dark:border-cyan-500 dark:bg-cyan-600"
                : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
            }`}
          >
            {f ? `${FONTES[f].nome} · ${compacto(soma(f))}` : `Todos · ${lanc.length}`}
          </button>
        ))}
      </div>
      <ul className="max-h-[32rem] overflow-auto p-3 pt-2">
        {lista.map((l, n) => {
          const novoDia = n === 0 || l.data !== lista[n - 1].data;
          return (
            <Fragment key={`${l.fonte}-${l.ref}-${l.data}-${n}`}>
              {novoDia && (
                <li className="sticky top-0 bg-white pb-1 pt-2 text-xs font-bold uppercase text-stone-500 dark:bg-slate-900 dark:text-slate-400">
                  {dataDe(l.data).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  {l.data < hoje && <span className="ml-1 text-rose-600 dark:text-rose-400">· vencido</span>}
                </li>
              )}
              <li className="flex items-start gap-2 border-b border-stone-100 py-2 last:border-0 dark:border-slate-800">
                <span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${FONTES[l.fonte].ponto}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-900 dark:text-white">{l.nome}</p>
                  <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                    {l.ref}
                    {l.detalhe ? ` · ${l.detalhe}` : ""}
                  </p>
                  {l.alerta && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">⚠ {l.alerta}</p>}
                </div>
                <span className={`shrink-0 font-mono text-sm font-bold ${FONTES[l.fonte].texto}`}>
                  {l.fonte === "pagar" ? "−" : "+"}
                  {moeda(l.valor)}
                </span>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </>
  );
}
