"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface Usuario {
  id: string;
  email: string | null;
  criado_em: string;
  ultimo_login_em: string | null;
}

// Cadastro de orçamentista — pedido explícito do usuário: só o
// administrador cadastra conta nova (e-mail + senha), ninguém se
// cadastra sozinho. A permissão é conferida no servidor (ver
// app/api/orcamentistas/route.ts); aqui só tratamos o 403 mostrando uma
// mensagem de acesso restrito.
export default function PaginaOrcamentistas() {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [acessoNegado, setAcessoNegado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

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
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao listar usuários.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    buscarUsuarios();
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
        body: JSON.stringify({ email, senha }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        throw new Error(dados?.erro || `Falha ao cadastrar (${resposta.status}).`);
      }
      setAviso(`Orçamentista ${dados.email} cadastrado — já pode entrar com essa senha.`);
      setEmail("");
      setSenha("");
      buscarUsuarios();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido ao cadastrar.");
    } finally {
      setCadastrando(false);
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
    <div className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-stone-900 dark:text-white">Orçamentistas</h1>
        <Link href="/" className="text-sm text-green-700 dark:text-cyan-300 hover:underline">
          Voltar
        </Link>
      </div>

      <section className="rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-5">
        <h2 className="mb-3 font-semibold text-stone-900 dark:text-white">Cadastrar novo orçamentista</h2>
        <p className="mb-4 text-xs text-stone-500 dark:text-slate-500">
          Cria uma conta com e-mail e senha — a pessoa já entra direto, sem precisar confirmar e-mail.
        </p>
        <form onSubmit={handleCadastrar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-stone-700 dark:text-slate-300">E-mail</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              <li key={u.id} className="flex items-center justify-between py-2">
                <span className="text-stone-800 dark:text-slate-200">{u.email}</span>
                <span className="text-xs text-stone-500 dark:text-slate-500">
                  {u.ultimo_login_em
                    ? `último acesso ${new Date(u.ultimo_login_em).toLocaleDateString("pt-BR")}`
                    : "nunca entrou"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
