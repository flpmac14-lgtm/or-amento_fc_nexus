"use client";

// Registro — pedido explícito do usuário (13/10/2026, só o admin flpmac14):
// tudo o que cada um está apontando, fácil de ver e separado por área
// (Caldeiraria, Usinagem, Pintura, Data book, Corte, Projeto).
// Dados: services/calc_engine/app/registro_geral.py.
import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { buscarRegistro, type EventoRegistro, type RespostaRegistro } from "@/lib/api";
import { podeVerFinanceiro } from "@/lib/financeiro";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

const RECARREGAR_A_CADA_MS = 2 * 60 * 1000;

const AREA: Record<EventoRegistro["area"], { icone: string; cor: string; selo: string }> = {
  caldeiraria: { icone: "🔩", cor: "border-cyan-500", selo: "bg-cyan-600 text-white" },
  usinagem: { icone: "⚙️", cor: "border-amber-500", selo: "bg-amber-500 text-stone-900" },
  pintura: { icone: "🎨", cor: "border-pink-500", selo: "bg-pink-600 text-white" },
  databook: { icone: "📘", cor: "border-violet-500", selo: "bg-violet-600 text-white" },
  corte: { icone: "✂️", cor: "border-orange-500", selo: "bg-orange-500 text-white" },
  projeto: { icone: "📐", cor: "border-sky-500", selo: "bg-sky-600 text-white" },
};

const TIPO: Record<EventoRegistro["tipo"], string> = {
  andamento: "text-amber-700 dark:text-amber-300",
  fim: "text-green-700 dark:text-green-400",
  falta: "text-red-600 dark:text-red-400",
  pausa: "text-sky-700 dark:text-sky-300",
};

function hora(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function dia(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
}

export default function PaginaRegistro() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [dias, setDias] = useState(1);
  const [dados, setDados] = useState<RespostaRegistro | null>(null);
  const [erro, setErro] = useState("");
  const [area, setArea] = useState<EventoRegistro["area"] | "">("");
  const [pessoa, setPessoa] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [atualizado, setAtualizado] = useState("");

  useEffect(() => {
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => setAdmin(podeVerFinanceiro(data.user?.email)));
  }, []);

  useEffect(() => {
    if (!admin) return;
    let ativo = true;
    function carregar() {
      buscarRegistro(dias)
        .then((d) => {
          if (!ativo) return;
          setDados(d);
          setErro("");
          setAtualizado(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
        })
        .catch((e: Error) => ativo && setErro(e.message));
    }
    carregar();
    const id = setInterval(carregar, RECARREGAR_A_CADA_MS);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [admin, dias, recarga]);

  const eventos = useMemo(
    () => (dados?.eventos ?? []).filter((e) => (!area || e.area === area) && (!pessoa || e.usuario === pessoa)),
    [dados, area, pessoa],
  );
  const porDia = useMemo(() => {
    const m = new Map<string, EventoRegistro[]>();
    for (const e of eventos) {
      const k = new Date(e.em).toDateString();
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.values()];
  }, [eventos]);
  const areaSel = dados?.areas.find((a) => a.area === area);

  return (
    <AppShell titulo="Registro" subtitulo="Tudo o que cada um está apontando, por área">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 py-4 sm:px-6">
        {admin === false && <p className="rounded-lg bg-red-50 p-4 text-red-700">Só o administrador (flpmac14) abre esta tela.</p>}
        {admin && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {[
                [1, "Hoje"],
                [7, "7 dias"],
                [30, "30 dias"],
              ].map(([n, r]) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDias(Number(n))}
                  className={`rounded-full border-2 px-4 py-1.5 text-sm font-bold ${
                    dias === n
                      ? "border-green-600 bg-green-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                      : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
                  }`}
                >
                  {r}
                </button>
              ))}
              <span className="ml-auto text-xs text-stone-500 dark:text-slate-400">
                atualiza a cada 2 min{atualizado ? ` · última às ${atualizado}` : ""}
              </span>
              <button
                type="button"
                onClick={() => setRecarga((r) => r + 1)}
                className="rounded-full border-2 border-stone-300 px-3 py-1 text-sm font-semibold text-stone-700 dark:border-slate-600 dark:text-slate-300"
              >
                ↻ Atualizar
              </button>
            </div>
            {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
            {!dados && !erro && <p className="py-10 text-center text-stone-500">Carregando… (o servidor pode levar até 1 minuto para acordar)</p>}

            {dados && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                {dados.areas.map((a) => (
                  <button
                    key={a.area}
                    type="button"
                    onClick={() => {
                      setArea(area === a.area ? "" : a.area);
                      setPessoa("");
                    }}
                    className={`flex flex-col gap-1 rounded-xl border-2 border-l-8 bg-white p-3 text-left dark:bg-slate-900/60 ${AREA[a.area].cor} ${
                      area === a.area ? "ring-2 ring-green-600 dark:ring-cyan-500" : area ? "opacity-60" : ""
                    }`}
                  >
                    <span className="text-sm font-extrabold text-stone-900 dark:text-white">
                      {AREA[a.area].icone} {a.nome}
                    </span>
                    <span className="font-mono text-3xl font-extrabold text-stone-900 dark:text-white">{a.total}</span>
                    <span className="text-[11px] text-stone-500 dark:text-slate-400">
                      apontamento(s) · <strong className="text-green-700 dark:text-green-400">{a.concluidos} concluído(s)</strong>
                    </span>
                    <span className="mt-1 flex flex-col gap-0.5">
                      {a.pessoas.length === 0 && <span className="text-xs text-stone-400">ninguém apontou</span>}
                      {a.pessoas.slice(0, 5).map((p) => (
                        <span key={p.usuario} className="flex items-baseline justify-between gap-2 text-xs">
                          <span className="truncate font-semibold text-stone-700 dark:text-slate-300">{p.usuario}</span>
                          <span className="font-mono text-stone-500 dark:text-slate-400">
                            {p.total}
                            {p.fim ? ` · ✔${p.fim}` : ""}
                          </span>
                        </span>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {areaSel && areaSel.pessoas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <span className="self-center text-xs font-semibold text-stone-500">{areaSel.nome}:</span>
                {["", ...areaSel.pessoas.map((p) => p.usuario)].map((p) => (
                  <button
                    key={p || "todos"}
                    type="button"
                    onClick={() => setPessoa(p)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      pessoa === p ? "border-transparent bg-stone-800 text-white dark:bg-white dark:text-slate-900" : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {p || "Todos"}
                  </button>
                ))}
              </div>
            )}

            {dados && (
              <div className="flex flex-col gap-4">
                <p className="text-sm font-semibold text-stone-700 dark:text-slate-300">
                  {eventos.length} apontamento(s){area ? ` em ${areaSel?.nome}` : ""}
                  {pessoa ? ` de ${pessoa}` : ""}
                  {dados.eventos.length >= 3000 ? " (mostrando os 3.000 mais recentes)" : ""}
                </p>
                {porDia.map((lista) => (
                  <section key={lista[0].em} className="flex flex-col gap-1">
                    <h3 className="sticky top-0 z-[1] bg-stone-50 py-1 text-xs font-bold uppercase tracking-wide text-stone-500 dark:bg-slate-950 dark:text-slate-400">
                      {dia(lista[0].em)} · {lista.length}
                    </h3>
                    {lista.slice(0, 400).map((e, n) => (
                      <div
                        key={`${e.em}-${n}`}
                        className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900/50"
                      >
                        <span className="w-12 shrink-0 font-mono text-xs text-stone-500 dark:text-slate-400">{hora(e.em)}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${AREA[e.area].selo}`}>
                          {AREA[e.area].icone} {dados.areas.find((a) => a.area === e.area)?.nome}
                        </span>
                        <span className="font-bold text-stone-900 dark:text-white">{e.usuario}</span>
                        <span className={`font-semibold ${TIPO[e.tipo]}`}>{e.acao}</span>
                        <span className="font-mono text-xs text-stone-700 dark:text-slate-300">{e.alvo}</span>
                        {e.detalhe && <span className="w-full pl-[3.75rem] text-xs text-stone-500 dark:text-slate-400">{e.detalhe}</span>}
                      </div>
                    ))}
                    {lista.length > 400 && (
                      <p className="text-xs text-stone-500">… e mais {lista.length - 400} neste dia — filtre por área ou pessoa.</p>
                    )}
                  </section>
                ))}
                {eventos.length === 0 && <p className="py-8 text-center text-stone-500">Nenhum apontamento nesse período.</p>}
              </div>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
