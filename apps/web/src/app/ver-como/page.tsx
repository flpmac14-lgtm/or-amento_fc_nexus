"use client";

// Ver como usuário — pedido explícito do usuário (13/10/2026, só o admin
// flpmac14): escolher uma conta e ver o app como ela enxerga (mesmas abas e
// telas), sem entrar na conta dela. Ver lib/verComo.ts.
import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { podeVerFinanceiro } from "@/lib/financeiro";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import { gravarVerComo, lerVerComo } from "@/lib/verComo";

interface Usuario {
  id: string;
  login: string | null;
  ultimo_login_em: string | null;
  acesso: string | null;
}

// O que cada perfil vê (lib/abasFollowUp.ts::visoesDoPerfil) — pra escolher sem adivinhar.
const PERFIS: Record<string, { nome: string; ve: string; cor: string }> = {
  total: { nome: "Acesso total", ve: "Tudo (orçamentos, Follow up e todas as abas)", cor: "border-stone-400" },
  follow_up: { nome: "Follow up", ve: "Follow up, Controle de obras, Material, Croqui, Corte, Consulta, Visão Geral", cor: "border-green-500" },
  projeto: { nome: "Projeto", ve: "Material de compra, Croqui de corte, Corte", cor: "border-sky-500" },
  corte: { nome: "Corte", ve: "Só a aba Corte", cor: "border-orange-500" },
  usinagem: { nome: "Usinagem", ve: "Usinagem + Consulta (coletas)", cor: "border-amber-500" },
  qualidade: { nome: "Qualidade", ve: "QUALIDADE, Backup Recebimento, Data book, Recebimento, Coletas", cor: "border-violet-500" },
  consulta: { nome: "Consulta / Caldeiraria", ve: "Consulta + Caldeiraria (celular)", cor: "border-cyan-500" },
  pintura: { nome: "Pintura", ve: "Consulta + Pintura (celular)", cor: "border-pink-500" },
};

export default function PaginaVerComo() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [erro, setErro] = useState("");
  const [atual, setAtual] = useState<string | null>(null);

  useEffect(() => {
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => {
        setAtual(lerVerComo()?.login ?? null);
        const ok = podeVerFinanceiro(data.user?.email);
        setAdmin(ok);
        if (!ok) return;
        fetch("/api/orcamentistas")
          .then((r) => r.json())
          .then((d) => (d.erro ? setErro(d.erro) : setUsuarios(d.usuarios)))
          .catch((e: Error) => setErro(e.message));
      });
  }, []);

  function entrar(u: Usuario) {
    if (!u.login) return;
    gravarVerComo({ login: u.login, acesso: u.acesso });
    window.location.assign(u.acesso ? "/follow-up" : "/");
  }

  const grupos = Object.keys(PERFIS)
    .map((p) => ({ perfil: p, lista: (usuarios ?? []).filter((u) => (u.acesso ?? "total") === p && u.login) }))
    .filter((g) => g.lista.length);

  return (
    <AppShell titulo="Ver como usuário" subtitulo="Veja o app como cada pessoa enxerga">
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-6">
        {admin === false && <p className="rounded-lg bg-red-50 p-4 text-red-700">Só o administrador (flpmac14) abre esta tela.</p>}
        {admin && (
          <>
            <p className="text-sm text-stone-600 dark:text-slate-400">
              Toque numa conta: o app passa a mostrar só as abas e telas que ela vê (uma faixa roxa no topo avisa). Não entra
              na conta dela nem precisa de senha — o que você salvar continua no seu nome. Pra voltar, “Voltar à minha conta”.
            </p>
            {atual && (
              <button
                type="button"
                onClick={() => {
                  gravarVerComo(null);
                  setAtual(null);
                }}
                className="w-fit rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white"
              >
                ✕ Parar de ver como {atual}
              </button>
            )}
            {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
            {!usuarios && !erro && <p className="text-stone-500">Carregando contas…</p>}
            {grupos.map((g) => (
              <section key={g.perfil} className={`rounded-xl border-l-4 ${PERFIS[g.perfil].cor} bg-white p-3 dark:bg-slate-900/50`}>
                <h2 className="text-base font-extrabold text-stone-900 dark:text-white">{PERFIS[g.perfil].nome}</h2>
                <p className="mb-2 text-xs text-stone-500 dark:text-slate-400">Vê: {PERFIS[g.perfil].ve}</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {g.lista.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => entrar(u)}
                      className={`rounded-xl border-2 p-3 text-left active:scale-[0.98] ${
                        atual === u.login
                          ? "border-violet-600 bg-violet-50 dark:bg-violet-950/40"
                          : "border-stone-200 hover:border-violet-500 dark:border-slate-700"
                      }`}
                    >
                      <span className="block text-lg font-bold capitalize text-stone-900 dark:text-white">👁 {u.login}</span>
                      <span className="block text-[11px] text-stone-500 dark:text-slate-400">
                        {u.ultimo_login_em
                          ? `último acesso ${new Date(u.ultimo_login_em).toLocaleDateString("pt-BR")}`
                          : "nunca entrou"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    </AppShell>
  );
}
