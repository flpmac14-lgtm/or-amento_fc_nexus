"use client";

// Busca da Croqui de corte na Visão Geral — pedido do usuário: "saber ali na
// visão geral se já foi feito ou não o croqui de corte e qual estágio está",
// fácil de ver até no celular. GET /painel/croqui-busca (app/painel.py::busca_croqui).
// Cada resultado mostra o estágio numa linha de etapas:
// Aguardando projeto → Em projeto → Croqui feito → Cortado.

import { useEffect, useState } from "react";
import { buscarPainel } from "@/lib/api";
import { infoMaquina } from "@/lib/maquinaCorte";
import { horaMinuto, linkObra, type ItemBuscaCroqui } from "@/lib/painel";

const ETAPAS = ["Aguardando projeto", "Em projeto", "Croqui feito", "Cortado"];

// Status que não passam pelo corte (a peça sai por outro caminho).
const FORA_DO_CORTE = new Set(["Sem Corte", "Estoque", "Terceirizado", "Corte Manual"]);

function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = d.toDateString() === new Date().toDateString();
  return hoje ? `hoje ${horaMinuto(iso)}` : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Etapa (0–3), frase e cor do estágio de um pedido. */
function estagio(i: ItemBuscaCroqui): { etapa: number; texto: string; classe: string; fora?: boolean } {
  if (i.status && FORA_DO_CORTE.has(i.status))
    return { etapa: 3, texto: i.status, classe: "bg-sky-600 text-white", fora: true };
  if (i.status === "Aguardando revisão")
    return { etapa: 1, texto: "Aguardando revisão", classe: "bg-red-600 text-white" };
  if (i.status === "Pausado")
    return { etapa: 1, texto: `Projeto pausado${i.projetista ? ` · ${i.projetista}` : ""}`, classe: "bg-orange-500 text-white" };
  if (i.status === "Fazendo")
    return { etapa: 1, texto: `Em projeto${i.projetista ? ` · ${i.projetista}` : ""}`, classe: "bg-amber-400 text-stone-900" };
  if (i.status === "Feito") {
    const ps = i.programas;
    if (ps.length && ps.every((p) => p.situacao === "finalizado"))
      return { etapa: 3, texto: "Cortado", classe: "bg-green-700 text-white" };
    if (ps.some((p) => p.situacao === "cortando"))
      return { etapa: 2, texto: "Croqui feito · cortando agora", classe: "bg-green-600 text-white" };
    if (ps.some((p) => p.situacao === "falta_material"))
      return { etapa: 2, texto: "Croqui feito · falta material", classe: "bg-red-600 text-white" };
    return { etapa: 2, texto: "Croqui feito · aguardando corte", classe: "bg-green-600 text-white" };
  }
  return { etapa: 0, texto: "Aguardando projeto", classe: "bg-stone-300 text-stone-800 dark:bg-slate-600 dark:text-white" };
}

const ROTULO_CORTE = {
  a_cortar: "a cortar",
  cortando: "cortando",
  finalizado: "cortado ✓",
  falta_material: "falta material",
} as const;

function Resultado({ i }: { i: ItemBuscaCroqui }) {
  const e = estagio(i);
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-stone-200 bg-stone-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="flex flex-wrap items-center gap-1.5">
        <a href={linkObra(i.obra)} target="_blank" rel="noreferrer" className="rounded bg-white px-1.5 text-xs font-bold text-stone-800 hover:underline dark:bg-slate-900 dark:text-slate-200">
          {i.obra || "—"}
        </a>
        <span className="font-mono text-xs text-stone-600 dark:text-slate-400">{i.pedido}</span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-black ${e.classe}`}>{e.texto}</span>
      </div>
      <p className="truncate text-sm font-semibold text-stone-900 dark:text-white" title={i.descricao ?? ""}>
        {i.descricao ?? "—"}
      </p>
      <p className="truncate text-[11px] text-stone-500 dark:text-slate-400">
        {i.desenho ?? "sem desenho"} · {i.mp ?? "—"}
        {i.qtt !== null && ` · ${i.qtt.toLocaleString("pt-BR")} ${i.un ?? "pç"}`}
      </p>

      {/* Linha de etapas */}
      {!e.fora && (
        <div className="grid grid-cols-4 gap-1" aria-label={`Etapa ${e.etapa + 1} de 4`}>
          {ETAPAS.map((t, k) => (
            <div key={t} className="flex flex-col gap-0.5">
              <div
                className={`h-1.5 rounded-full ${
                  k < e.etapa ? "bg-green-600 dark:bg-cyan-500" : k === e.etapa ? (e.etapa === 3 ? "bg-green-600 dark:bg-cyan-500" : "bg-amber-400") : "bg-stone-200 dark:bg-slate-700"
                }`}
              />
              <span className={`text-[9px] leading-tight ${k === e.etapa ? "font-bold text-stone-800 dark:text-slate-100" : "text-stone-400 dark:text-slate-500"}`}>{t}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-600 dark:text-slate-400">
        {i.dt_fazendo && <span>começou {quando(i.dt_fazendo)}</span>}
        {i.dt_feito && <span className="font-semibold text-green-700 dark:text-green-400">feito {quando(i.dt_feito)}</span>}
        {i.programas.map((p) => (
          <span key={p.programa} className="rounded bg-white px-1.5 font-semibold dark:bg-slate-900" title={infoMaquina(p.maquina).rotulo}>
            {infoMaquina(p.maquina).icone} {p.programa} · {ROTULO_CORTE[p.situacao]}
          </span>
        ))}
        {i.observacao && <span className="w-full truncate italic" title={i.observacao}>“{i.observacao}”</span>}
      </div>
    </li>
  );
}

export default function VisaoGeralCroquiBusca({ busca }: { busca: string }) {
  const q = busca.trim();
  const [estado, setEstado] = useState<{ q: string; itens: ItemBuscaCroqui[]; erro: string }>({ q: "", itens: [], erro: "" });

  useEffect(() => {
    if (q.length < 2) return;
    let ativo = true;
    // Espera parar de digitar (não busca a cada letra).
    const id = setTimeout(() => {
      buscarPainel<{ itens: ItemBuscaCroqui[] }>("croqui-busca", { q })
        .then((r) => ativo && setEstado({ q, itens: r.itens, erro: "" }))
        .catch((e: Error) => ativo && setEstado({ q, itens: [], erro: e.message }));
    }, 400);
    return () => {
      ativo = false;
      clearTimeout(id);
    };
  }, [q]);

  if (q.length < 2) return <p className="text-xs text-stone-500 dark:text-slate-400">Digite pelo menos 2 letras ou números.</p>;
  if (estado.q !== q) return <p className="text-xs text-stone-500 dark:text-slate-400">Buscando…</p>;
  if (estado.erro) return <p className="text-xs text-red-600 dark:text-red-400">{estado.erro}</p>;
  if (estado.itens.length === 0)
    return <p className="text-sm text-stone-500 dark:text-slate-400">Nada na Croqui de corte com “{q}”.</p>;
  return (
    <>
      <p className="text-[11px] text-stone-500 dark:text-slate-400">
        {estado.itens.length >= 40 ? "Os 40 mais recentes" : `${estado.itens.length} resultado(s)`} para “{q}”
      </p>
      <ul className="flex flex-col gap-1.5">
        {estado.itens.map((i, k) => (
          <Resultado key={`${i.pedido}-${k}`} i={i} />
        ))}
      </ul>
    </>
  );
}
