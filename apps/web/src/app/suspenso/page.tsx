"use client";

// Aviso da conta suspensa — pedido do usuário (03/11/2026). O proxy manda pra
// cá toda conta de CONTAS_SUSPENSAS (lib/acesso.ts); aqui só dá pra sair.

import { useRouter } from "next/navigation";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

export default function PaginaSuspenso() {
  const router = useRouter();

  async function sair() {
    await criarClienteSupabaseNavegador().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl dark:bg-amber-950/50">⏸</div>
        <h1 className="text-lg font-bold text-stone-900 dark:text-white">Acesso temporariamente suspenso</h1>
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-300">
          Seu acesso ao FC Nexus está pausado por enquanto. Assim que for liberado, você entra normalmente com o mesmo usuário e senha.
        </p>
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-300">Em caso de dúvida, fale com o Felipe.</p>
        <button
          type="button"
          onClick={sair}
          className="mt-5 rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Sair
        </button>
      </div>
    </main>
  );
}
