"use client";

// Histórico de serviço do Corte (laser) — pedido explícito do usuário: cada
// marcação do operador (Cortando / Finalizado / Falta material, marcar ou
// desmarcar) vira uma linha de uma lista, como um histórico de serviço.
// Em "Finalizado" mostra o tempo desde o último "Cortando" (app/corte.py::historico).

import { useEffect, useMemo, useState } from "react";
import { listarHistoricoCorte } from "@/lib/api";
import { formatarNumero } from "@/lib/format";
import type { HistoricoCorte, MarcaCorte } from "@/lib/types";

const ROTULO: Record<MarcaCorte, { texto: string; classe: string }> = {
  cortando: { texto: "Cortando", classe: "bg-amber-400 text-stone-900" },
  finalizado: { texto: "Finalizado", classe: "bg-green-600 text-white" },
  falta_material: { texto: "Falta material", classe: "bg-red-600 text-white" },
};

const classeCampo =
  "rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function duracao(min: number | null): string {
  if (min === null) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export default function CorteHistorico() {
  const [dias, setDias] = useState(30);
  const [linhas, setLinhas] = useState<HistoricoCorte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [operador, setOperador] = useState("");
  const [acao, setAcao] = useState("");
  const [programa, setPrograma] = useState("");
  const [comDesmarcadas, setComDesmarcadas] = useState(false);

  useEffect(() => {
    let ativo = true;
    listarHistoricoCorte(dias)
      .then((l) => {
        if (!ativo) return;
        setLinhas(l);
        setErro("");
      })
      .catch((e: Error) => ativo && setErro(e.message))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [dias]);

  const operadores = useMemo(
    () =>
      [
        ...new Set(linhas.map((l) => l.por).filter((p): p is string => !!p)),
      ].sort(),
    [linhas],
  );

  const filtradas = useMemo(
    () =>
      linhas.filter(
        (l) =>
          (comDesmarcadas || l.valor) &&
          (!operador || l.por === operador) &&
          (!acao || l.marca === acao) &&
          (!programa || l.programa.startsWith(programa.replace(/\D/g, ""))),
      ),
    [linhas, operador, acao, programa, comDesmarcadas],
  );

  const resumo = useMemo(() => {
    const fin = filtradas.filter((l) => l.marca === "finalizado" && l.valor);
    const tempos = fin
      .map((l) => l.minutos_corte)
      .filter((m): m is number => m !== null);
    return {
      finalizados: new Set(fin.map((l) => l.programa)).size,
      pecas: fin.reduce((s, l) => s + (l.pecas ?? 0), 0),
      faltas: filtradas.filter((l) => l.marca === "falta_material" && l.valor)
        .length,
      tempoMedio: tempos.length
        ? Math.round(tempos.reduce((s, m) => s + m, 0) / tempos.length)
        : null,
    };
  }, [filtradas]);

  // Planilha (.csv com ; e acentos) — abre direto no Excel.
  function exportar() {
    const cab = [
      "Data/hora",
      "Programa",
      "Ação",
      "Marcou/Desmarcou",
      "Operador",
      "Material",
      "Peças",
      "Itens",
      "Tempo de corte (min)",
    ];
    const csv = [
      cab,
      ...filtradas.map((l) => [
        dataHora(l.em),
        l.programa,
        ROTULO[l.marca].texto,
        l.valor ? "Marcou" : "Desmarcou",
        l.por ?? "",
        l.mps.join(" / "),
        String(l.pecas ?? ""),
        String(l.itens),
        l.minutos_corte === null ? "" : String(l.minutos_corte),
      ]),
    ]
      .map((linha) =>
        linha.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"),
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-corte-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          { r: "Programas finalizados", v: resumo.finalizados },
          { r: "Peças finalizadas", v: formatarNumero(resumo.pecas, 0) },
          {
            r: "Falta de material",
            v: resumo.faltas,
            cor: "text-red-600 dark:text-red-400",
          },
          { r: "Tempo médio de corte", v: duracao(resumo.tempoMedio) || "—" },
        ].map((k) => (
          <div
            key={k.r}
            className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">
              {k.r}
            </p>
            <p
              className={`font-mono text-2xl font-bold ${k.cor ?? "text-stone-900 dark:text-white"}`}
            >
              {k.v}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3">
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Período
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            className={classeCampo}
          >
            {[
              [1, "Hoje e ontem"],
              [7, "Últimos 7 dias"],
              [30, "Últimos 30 dias"],
              [90, "Últimos 90 dias"],
              [365, "Último ano"],
            ].map(([n, r]) => (
              <option key={n} value={n}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Operador
          <select
            value={operador}
            onChange={(e) => setOperador(e.target.value)}
            className={classeCampo}
          >
            <option value="">Todos</option>
            {operadores.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Ação
          <select
            value={acao}
            onChange={(e) => setAcao(e.target.value)}
            className={classeCampo}
          >
            <option value="">Todas</option>
            {(Object.keys(ROTULO) as MarcaCorte[]).map((m) => (
              <option key={m} value={m}>
                {ROTULO[m].texto}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Programa
          <input
            value={programa}
            onChange={(e) => setPrograma(e.target.value)}
            inputMode="numeric"
            placeholder="nº"
            className={`${classeCampo} w-24 font-mono`}
          />
        </label>
        <label className="flex items-center gap-1.5 pb-2 text-sm text-stone-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={comDesmarcadas}
            onChange={(e) => setComDesmarcadas(e.target.checked)}
          />
          Mostrar desmarcações
        </label>
        <button
          type="button"
          onClick={exportar}
          disabled={filtradas.length === 0}
          className="ml-auto rounded-lg border border-green-600/60 dark:border-cyan-500/60 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-cyan-300 hover:bg-green-50 dark:hover:bg-cyan-950/30 disabled:opacity-40"
        >
          Exportar Excel ({filtradas.length})
        </button>
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

      <div className="max-h-[65vh] overflow-auto rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
        <table className="w-full min-w-[46rem] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 bg-stone-100 dark:bg-slate-900 text-left text-[11px] uppercase tracking-wide text-stone-600 dark:text-slate-400">
            <tr>
              {[
                "Data/hora",
                "Programa",
                "Ação",
                "Operador",
                "Material",
                "Peças",
                "Tempo de corte",
              ].map((c) => (
                <th
                  key={c}
                  className="border-b border-stone-200 dark:border-slate-800 px-3 py-2 font-semibold"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((l) => (
              <tr
                key={l.id}
                className={`text-stone-800 dark:text-slate-200 ${l.valor ? "" : "opacity-50"}`}
              >
                <td className="border-b border-stone-100 dark:border-slate-800/80 px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                  {dataHora(l.em)}
                </td>
                <td className="border-b border-stone-100 dark:border-slate-800/80 px-3 py-1.5 font-mono text-base font-bold">
                  {l.programa}
                </td>
                <td className="border-b border-stone-100 dark:border-slate-800/80 px-3 py-1.5">
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${ROTULO[l.marca].classe} ${l.valor ? "" : "line-through"}`}
                  >
                    {ROTULO[l.marca].texto}
                  </span>
                  {!l.valor && (
                    <span className="ml-1.5 text-xs">desmarcou</span>
                  )}
                </td>
                <td className="border-b border-stone-100 dark:border-slate-800/80 px-3 py-1.5 text-xs">
                  {l.por ?? "—"}
                </td>
                <td className="border-b border-stone-100 dark:border-slate-800/80 px-3 py-1.5 text-xs">
                  {l.mps.join(" · ") || "—"}
                </td>
                <td className="border-b border-stone-100 dark:border-slate-800/80 px-3 py-1.5 text-right font-mono text-xs">
                  {l.pecas === null ? "" : formatarNumero(l.pecas, 0)}
                </td>
                <td className="border-b border-stone-100 dark:border-slate-800/80 px-3 py-1.5 font-mono text-xs">
                  {duracao(l.minutos_corte)}
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-stone-500 dark:text-slate-500"
                >
                  {carregando
                    ? "Carregando…"
                    : `Nenhuma marcação ${dias === 1 ? "desde ontem" : `nos últimos ${dias} dias`} com esses filtros.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500 dark:text-slate-500">
        Cada toque do operador na aba Corte vira uma linha. O tempo de corte é
        do último “Cortando” até o “Finalizado” do programa.
      </p>
    </div>
  );
}
