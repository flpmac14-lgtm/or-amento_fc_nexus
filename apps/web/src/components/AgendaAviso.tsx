"use client";

// Aviso da Agenda (pedido do usuário, 19/11/2026): no dia do lembrete (e a
// partir da hora, se tiver) aparece um cartão no canto da tela em qualquer
// página do app, e também a notificação do navegador se ela estiver ativada.
// "OK" marca como visto (não avisa mais); "Depois" esconde até recarregar.
// Lê /api/agenda?pendentes=1 no máximo a cada 5 min (egress do Supabase).

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ROTA_AGENDA, dataBr, hojeIso, horaCurta, jaVenceu, type Lembrete } from "@/lib/agenda";

const EVENTO = "fcnexus-agenda-mudou";
const INTERVALO = 5 * 60 * 1000;

// Cache do módulo: sobrevive à troca de página (cada página monta o AppShell de novo).
let cache: { em: number; dia: string; lembretes: Lembrete[] } | null = null;
const adiados = new Set<string>();
const notificados = new Set<string>();

function tirarDoCache(id: string) {
  if (cache) cache = { ...cache, lembretes: cache.lembretes.filter((l) => l.id !== id) };
}

export function avisarAgendaMudou() {
  cache = null;
  window.dispatchEvent(new Event(EVENTO));
}

async function buscar(forcar = false): Promise<Lembrete[]> {
  const dia = hojeIso();
  if (!forcar && cache && cache.dia === dia && Date.now() - cache.em < INTERVALO) return cache.lembretes;
  const r = await fetch(`/api/agenda?pendentes=1&ate=${dia}`, { cache: "no-store" });
  if (!r.ok) return cache?.lembretes ?? [];
  const j = (await r.json()) as { lembretes: Lembrete[] };
  cache = { em: Date.now(), dia, lembretes: j.lembretes };
  return j.lembretes;
}

function notificarNavegador(l: Lembrete) {
  if (notificados.has(l.id)) return;
  notificados.add(l.id);
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted")
      new Notification("FC Nexus · Agenda", { body: `${l.hora ? `${horaCurta(l.hora)} · ` : ""}${l.texto}`, tag: `agenda-${l.id}` });
  } catch {
    // navegador sem suporte: fica só o cartão
  }
}

export default function AgendaAviso() {
  const [pendentes, setPendentes] = useState<Lembrete[]>([]);
  const [agora, setAgora] = useState(() => Date.now());

  const atualizar = useCallback(async (forcar = false) => {
    try {
      setPendentes(await buscar(forcar));
      setAgora(Date.now());
    } catch {
      // sem rede: tenta no próximo ciclo
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    buscar().then(
      (l) => vivo && setPendentes(l),
      () => null,
    );
    const t = setInterval(() => atualizar(), INTERVALO);
    // Relógio de 30 s: libera os de hora marcada sem chamar a API.
    const r = setInterval(() => setAgora(Date.now()), 30_000);
    const mudou = () => atualizar(true);
    window.addEventListener(EVENTO, mudou);
    return () => {
      vivo = false;
      clearInterval(t);
      clearInterval(r);
      window.removeEventListener(EVENTO, mudou);
    };
  }, [atualizar]);

  const visiveis = pendentes.filter((l) => !adiados.has(l.id) && jaVenceu(l, new Date(agora)));

  useEffect(() => {
    for (const l of visiveis) notificarNavegador(l);
  }, [visiveis]);

  async function ok(id: string) {
    setPendentes((p) => p.filter((l) => l.id !== id));
    tirarDoCache(id);
    await fetch("/api/agenda", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, visto: true }),
    }).catch(() => null);
  }

  function depois(id: string) {
    adiados.add(id);
    setAgora(Date.now());
  }

  if (!visiveis.length) return null;
  const hoje = hojeIso();
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 print:hidden">
      {visiveis.slice(0, 4).map((l) => (
        <div
          key={l.id}
          role="alert"
          className="rounded-xl border-l-4 border-amber-500 bg-white p-3 shadow-xl ring-1 ring-stone-200 dark:bg-slate-900 dark:ring-slate-700"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            🔔 Lembrete · {l.data === hoje ? "hoje" : dataBr(l.data)}
            {l.hora ? ` · ${horaCurta(l.hora)}` : ""}
          </p>
          <p className="mt-1 break-words text-sm font-medium text-stone-900 dark:text-white">{l.texto}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => ok(l.id)}
              className="rounded-lg bg-green-600 px-3 py-1 text-xs font-bold text-white hover:bg-green-500 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => depois(l.id)}
              className="rounded-lg border border-stone-300 px-3 py-1 text-xs text-stone-600 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Depois
            </button>
            <Link href={ROTA_AGENDA} className="ml-auto text-xs text-stone-500 hover:underline dark:text-slate-400">
              Abrir agenda
            </Link>
          </div>
        </div>
      ))}
      {visiveis.length > 4 && (
        <Link href={ROTA_AGENDA} className="self-end rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-white">
          +{visiveis.length - 4} lembrete(s)
        </Link>
      )}
    </div>
  );
}
