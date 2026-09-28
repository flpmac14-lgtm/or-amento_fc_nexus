"use client";

// Registro diário do item — pedido explícito do usuário: dentro do card do
// item, ir anotando o que aconteceu no dia (padrão: hoje) e ver o histórico
// do pedido. Só aparece no card e no relatório do item.

import { useEffect, useState } from "react";
import { adicionarRegistroFollowUp, listarRegistrosFollowUp, removerRegistroFollowUp } from "@/lib/api";
import { formatarDataBr } from "@/lib/format";
import type { RegistroFollowUp } from "@/lib/types";

// Data AAAA-MM-DD no fuso do computador (não UTC: registro às 22h é "hoje").
export function hojeLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function rotuloDia(iso: string, hoje: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const semana = new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long" });
  const [ah, mh, dh] = hoje.split("-").map(Number);
  const dias = Math.round((Date.UTC(ah, mh - 1, dh) - Date.UTC(a, m - 1, d)) / 86_400_000);
  const relativo = dias === 0 ? "Hoje" : dias === 1 ? "Ontem" : null;
  return `${relativo ? `${relativo} · ` : ""}${formatarDataBr(iso)} · ${semana}`;
}

export default function FollowUpRegistros({ itemId, autor }: { itemId: string; autor: string | null }) {
  const [registros, setRegistros] = useState<RegistroFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [hoje] = useState(() => hojeLocal());
  const [data, setData] = useState(hoje);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    listarRegistrosFollowUp(itemId)
      .then((r) => ativo && setRegistros(r))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [itemId]);

  async function registrar() {
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    setErro("");
    try {
      const novo = await adicionarRegistroFollowUp(itemId, texto, data, autor);
      setRegistros((r) =>
        [novo, ...(r ?? [])].sort((a, b) => (a.data === b.data ? b.created_at.localeCompare(a.created_at) : b.data.localeCompare(a.data))),
      );
      setTexto("");
      setData(hoje);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(id: string) {
    setErro("");
    try {
      await removerRegistroFollowUp(id);
      setRegistros((r) => (r ?? []).filter((x) => x.id !== id));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setConfirmarApagar(null);
    }
  }

  // Agrupa por dia (já vem do mais recente pro mais antigo).
  const dias: { data: string; itens: RegistroFollowUp[] }[] = [];
  for (const r of registros ?? []) {
    const ultimo = dias[dias.length - 1];
    if (ultimo?.data === r.data) ultimo.itens.push(r);
    else dias.push({ data: r.data, itens: [r] });
  }

  return (
    <section className="rounded-lg border border-green-600/40 dark:border-cyan-500/40 bg-white dark:bg-slate-900/40 p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-green-700 dark:text-cyan-400">
        Registro diário {registros && registros.length > 0 && <span className="font-normal">({registros.length})</span>}
      </h3>

      <div className="flex flex-col gap-2">
        <textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void registrar();
          }}
          placeholder="O que aconteceu hoje com este pedido?"
          className="w-full rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-stone-500 dark:text-slate-400">
            Dia
            <input
              type="date"
              value={data}
              max={hoje}
              onChange={(e) => setData(e.target.value || hoje)}
              className="rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs text-stone-900 dark:text-slate-100"
            />
            {data !== hoje && <span className="text-amber-600 dark:text-amber-400">(registro retroativo)</span>}
          </label>
          <button
            type="button"
            onClick={registrar}
            disabled={!texto.trim() || salvando}
            title="Ctrl + Enter"
            className="rounded-lg bg-green-600 dark:bg-cyan-500 px-4 py-1.5 text-sm font-bold text-white dark:text-slate-950 hover:bg-green-500 dark:hover:bg-cyan-400 disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Registrar"}
          </button>
        </div>
      </div>

      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}

      <div className="mt-3 flex max-h-80 flex-col gap-3 overflow-y-auto">
        {registros === null && !erro && <p className="text-xs text-stone-500 dark:text-slate-500">Carregando histórico…</p>}
        {registros?.length === 0 && (
          <p className="text-xs text-stone-500 dark:text-slate-500">Nenhum registro ainda — o histórico deste pedido começa aqui.</p>
        )}
        {dias.map((dia) => (
          <div key={dia.data}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
              {rotuloDia(dia.data, hoje)}
            </p>
            <ul className="flex flex-col gap-1.5 border-l-2 border-green-600/30 dark:border-cyan-500/30 pl-3">
              {dia.itens.map((r) => (
                <li key={r.id} className="group text-sm">
                  <p className="whitespace-pre-wrap break-words text-stone-900 dark:text-slate-100">{r.texto}</p>
                  <p className="flex flex-wrap items-center gap-2 text-[11px] text-stone-400 dark:text-slate-500">
                    {r.autor ?? "—"} · {new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {r.data !== hojeLocal(new Date(r.created_at)) &&
                      ` (registrado em ${new Date(r.created_at).toLocaleDateString("pt-BR")})`}
                    {confirmarApagar === r.id ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-red-600 dark:text-red-400">Apagar este registro?</span>
                        <button type="button" onClick={() => apagar(r.id)} className="font-semibold text-red-600 underline dark:text-red-400">
                          Sim
                        </button>
                        <button type="button" onClick={() => setConfirmarApagar(null)} className="underline">
                          Não
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmarApagar(r.id)}
                        className="opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      >
                        apagar
                      </button>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
