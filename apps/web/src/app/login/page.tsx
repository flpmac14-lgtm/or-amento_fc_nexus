"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

function FormularioLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(evento: React.FormEvent) {
    evento.preventDefault();
    setCarregando(true);
    setErro(null);

    const supabase = criarClienteSupabaseNavegador();
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro("E-mail ou senha inválidos.");
      setCarregando(false);
      return;
    }

    const proximo = searchParams.get("proximo") || "/";
    router.replace(proximo);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-8 shadow-[0_0_40px_-15px_rgba(34,211,238,0.3)]">
        <h1 className="text-xl font-bold text-stone-900 dark:text-white">
          FC Nexus <span className="text-green-600 dark:text-cyan-400">—</span> Orçamento Industrial I.A.
        </h1>
        <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">Entre com a conta cadastrada pelo administrador.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-stone-700 dark:text-slate-300">E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-stone-700 dark:text-slate-300">Senha</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          </label>

          {erro && (
            <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="mt-2 rounded-lg bg-green-600 dark:bg-cyan-500 px-6 py-3 text-sm font-bold text-white dark:text-slate-950 shadow-[0_0_25px_-6px_rgba(34,211,238,0.7)] transition-colors hover:bg-green-500 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PaginaLogin() {
  return (
    <Suspense>
      <FormularioLogin />
    </Suspense>
  );
}
