"use client";

// Painel do financeiro — pedido do usuário (15/10/2026): a conta da gabriele
// (perfil "financeiro") vê pelo celular, claro e objetivo: resumo do dia,
// compras recentes, contas a pagar e a receber. Dados do ERP gravados a cada
// 15 min por services/calc_engine/scripts/sincronizar_financeiro.py (_painel).

import { useMemo, useState } from "react";
import type { CompraErp, ResumoFinanceiro, TituloErp } from "@/lib/financeiro";
import { normalizarBusca } from "@/lib/followUp";

export type AbaPainel = "resumo" | "compras" | "pagar" | "receber";

export function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Valor curto pros cartões do celular: R$ 1,2 mi / R$ 350 mil.
function moedaCurta(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 10_000) return `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return moeda(v);
}

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diaBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

// "Hoje", "Amanhã", "Ontem" ou "qui, 16/10".
function diaExtenso(iso: string, hoje: string): string {
  if (iso === hoje) return "Hoje";
  if (iso === somarDias(hoje, 1)) return "Amanhã";
  if (iso === somarDias(hoje, -1)) return "Ontem";
  const d = new Date(`${iso}T12:00:00`);
  const semana = d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return `${semana}, ${diaBr(iso).slice(0, 5)}`;
}

function soma(lista: { valor?: number; total?: number }[]): number {
  return lista.reduce((s, t) => s + (t.valor ?? t.total ?? 0), 0);
}

const SELO_COMPRA: Record<string, string> = {
  A: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  D: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  L: "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
  $: "bg-sky-100 text-sky-900 dark:bg-sky-950/60 dark:text-sky-200",
  V: "bg-violet-100 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200",
  E: "bg-green-100 text-green-900 dark:bg-green-950/60 dark:text-green-200",
};

// --- peças ----------------------------------------------------------------------

function Cartao({
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
  onClick,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: "neutro" | "vermelho" | "verde" | "ambar";
  onClick?: () => void;
}) {
  const cor = {
    neutro: "border-stone-200 dark:border-slate-800",
    vermelho: "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30",
    verde: "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950/30",
    ambar: "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30",
  }[tom];
  const corValor = {
    neutro: "text-stone-900 dark:text-white",
    vermelho: "text-red-700 dark:text-red-300",
    verde: "text-green-800 dark:text-green-300",
    ambar: "text-amber-800 dark:text-amber-300",
  }[tom];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`flex flex-col rounded-xl border bg-white p-3 text-left dark:bg-slate-900 ${cor} ${onClick ? "active:scale-[0.98]" : ""}`}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">{rotulo}</span>
      <span className={`text-xl font-black leading-tight ${corValor}`}>{valor}</span>
      {detalhe && <span className="text-xs text-stone-500 dark:text-slate-400">{detalhe}</span>}
    </Tag>
  );
}

function Titulo({ children, extra }: { children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 px-1">
      <h2 className="text-sm font-bold uppercase tracking-wide text-stone-700 dark:text-slate-300">{children}</h2>
      {extra}
    </div>
  );
}

function Chips<T extends string>({ opcoes, valor, mudar }: { opcoes: [T, string][]; valor: T; mudar: (v: T) => void }) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {opcoes.map(([v, r]) => (
        <button
          key={v}
          type="button"
          onClick={() => mudar(v)}
          className={`shrink-0 rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${
            valor === v
              ? "border-green-700 bg-green-700 text-white dark:border-cyan-500 dark:bg-cyan-600"
              : "border-stone-300 bg-white text-stone-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function Busca({ valor, mudar, dica }: { valor: string; mudar: (v: string) => void; dica: string }) {
  return (
    <div className="flex gap-2">
      <input
        type="search"
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        placeholder={dica}
        className="h-12 min-w-0 flex-1 rounded-xl border-2 border-stone-300 bg-white px-3 text-base text-stone-900 outline-none focus:border-green-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
      />
      {valor && (
        <button
          type="button"
          onClick={() => mudar("")}
          aria-label="Limpar busca"
          className="h-12 w-12 shrink-0 rounded-xl border-2 border-stone-300 text-xl text-stone-600 dark:border-slate-700 dark:text-slate-300"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-slate-700 dark:text-slate-400">{children}</p>;
}

// Lista de títulos agrupada por dia (vencimento ou baixa), com o total de cada dia.
function ListaTitulos({
  titulos,
  hoje,
  campoDia,
  vencidos = false,
}: {
  titulos: TituloErp[];
  hoje: string;
  campoDia: "vencimento" | "pago_em";
  vencidos?: boolean;
}) {
  const grupos = useMemo(() => {
    const m = new Map<string, TituloErp[]>();
    for (const t of titulos) {
      const d = (t[campoDia] as string | null) ?? "";
      m.set(d, [...(m.get(d) ?? []), t]);
    }
    return [...m.entries()];
  }, [titulos, campoDia]);
  if (!titulos.length) return <Vazio>Nada por aqui.</Vazio>;
  return (
    <div className="flex flex-col gap-3">
      {grupos.map(([dia, lista]) => (
        <section key={dia} className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <header
            className={`flex items-baseline justify-between px-3 py-2 text-sm font-bold ${
              vencidos ? "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200" : "bg-stone-100 text-stone-800 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            <span>
              {dia ? diaExtenso(dia, hoje) : "Sem data"}
              <span className="ml-1 font-normal text-stone-500 dark:text-slate-400">· {lista.length}</span>
            </span>
            <span className="font-mono">{moeda(soma(lista))}</span>
          </header>
          <ul>
            {lista.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 border-t border-stone-100 px-3 py-2 dark:border-slate-800">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-stone-900 dark:text-white">{t.nome ?? "—"}</span>
                  <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
                    {[t.documento, t.forma, t.filial === 2 ? "Filial 2" : null, vencidos && t.vencimento ? `venceu ${diaBr(t.vencimento)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[15px] font-bold text-stone-900 dark:text-white">{moeda(t.valor)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function CartaoCompra({ c, hoje }: { c: CompraErp; hoje: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button type="button" onClick={() => setAberto((a) => !a)} className="flex w-full flex-col gap-1 p-3 text-left active:bg-stone-50 dark:active:bg-slate-800">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-[15px] font-bold leading-snug text-stone-900 dark:text-white">{c.fornecedor ?? "—"}</span>
          <span className="shrink-0 font-mono text-[15px] font-black text-stone-900 dark:text-white">{moeda(c.total)}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-stone-500 dark:text-slate-400">
          <span className={`rounded px-1.5 py-0.5 font-bold ${SELO_COMPRA[c.status] ?? "bg-stone-100 text-stone-700 dark:bg-slate-800 dark:text-slate-300"}`}>
            {c.status_rotulo}
          </span>
          <span>Pedido {c.pedido}</span>
          <span>· {c.data ? diaExtenso(c.data, hoje) : "—"}</span>
          {c.itens.length > 0 && <span>· {c.itens.length} item(ns)</span>}
        </span>
        {(c.obras.length > 0 || c.itens.length > 0) && (
          <span className="flex flex-wrap items-center gap-1">
            {c.obras.map((o) => (
              <span key={o} className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-stone-700 dark:bg-slate-800 dark:text-slate-300">
                {o === "EMPRESA" ? "Uso interno" : `Obra ${o}`}
              </span>
            ))}
            <span className="ml-auto text-xs font-semibold text-green-700 dark:text-cyan-300">{aberto ? "▲ fechar" : "▼ itens"}</span>
          </span>
        )}
      </button>
      {aberto && (
        <ul className="border-t border-stone-100 bg-stone-50 dark:border-slate-800 dark:bg-slate-950/40">
          {c.itens.length === 0 && <li className="px-3 py-2 text-sm text-stone-500">Sem itens no pedido.</li>}
          {c.itens.map((i, n) => (
            <li key={`${i.item}-${n}`} className="flex items-start justify-between gap-3 border-t border-stone-100 px-3 py-2 first:border-t-0 dark:border-slate-800">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-stone-900 dark:text-slate-100">{i.descricao ?? "—"}</span>
                <span className="block text-xs text-stone-500 dark:text-slate-400">
                  {i.qtd.toLocaleString("pt-BR")} {i.und ?? ""}
                  {i.obra ? ` · ${i.obra === "EMPRESA" ? "uso interno" : `obra ${i.obra}`}` : ""}
                  {i.prazo ? ` · entrega ${diaBr(i.prazo)}` : ""}
                </span>
              </span>
              <span className="shrink-0 font-mono text-sm font-semibold text-stone-900 dark:text-white">{moeda(i.total)}</span>
            </li>
          ))}
          {c.frete > 0 && (
            <li className="flex justify-between border-t border-stone-100 px-3 py-2 text-xs text-stone-600 dark:border-slate-800 dark:text-slate-400">
              <span>Frete</span>
              <span className="font-mono">{moeda(c.frete)}</span>
            </li>
          )}
        </ul>
      )}
    </article>
  );
}

// --- abas -----------------------------------------------------------------------

function Resumo({ resumo, hoje, ir }: { resumo: ResumoFinanceiro; hoje: string; ir: (a: AbaPainel) => void }) {
  const pagar = resumo.pagar?.abertos ?? [];
  const receber = resumo.receber?.abertos ?? [];
  const compras = resumo.compras ?? [];
  const em7 = somarDias(hoje, 7);
  const em30 = somarDias(hoje, 30);
  const entre = (l: TituloErp[], de: string, ate: string) => l.filter((t) => t.vencimento && t.vencimento >= de && t.vencimento <= ate);
  const vencidosP = pagar.filter((t) => t.vencimento && t.vencimento < hoje);
  const vencidosR = receber.filter((t) => t.vencimento && t.vencimento < hoje);
  const hojeP = entre(pagar, hoje, hoje);
  const p7 = entre(pagar, hoje, em7);
  const p30 = entre(pagar, hoje, em30);
  const r7 = entre(receber, hoje, em7);
  const r30 = entre(receber, hoje, em30);
  const saldo30 = soma(r30) - soma(p30);
  const mes = hoje.slice(0, 7);
  const comprasMes = compras.filter((c) => c.data?.startsWith(mes));
  const compras7 = compras.filter((c) => c.data && c.data >= somarDias(hoje, -6));
  const fat = resumo.faturamento[mes];
  const fatMes = fat ? fat.producao + fat.servico : 0;
  const proximos = pagar.filter((t) => t.vencimento && t.vencimento >= hoje).slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      <Titulo>A pagar</Titulo>
      <div className="grid grid-cols-2 gap-2">
        <Cartao rotulo="Vencidos" valor={moedaCurta(soma(vencidosP))} detalhe={`${vencidosP.length} título(s)`} tom={vencidosP.length ? "vermelho" : "verde"} onClick={() => ir("pagar")} />
        <Cartao rotulo="Hoje" valor={moedaCurta(soma(hojeP))} detalhe={`${hojeP.length} título(s)`} tom={hojeP.length ? "ambar" : "neutro"} onClick={() => ir("pagar")} />
        <Cartao rotulo="Próximos 7 dias" valor={moedaCurta(soma(p7))} detalhe={`${p7.length} título(s)`} onClick={() => ir("pagar")} />
        <Cartao rotulo="Próximos 30 dias" valor={moedaCurta(soma(p30))} detalhe={`${p30.length} título(s)`} onClick={() => ir("pagar")} />
      </div>

      <Titulo>A receber</Titulo>
      <div className="grid grid-cols-2 gap-2">
        <Cartao rotulo="Vencidos" valor={moedaCurta(soma(vencidosR))} detalhe={`${vencidosR.length} título(s)`} tom={vencidosR.length ? "vermelho" : "verde"} onClick={() => ir("receber")} />
        <Cartao rotulo="Próximos 7 dias" valor={moedaCurta(soma(r7))} detalhe={`${r7.length} título(s)`} onClick={() => ir("receber")} />
        <Cartao rotulo="Próximos 30 dias" valor={moedaCurta(soma(r30))} detalhe={`${r30.length} título(s)`} onClick={() => ir("receber")} />
        <Cartao
          rotulo="Saldo 30 dias"
          valor={moedaCurta(saldo30)}
          detalhe="a receber − a pagar (sem vencidos)"
          tom={saldo30 >= 0 ? "verde" : "vermelho"}
        />
      </div>

      <Titulo>Compras e faturamento</Titulo>
      <div className="grid grid-cols-2 gap-2">
        <Cartao rotulo="Compras 7 dias" valor={moedaCurta(soma(compras7))} detalhe={`${compras7.length} pedido(s)`} onClick={() => ir("compras")} />
        <Cartao rotulo="Compras no mês" valor={moedaCurta(soma(comprasMes))} detalhe={`${comprasMes.length} pedido(s)`} onClick={() => ir("compras")} />
        <Cartao rotulo="Faturado no mês" valor={moedaCurta(fatMes)} detalhe={fat ? `Produção ${moedaCurta(fat.producao)} · Serviço ${moedaCurta(fat.servico)}` : undefined} tom="verde" />
        <Cartao rotulo="Recebido 15 dias" valor={moedaCurta(soma(resumo.receber?.recebidos ?? []))} detalhe={`${resumo.receber?.recebidos.length ?? 0} título(s)`} onClick={() => ir("receber")} />
      </div>

      <Titulo extra={<button type="button" onClick={() => ir("pagar")} className="text-sm font-semibold text-green-700 dark:text-cyan-300">ver todos →</button>}>
        Próximos pagamentos
      </Titulo>
      <ListaTitulos titulos={proximos} hoje={hoje} campoDia="vencimento" />

      <Titulo extra={<button type="button" onClick={() => ir("compras")} className="text-sm font-semibold text-green-700 dark:text-cyan-300">ver todas →</button>}>
        Últimas compras
      </Titulo>
      <div className="flex flex-col gap-2">
        {compras.slice(0, 5).map((c) => (
          <CartaoCompra key={c.pedido} c={c} hoje={hoje} />
        ))}
        {!compras.length && <Vazio>Nenhuma compra nos últimos 45 dias.</Vazio>}
      </div>
    </div>
  );
}

type FiltroCompra = "todas" | "andamento" | "E";

function Compras({ compras, hoje }: { compras: CompraErp[]; hoje: string }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroCompra>("todas");
  const [periodo, setPeriodo] = useState<"7" | "30" | "45">("30");
  const lista = useMemo(() => {
    const desde = somarDias(hoje, -Number(periodo) + 1);
    const termos = normalizarBusca(busca).split(" ").filter(Boolean);
    return compras.filter((c) => {
      if (!c.data || c.data < desde) return false;
      if (filtro === "E" && c.status !== "E") return false;
      if (filtro === "andamento" && c.status === "E") return false;
      if (!termos.length) return true;
      const texto = normalizarBusca([c.fornecedor, c.pedido, ...c.obras, ...c.itens.map((i) => i.descricao)].filter(Boolean).join(" "));
      return termos.every((t) => texto.includes(t));
    });
  }, [compras, busca, filtro, periodo, hoje]);
  return (
    <div className="flex flex-col gap-3">
      <Busca valor={busca} mudar={setBusca} dica="🔍 Fornecedor, item, obra, nº do pedido…" />
      <Chips<"7" | "30" | "45">
        opcoes={[
          ["7", "7 dias"],
          ["30", "30 dias"],
          ["45", "45 dias"],
        ]}
        valor={periodo}
        mudar={setPeriodo}
      />
      <Chips<FiltroCompra>
        opcoes={[
          ["todas", "Todas"],
          ["andamento", "Em andamento"],
          ["E", "Encerradas"],
        ]}
        valor={filtro}
        mudar={setFiltro}
      />
      <div className="flex items-baseline justify-between rounded-xl bg-stone-900 px-4 py-3 text-white dark:bg-slate-800">
        <span className="text-sm">{lista.length} pedido(s)</span>
        <span className="font-mono text-lg font-black">{moeda(soma(lista))}</span>
      </div>
      {lista.map((c) => (
        <CartaoCompra key={c.pedido} c={c} hoje={hoje} />
      ))}
      {!lista.length && <Vazio>Nenhuma compra com esse filtro.</Vazio>}
    </div>
  );
}

type FiltroTitulo = "vencidos" | "hoje" | "7" | "30" | "todos" | "baixados";

function Titulos({ abertos, baixados, hoje, tipo }: { abertos: TituloErp[]; baixados: TituloErp[]; hoje: string; tipo: "pagar" | "receber" }) {
  const [filtro, setFiltro] = useState<FiltroTitulo>("7");
  const [busca, setBusca] = useState("");
  const termos = normalizarBusca(busca).split(" ").filter(Boolean);
  const bate = (t: TituloErp) =>
    !termos.length || termos.every((x) => normalizarBusca(`${t.nome ?? ""} ${t.documento ?? ""} ${t.nota ?? ""}`).includes(x));
  const vencidos = abertos.filter((t) => t.vencimento && t.vencimento < hoje);
  const futuros = abertos.filter((t) => !t.vencimento || t.vencimento >= hoje);
  const ate = (dias: number) => futuros.filter((t) => t.vencimento && t.vencimento <= somarDias(hoje, dias));
  const listas: Record<FiltroTitulo, TituloErp[]> = {
    vencidos: [...vencidos].reverse(), // o mais recente primeiro
    hoje: ate(0),
    "7": ate(7),
    "30": ate(30),
    todos: futuros,
    baixados,
  };
  const lista = listas[filtro].filter(bate);
  const pagarOuReceber = tipo === "pagar" ? "pagos" : "recebidos";
  return (
    <div className="flex flex-col gap-3">
      <Busca valor={busca} mudar={setBusca} dica={tipo === "pagar" ? "🔍 Fornecedor ou documento…" : "🔍 Cliente, nota ou documento…"} />
      <Chips<FiltroTitulo>
        opcoes={[
          ["vencidos", `Vencidos (${vencidos.length})`],
          ["hoje", "Hoje"],
          ["7", "7 dias"],
          ["30", "30 dias"],
          ["todos", tipo === "pagar" ? "Até 60 dias" : "Todos"],
          ["baixados", `${pagarOuReceber[0].toUpperCase()}${pagarOuReceber.slice(1)} (15 dias)`],
        ]}
        valor={filtro}
        mudar={setFiltro}
      />
      <div
        className={`flex items-baseline justify-between rounded-xl px-4 py-3 text-white ${
          filtro === "vencidos" ? "bg-red-700" : filtro === "baixados" ? "bg-green-800" : "bg-stone-900 dark:bg-slate-800"
        }`}
      >
        <span className="text-sm">{lista.length} título(s)</span>
        <span className="font-mono text-lg font-black">{moeda(soma(lista))}</span>
      </div>
      <ListaTitulos titulos={lista} hoje={hoje} campoDia={filtro === "baixados" ? "pago_em" : "vencimento"} vencidos={filtro === "vencidos"} />
    </div>
  );
}

// --- painel ---------------------------------------------------------------------

export const ABAS_PAINEL: [AbaPainel, string][] = [
  ["resumo", "Resumo"],
  ["compras", "Compras"],
  ["pagar", "A pagar"],
  ["receber", "A receber"],
];

export default function FinanceiroPainel({ resumo, aba, ir }: { resumo: ResumoFinanceiro; aba: AbaPainel; ir: (a: AbaPainel) => void }) {
  const hoje = hojeIso();
  if (!resumo.compras && !resumo.pagar) {
    return <Vazio>Os dados de compras e contas ainda não chegaram do ERP — aparecem na próxima atualização (até 15 min).</Vazio>;
  }
  return (
    <div className="mx-auto w-full max-w-2xl">
      {aba === "resumo" && <Resumo resumo={resumo} hoje={hoje} ir={ir} />}
      {aba === "compras" && <Compras compras={resumo.compras ?? []} hoje={hoje} />}
      {aba === "pagar" && <Titulos abertos={resumo.pagar?.abertos ?? []} baixados={resumo.pagar?.pagos ?? []} hoje={hoje} tipo="pagar" />}
      {aba === "receber" && (
        <Titulos abertos={resumo.receber?.abertos ?? []} baixados={resumo.receber?.recebidos ?? []} hoje={hoje} tipo="receber" />
      )}
    </div>
  );
}
