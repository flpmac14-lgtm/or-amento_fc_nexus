"use client";

// Casca das páginas internas — pedido do usuário: mesmo padrão de cabeçalho e
// navegação do "FC Nexus ERP" (rev 02), que ficou bom no PC e no celular:
//   - barra lateral escura com logo, usuário e o menu em seções;
//   - cabeçalho fino em cima: ☰, título da página, ações da página, tema;
//   - no celular o menu fica escondido e abre por cima (fecha ao tocar fora
//     ou num item); no PC dá pra recolher (fica lembrado).
// Só layout: cada página continua com as mesmas funções. O menu mostra só o
// que cada conta já podia abrir (o bloqueio de verdade segue no proxy.ts).

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { acessoSoFollowUp, perfilModulo } from "@/lib/acesso";
import { podeVerFinanceiro } from "@/lib/financeiro";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

const CHAVE_RECOLHIDO = "fcnexus-menu-recolhido";

type Icone = "orcamento" | "followup" | "painel" | "financeiro" | "usuarios" | "sair";

function IconeMenu({ nome, className = "h-5 w-5" }: { nome: Icone; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {nome === "orcamento" && (
        <g {...p}>
          <path d="M4 19V5a1 1 0 0 1 1-1h9l6 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
          <path d="M14 4v5a1 1 0 0 0 1 1h5M8 13h8M8 16.5h5" />
        </g>
      )}
      {nome === "followup" && (
        <g {...p}>
          <path d="M9 5h11M9 12h11M9 19h11" />
          <path d="m3.5 5 1.2 1.2L7 4M3.5 12l1.2 1.2L7 11M3.5 19l1.2 1.2L7 18" />
        </g>
      )}
      {nome === "painel" && (
        <g {...p}>
          <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
          <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
          <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
        </g>
      )}
      {nome === "financeiro" && (
        <g {...p}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </g>
      )}
      {nome === "usuarios" && (
        <g {...p}>
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
        </g>
      )}
      {nome === "sair" && (
        <g {...p}>
          <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
        </g>
      )}
    </svg>
  );
}

// Marca do FC Nexus — pedido do usuário: "FC" e mais futurista. Monograma
// geométrico em neon ciano→verde (as cores de destaque do app) com brilho,
// moldura octogonal chanfrada e o ponto de conexão ("rede").
function MarcaNexus() {
  return (
    <svg viewBox="0 0 40 40" className="h-10 w-10 shrink-0 transition-transform group-hover:scale-105" aria-hidden="true">
      <defs>
        <linearGradient id="marca-fundo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b1626" />
          <stop offset="1" stopColor="#0d2b3e" />
        </linearGradient>
        <linearGradient id="marca-neon" x1="6" y1="8" x2="34" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#4ade80" />
        </linearGradient>
        <filter id="marca-brilho" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.9" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d="M8 1.5H32L38.5 8V32L32 38.5H8L1.5 32V8Z" fill="url(#marca-fundo)" stroke="url(#marca-neon)" strokeWidth="1.2" />
      <g filter="url(#marca-brilho)" fill="none" stroke="url(#marca-neon)" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 29.5V13.5L11.5 11H19M9 20H17" />
        <path d="M31.5 11H25.5L22.5 14V26.5L25.5 29.5H31.5" />
      </g>
      <circle cx="31.5" cy="20.2" r="1.8" fill="#4ade80" filter="url(#marca-brilho)" />
    </svg>
  );
}

interface ItemMenu {
  href: string;
  rotulo: string;
  icone: Icone;
}

interface Conta {
  login: string;
  perfil: string;
  itens: { secao: string; itens: ItemMenu[] }[];
}

const ROTULO_PERFIL: Record<string, string> = {
  total: "ACESSO TOTAL",
  follow_up: "FOLLOW UP",
  projeto: "PROJETO",
  corte: "CORTE",
  usinagem: "USINAGEM",
};

function montarMenu(user: User): Conta {
  const perfil = perfilModulo(user);
  const restrita = acessoSoFollowUp(user);
  const secoes: Conta["itens"] = [];
  const principal: ItemMenu[] = [];
  if (!restrita || perfil === "follow_up") principal.push({ href: "/visao-geral", rotulo: "Visão Geral", icone: "painel" });
  if (podeVerFinanceiro(user.email)) principal.push({ href: "/financeiro", rotulo: "Financeiro", icone: "financeiro" });
  if (principal.length) secoes.push({ secao: "Principal", itens: principal });
  const operacao: ItemMenu[] = [];
  if (!restrita) operacao.push({ href: "/", rotulo: "Orçamentos", icone: "orcamento" });
  operacao.push({ href: "/follow-up", rotulo: "Follow up / Produção", icone: "followup" });
  secoes.push({ secao: "Operação", itens: operacao });
  if (!restrita) secoes.push({ secao: "Administração", itens: [{ href: "/orcamentistas", rotulo: "Orçamentistas", icone: "usuarios" }] });
  return { login: emailParaLogin(user.email ?? ""), perfil, itens: secoes };
}

export default function AppShell({
  titulo,
  subtitulo,
  acoes,
  children,
}: {
  titulo: React.ReactNode;
  subtitulo?: React.ReactNode;
  acoes?: React.ReactNode; // botões/infos da página no cabeçalho (lado direito)
  children: React.ReactNode;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [conta, setConta] = useState<Conta | null>(null);
  const [aberto, setAberto] = useState(false); // celular
  const [recolhido, setRecolhido] = useState(false); // PC

  useEffect(() => {
    let ativo = true;
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => {
        if (!ativo) return;
        if (data.user) setConta(montarMenu(data.user));
        // Menu recolhido no PC (lembrado entre visitas).
        try {
          if (localStorage.getItem(CHAVE_RECOLHIDO) === "1") setRecolhido(true);
        } catch {
          // localStorage bloqueado: começa aberto
        }
      });
    return () => {
      ativo = false;
    };
  }, []);

  function alternarMenu() {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setRecolhido((r) => {
        try {
          localStorage.setItem(CHAVE_RECOLHIDO, r ? "0" : "1");
        } catch {
          // sem persistência
        }
        return !r;
      });
    } else {
      setAberto((a) => !a);
    }
  }

  async function sair() {
    await criarClienteSupabaseNavegador().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const ativo = (href: string) => (href === "/" ? caminho === "/" : caminho.startsWith(href));

  return (
    <div data-app-shell className="min-h-screen bg-stone-100 dark:bg-slate-950 print:bg-white">
      {/* Fundo escuro atrás do menu aberto no celular */}
      {aberto && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden print:hidden" onClick={() => setAberto(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-gradient-to-b from-[#1e3a5f] to-[#14213a] text-white shadow-xl transition-transform duration-300 print:hidden dark:from-slate-900 dark:to-slate-950 dark:shadow-none dark:ring-1 dark:ring-slate-800 ${
          aberto ? "translate-x-0" : "-translate-x-full"
        } ${recolhido ? "lg:-translate-x-full" : "lg:translate-x-0"}`}
      >
        {/* Logo → Visão Geral (pedido do usuário); quem não tem Visão Geral vai pro Follow up. */}
        <Link
          href={conta?.itens.some((s) => s.itens.some((i) => i.href === "/visao-geral")) ? "/visao-geral" : "/follow-up"}
          onClick={() => setAberto(false)}
          className="group flex items-center gap-3 border-b border-white/10 px-4 py-4"
        >
          <MarcaNexus />
          <span className="leading-none">
            <span className="block text-[17px] tracking-tight">
              <span className="font-bold text-white">FC</span>{" "}
              <span className="font-light text-cyan-200">Nexus</span>
            </span>
            <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.25em] text-white/45">Macfab</span>
          </span>
        </Link>

        {conta && (
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
              {conta.login.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-semibold">{conta.login}</span>
              <small className="text-[10px] tracking-wider text-white/50">{ROTULO_PERFIL[conta.perfil] ?? conta.perfil.toUpperCase()}</small>
            </span>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto py-2">
          {conta?.itens.map((s) => (
            <div key={s.secao} className="mt-2">
              <p className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-[0.2em] text-white/40">{s.secao}</p>
              {s.itens.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  onClick={() => setAberto(false)}
                  className={`flex items-center gap-3 border-l-[3px] px-4 py-2.5 text-sm transition-colors ${
                    ativo(i.href)
                      ? "border-amber-400 bg-white/10 font-semibold text-white"
                      : "border-transparent text-white/75 hover:border-amber-400/60 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <IconeMenu nome={i.icone} />
                  {i.rotulo}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={sair}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white"
          >
            <IconeMenu nome="sair" className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <div className={`flex min-h-screen flex-col transition-[padding] duration-300 print:!pl-0 ${recolhido ? "" : "lg:pl-64"}`}>
        <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-stone-200 bg-white/95 px-3 py-2 backdrop-blur-sm print:hidden dark:border-slate-800 dark:bg-slate-900/95 sm:gap-3 sm:px-5">
          <button
            type="button"
            onClick={alternarMenu}
            aria-label="Abrir ou fechar o menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-stone-700 hover:bg-stone-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-stone-900 dark:text-white sm:text-lg">{titulo}</h1>
            {subtitulo && <p className="hidden truncate text-xs text-stone-500 dark:text-slate-400 sm:block">{subtitulo}</p>}
          </div>
          {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
          <ThemeToggle embutido />
        </header>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}

/** Botão secundário padrão do cabeçalho (mesmo visual em todas as páginas). */
export const classeBotaoCabecalho =
  "inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:border-green-600/50 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-cyan-500/50 dark:hover:bg-slate-800";

/** Abas sublinhadas (padrão do ERP) — rolam na horizontal no celular. */
export function classeAbaSublinhada(ativa: boolean): string {
  return `shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4 ${
    ativa
      ? "border-green-600 text-green-700 dark:border-cyan-400 dark:text-cyan-300"
      : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
  }`;
}
