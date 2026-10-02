"use client";

// Bloco 6 — Registros do dia: painel lateral retrátil à direita. Fonte: o que
// as tabelas já guardam (sem log de auditoria por enquanto — ver
// app/painel.py::registros). Filtros por módulo (chips), usuário e ação.

import { useMemo, useState } from "react";
import { Vazio } from "@/components/VisaoGeralComum";
import { horaMinuto, type AcaoRegistro, type RespostaRegistros } from "@/lib/painel";

const COR_MODULO: Record<string, string> = {
  "Follow up": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  Croqui: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  Corte: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  Obras: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
};

const ACOES: AcaoRegistro[] = ["criou", "alterou", "concluiu", "excluiu"];

export default function VisaoGeralRegistros({
  dados,
  erro,
  carregando,
  data,
  setData,
  fechar,
}: {
  dados: RespostaRegistros | null;
  erro: string;
  carregando: boolean;
  data: string;
  setData: (d: string) => void;
  fechar: () => void;
}) {
  const [modulo, setModulo] = useState("");
  const [usuario, setUsuario] = useState("");
  const [acao, setAcao] = useState("");
  const eventos = useMemo(() => dados?.eventos ?? [], [dados]);

  const porModulo = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of eventos) m.set(e.modulo, (m.get(e.modulo) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [eventos]);
  const usuarios = useMemo(() => [...new Set(eventos.map((e) => e.usuario))].sort(), [eventos]);
  const filtrados = eventos.filter(
    (e) => (!modulo || e.modulo === modulo) && (!usuario || e.usuario === usuario) && (!acao || e.acao === acao),
  );
  const campo =
    "rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-stone-800 dark:text-slate-200";

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-stone-200 dark:border-slate-800 p-3">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">📋 Registros do dia</h2>
        <button type="button" onClick={fechar} className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1 text-sm text-stone-700 dark:text-slate-300">
          Fechar
        </button>
      </div>
      <div className="flex flex-col gap-2 border-b border-stone-200 dark:border-slate-800 p-3">
        <div className="flex flex-wrap gap-2">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} className={campo}>
            <option value="">Todos os usuários</option>
            {usuarios.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <select value={acao} onChange={(e) => setAcao(e.target.value)} className={campo}>
            <option value="">Todas as ações</option>
            {ACOES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {porModulo.map(([m, n]) => (
            <button
              key={m}
              type="button"
              onClick={() => setModulo((atual) => (atual === m ? "" : m))}
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR_MODULO[m] ?? "bg-stone-100 text-stone-700"} ${
                modulo === m ? "ring-2 ring-stone-900 dark:ring-white" : modulo ? "opacity-50" : ""
              }`}
            >
              {m} {n}
            </button>
          ))}
        </div>
        {dados && <p className="text-[11px] italic text-stone-500 dark:text-slate-400">{dados.aviso}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
        {carregando && !dados && <p className="text-sm text-stone-500">Carregando…</p>}
        {dados && filtrados.length === 0 && <Vazio>Nenhum registro.</Vazio>}
        <ul className="flex flex-col">
          {filtrados.map((e, i) => {
            const corpo = (
              <>
                <span className="w-11 shrink-0 font-mono text-xs text-stone-500 dark:text-slate-400">{horaMinuto(e.em)}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5">
                    <span className={`rounded px-1.5 text-[10px] font-semibold ${COR_MODULO[e.modulo] ?? ""}`}>{e.modulo}</span>
                    <span className="text-[11px] text-stone-500 dark:text-slate-400">{e.acao}</span>
                    <span className="ml-auto text-[11px] font-semibold text-stone-600 dark:text-slate-300">{e.usuario}</span>
                  </span>
                  <span className="truncate text-sm text-stone-800 dark:text-slate-200" title={e.descricao}>
                    {e.descricao}
                  </span>
                </span>
              </>
            );
            return (
              <li key={i} className="border-b border-stone-100 dark:border-slate-800">
                {e.link ? (
                  <a href={e.link} target="_blank" rel="noreferrer" className="flex gap-2 py-1.5 hover:bg-stone-50 dark:hover:bg-slate-800/60">
                    {corpo}
                  </a>
                ) : (
                  <div className="flex gap-2 py-1.5">{corpo}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
