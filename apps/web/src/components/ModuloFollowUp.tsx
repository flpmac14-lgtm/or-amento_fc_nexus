"use client";

// Módulo Follow up = duas visões lado a lado (pedido explícito do usuário:
// "pode ser junto com a do follow up"): o Follow up (filha) e o Controle de
// obras (mãe), sincronizado sozinho a cada 15 min.
// Usado na aba "Follow up" da tela principal e na página /follow-up.
//
// Tela cheia — pedido explícito do usuário: um botão que expande para
// mostrar só os dados (sem cabeçalho do app, sem textos e indicadores) e
// uma seta para voltar ao normal. Também pede tela cheia ao navegador
// (some a barra do navegador); Esc volta.

import { useEffect, useState } from "react";
import ControleObras, { CONFIG_MATERIAL_COMPRA } from "@/components/ControleObras";
import FollowUp from "@/components/FollowUp";
import ReferenciaPrecosMP from "@/components/ReferenciaPrecosMP";

const VISOES = [
  { valor: "followup", rotulo: "Follow up" },
  { valor: "controle", rotulo: "Controle de obras" },
  // Espelho da aba MACLM do MACLM.xlsx — pedido do usuário (mãe de um projeto novo).
  { valor: "material", rotulo: "Material de compra" },
  { valor: "referencia", rotulo: "Referência de preços" },
] as const;

// comReferenciaPrecos: pedido do usuário — a conta restrita (marcelo) também vê
// a aba "Referência de preços" (histórico de compras do ERP), que as contas
// completas já têm na tela principal.
export default function ModuloFollowUp({ comReferenciaPrecos = false }: { comReferenciaPrecos?: boolean }) {
  const [visao, setVisao] = useState<(typeof VISOES)[number]["valor"]>("followup");
  // Material de compra é grande (~57 mil linhas): só carrega na 1ª vez que a aba é aberta.
  const [materialAberto, setMaterialAberto] = useState(false);
  const visoes = VISOES.filter((v) => v.valor !== "referencia" || comReferenciaPrecos);
  const [telaCheia, setTelaCheia] = useState(false);
  // Onde o Follow up desenha os cards de ativos por cliente (só na tela cheia).
  const [alvoCards, setAlvoCards] = useState<HTMLDivElement | null>(null);
  // Onde o Follow up desenha o sininho de notificações (sempre, no canto direito).
  const [alvoSino, setAlvoSino] = useState<HTMLDivElement | null>(null);

  function entrar() {
    setTelaCheia(true);
    document.documentElement.requestFullscreen?.().catch(() => {
      // navegador recusou: fica só o modo "tela cheia" dentro da página
    });
  }

  function sair() {
    setTelaCheia(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }

  // Atalho F2 — pedido explícito do usuário: expande (e, apertando de novo,
  // volta ao normal). Tecla conta como gesto do usuário, então o navegador
  // aceita entrar em tela cheia a partir dela.
  useEffect(() => {
    function f2(e: KeyboardEvent) {
      if (e.key !== "F2" || e.repeat) return;
      e.preventDefault();
      if (telaCheia) {
        setTelaCheia(false);
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      } else {
        setTelaCheia(true);
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    }
    window.addEventListener("keydown", f2);
    return () => window.removeEventListener("keydown", f2);
  }, [telaCheia]);

  useEffect(() => {
    if (!telaCheia) return;
    // Esc do navegador sai do fullscreen dele — acompanha e volta ao normal também.
    function aoMudar() {
      if (!document.fullscreenElement) setTelaCheia(false);
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape" && !document.querySelector("aside, .z-\\[60\\], .z-\\[70\\]")) setTelaCheia(false);
    }
    document.addEventListener("fullscreenchange", aoMudar);
    window.addEventListener("keydown", tecla);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", aoMudar);
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = "";
    };
  }, [telaCheia]);

  return (
    <div
      className={
        telaCheia
          ? "fixed inset-0 z-[55] flex flex-col gap-2 overflow-auto bg-stone-50 dark:bg-slate-950 p-2"
          : "flex flex-col gap-4"
      }
    >
      <div className="flex items-center gap-2">
        {telaCheia && (
          <button
            type="button"
            onClick={sair}
            title="Voltar ao normal (Esc ou F2)"
            aria-label="Voltar ao normal"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-stone-700 dark:text-slate-200 hover:border-green-600 dark:hover:border-cyan-500"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12.5 4.5 7 10l5.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        <div className="flex w-fit gap-1 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-1 text-sm">
          {visoes.map((v) => (
            <button
              key={v.valor}
              type="button"
              onClick={() => {
                setVisao(v.valor);
                if (v.valor === "material") setMaterialAberto(true);
              }}
              className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
                visao === v.valor
                  ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950"
                  : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
              }`}
            >
              {v.rotulo}
            </button>
          ))}
        </div>
        {telaCheia && <div ref={setAlvoCards} className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" />}
        {!telaCheia && (
          <button
            type="button"
            onClick={entrar}
            title="Expandir para tela cheia — só os dados (atalho: F2)"
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-stone-700 dark:text-slate-300 hover:border-green-600/50 dark:hover:border-cyan-500/50"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 7.5V3h4.5M17 7.5V3h-4.5M3 12.5V17h4.5M17 12.5V17h-4.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Tela cheia <kbd className="rounded border border-stone-300 dark:border-slate-600 px-1 font-mono text-[10px] text-stone-500 dark:text-slate-400">F2</kbd>
          </button>
        )}
        <div ref={setAlvoSino} className="shrink-0" />
      </div>
      {/* As duas ficam montadas (só escondidas) pra não recarregar/perder filtros ao alternar. */}
      <div className={visao === "followup" ? "" : "hidden"}>
        <FollowUp telaCheia={telaCheia} alvoCards={telaCheia ? alvoCards : null} alvoSino={alvoSino} />
      </div>
      <div className={visao === "controle" ? "" : "hidden"}>
        <ControleObras telaCheia={telaCheia} />
      </div>
      {materialAberto && (
        <div className={visao === "material" ? "" : "hidden"}>
          <ControleObras telaCheia={telaCheia} config={CONFIG_MATERIAL_COMPRA} />
        </div>
      )}
      {comReferenciaPrecos && visao === "referencia" && <ReferenciaPrecosMP />}
    </div>
  );
}
