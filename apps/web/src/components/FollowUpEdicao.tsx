"use client";

// Edição dos campos de acompanhamento do Follow up — pedido explícito do
// usuário: "conforme for colocando quero salvar". Cada campo salva sozinho
// (ao sair do campo / Enter, e no painel de detalhes também depois de uma
// pausa na digitação), sem botão "Salvar".

import { useEffect, useRef, useState } from "react";
import type { TipoEdicao } from "@/lib/followUp";

type Estado = "ocioso" | "salvando" | "salvo" | "erro";

const PAUSA_DIGITACAO_MS = 900;

function Indicador({ estado, erro }: { estado: Estado; erro: string }) {
  if (estado === "salvando") return <span className="text-[10px] text-stone-400 dark:text-slate-500">salvando…</span>;
  if (estado === "salvo") return <span className="text-[10px] text-green-600 dark:text-cyan-400">✓ salvo</span>;
  if (estado === "erro")
    return (
      <span className="text-[10px] text-red-600 dark:text-red-400" title={erro}>
        ✕ {erro}
      </span>
    );
  return null;
}

function useSalvamento(valorSalvo: string, salvar: (valor: string) => Promise<void>) {
  const [estado, setEstado] = useState<Estado>("ocioso");
  const [erro, setErro] = useState("");
  const ultimoEnviado = useRef(valorSalvo);

  async function enviar(valor: string) {
    if (valor.trim() === ultimoEnviado.current.trim()) return;
    ultimoEnviado.current = valor;
    setEstado("salvando");
    setErro("");
    try {
      await salvar(valor);
      setEstado("salvo");
    } catch (e) {
      setEstado("erro");
      setErro((e as Error).message);
      ultimoEnviado.current = valorSalvo; // deixa tentar de novo
    }
  }
  return { estado, erro, enviar, ultimoEnviado };
}

const classeInput =
  "w-full rounded border border-green-600 dark:border-cyan-500 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs text-stone-900 dark:text-slate-100 outline-none";

// Célula da tabela: mostra o valor; clique para editar; Enter/sair salva, Esc cancela.
// aoDuploClique (ex.: nº do programa com PDF): 2 cliques chamam isso e 1 clique
// só edita depois de um instante (pra dar tempo do 2º clique).
export function CelulaEditavel({
  valor,
  tipo,
  exibicao,
  salvar,
  aoDuploClique,
}: {
  valor: string;
  tipo: TipoEdicao;
  exibicao: React.ReactNode;
  salvar: (valor: string) => Promise<void>;
  aoDuploClique?: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rascunho, setRascunho] = useState(valor);
  const { estado, erro, enviar } = useSalvamento(valor, salvar);

  function abrir(e: React.MouseEvent) {
    e.stopPropagation(); // não abre o painel de detalhes da linha
    if (aoDuploClique) {
      if (espera.current) clearTimeout(espera.current);
      if (e.detail > 1) return; // 2º clique: quem age é o onDoubleClick
      espera.current = setTimeout(() => {
        espera.current = null;
        setRascunho(valor);
        setEditando(true);
      }, 280);
      return;
    }
    setRascunho(valor);
    setEditando(true);
  }

  function duploClique(e: React.MouseEvent) {
    e.stopPropagation(); // 2 cliques numa célula editável não abrem o card
    if (!aoDuploClique) return;
    if (espera.current) clearTimeout(espera.current);
    espera.current = null;
    aoDuploClique();
  }

  function confirmar() {
    setEditando(false);
    void enviar(rascunho);
  }

  if (editando) {
    return (
      <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type={tipo === "etapa" ? "number" : "text"}
          min={tipo === "etapa" ? 0 : undefined}
          max={tipo === "etapa" ? 100 : undefined}
          step={tipo === "etapa" ? 5 : undefined}
          inputMode={tipo === "etapa" || tipo === "numero" ? "decimal" : undefined}
          placeholder={tipo === "coleta" ? "dd/mm/aaaa ou texto" : tipo === "etapa" ? "0–100" : ""}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmar();
            if (e.key === "Escape") setEditando(false);
          }}
          className={`${classeInput} ${tipo === "etapa" ? "w-16" : "min-w-[8rem]"}`}
        />
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={abrir}
      onDoubleClick={duploClique} // sem aoDuploClique: só não deixa abrir o card
      title={aoDuploClique ? "Duplo clique abre o PDF · 1 clique edita" : "Clique para editar — salva sozinho"}
      className="group relative block w-full min-w-[2.5rem] rounded text-left outline-none ring-green-600/40 hover:ring-1 focus-visible:ring-2 dark:ring-cyan-500/40"
    >
      {exibicao}
      {estado !== "ocioso" && (
        <span className="absolute -bottom-3 left-0 whitespace-nowrap">
          <Indicador estado={estado} erro={erro} />
        </span>
      )}
    </button>
  );
}

// Campo do painel de detalhes: sempre editável; salva ao sair e após uma pausa na digitação.
export function CampoEditavel({
  valor,
  tipo,
  longo = false,
  salvar,
}: {
  valor: string;
  tipo: TipoEdicao;
  longo?: boolean;
  salvar: (valor: string) => Promise<void>;
}) {
  const [rascunho, setRascunho] = useState(valor);
  const { estado, erro, enviar } = useSalvamento(valor, salvar);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function mudar(v: string) {
    setRascunho(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void enviar(v), PAUSA_DIGITACAO_MS);
  }

  function sair() {
    if (timer.current) clearTimeout(timer.current);
    void enviar(rascunho);
  }

  const classe =
    "w-full rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";
  return (
    <div className="flex flex-col gap-0.5">
      {longo ? (
        <textarea rows={2} value={rascunho} onChange={(e) => mudar(e.target.value)} onBlur={sair} className={classe} />
      ) : (
        <input
          type={tipo === "etapa" ? "number" : "text"}
          min={tipo === "etapa" ? 0 : undefined}
          max={tipo === "etapa" ? 100 : undefined}
          step={tipo === "etapa" ? 5 : undefined}
          inputMode={tipo === "etapa" || tipo === "numero" ? "decimal" : undefined}
          placeholder={tipo === "coleta" ? "dd/mm/aaaa ou texto" : tipo === "etapa" ? "0–100" : ""}
          value={rascunho}
          onChange={(e) => mudar(e.target.value)}
          onBlur={sair}
          onKeyDown={(e) => e.key === "Enter" && sair()}
          className={classe}
        />
      )}
      <span className="h-3">
        <Indicador estado={estado} erro={erro} />
      </span>
    </div>
  );
}

// Valor do campo como texto para o input (valores em R$ com vírgula decimal;
// etapa fica com ponto porque o input é type="number").
export function valorParaEdicao(v: string | number | null | undefined, tipo: TipoEdicao): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return tipo === "etapa" ? String(v) : String(v).replace(".", ",");
  return v;
}

export function IconeCadeado() {
  return (
    <svg viewBox="0 0 16 16" className="inline h-3 w-3 opacity-60" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}
