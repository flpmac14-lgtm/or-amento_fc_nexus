"use client";

// Página só do módulo Follow up — é onde cai a conta com acesso restrito
// (ver lib/acesso.ts e proxy.ts). Contas com acesso total também podem abrir
// esta página, e continuam tendo a aba "Follow up" na tela principal.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import FollowUp from "@/components/FollowUp";
import { acessoSoFollowUp } from "@/lib/acesso";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

export default function PaginaFollowUp() {
  const router = useRouter();
  const [conta, setConta] = useState<{ login: string; restrita: boolean } | null>(null);

  useEffect(() => {
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) {
          setConta({ login: emailParaLogin(data.user.email ?? ""), restrita: acessoSoFollowUp(data.user) });
        }
      });
  }, []);

  async function sair() {
    await criarClienteSupabaseNavegador().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-slate-950">
      <main className="mx-auto flex max-w-[100rem] flex-col gap-6 px-6 py-12">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-600/15 dark:bg-cyan-500/15 text-green-600 dark:text-cyan-400">
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 19V5a1 1 0 0 1 1-1h9l6 6v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" strokeLinejoin="round" />
                <path d="M14 4v5a1 1 0 0 0 1 1h5" strokeLinejoin="round" />
                <path d="M8 13h8M8 16.5h5" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
              FC Nexus <span className="text-green-600 dark:text-cyan-400">—</span> Follow up
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            {conta && <span className="text-stone-600 dark:text-slate-400">Conectado como {conta.login}</span>}
            {conta && !conta.restrita && (
              <Link
                href="/"
                className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 font-medium text-stone-700 dark:text-slate-300 hover:border-green-600/50 dark:hover:border-cyan-500/50"
              >
                Voltar ao orçamento
              </Link>
            )}
            <button
              type="button"
              onClick={sair}
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 font-medium text-stone-700 dark:text-slate-300 hover:border-green-600/50 dark:hover:border-cyan-500/50"
            >
              Sair
            </button>
          </div>
        </header>
        <FollowUp />
      </main>
    </div>
  );
}
