"use client";

// Relatório de carga — pedido do usuário (19/10/2026): os pedidos com COLETA
// entre a data inicial e a data que ele marcar, o que já foi feito e quanto
// falta pra finalizar pelo percentual das etapas (ENG … PIN), e onde aplicar
// mais energia na fabricação (gargalo por etapa, coletas em risco). Folha A4
// paisagem pra imprimir / salvar em PDF; profissional e fácil de ler.
// Parâmetros: ?de=AAAA-MM-DD&ate=AAAA-MM-DD&cliente=A1 (vazio = de hoje a
// +14 dias, todos os clientes). Aberto pela janela "Relatório de coleta".
//
// Conta: cada pedido tem 8 etapas (7 se tiver SP na pintura = sem pintura); a etapa vale de 0 a 100 (vazio = 0), igual
// à fórmula do Status da planilha (Pronto = as 8 em 100). % do pedido = média
// das 8. Carga em kg = peso total × o que falta; pedidos sem peso entram só
// na contagem.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { listarFollowUp } from "@/lib/api";
import { nomeClienteRelatorio } from "@/lib/clientes";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { ETAPAS } from "@/lib/followUp";
import type { EtapaFollowUp, ItemFollowUp } from "@/lib/types";

const DIA = 86400000;
const DIAS_PADRAO = 14;
// Item pesado — pedido do usuário (19/10/2026): "!" discreto na frente do PO pra dar atenção.
const KG_ATENCAO = 100;

function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function deIso(iso: string | null): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? null : d;
}
function hoje(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}
const somarDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA);
const diasAte = (iso: string) => Math.round((deIso(iso)!.getTime() - hoje().getTime()) / DIA);
const valorEtapa = (i: ItemFollowUp, e: EtapaFollowUp) => Math.max(0, Math.min(100, i[e] ?? 0));
// SP na pintura (COR2 / Plano) = pedido sem pintura — pedido do usuário (19/10/2026):
// a etapa Pintura não conta pra esse pedido (nem no % nem no gargalo).
const ehSP = (v: string | null) => (v ?? "").trim().toUpperCase() === "SP";
const semPintura = (i: ItemFollowUp) => ehSP(i.cor2) || ehSP(i.cor_2) || ehSP(i.plano_pintura);
const aplica = (i: ItemFollowUp, e: EtapaFollowUp) => e !== "pin" || !semPintura(i);
const etapasDo = (i: ItemFollowUp) => ETAPAS.filter((e) => aplica(i, e.campo));
const pctPedido = (i: ItemFollowUp) => {
  const l = etapasDo(i);
  return l.reduce((s, e) => s + valorEtapa(i, e.campo), 0) / l.length;
};
const kg = (v: number) => `${formatarNumero(v, 0)} kg`;
const pct = (v: number) => `${formatarNumero(v, 0)}%`;

// Cor do percentual: vermelho < 40, âmbar < 80, verde acima.
function corPct(v: number): string {
  return v >= 100 ? "#15803d" : v >= 80 ? "#16a34a" : v >= 40 ? "#d97706" : "#dc2626";
}

function Barra({ valor, altura = "h-2.5", cor }: { valor: number; altura?: string; cor?: string }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-stone-200 ${altura}`}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, valor))}%`, backgroundColor: cor ?? corPct(valor) }} />
    </div>
  );
}

// As 8 etapas do pedido em quadradinhos: verde = 100, âmbar = parcial, cinza = não iniciada, riscada = não tem (SP).
function FaixaEtapas({ item }: { item: ItemFollowUp }) {
  return (
    <span className="inline-flex gap-[2px]">
      {ETAPAS.map((e) => {
        const v = valorEtapa(item, e.campo);
        if (!aplica(item, e.campo))
          return (
            <span
              key={e.campo}
              title={`${e.nome}: não tem (SP — sem pintura)`}
              className="inline-flex h-[14px] w-[22px] items-center justify-center rounded-[2px] border border-dashed border-stone-300 text-[7px] font-bold text-stone-400"
            >
              SP
            </span>
          );
        return (
          <span
            key={e.campo}
            title={`${e.nome}: ${v}%`}
            className={`inline-flex h-[14px] w-[22px] items-center justify-center rounded-[2px] text-[7px] font-bold ${
              v >= 100 ? "bg-green-600 text-white" : v > 0 ? "bg-amber-400 text-stone-900" : "bg-stone-200 text-stone-500"
            }`}
          >
            {e.rotulo}
          </span>
        );
      })}
    </span>
  );
}

interface Resumo {
  pedidos: number;
  prontos: number;
  andamento: number;
  naoIniciados: number;
  pct: number; // média simples dos pedidos
  pesoTotal: number;
  pesoFalta: number;
}

function resumir(lista: ItemFollowUp[]): Resumo {
  const r: Resumo = { pedidos: lista.length, prontos: 0, andamento: 0, naoIniciados: 0, pct: 0, pesoTotal: 0, pesoFalta: 0 };
  let soma = 0;
  for (const i of lista) {
    const p = pctPedido(i);
    soma += p;
    if (p >= 100) r.prontos++;
    else if (p > 0) r.andamento++;
    else r.naoIniciados++;
    r.pesoTotal += i.peso_total ?? 0;
    r.pesoFalta += ((i.peso_total ?? 0) * (100 - p)) / 100;
  }
  r.pct = lista.length ? soma / lista.length : 0;
  return r;
}

function Relatorio() {
  const params = useSearchParams();
  const router = useRouter();
  const { de, ate } = useMemo(() => {
    const d1 = deIso(params.get("de")) ?? hoje();
    const d2 = deIso(params.get("ate")) ?? somarDias(d1, DIAS_PADRAO);
    return d1 <= d2 ? { de: d1, ate: d2 } : { de: d2, ate: d1 };
  }, [params]);
  const cliente = params.get("cliente") ?? "";
  const deStr = isoDia(de);
  const ateStr = isoDia(ate);
  const [itens, setItens] = useState<ItemFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));

  useEffect(() => {
    document.title = `Carga ${formatarDataBr(deStr).slice(0, 5).replace("/", ".")} a ${formatarDataBr(ateStr).slice(0, 5).replace("/", ".")}${cliente ? ` - ${cliente}` : ""}`;
  }, [deStr, ateStr, cliente]);

  useEffect(() => {
    let ativo = true;
    listarFollowUp()
      .then((r) => ativo && setItens(r.itens))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  function ir(novoDe: Date, novoAte: Date, novoCliente = cliente) {
    const qs = new URLSearchParams({ de: isoDia(novoDe), ate: isoDia(novoAte) });
    if (novoCliente) qs.set("cliente", novoCliente);
    router.replace(`/follow-up/carga?${qs}`);
  }

  // Pedidos com coleta no período (e do cliente, se escolhido).
  const doPeriodo = useMemo(
    () => (itens ?? []).filter((i) => i.coleta_data && i.coleta_data >= deStr && i.coleta_data <= ateStr),
    [itens, deStr, ateStr],
  );
  const clientesPeriodo = useMemo(
    () =>
      [...new Set([...doPeriodo.map((i) => i.cliente?.trim() || "Sem cliente"), ...(cliente ? [cliente] : [])])].sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      ),
    [doPeriodo, cliente],
  );
  const lista = useMemo(
    () => (cliente ? doPeriodo.filter((i) => (i.cliente?.trim() || "Sem cliente") === cliente) : doPeriodo),
    [doPeriodo, cliente],
  );

  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens) return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  const geral = resumir(lista);
  const comPeso = geral.pesoTotal > 0;
  // % geral pela carga (kg) quando tem peso; senão pela média dos pedidos.
  const pctGeral = comPeso ? ((geral.pesoTotal - geral.pesoFalta) / geral.pesoTotal) * 100 : geral.pct;

  // Etapas: quanto falta em cada uma (pedidos e kg) — o gargalo é a que mais falta.
  const etapas = ETAPAS.map((e) => {
    let faltamPedidos = 0;
    let faltaKg = 0;
    let soma = 0;
    let aplicaveis = 0;
    for (const i of lista) {
      if (!aplica(i, e.campo)) continue;
      aplicaveis++;
      const v = valorEtapa(i, e.campo);
      soma += v;
      if (v < 100) faltamPedidos++;
      faltaKg += ((i.peso_total ?? 0) * (100 - v)) / 100;
    }
    return { ...e, faltamPedidos, faltaKg, aplicaveis, pct: aplicaveis ? soma / aplicaveis : 100 };
  });
  const prioridade = [...etapas]
    .filter((e) => e.faltamPedidos > 0)
    .sort((a, b) => (comPeso ? b.faltaKg - a.faltaKg : 0) || b.faltamPedidos - a.faltamPedidos);
  const maxFalta = Math.max(1, ...etapas.map((e) => (comPeso ? e.faltaKg : e.faltamPedidos)));

  // Por data de coleta (linha do tempo) e por cliente.
  const datas = [...new Set(lista.map((i) => i.coleta_data!))].sort();
  const porData = datas.map((d) => {
    const l = lista.filter((i) => i.coleta_data === d);
    return { data: d, dias: diasAte(d), clientes: [...new Set(l.map((i) => i.cliente?.trim() || "—"))].sort(), ...resumir(l) };
  });
  const porCliente = (cliente ? [cliente] : clientesPeriodo).map((c) => ({
    cliente: c,
    ...resumir(lista.filter((i) => (i.cliente?.trim() || "Sem cliente") === c)),
  }));

  // Pedidos que ainda faltam: coleta mais perto primeiro, depois o mais atrasado na fabricação.
  const faltando = lista
    .filter((i) => pctPedido(i) < 100)
    .sort((a, b) => a.coleta_data!.localeCompare(b.coleta_data!) || pctPedido(a) - pctPedido(b) || a.po.localeCompare(b.po, "pt-BR", { numeric: true }));
  // Coleta em risco: já passou, ou faltam até 3 dias e está abaixo de 80%.
  const emRisco = porData.filter((d) => d.pct < 100 && (d.dias < 0 || (d.dias <= 3 && d.pct < 80)));
  const gargalo = prioridade[0];

  const botao = "rounded-lg border border-stone-400 bg-white px-3 py-2 text-sm hover:bg-stone-100";
  const th = "border-b-2 border-stone-300 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-stone-500";
  const td = "border-b border-stone-200 px-2 py-1 text-xs";

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] flex-wrap items-end gap-2 px-4 print:hidden">
        <label className="flex flex-col text-[11px] text-stone-600">
          Data inicial
          <input
            type="date"
            value={deStr}
            onChange={(e) => deIso(e.target.value) && ir(deIso(e.target.value)!, ate)}
            className="rounded-lg border border-stone-400 bg-white px-2 py-1.5 text-sm text-stone-900"
          />
        </label>
        <label className="flex flex-col text-[11px] text-stone-600">
          Até
          <input
            type="date"
            value={ateStr}
            onChange={(e) => deIso(e.target.value) && ir(de, deIso(e.target.value)!)}
            className="rounded-lg border border-stone-400 bg-white px-2 py-1.5 text-sm text-stone-900"
          />
        </label>
        <label className="flex flex-col text-[11px] text-stone-600">
          Cliente
          <select
            value={cliente}
            onChange={(e) => ir(de, ate, e.target.value)}
            className="rounded-lg border border-stone-400 bg-white px-2 py-2 text-sm text-stone-900"
          >
            <option value="">Todos</option>
            {clientesPeriodo.map((c) => (
              <option key={c} value={c}>
                {nomeClienteRelatorio(c)}
              </option>
            ))}
          </select>
        </label>
        {[7, 15, 30].map((n) => (
          <button key={n} type="button" onClick={() => ir(hoje(), somarDias(hoje(), n))} className={botao}>
            Próx. {n} dias
          </button>
        ))}
        <span className="mr-auto" />
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-600">
          Imprimir / Salvar PDF
        </button>
        <button type="button" onClick={() => window.close()} className="rounded-lg border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100">
          Fechar
        </button>
      </div>

      <main className="folha-coleta mx-auto flex max-w-[297mm] flex-col gap-5 bg-white p-[8mm] text-stone-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between gap-4 border-b-4 border-green-700 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-green-800">FC Nexus · Follow up de obras</p>
            <h1 className="text-2xl font-bold">
              Relatório de carga
              {cliente && <span className="font-normal text-stone-600"> — {nomeClienteRelatorio(cliente)}</span>}
            </h1>
            <p className="text-sm text-stone-600">
              Coletas de {de.toLocaleDateString("pt-BR")} a {ate.toLocaleDateString("pt-BR")}
            </p>
          </div>
          <p className="text-right text-xs text-stone-500">
            Gerado em <span className="block font-medium text-stone-700">{geradoEm}</span>
          </p>
        </header>

        {lista.length === 0 ? (
          <p className="py-10 text-center text-stone-500">Nenhum pedido com coleta neste período.</p>
        ) : (
          <>
            {/* 1. Visão geral: quanto já foi feito e quanto falta. */}
            <section className="grid grid-cols-[1.3fr_1fr] gap-4 break-inside-avoid">
              <div className="flex flex-col justify-center gap-2 rounded-xl border border-stone-300 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Andamento da carga</p>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-5xl font-extrabold" style={{ color: corPct(pctGeral) }}>
                    {pct(pctGeral)}
                  </span>
                  <span className="text-sm text-stone-600">
                    concluído · <strong>falta {pct(100 - pctGeral)}</strong> pra finalizar
                  </span>
                </div>
                <Barra valor={pctGeral} altura="h-5" />
                <p className="text-xs text-stone-600">
                  {comPeso ? (
                    <>
                      Carga total <strong>{kg(geral.pesoTotal)}</strong> · feito <strong className="text-green-700">{kg(geral.pesoTotal - geral.pesoFalta)}</strong> ·
                      falta <strong className="text-red-700">{kg(geral.pesoFalta)}</strong>
                    </>
                  ) : (
                    "Média do percentual das etapas dos pedidos (sem peso cadastrado)."
                  )}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* Termos do PCP — pedido do usuário (19/10/2026): sem nenhuma etapa apontada =
                    aguardando a Engenharia, que é a etapa inicial de tudo. */}
                {(
                  [
                    ["Pedidos no período", geral.pedidos, "text-stone-900", "", "com coleta no período"],
                    ["Concluídos (100%)", geral.prontos, "text-green-700", "bg-green-50 border-green-300", "dos pedidos"],
                    ["Em fabricação", geral.andamento, "text-amber-700", "bg-amber-50 border-amber-300", "dos pedidos · já liberados"],
                    ["Aguardando Engenharia", geral.naoIniciados, "text-red-700", "bg-red-50 border-red-300", "dos pedidos · não liberados p/ fabricação"],
                  ] as const
                ).map(([rotulo, n, cor, fundo, dica], k) => (
                  <div key={rotulo} className={`rounded-xl border p-2.5 ${fundo || "border-stone-300"}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-stone-500">{rotulo}</p>
                    <p className={`font-mono text-3xl font-extrabold ${cor}`}>{n}</p>
                    <p className="text-[10px] text-stone-500">
                      {k > 0 && `${pct((n / geral.pedidos) * 100)} `}
                      {dica}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* 2. Onde aplicar mais energia: etapas em ordem de quanto falta. */}
            <section className="break-inside-avoid rounded-xl border-2 border-red-200 bg-red-50/40 p-4">
              <h2 className="text-base font-extrabold text-red-800">🎯 Onde aplicar mais energia na fabricação</h2>
              {gargalo ? (
                <p className="mb-3 text-sm text-stone-700">
                  Maior gargalo: <strong>{gargalo.nome}</strong> — faltam <strong>{gargalo.faltamPedidos} pedido(s)</strong>
                  {comPeso && (
                    <>
                      {" "}
                      e <strong>{kg(gargalo.faltaKg)}</strong> de carga
                    </>
                  )}{" "}
                  nessa etapa. As etapas estão em ordem de prioridade (o que mais falta primeiro).
                </p>
              ) : (
                <p className="mb-3 text-sm text-green-700">Todas as etapas estão concluídas neste período. 🎉</p>
              )}
              <div className="flex flex-col gap-1.5">
                {prioridade.map((e, n) => {
                  const medida = comPeso ? e.faltaKg : e.faltamPedidos;
                  return (
                    <div key={e.campo} className="grid grid-cols-[2rem_7rem_1fr_11rem_4rem] items-center gap-2">
                      <span
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold text-white ${
                          n === 0 ? "bg-red-600" : n === 1 ? "bg-orange-500" : n === 2 ? "bg-amber-500" : "bg-stone-400"
                        }`}
                      >
                        {n + 1}
                      </span>
                      <span className="text-sm font-bold">{e.nome}</span>
                      <div className="h-5 w-full overflow-hidden rounded bg-white ring-1 ring-stone-200">
                        <div
                          className="flex h-full items-center justify-end rounded pr-1 text-[10px] font-bold text-white"
                          style={{ width: `${Math.max(4, (medida / maxFalta) * 100)}%`, backgroundColor: n === 0 ? "#dc2626" : n === 1 ? "#f97316" : n === 2 ? "#f59e0b" : "#a8a29e" }}
                        >
                          {comPeso ? kg(e.faltaKg) : ""}
                        </div>
                      </div>
                      <span className="text-xs text-stone-600">
                        faltam <strong>{e.faltamPedidos}</strong> de {e.aplicaveis} pedido(s)
                      </span>
                      <span className="text-right font-mono text-xs font-bold" style={{ color: corPct(e.pct) }}>
                        {pct(e.pct)} feito
                      </span>
                    </div>
                  );
                })}
              </div>
              {emRisco.length > 0 && (
                <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
                  ⚠ <strong>Coletas em risco</strong> (já passaram ou faltam até 3 dias com menos de 80%):{" "}
                  {emRisco.map((d) => `${formatarDataBr(d.data).slice(0, 5)} (${pct(d.pct)})`).join(" · ")}
                </p>
              )}
            </section>

            {/* 3. Fluxo das etapas, na ordem da fabricação. */}
            <section className="break-inside-avoid">
              <h2 className="mb-2 text-sm font-bold">Andamento por etapa (na ordem da fabricação)</h2>
              <div className="grid grid-cols-8 gap-1.5">
                {etapas.map((e, n) => (
                  <div key={e.campo} className="relative rounded-lg border border-stone-300 p-2 text-center">
                    {n < etapas.length - 1 && <span className="absolute -right-[9px] top-1/2 z-10 -translate-y-1/2 text-stone-400">▶</span>}
                    <p className="text-[10px] font-bold uppercase text-stone-500">{e.nome}</p>
                    <p className="font-mono text-xl font-extrabold" style={{ color: corPct(e.pct) }}>
                      {pct(e.pct)}
                    </p>
                    <Barra valor={e.pct} altura="h-1.5" />
                    <p className="mt-1 text-[10px] text-stone-500">{e.faltamPedidos ? `faltam ${e.faltamPedidos}` : "✓ ok"}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* 4. Linha do tempo das coletas e por cliente. */}
            <section className="grid grid-cols-[1.4fr_1fr] gap-4 break-inside-avoid">
              <div>
                <h2 className="mb-1 text-sm font-bold">Por data de coleta</h2>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Coleta</th>
                      <th className={th}>Clientes</th>
                      <th className={`${th} text-center`}>Prontos</th>
                      <th className={`${th} w-[35%]`}>Concluído</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porData.map((d) => (
                      <tr key={d.data} className={emRisco.includes(d) ? "bg-red-50" : ""}>
                        <td className={`${td} whitespace-nowrap`}>
                          <strong>{formatarDataBr(d.data).slice(0, 5)}</strong>
                          <span className={`ml-1 text-[10px] ${d.dias < 0 ? "font-bold text-red-700" : "text-stone-500"}`}>
                            {d.dias < 0 ? `${-d.dias}d atrás` : d.dias === 0 ? "hoje" : `em ${d.dias}d`}
                          </span>
                        </td>
                        <td className={`${td} text-[11px]`}>{d.clientes.join(", ")}</td>
                        <td className={`${td} text-center font-mono`}>
                          {d.prontos}/{d.pedidos}
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            <Barra valor={d.pct} />
                            <span className="w-9 text-right font-mono text-[11px] font-bold" style={{ color: corPct(d.pct) }}>
                              {pct(d.pct)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <h2 className="mb-1 text-sm font-bold">Por cliente</h2>
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Cliente</th>
                      <th className={`${th} text-center`}>Prontos</th>
                      <th className={`${th} w-[40%]`}>Concluído</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porCliente.map((c) => (
                      <tr key={c.cliente}>
                        <td className={`${td} font-semibold`}>
                          {nomeClienteRelatorio(c.cliente)}
                          {comPeso && c.pesoFalta > 0 && <span className="block text-[10px] font-normal text-stone-500">falta {kg(c.pesoFalta)}</span>}
                        </td>
                        <td className={`${td} text-center font-mono`}>
                          {c.prontos}/{c.pedidos}
                        </td>
                        <td className={td}>
                          <div className="flex items-center gap-2">
                            <Barra valor={c.pct} />
                            <span className="w-9 text-right font-mono text-[11px] font-bold" style={{ color: corPct(c.pct) }}>
                              {pct(c.pct)}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 5. Lista do que falta, coleta mais perto primeiro. */}
            <section>
              <h2 className="mb-1 text-sm font-bold">
                Pedidos que ainda faltam — {faltando.length} de {lista.length}
                <span className="ml-2 inline-flex items-center gap-2 text-[10px] font-normal text-stone-500">
                  <span className="inline-block h-2.5 w-3 rounded-[2px] bg-green-600" /> etapa concluída
                  <span className="inline-block h-2.5 w-3 rounded-[2px] bg-amber-400" /> parcial
                  <span className="inline-block h-2.5 w-3 rounded-[2px] bg-stone-200" /> não iniciada
                  <span className="inline-block h-2.5 w-3 rounded-[2px] border border-dashed border-stone-300" /> SP = sem pintura
                </span>
              </h2>
              {faltando.length === 0 ? (
                <p className="text-sm text-green-700">Todos os pedidos do período estão prontos.</p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className={th}>Coleta</th>
                      <th className={th}>Cliente</th>
                      <th className={th}>PO (MAC)</th>
                      <th className={th}>Descrição</th>
                      <th className={`${th} text-center`}>Qtd</th>
                      <th className={th}>Etapas</th>
                      <th className={`${th} w-[13%]`}>Concluído</th>
                      {comPeso && <th className={`${th} text-right`}>Falta</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {faltando.map((i) => {
                      const p = pctPedido(i);
                      const atrasado = diasAte(i.coleta_data!) < 0;
                      return (
                        <tr key={i.id} className={`break-inside-avoid ${atrasado ? "bg-red-50" : ""}`}>
                          <td className={`${td} whitespace-nowrap font-semibold ${atrasado ? "text-red-700" : ""}`}>{formatarDataBr(i.coleta_data).slice(0, 5)}</td>
                          <td className={td}>{i.cliente}</td>
                          <td className={`${td} whitespace-nowrap font-mono text-[11px]`}>
                            <span
                              className={`mr-0.5 inline-block w-1.5 font-sans font-bold text-amber-600 ${(i.peso_total ?? 0) > KG_ATENCAO ? "" : "invisible"}`}
                              title={`Item pesado: ${kg(i.peso_total ?? 0)} (acima de ${KG_ATENCAO} kg)`}
                            >
                              !
                            </span>
                            {i.po}
                            {i.mac?.trim() && <span className="text-stone-500"> ({i.mac.trim()})</span>}
                            {i.falta_material && <span className="ml-1 rounded bg-red-600 px-1 text-[8px] font-bold text-white">F.MAT</span>}
                          </td>
                          <td className={`${td} max-w-[14rem] truncate text-[11px]`} title={i.descricao ?? undefined}>
                            {i.descricao}
                          </td>
                          <td className={`${td} text-center font-mono`}>{i.quantidade ?? ""}</td>
                          <td className={td}>
                            <FaixaEtapas item={i} />
                          </td>
                          <td className={td}>
                            <div className="flex items-center gap-1.5">
                              <Barra valor={p} altura="h-2" />
                              <span className="w-8 text-right font-mono text-[11px] font-bold" style={{ color: corPct(p) }}>
                                {pct(p)}
                              </span>
                            </div>
                          </td>
                          {comPeso && (
                            <td className={`${td} whitespace-nowrap text-right font-mono text-[11px]`}>
                              {i.peso_total ? kg(((i.peso_total ?? 0) * (100 - p)) / 100) : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}

        <p className="text-[10px] text-stone-500">
          Como é calculado: cada pedido tem 8 etapas (Engenharia, Corte, Montagem, Solda, Usinagem, Dobra, Jato, Pintura), cada uma de 0 a 100% como no
          Follow up; o pedido está pronto quando as etapas estão em 100% (mesma regra do Status). % do pedido = média das etapas. Pedido com SP na
          pintura (COR2 ou Plano) não tem pintura: a etapa Pintura não conta pra ele. Carga = peso total do
          pedido; o que falta em kg = peso × (100% − concluído). Base: pedidos com data na coluna COLETA dentro do período. F.MAT = esperando material. ! = item acima de 100 kg (atenção). Aguardando Engenharia = nenhuma etapa apontada ainda.
        </p>
      </main>
    </div>
  );
}

export default function RelatorioCarga() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
