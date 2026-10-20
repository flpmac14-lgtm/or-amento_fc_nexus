"use client";

// Aba "Cortados" da Qualidade — pedido do usuário (14/10/2026): a Qualidade
// precisa ver os programas que já foram cortados e, principalmente, o NRI que
// o operador anotou na aba Corte (corte_programas.nri), pra pôr no data book.
// Só consulta: mesma lista da aba Corte (GET /corte/programas), só finalizados.

import { Fragment, useEffect, useMemo, useState } from "react";
import { BotaoPdfPrograma } from "@/components/PdfPrograma";
import { listarProgramasCorte } from "@/lib/api";
import { rotuloCliente } from "@/lib/clientes";
import { formatarNumero } from "@/lib/format";
import { normalizarBusca } from "@/lib/followUp";
import { MAQUINAS, infoMaquina } from "@/lib/maquinaCorte";
import type { MaquinaCorte, PecaCorte, ProgramaCorte } from "@/lib/types";

const PERIODOS = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: 365, rotulo: "1 ano" },
  { dias: 0, rotulo: "Tudo" },
];
const LIMITE_LINHAS = 300;

const classeCampo =
  "rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function pecaBate(i: PecaCorte, termo: string): boolean {
  return [i.mac, i.pedido, i.desenho, i.descricao, rotuloCliente(i.cliente)].some((v) =>
    normalizarBusca(String(v ?? "")).includes(termo),
  );
}

export default function CortadosQualidade() {
  const [programas, setProgramas] = useState<ProgramaCorte[] | null>(null);
  const [erro, setErro] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [agora, setAgora] = useState(0); // hora da última carga (base do período)
  const [dias, setDias] = useState(30);
  const [busca, setBusca] = useState("");
  const [comNri, setComNri] = useState<"" | "com" | "sem">("");
  const [maquina, setMaquina] = useState<MaquinaCorte | "">("");
  const [aberto, setAberto] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let ativo = true;
    listarProgramasCorte()
      .then((l) => {
        if (!ativo) return;
        setProgramas(l.filter((p) => p.finalizado_em));
        setAgora(Date.now());
        setErro("");
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [recarga]);

  const termo = normalizarBusca(busca.trim());

  const linhas = useMemo(() => {
    if (!programas) return [];
    // Pesquisando, procura em todo o período (o programa pode ter sido cortado há meses).
    const limite = dias && !termo ? agora - dias * 86400000 : 0;
    return programas
      .filter((p) => new Date(p.finalizado_em!).getTime() >= limite)
      .filter((p) => !maquina || p.maquina === maquina)
      .filter((p) => (comNri === "com" ? !!p.nri : comNri === "sem" ? !p.nri : true))
      .map((p) => {
        const achou = termo ? p.itens.filter((i) => pecaBate(i, termo)) : [];
        const peloNumero = !!termo && (p.programa.startsWith(termo) || (p.nri ?? "").startsWith(termo));
        return { p, achou, peloNumero };
      })
      .filter((r) => !termo || r.peloNumero || r.achou.length > 0)
      .sort((a, b) => b.p.finalizado_em!.localeCompare(a.p.finalizado_em!));
  }, [programas, agora, dias, termo, maquina, comNri]);

  // Pesquisando uma MAC/desenho: os NRIs que aparecem nos programas achados (o que vai pro data book).
  const nrisAchados = useMemo(
    () => (termo ? [...new Set(linhas.map((r) => r.p.nri).filter((n): n is string => !!n))].sort() : []),
    [linhas, termo],
  );
  const semNri = linhas.filter((r) => !r.p.nri).length;

  // Planilha (.csv com ; e acentos) — uma linha por peça, abre direto no Excel.
  function exportar() {
    const cab = ["Cortado em", "Programa", "Máquina", "NRI", "Cliente", "MAC", "Pedido (PO)", "Desenho", "Descrição", "Material", "Qtd", "Operador"];
    const corpo = linhas.flatMap(({ p, achou }) => {
      const pecas = termo && achou.length > 0 ? achou : p.itens;
      const base = [dataHora(p.finalizado_em!), p.programa, infoMaquina(p.maquina).rotulo, p.nri ?? ""];
      if (pecas.length === 0) return [[...base, "", "", "", "", "", p.mps.join(" / "), "", p.finalizado_por ?? ""]];
      return pecas.map((i) => [
        ...base,
        rotuloCliente(i.cliente) ?? "",
        i.mac ?? "",
        i.pedido ?? "",
        i.desenho ?? "",
        i.descricao ?? "",
        i.mp ?? "",
        i.qtt === null ? "" : String(i.qtt),
        p.finalizado_por ?? "",
      ]);
    });
    const csv = [cab, ...corpo]
      .map((linha) => linha.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `programas-cortados-nri.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (erro && !programas) return <p className="rounded-xl bg-red-50 p-4 text-red-700">{erro}</p>;
  if (!programas)
    return <p className="py-10 text-center text-stone-500">Carregando… (o servidor pode levar até 1 minuto para acordar)</p>;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-extrabold text-stone-900 dark:text-white">✂️ Programas cortados</h2>
        <p className="text-sm text-stone-500 dark:text-slate-400">
          NRI anotado pelo operador na aba Corte — pra rastrear a matéria-prima de cada peça no data book.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 MAC, desenho, pedido, programa ou NRI"
          autoComplete="off"
          aria-label="Pesquisar programas cortados"
          className={`${classeCampo} h-10 min-w-0 flex-1 basis-64 text-base`}
        />
        <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className={`${classeCampo} h-10`} aria-label="Período">
          {PERIODOS.map((p) => (
            <option key={p.dias} value={p.dias}>
              {p.dias ? `Últimos ${p.rotulo}` : "Todo o histórico"}
            </option>
          ))}
        </select>
        <select value={comNri} onChange={(e) => setComNri(e.target.value as "" | "com" | "sem")} className={`${classeCampo} h-10`} aria-label="NRI">
          <option value="">Com e sem NRI</option>
          <option value="com">Só com NRI</option>
          <option value="sem">Só sem NRI</option>
        </select>
        <select value={maquina} onChange={(e) => setMaquina(e.target.value as MaquinaCorte | "")} className={`${classeCampo} h-10`} aria-label="Máquina">
          <option value="">Laser e Oxicorte</option>
          {MAQUINAS.map((m) => (
            <option key={m.maquina} value={m.maquina}>
              {m.icone} {m.rotulo}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setRecarga((r) => r + 1)} className={`${classeCampo} h-10 font-semibold`}>
          ↻ Atualizar
        </button>
        <button
          type="button"
          onClick={exportar}
          disabled={linhas.length === 0}
          className="h-10 rounded-lg bg-green-700 px-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-cyan-600"
        >
          ⬇ Planilha
        </button>
      </div>

      <p className="text-sm text-stone-600 dark:text-slate-300">
        <b>{linhas.length}</b> programa(s) cortado(s)
        {termo ? " (pesquisa em todo o histórico)" : ""} ·{" "}
        <span className="text-green-700 dark:text-green-400">{linhas.length - semNri} com NRI</span> ·{" "}
        <span className={semNri ? "font-semibold text-red-600 dark:text-red-400" : ""}>{semNri} sem NRI</span>
      </p>

      {nrisAchados.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-green-600 bg-green-50 p-2.5 dark:border-cyan-700 dark:bg-cyan-950/30">
          <span className="text-sm font-bold text-green-800 dark:text-cyan-300">NRIs desta pesquisa:</span>
          {nrisAchados.map((n) => (
            <span key={n} className="rounded-md bg-green-700 px-2 py-0.5 font-mono text-base font-extrabold text-white dark:bg-cyan-600">
              {n}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-slate-700">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-stone-100 text-left text-xs uppercase tracking-wide text-stone-600 dark:bg-slate-800 dark:text-slate-300">
            <tr>
              <th className="px-3 py-2">Cortado em</th>
              <th className="px-3 py-2">Programa</th>
              <th className="px-3 py-2">NRI</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">MAC</th>
              <th className="px-3 py-2">Material</th>
              <th className="px-3 py-2 text-right">Peças</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-stone-500">
                  {termo ? "Nenhum programa cortado encontrado." : "Nenhum programa cortado no período."}
                </td>
              </tr>
            )}
            {linhas.slice(0, LIMITE_LINHAS).map(({ p, achou }) => {
              const m = infoMaquina(p.maquina);
              const clientes = [...new Set(p.itens.map((i) => rotuloCliente(i.cliente)).filter(Boolean))].sort();
              const macs = [...new Set(p.itens.map((i) => i.mac?.trim()).filter(Boolean))].sort();
              const abrir = aberto[p.programa] || (achou.length > 0 && achou.length <= 5);
              const marcadas = new Set(achou.map((i) => i.id));
              return (
                <Fragment key={p.programa}>
                  <tr
                    onClick={() => setAberto((a) => ({ ...a, [p.programa]: !abrir }))}
                    className="cursor-pointer border-t border-stone-200 hover:bg-stone-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-stone-600 dark:text-slate-400">
                      {dataHora(p.finalizado_em!)}
                      {p.finalizado_por && <span className="block text-xs">{p.finalizado_por}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="font-mono text-base font-bold text-stone-900 dark:text-white">{p.programa}</span>
                      <BotaoPdfPrograma programa={p.programa} />
                      <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${m.etiqueta}`}>
                        {m.icone} {m.rotulo}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {p.nri ? (
                        <span className="rounded-md bg-green-100 px-2 py-0.5 font-mono text-lg font-extrabold text-green-800 dark:bg-green-950/50 dark:text-green-300">
                          {p.nri}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-red-600 dark:text-red-400">sem NRI</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-semibold text-green-800 dark:text-cyan-300">{clientes.join(" · ") || "—"}</td>
                    <td className="px-3 py-2 text-stone-700 dark:text-slate-300">{macs.join(" · ") || "—"}</td>
                    <td className="px-3 py-2 text-xs text-stone-600 dark:text-slate-400">{p.mps.join(" · ") || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{formatarNumero(p.pecas, 0)}</td>
                    <td className="px-3 py-2 text-stone-400">{abrir ? "▴" : "▾"}</td>
                  </tr>
                  {abrir && (
                    <tr className="bg-stone-50 dark:bg-slate-900/60">
                      <td colSpan={8} className="px-3 py-2">
                        {p.itens.length === 0 ? (
                          <span className="text-stone-500">Sem peças listadas.</span>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="text-left text-stone-500 dark:text-slate-400">
                              <tr>
                                <th className="py-1 pr-3">Desenho</th>
                                <th className="py-1 pr-3">Descrição</th>
                                <th className="py-1 pr-3">MAC</th>
                                <th className="py-1 pr-3">Pedido (PO)</th>
                                <th className="py-1 pr-3">Material</th>
                                <th className="py-1 text-right">Qtd</th>
                              </tr>
                            </thead>
                            <tbody>
                              {p.itens.map((i) => (
                                <tr key={i.id} className={marcadas.has(i.id) ? "bg-yellow-100 dark:bg-yellow-900/40" : ""}>
                                  <td className="py-1 pr-3 font-mono font-bold text-stone-900 dark:text-white">{i.desenho ?? "—"}</td>
                                  <td className="py-1 pr-3">{i.descricao ?? ""}</td>
                                  <td className="py-1 pr-3">{i.mac ?? ""}</td>
                                  <td className="py-1 pr-3">{i.pedido ?? ""}</td>
                                  <td className="py-1 pr-3">{i.mp ?? ""}</td>
                                  <td className="py-1 text-right font-mono font-bold">{formatarNumero(i.qtt ?? 0, 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {linhas.length > LIMITE_LINHAS && (
        <p className="text-center text-sm text-stone-500">
          Mostrando {LIMITE_LINHAS} de {linhas.length} — pesquise ou diminua o período (a planilha leva todos).
        </p>
      )}
    </div>
  );
}
