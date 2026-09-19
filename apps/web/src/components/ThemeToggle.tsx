"use client";

import { useEffect, useState } from "react";

const CHAVE_LOCALSTORAGE = "fcnexus-theme";

// Botão fixo no canto superior esquerdo (pedido explícito do usuário) —
// alterna entre o tema escuro original (navy + ciano) e um tema claro
// inspirado na paleta da logo da Macfab (verde + laranja sobre branco).
// Nunca segue prefers-color-scheme, só a escolha manual, persistida em
// localStorage. O <html data-theme="dark"> já vem hardcoded no layout
// (ver layout.tsx) — aqui só lemos o que já está no atributo (o script
// inline do layout já aplicou "light" antes do primeiro paint, se for o
// caso) pra manter o estado do botão em sincronia, sem flash.
export default function ThemeToggle() {
  const [tema, setTema] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-theme");
    setTema(atual === "light" ? "light" : "dark");
  }, []);

  function alternar() {
    const proximo = tema === "dark" ? "light" : "dark";
    setTema(proximo);
    document.documentElement.setAttribute("data-theme", proximo);
    try {
      localStorage.setItem(CHAVE_LOCALSTORAGE, proximo);
    } catch {
      // localStorage bloqueado (modo privado etc.) — troca ainda funciona
      // nesta sessão, só não persiste pra próxima visita.
    }
  }

  return (
    <button
      type="button"
      onClick={alternar}
      title={tema === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-white/90 text-stone-700 shadow-lg backdrop-blur-sm transition-colors hover:border-green-600/50 hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-cyan-500/50 dark:hover:bg-slate-800"
    >
      {tema === "dark" ? (
        // Sol — clique pra ir pro tema claro
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4.5" />
          <path
            strokeLinecap="round"
            d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8"
          />
        </svg>
      ) : (
        // Lua — clique pra voltar pro tema escuro
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}
