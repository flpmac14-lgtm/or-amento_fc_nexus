"use client";

// Aba "Funcionários" — pedido do usuário (26/10/2026): só os nomes da planilha
// CONTROLE ACORDO SABADOS TRABALHADOS (tabela funcionarios, migration 0059) e a
// Solicitação de hora extra: ele (flpmac14), o Jeferson e o Diego escolhem os
// nomes, os dias e de que hora até que hora; gera o relatório em PDF
// (/follow-up/hora-extra?n=). Dados: /api/follow-up/hora-extra.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatarDataBr } from "@/lib/format";
import { normalizarBusca } from "@/lib/followUp";
import {
  diaDaSemana,
  diaValido,
  formatarHoras,
  minutosDaSolicitacao,
  minutosDoDia,
  type DiaHoraExtra,
  type SolicitacaoHoraExtra,
} from "@/lib/horaExtra";

const API = "/api/follow-up/hora-extra";

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Padrão: o próximo sábado, 7:00–15:00 (como no acordo dos sábados).
function proximoSabado(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
  return isoLocal(d);
}

function diaSeguinte(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  return isoLocal(new Date(a, m - 1, d + 1));
}

const classeCampo =
  "rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm text-stone-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100";

export default function FuncionariosHoraExtra() {
  const router = useRouter();
  const [nomes, setNomes] = useState<string[] | null>(null);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoHoraExtra[]>([]);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [dias, setDias] = useState<DiaHoraExtra[]>(() => [{ data: proximoSabado(), inicio: "07:00", fim: "15:00" }]);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [excluir, setExcluir] = useState<number | null>(null);

  function carregar() {
    fetch(API, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
        setNomes(j.funcionarios);
        setSolicitacoes(j.solicitacoes);
      })
      .catch((e: Error) => setErro(e.message));
  }
  useEffect(carregar, []);

  const filtrados = useMemo(() => {
    const alvo = normalizarBusca(busca);
    return (nomes ?? []).filter((n) => !alvo || normalizarBusca(n).includes(alvo));
  }, [nomes, busca]);

  function alternar(nome: string) {
    setEscolhidos((s) => {
      const novo = new Set(s);
      if (novo.has(nome)) novo.delete(nome);
      else novo.add(nome);
      return novo;
    });
  }

  function mudarDia(n: number, campo: keyof DiaHoraExtra, valor: string) {
    setDias((ds) => ds.map((d, i) => (i === n ? { ...d, [campo]: valor } : d)));
  }

  function adicionarDia() {
    setDias((ds) => {
      const ultimo = ds[ds.length - 1];
      return [...ds, ultimo ? { ...ultimo, data: diaSeguinte(ultimo.data) } : { data: proximoSabado(), inicio: "07:00", fim: "15:00" }];
    });
  }

  const diasOk = dias.length > 0 && dias.every(diaValido);
  const minutos = diasOk ? minutosDaSolicitacao(dias) : 0;
  const pode = escolhidos.size > 0 && diasOk && !enviando;

  async function gerar() {
    setEnviando(true);
    setAviso("");
    // Abre a aba já no clique (depois do await o navegador bloqueia a janela nova).
    const janela = window.open("", "_blank");
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funcionarios: [...escolhidos], dias, motivo }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
      const url = `/follow-up/hora-extra?n=${j.numero}`;
      if (janela) janela.location.href = url;
      else router.push(url);
      setAviso(`Solicitação nº ${j.numero} gerada.`);
      setEscolhidos(new Set());
      setMotivo("");
      carregar();
    } catch (e) {
      janela?.close();
      setAviso((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  async function apagar(n: number) {
    const r = await fetch(`${API}?n=${n}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    setExcluir(null);
    if (!r.ok) setAviso(j.erro ?? `Erro ${r.status}`);
    carregar();
  }

  if (erro) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>;
  if (!nomes) return <p className="p-4 text-sm text-stone-500 dark:text-slate-400">Carregando funcionários…</p>;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-base font-bold text-stone-900 dark:text-slate-100">Solicitação de hora extra</h2>
        <p className="text-xs text-stone-500 dark:text-slate-400">Escolha os funcionários, os dias e o horário. Gera o relatório em PDF pra imprimir e assinar.</p>

        {/* 1. Funcionários */}
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200">
              1. Funcionários <span className="font-normal text-stone-500 dark:text-slate-400">({escolhidos.size} de {nomes.length})</span>
            </h3>
            <button
              type="button"
              onClick={() => setEscolhidos((s) => new Set([...s, ...filtrados]))}
              className="rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Marcar {busca ? "os filtrados" : "todos"}
            </button>
            {escolhidos.size > 0 && (
              <button
                type="button"
                onClick={() => setEscolhidos(new Set())}
                className="rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Limpar
              </button>
            )}
          </div>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar nome…"
            className={`${classeCampo} mt-2 w-full sm:max-w-sm`}
          />
          <div className="mt-2 grid max-h-[22rem] grid-cols-1 gap-1 overflow-y-auto rounded-lg border border-stone-200 p-1 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-700">
            {filtrados.map((n) => {
              const marcado = escolhidos.has(n);
              return (
                <label
                  key={n}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm ${
                    marcado
                      ? "bg-blue-50 font-semibold text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                      : "text-stone-800 hover:bg-stone-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <input type="checkbox" checked={marcado} onChange={() => alternar(n)} className="h-4 w-4 shrink-0 accent-blue-600" />
                  <span className="truncate">{n}</span>
                </label>
              );
            })}
            {!filtrados.length && <p className="p-2 text-sm text-stone-500 dark:text-slate-400">Nenhum nome com “{busca}”.</p>}
          </div>
        </div>

        {/* 2. Dias e horário */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200">2. Dias e horário</h3>
          <div className="mt-2 flex flex-col gap-2">
            {dias.map((d, n) => {
              const ok = diaValido(d);
              return (
                <div key={n} className="flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 p-2 dark:border-slate-700">
                  <input type="date" value={d.data} onChange={(e) => mudarDia(n, "data", e.target.value)} className={classeCampo} aria-label="Dia" />
                  <span className="w-16 text-xs text-stone-500 dark:text-slate-400">{d.data ? diaDaSemana(d.data) : ""}</span>
                  <label className="flex items-center gap-1 text-xs text-stone-600 dark:text-slate-300">
                    das
                    <input type="time" value={d.inicio} onChange={(e) => mudarDia(n, "inicio", e.target.value)} className={classeCampo} />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-stone-600 dark:text-slate-300">
                    até
                    <input type="time" value={d.fim} onChange={(e) => mudarDia(n, "fim", e.target.value)} className={classeCampo} />
                  </label>
                  <span className={`text-sm font-bold ${ok ? "text-blue-800 dark:text-sky-300" : "text-red-600"}`}>
                    {ok ? formatarHoras(minutosDoDia(d)) : "horário inválido"}
                  </span>
                  {dias.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDias((ds) => ds.filter((_, i) => i !== n))}
                      className="ml-auto rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      Remover
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={adicionarDia}
            className="mt-2 rounded-lg border border-dashed border-stone-400 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            + Adicionar dia
          </button>
          <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">O almoço (12:00–13:00) não conta nas horas.</p>
        </div>

        {/* 3. Motivo */}
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-stone-800 dark:text-slate-200">3. Motivo (opcional)</h3>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="ex.: entrega da obra 723 (Meta 6P)"
            className={`${classeCampo} mt-2 w-full`}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-stone-200 pt-3 dark:border-slate-700">
          <p className="text-sm text-stone-700 dark:text-slate-300">
            <strong>{escolhidos.size}</strong> funcionário(s) · <strong>{dias.length}</strong> dia(s) ·{" "}
            <strong>{formatarHoras(minutos)}</strong> por pessoa
            {escolhidos.size > 1 && (
              <>
                {" "}
                · <strong>{formatarHoras(minutos * escolhidos.size)}</strong> no total
              </>
            )}
          </p>
          <button
            type="button"
            onClick={gerar}
            disabled={!pode}
            className="w-full rounded-lg bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-600 disabled:opacity-50 sm:ml-auto sm:w-auto"
          >
            {enviando ? "Gerando…" : "Gerar solicitação (PDF)"}
          </button>
          {aviso && <p className="w-full text-sm font-medium text-stone-700 dark:text-slate-200">{aviso}</p>}
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm sm:p-4 dark:border-slate-700 dark:bg-slate-800">
        <h2 className="text-base font-bold text-stone-900 dark:text-slate-100">Solicitações feitas</h2>
        {!solicitacoes.length ? (
          <p className="mt-2 text-sm text-stone-500 dark:text-slate-400">Nenhuma ainda.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-stone-100 dark:divide-slate-700">
            {solicitacoes.map((s) => (
              <li key={s.numero} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-mono font-bold text-stone-900 dark:text-slate-100">Nº {s.numero}</span>
                <span className="text-stone-700 dark:text-slate-300">
                  {s.dias.map((d) => `${formatarDataBr(d.data).slice(0, 5)} ${d.inicio}–${d.fim}`).join(" · ")}
                </span>
                <span className="text-stone-500 dark:text-slate-400">
                  {s.funcionarios.length} funcionário(s) · {formatarHoras(minutosDaSolicitacao(s.dias))}/pessoa · por {s.solicitante.split(" ")[0]}
                </span>
                <span className="ml-auto flex gap-2">
                  <a
                    href={`/follow-up/hora-extra?n=${s.numero}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md bg-blue-700 px-3 py-1 text-xs font-bold text-white hover:bg-blue-600"
                  >
                    PDF
                  </a>
                  {excluir === s.numero ? (
                    <>
                      <button type="button" onClick={() => apagar(s.numero)} className="rounded-md bg-red-600 px-3 py-1 text-xs font-bold text-white">
                        Confirmar exclusão
                      </button>
                      <button type="button" onClick={() => setExcluir(null)} className="rounded-md px-2 py-1 text-xs text-stone-600 dark:text-slate-300">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExcluir(s.numero)}
                      className="rounded-md border border-stone-300 px-3 py-1 text-xs text-stone-700 hover:bg-stone-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Excluir
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
