"use client";

import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useEffect, useState } from "react";

interface Usuario {
  id: string;
  login: string | null;
  criado_em: string;
  ultimo_login_em: string | null;
}

// Cadastro de orçamentista — pedido explícito do usuário: só o
// administrador cadastra conta nova (login + senha, sem precisar de
// e-mail de verdade — ver lib/loginInterno.ts), ninguém se cadastra
// sozinho. A permissão é conferida no servidor (ver
// app/api/orcamentistas/route.ts); aqui só tratamos o 403 mostrando uma
// mensagem de acesso restrito.
export default function PaginaOrcamentistas() {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [acessoNegado, setAcessoNegado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Trocar senha (só o flpmac14 — o servidor confere de novo).
  const [podeTrocarSenha, setPodeTrocarSenha] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null); // id da conta com o campo aberto
  const [novaSenha, setNovaSenha] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  async function buscarUsuarios() {
    setCarregando(true);
    setErro(null);
    try {
      const resposta = await fetch("/api/orcamentistas");
      if (resposta.status === 403) {
        setAcessoNegado(true);
        return;
      }
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.erro || `Falha ao listar usuários (${resposta.status}).`);
      }
      const dados = await resposta.json();
      setUsuarios(dados.usuarios);
      setPodeTrocarSenha(!!dados.pode_trocar_senha);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao listar usuários.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    Promise.resolve().then(buscarUsuarios);
  }, []);

  async function handleCadastrar(evento: React.FormEvent) {
    evento.preventDefault();
    setCadastrando(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/orcamentistas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, senha }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        throw new Error(dados?.erro || `Falha ao cadastrar (${resposta.status}).`);
      }
      setAviso(`Orçamentista "${dados.login}" cadastrado — já pode entrar com essa senha.`);
      setLogin("");
      setSenha("");
      buscarUsuarios();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao cadastrar.");
    } finally {
      setCadastrando(false);
    }
  }

  async function trocarSenha(u: Usuario) {
    setSalvandoSenha(true);
    setErro(null);
    setAviso(null);
    try {
      const resposta = await fetch("/api/orcamentistas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, senha: novaSenha }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados?.erro || `Falha ao trocar a senha (${resposta.status}).`);
      setAviso(`Senha de "${u.login}" trocada — a pessoa já entra com a nova senha.`);
      setTrocando(null);
      setNovaSenha("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao trocar a senha.");
    } finally {
      setSalvandoSenha(false);
    }
  }

  if (acessoNegado) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-stone-700 dark:text-slate-300">Acesso restrito ao administrador.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-green-700 dark:text-cyan-300 hover:underline">
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <AppShell titulo="Orçamentistas" subtitulo="Contas de acesso ao app (só o administrador cadastra)">
    <div className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-6">

      <section className="rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
        <h2 className="mb-3 font-semibold text-stone-900 dark:text-white">Cadastrar novo orçamentista</h2>
        <p className="mb-4 text-xs text-stone-500 dark:text-slate-500">
          Cria uma conta com login e senha — a pessoa já entra direto, sem precisar de e-mail nem confirmar nada.
        </p>
        <form onSubmit={handleCadastrar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-stone-700 dark:text-slate-300">Login</span>
            <input
              type="text"
              required
              placeholder="ex: joao.silva"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-stone-700 dark:text-slate-300">Senha</span>
            <input
              type="text"
              required
              minLength={6}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="mín. 6 caracteres"
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          </label>
          <button
            type="submit"
            disabled={cadastrando}
            className="rounded-lg bg-green-600 dark:bg-cyan-500 px-5 py-2 text-sm font-bold text-white dark:text-slate-950 transition-colors hover:bg-green-500 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cadastrando ? "Cadastrando…" : "Cadastrar"}
          </button>
        </form>

        {aviso && <p className="mt-3 text-sm text-green-700 dark:text-cyan-300">{aviso}</p>}
        {erro && (
          <p className="mt-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
            {erro}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
        <h2 className="mb-3 font-semibold text-stone-900 dark:text-white">Contas cadastradas</h2>
        {carregando ? (
          <p className="text-sm text-stone-500 dark:text-slate-500">Carregando…</p>
        ) : (
          <ul className="divide-y divide-stone-200 dark:divide-slate-800 text-sm">
            {usuarios?.map((u) => (
              <li key={u.id} className="flex flex-col gap-2 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-stone-800 dark:text-slate-200">{u.login}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-stone-500 dark:text-slate-500">
                      {u.ultimo_login_em
                        ? `último acesso ${new Date(u.ultimo_login_em).toLocaleDateString("pt-BR")}`
                        : "nunca entrou"}
                    </span>
                    {podeTrocarSenha && (
                      <button
                        type="button"
                        onClick={() => {
                          setTrocando(trocando === u.id ? null : u.id);
                          setNovaSenha("");
                        }}
                        className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-700 hover:border-green-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-cyan-500"
                      >
                        🔑 Trocar senha
                      </button>
                    )}
                  </span>
                </div>
                {trocando === u.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      trocarSenha(u);
                    }}
                    className="flex flex-col gap-2 rounded-lg bg-stone-50 p-2 dark:bg-slate-900 sm:flex-row sm:items-center"
                  >
                    <input
                      type="text"
                      required
                      minLength={6}
                      autoFocus
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      placeholder={`nova senha de ${u.login} (mín. 6)`}
                      className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-green-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-500"
                    />
                    <button
                      type="submit"
                      disabled={salvandoSenha || novaSenha.length < 6}
                      className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950"
                    >
                      {salvandoSenha ? "Salvando…" : "Salvar senha"}
                    </button>
                    <button type="button" onClick={() => setTrocando(null)} className="px-2 text-sm text-stone-500 dark:text-slate-400">
                      Cancelar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
    </AppShell>
  );
}
