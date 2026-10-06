"use client";

// Usinagem na Visão Geral — pedido do usuário (no lugar do "Atenção hoje"):
// o que cada operador está usinando/pausou e os apontamentos de hoje do líder
// (saymon) — Usinando, Pausado, Fim, Falta material, inclusive serviço interno
// Macfab. GET /painel/usinagem (app/painel.py::usinagem).

import { Bloco, Vazio, useBloco } from "@/components/VisaoGeralComum";
import { horaMinuto, linkObra, type ApontamentoUsinagem, type RespostaUsinagem } from "@/lib/painel";

const SELO: Record<ApontamentoUsinagem["status"], string> = {
  em_andamento: "bg-amber-400 text-stone-900",
  pausado: "bg-sky-600 text-white",
  finalizado: "bg-green-600 text-white",
  falta_material: "bg-red-600 text-white",
};
const ICONE: Record<ApontamentoUsinagem["status"], string> = {
  em_andamento: "▶",
  pausado: "⏸",
  finalizado: "✔",
  falta_material: "⚠",
};

function Alvo({ a }: { a: ApontamentoUsinagem }) {
  if (a.servico) return <span className="text-violet-700 dark:text-violet-300">🔧 {a.servico}</span>;
  const nome = a.desenho ?? `PO ${a.po ?? "—"}`;
  return (
    <>
      <span className="font-mono font-semibold" title={`${a.descricao ?? ""}\nPO ${a.po ?? "—"}`}>
        {nome}
      </span>
      {a.obra_mac && (
        <a href={linkObra(a.obra_mac)} target="_blank" rel="noreferrer" className="ml-1 rounded bg-stone-100 px-1 text-[10px] font-semibold text-stone-600 hover:underline dark:bg-slate-800 dark:text-slate-300">
          {a.obra_mac}
        </a>
      )}
    </>
  );
}

export default function VisaoGeralUsinagem({ tick }: { tick: number }) {
  const { dados, erro, carregando } = useBloco<RespostaUsinagem>("usinagem", {}, tick);

  return (
    <Bloco titulo="⚙️ Usinagem" carregando={carregando} erro={erro}>
      {dados && (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <ul className="flex shrink-0 flex-col gap-0.5">
            {dados.operadores.map((o) => (
              <li key={o.nome} className="flex items-start gap-2 text-xs">
                <span className="w-16 shrink-0 truncate font-bold text-stone-900 dark:text-white">{o.nome}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  {o.usinando.length === 0 && o.pausados.length === 0 && (
                    <span className="text-stone-400 dark:text-slate-500">nada usinando</span>
                  )}
                  {[...o.usinando, ...o.pausados].map((a, k) => (
                    <span key={k} className="truncate">
                      <span className={`mr-1 rounded px-1 text-[10px] font-bold ${SELO[a.status]}`}>{ICONE[a.status]}</span>
                      <Alvo a={a} />
                      <span className="ml-1 text-stone-400 dark:text-slate-500">{horaMinuto(a.em)}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
            {dados.falta_material.length > 0 && (
              <li className="text-xs font-semibold text-red-600 dark:text-red-400" title={dados.falta_material.map((a) => a.servico ?? a.desenho ?? a.po).join("\n")}>
                ⚠ {dados.falta_material.length} com falta de material
              </li>
            )}
          </ul>

          <p className="shrink-0 border-t border-stone-200 pt-1 text-[11px] font-bold uppercase text-stone-500 dark:border-slate-700 dark:text-slate-400">
            Registros de hoje · {dados.hoje.length}
          </p>
          <ul className="min-h-0 flex-1 overflow-auto pr-1">
            {dados.hoje.length === 0 && <Vazio>Nenhum apontamento hoje.</Vazio>}
            {dados.hoje.map((a, k) => (
              <li key={k} className="border-b border-stone-100 py-0.5 text-xs last:border-b-0 dark:border-slate-800">
                <div className="flex items-center gap-1.5">
                  <span className="shrink-0 font-mono text-stone-500 dark:text-slate-400">{horaMinuto(a.em)}</span>
                  <span className={`shrink-0 rounded px-1 text-[10px] font-bold ${SELO[a.status]}`}>
                    {ICONE[a.status]} {a.rotulo}
                  </span>
                  <span className="shrink-0 font-bold text-stone-800 dark:text-slate-200">{a.operador ?? "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-700 dark:text-slate-300">
                    <Alvo a={a} />
                  </span>
                </div>
                {a.observacao && <p className="truncate pl-11 italic text-stone-500 dark:text-slate-400" title={a.observacao}>“{a.observacao}”</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Bloco>
  );
}
