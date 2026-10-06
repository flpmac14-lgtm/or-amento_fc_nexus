"use client";

// Página só do módulo Follow up — é onde cai a conta com acesso restrito
// (ver lib/acesso.ts e proxy.ts). Contas com acesso total também podem abrir
// esta página, e continuam tendo a aba "Follow up" na tela principal.
// Cabeçalho e menu: components/AppShell.tsx (padrão do FC Nexus ERP).
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ModuloFollowUp from "@/components/ModuloFollowUp";
import { acessoSoFollowUp, perfilModulo } from "@/lib/acesso";
import type { PerfilModulo } from "@/components/ModuloFollowUp";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";

export default function PaginaFollowUp() {
  const [conta, setConta] = useState<{ login: string; restrita: boolean; perfil: PerfilModulo } | null>(null);

  useEffect(() => {
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) {
          setConta({
            login: emailParaLogin(data.user.email ?? ""),
            restrita: acessoSoFollowUp(data.user),
            perfil: perfilModulo(data.user),
          });
        }
      });
  }, []);

  return (
    <AppShell titulo="Follow up / Produção" subtitulo={conta ? `Conectado como ${conta.login}` : undefined}>
      <main className="mx-auto flex w-full max-w-[100rem] flex-col gap-4 px-3 py-3 sm:px-6 sm:py-5">
        {/* Só monta depois de saber quem é: projetista não pode nem carregar o Follow up. */}
        {conta && <ModuloFollowUp comReferenciaPrecos={conta.perfil === "follow_up"} perfil={conta.perfil} />}
      </main>
    </AppShell>
  );
}
