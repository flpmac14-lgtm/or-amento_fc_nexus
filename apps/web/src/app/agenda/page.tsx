"use client";

// Agenda pessoal (pedido do usuário, 19/11/2026): calendário do mês; clica no
// dia, escreve um lembrete curto (hora opcional) e no dia o app avisa em
// qualquer tela (components/AgendaAviso.tsx). Só o flpmac14 (lib/agenda.ts).

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell, { classeBotaoCabecalho } from "@/components/AppShell";
import { avisarAgendaMudou } from "@/components/AgendaAviso";
import { dataBr, hojeIso, horaCurta, podeVerAgenda, type Lembrete } from "@/lib/agenda";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

async function chamar<T>(metodo: string, corpo?: unknown, query = ""): Promise<T> {
  const r = await fetch(`/api/agenda${query}`, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
  return j as T;
}

export default function PaginaAgenda() {
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const hoje = hojeIso();
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [dia, setDia] = useState<string>(hoje);
  const [texto, setTexto] = useState("");
  const [hora, setHora] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [permissaoAviso, setPermissaoAviso] = useState<string>("granted");

  useEffect(() => {
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => {
        setPermitido(podeVerAgenda(data.user?.email));
        setPermissaoAviso(typeof Notification === "undefined" ? "indisponivel" : Notification.permission);
      });
  }, []);

  async function ativarAvisoNavegador() {
    try {
      setPermissaoAviso(await Notification.requestPermission());
    } catch {
      setPermissaoAviso("denied");
    }
  }

  // Grade do mês: começa no domingo da semana do dia 1 e fecha em semanas inteiras.
  const grade = useMemo(() => {
    const primeiro = new Date(mes.ano, mes.mes, 1);
    const inicio = new Date(mes.ano, mes.mes, 1 - primeiro.getDay());
    const ultimo = new Date(mes.ano, mes.mes + 1, 0);
    const total = Math.ceil((primeiro.getDay() + ultimo.getDate()) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
      return { iso: hojeIso(d), numero: d.getDate(), doMes: d.getMonth() === mes.mes };
    });
  }, [mes]);

  const buscarMes = useCallback(
    () =>
      chamar<{ lembretes: Lembrete[] }>("GET", undefined, `?de=${grade[0].iso}&ate=${grade[grade.length - 1].iso}`).then(
        (j) => j.lembretes,
      ),
    [grade],
  );

  const carregar = useCallback(async () => {
    try {
      setLembretes(await buscarMes());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [buscarMes]);

  useEffect(() => {
    if (!permitido) return;
    let vivo = true;
    buscarMes().then(
      (l) => vivo && setLembretes(l),
      (e) => vivo && setErro((e as Error).message),
    );
    return () => {
      vivo = false;
    };
  }, [permitido, buscarMes]);

  const porDia = useMemo(() => {
    const m = new Map<string, Lembrete[]>();
    for (const l of lembretes) m.set(l.data, [...(m.get(l.data) ?? []), l]);
    return m;
  }, [lembretes]);

  function mudarMes(delta: number) {
    setMes((m) => {
      const d = new Date(m.ano, m.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  }

  function irHoje() {
    const d = new Date();
    setMes({ ano: d.getFullYear(), mes: d.getMonth() });
    escolherDia(hojeIso(d));
  }

  function escolherDia(iso: string) {
    setDia(iso);
    limpar();
    const [a, m] = iso.split("-").map(Number);
    if (a !== mes.ano || m - 1 !== mes.mes) setMes({ ano: a, mes: m - 1 });
  }

  function limpar() {
    setTexto("");
    setHora("");
    setEditando(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    try {
      if (editando) await chamar("PATCH", { id: editando, texto, hora: hora || null, data: dia });
      else await chamar("POST", { data: dia, hora: hora || null, texto });
      limpar();
      await carregar();
      avisarAgendaMudou();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    try {
      await chamar("DELETE", undefined, `?id=${id}`);
      if (editando === id) limpar();
      await carregar();
      avisarAgendaMudou();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function alternarFeito(l: Lembrete) {
    try {
      await chamar("PATCH", { id: l.id, visto: !l.visto_em });
      await carregar();
      avisarAgendaMudou();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (permitido === false) {
    return (
      <AppShell titulo="Agenda">
        <p className="p-6 text-sm text-stone-600 dark:text-slate-400">Acesso restrito.</p>
      </AppShell>
    );
  }

  const doDia = porDia.get(dia) ?? [];
  const campo =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/20";

  return (
    <AppShell
      titulo="Agenda"
      subtitulo="Clique no dia e anote — o app avisa no dia"
      acoes={
        <>
          {permissaoAviso === "default" && (
            <button
              type="button"
              onClick={ativarAvisoNavegador}
              className={classeBotaoCabecalho}
              title="Também mostra o lembrete como notificação do Windows/celular enquanto o app estiver aberto"
            >
              🔔<span className="hidden sm:inline"> Ativar notificação</span>
            </button>
          )}
          <button type="button" onClick={irHoje} className={classeBotaoCabecalho}>
            Hoje
          </button>
        </>
      }
    >
      <div className="grid gap-4 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Calendário */}
        <section className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => mudarMes(-1)} className={classeBotaoCabecalho} aria-label="Mês anterior">
              ◀
            </button>
            <h2 className="text-base font-semibold text-stone-900 dark:text-white sm:text-lg">
              {MESES[mes.mes]} {mes.ano}
            </h2>
            <button type="button" onClick={() => mudarMes(1)} className={classeBotaoCabecalho} aria-label="Próximo mês">
              ▶
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grade.map((c) => {
              const itens = porDia.get(c.iso) ?? [];
              const abertos = itens.filter((l) => !l.visto_em).length;
              const selecionado = c.iso === dia;
              const ehHoje = c.iso === hoje;
              return (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => escolherDia(c.iso)}
                  className={`flex min-h-16 flex-col items-stretch rounded-lg border p-1 text-left transition-colors sm:min-h-24 sm:p-1.5 ${
                    selecionado
                      ? "border-green-600 bg-green-50 ring-2 ring-green-600/30 dark:border-cyan-400 dark:bg-cyan-500/10 dark:ring-cyan-400/30"
                      : "border-stone-200 hover:border-green-600/50 hover:bg-stone-50 dark:border-slate-800 dark:hover:border-cyan-500/50 dark:hover:bg-slate-800"
                  } ${c.doMes ? "" : "opacity-40"}`}
                >
                  <span
                    className={`flex h-6 w-6 items-center justify-center self-start rounded-full text-xs font-semibold ${
                      ehHoje ? "bg-amber-500 text-white" : "text-stone-700 dark:text-slate-200"
                    }`}
                  >
                    {c.numero}
                  </span>
                  {/* Celular: só a bolinha com a quantidade; PC: o começo dos lembretes. */}
                  {itens.length > 0 && (
                    <span className="mt-auto flex justify-end sm:hidden">
                      <span className={`h-2 w-2 rounded-full ${abertos ? "bg-red-500" : "bg-emerald-500"}`} />
                    </span>
                  )}
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {itens.slice(0, 3).map((l) => (
                      <span
                        key={l.id}
                        className={`truncate rounded px-1 text-[11px] leading-4 ${
                          l.visto_em
                            ? "bg-stone-100 text-stone-400 line-through dark:bg-slate-800 dark:text-slate-500"
                            : "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"
                        }`}
                      >
                        {l.hora ? `${horaCurta(l.hora)} ` : ""}
                        {l.texto}
                      </span>
                    ))}
                    {itens.length > 3 && <span className="text-[10px] text-stone-500 dark:text-slate-400">+{itens.length - 3}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Dia escolhido */}
        <section className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="text-sm font-semibold text-stone-900 dark:text-white">
            {dia === hoje ? "Hoje · " : ""}
            {dataBr(dia)}
          </h3>
          <form onSubmit={salvar} className="flex flex-col gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={500}
              placeholder="Ex.: Ligar pro fornecedor da chapa"
              className={campo}
              autoFocus
            />
            <div className="flex gap-2">
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className={`${campo} w-32`}
                title="Hora do aviso (opcional)"
              />
              <button
                type="submit"
                disabled={!texto.trim() || salvando}
                className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
              >
                {editando ? "Salvar" : "＋ Lembrar"}
              </button>
              {editando && (
                <button type="button" onClick={limpar} className={classeBotaoCabecalho}>
                  Cancelar
                </button>
              )}
            </div>
            <p className="text-[11px] text-stone-500 dark:text-slate-400">Sem hora: avisa assim que abrir o app no dia.</p>
          </form>

          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}

          {doDia.length === 0 ? (
            <p className="text-sm text-stone-500 dark:text-slate-400">Nada anotado neste dia.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {doDia.map((l) => (
                <li
                  key={l.id}
                  className="flex items-start gap-2 rounded-lg border border-stone-200 px-2.5 py-2 dark:border-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={!!l.visto_em}
                    onChange={() => alternarFeito(l)}
                    className="mt-1 h-4 w-4 accent-green-600"
                    title={l.visto_em ? "Feito — desmarque pra avisar de novo" : "Marcar como feito (não avisa mais)"}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`break-words text-sm ${l.visto_em ? "text-stone-400 line-through" : "text-stone-800 dark:text-slate-100"}`}>
                      {l.texto}
                    </p>
                    {l.hora && <p className="text-xs text-stone-500 dark:text-slate-400">⏰ {horaCurta(l.hora)}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditando(l.id);
                      setTexto(l.texto);
                      setHora(horaCurta(l.hora));
                    }}
                    className="text-sm text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-white"
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => excluir(l.id)}
                    className="text-sm text-stone-500 hover:text-red-600 dark:text-slate-400"
                    title="Excluir"
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
