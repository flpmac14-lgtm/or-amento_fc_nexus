"use client";

// Instalar o app no celular — pedido do usuário: um link pra mandar pro
// celular de um usuário (fcnexus.app.br/instalar) e ele colocar o FC Nexus na
// tela inicial. Página pública (proxy.ts), sem dado nenhum do app.
//   - Android/Chrome (e PC): botão "Instalar" (evento beforeinstallprompt);
//   - iPhone/iPad (Safari): não tem botão — mostra o passo a passo
//     (Compartilhar → Adicionar à Tela de Início);
//   - já instalado (aberto como app): só o botão de entrar.
// Manifesto e ícones: app/manifest.ts e app/icone-app/[tamanho]/route.tsx.

import Link from "next/link";
import { useEffect, useState } from "react";
import { renderBrandIcon } from "@/app/brand-icon";

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Plataforma = "ios" | "ios-outro-navegador" | "android" | "outro";

function detectar(): { plataforma: Plataforma; instalado: boolean } {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = ios && !/crios|fxios|edgios|opios/i.test(ua);
  const instalado =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    plataforma: ios ? (safari ? "ios" : "ios-outro-navegador") : /android/i.test(ua) ? "android" : "outro",
    instalado,
  };
}

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-sm font-bold text-cyan-300 ring-1 ring-cyan-400/40">
        {n}
      </span>
      <span className="pt-0.5 text-[15px] leading-snug text-slate-200">{children}</span>
    </li>
  );
}

// Ícone de "Compartilhar" do Safari (quadrado com seta pra cima).
function IconeCompartilhar() {
  return (
    <svg viewBox="0 0 24 24" className="mx-0.5 inline h-5 w-5 align-[-4px] text-sky-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12M8 7l4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
    </svg>
  );
}

export default function PaginaInstalar() {
  const [info, setInfo] = useState<{ plataforma: Plataforma; instalado: boolean } | null>(null);
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [feito, setFeito] = useState(false);

  useEffect(() => {
    function aoPoderInstalar(e: Event) {
      e.preventDefault(); // guarda pra mostrar o nosso botão
      setEvento(e as EventoInstalar);
    }
    function aoInstalar() {
      setFeito(true);
      setEvento(null);
    }
    window.addEventListener("beforeinstallprompt", aoPoderInstalar);
    window.addEventListener("appinstalled", aoInstalar);
    // Detecta depois do 1º quadro (navigator/matchMedia só existem no navegador).
    const id = requestAnimationFrame(() => setInfo(detectar()));
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener("beforeinstallprompt", aoPoderInstalar);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    const { outcome } = await evento.userChoice;
    if (outcome === "accepted") setFeito(true);
    setEvento(null);
  }

  const instalado = info?.instalado || feito;

  return (
    <main data-sem-botao-tema className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#14213a] to-[#0b1626] px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center shadow-2xl backdrop-blur sm:p-8">
        <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center drop-shadow-[0_0_24px_rgba(34,211,238,0.35)]">
          {renderBrandIcon(96)}
        </div>
        <h1 className="text-2xl tracking-tight text-white">
          <span className="font-bold">FC</span> <span className="font-light text-cyan-200">Nexus</span>
        </h1>
        <p className="mt-1 text-xs font-medium uppercase tracking-[0.3em] text-white/45">Macfab</p>
        <p className="mt-4 text-[15px] text-slate-300">
          Instale o app no seu celular: ele fica na tela inicial com o ícone FC e abre direto, em tela cheia.
        </p>

        <div className="mt-6 text-left">
          {!info ? (
            <p className="text-center text-sm text-slate-400">Carregando…</p>
          ) : instalado ? (
            <p className="rounded-xl border border-green-400/30 bg-green-500/10 p-4 text-center text-[15px] font-semibold text-green-300">
              ✔ App instalado! Procure o ícone <strong>FC Nexus</strong> na tela inicial.
            </p>
          ) : evento ? (
            <button
              type="button"
              onClick={instalar}
              className="w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-green-400 py-4 text-lg font-extrabold text-slate-950 shadow-[0_0_30px_-6px_rgba(34,211,238,0.8)] active:scale-[0.98]"
            >
              ⬇ Instalar o app
            </button>
          ) : info.plataforma === "ios" ? (
            <ol className="flex flex-col gap-3">
              <Passo n={1}>
                Toque em <strong>Compartilhar</strong> <IconeCompartilhar /> na barra do Safari (embaixo, ou em cima no iPad).
              </Passo>
              <Passo n={2}>
                Role e toque em <strong>Adicionar à Tela de Início</strong>.
              </Passo>
              <Passo n={3}>
                Toque em <strong>Adicionar</strong>. Pronto: o ícone FC Nexus aparece na tela inicial.
              </Passo>
            </ol>
          ) : info.plataforma === "ios-outro-navegador" ? (
            <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-[15px] text-amber-200">
              No iPhone, a instalação funciona pelo <strong>Safari</strong>. Copie este endereço e abra no Safari:
              <span className="mt-2 block select-all rounded-lg bg-black/30 px-3 py-2 text-center font-mono text-sm text-white">
                fcnexus.app.br/instalar
              </span>
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              <Passo n={1}>
                Abra o menu do navegador <strong>⋮</strong> (no canto de cima).
              </Passo>
              <Passo n={2}>
                Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
              </Passo>
              <Passo n={3}>Confirme. O ícone FC Nexus aparece na tela inicial.</Passo>
            </ol>
          )}
        </div>

        <Link
          href="/login"
          className="mt-6 block w-full rounded-2xl border border-white/15 py-3 text-[15px] font-semibold text-white/85 hover:bg-white/5"
        >
          {instalado ? "Abrir o FC Nexus" : "Entrar sem instalar"}
        </Link>
        <p className="mt-4 text-xs text-white/35">O acesso continua com o login e a senha de cada usuário.</p>
      </div>
    </main>
  );
}
