"use client";

// Aba Fornecedores (almoxarifado) — pedido do usuário (28/10/2026): a planilha
// J:\6 - PCP\PCP-Fornecedor\FORNECEDOR.xlsx organizada por grupos parecidos
// (Chapas, Tubos, Serviços, Solda…) e fácil de pesquisar, pra entrar em
// contato: telefone (toque liga), WhatsApp do celular, e-mail e endereço no
// mapa. Grupos: services/calc_engine/app/fornecedores.py (aba FM da planilha).
// Dados: /api/follow-up/fornecedores (migration 0062), atualizados a cada 15 min.

import { useEffect, useMemo, useState } from "react";
import { normalizarBusca } from "@/lib/busca";

interface Fornecedor {
  l: number;
  nome: string;
  cod: string[];
  fones: string[];
  cel: string[];
  email: string | null;
  contato: string | null;
  marcas: string | null;
  materiais: string | null;
  endereco: string | null;
  cidade: string | null;
  cep: string | null;
  uf: string | null;
  cnpj: string | null;
}
interface Codigo {
  nome: string | null;
  grupo: string;
  n: number;
}
interface Resposta {
  fornecedores: Fornecedor[];
  grupos: Record<string, Codigo>;
  modificado_em: string | null;
  gerado_em: string | null;
}

const SEM_GRUPO = "Sem grupo na planilha";
const POR_PAGINA = 60;

// "(16)3301-0404" → "+551633010404"; celular "(21)97077-8749/97232-2825" → os dois.
function numeros(texto: string): string[] {
  const partes = texto.split(/[/;]| ou /);
  const ddd = /\((\d{2})\)/.exec(texto)?.[1] ?? "";
  return partes
    .map((p) => p.replace(/\D/g, ""))
    .filter((d) => d.length >= 8)
    .map((d) => (d.length <= 9 && ddd ? ddd + d : d))
    .map((d) => (d.length === 10 || d.length === 11 ? `55${d}` : d));
}

function linkMapa(f: Fornecedor): string | null {
  const partes = [f.endereco, f.cidade && f.uf ? `${f.cidade} - ${f.uf}` : f.cidade, f.cep].filter(Boolean);
  if (!f.endereco && !f.cidade) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(partes.join(", "))}`;
}

export default function Fornecedores() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<string>("");
  const [codigo, setCodigo] = useState<string>(""); // nome do tipo escolhido
  const [limite, setLimite] = useState(POR_PAGINA);

  useEffect(() => {
    let ativo = true;
    fetch("/api/follow-up/fornecedores")
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
        if (ativo) setDados(j);
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  const nomeCodigo = (c: string) => dados?.grupos[c]?.nome ?? `Código ${c}`;
  const gruposDe = useMemo(
    () => (f: Fornecedor) => (f.cod.length ? [...new Set(f.cod.map((c) => dados?.grupos[c]?.grupo ?? "Outros"))] : [SEM_GRUPO]),
    [dados],
  );

  // Texto de busca de cada fornecedor (com o nome dos grupos), montado uma vez.
  const indice = useMemo(
    () =>
      (dados?.fornecedores ?? []).map((f) =>
        normalizarBusca(
          [f.nome, f.contato, f.email, f.marcas, f.materiais, f.endereco, f.cidade, f.uf, f.cnpj, ...f.fones, ...f.cel, ...f.cod, ...f.cod.map((c) => dados?.grupos[c]?.nome ?? "")]
            .filter(Boolean)
            .join(" "),
        ),
      ),
    [dados],
  );

  const contagemGrupos = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of dados?.fornecedores ?? []) for (const g of gruposDe(f)) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => (a[0] === SEM_GRUPO ? 1 : b[0] === SEM_GRUPO ? -1 : a[0] === "Outros" ? 1 : b[0] === "Outros" ? -1 : b[1] - a[1]));
  }, [dados, gruposDe]);

  // Tipos do grupo escolhido: códigos da planilha juntados pelo nome (CLC e CHC
  // são os dois "CHAPA CARBONO" no cadastro).
  const familias = useMemo(() => {
    if (!dados || !grupo || grupo === SEM_GRUPO) return [];
    const m = new Map<string, Set<string>>();
    for (const [c, info] of Object.entries(dados.grupos)) {
      if (info.grupo !== grupo) continue;
      const nome = info.nome ?? `Código ${c}`;
      m.set(nome, (m.get(nome) ?? new Set()).add(c));
    }
    return [...m.entries()]
      .map(([nome, codigos]) => ({ nome, codigos, n: dados.fornecedores.filter((f) => f.cod.some((c) => codigos.has(c))).length }))
      .sort((a, b) => b.n - a.n);
  }, [dados, grupo]);

  const lista = useMemo(() => {
    if (!dados) return [];
    const nomeDo = (c: string) => dados.grupos[c]?.nome ?? `Código ${c}`;
    const termos = normalizarBusca(busca.trim()).split(/\s+/).filter(Boolean);
    return dados.fornecedores.filter((f, i) => {
      if (grupo && !gruposDe(f).includes(grupo)) return false;
      if (codigo && !f.cod.some((c) => nomeDo(c) === codigo)) return false;
      return termos.every((t) => indice[i].includes(t));
    });
  }, [dados, grupo, codigo, busca, indice, gruposDe]);

  if (erro) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>;
  if (!dados) return <p className="py-10 text-center text-stone-500 dark:text-slate-400">Carregando fornecedores…</p>;

  const escolherGrupo = (g: string) => {
    setGrupo((atual) => (atual === g ? "" : g));
    setCodigo("");
    setLimite(POR_PAGINA);
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
      <section className="rounded-2xl border border-teal-200 bg-teal-50 p-3 dark:border-teal-900 dark:bg-teal-950/30 sm:p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-black text-teal-900 dark:text-teal-100">📇 Fornecedores</h2>
          <p className="text-xs text-teal-800 dark:text-teal-200">
            {dados.fornecedores.length.toLocaleString("pt-BR")} na planilha FORNECEDOR.xlsx
            {dados.modificado_em ? ` · alterada em ${new Date(dados.modificado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
          </p>
        </div>
        <p className="mt-1 text-sm text-teal-900 dark:text-teal-100">
          Escolha um <b>grupo</b> ou pesquise pelo nome, material, marca, cidade ou contato. Toque no telefone pra ligar, no 💬 pro WhatsApp e no 📍 pro mapa.
        </p>
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setLimite(POR_PAGINA);
          }}
          type="search"
          placeholder="🔍 Ex.: chapa inox, parafuso, Araraquara, SKF, 2i eletrônica…"
          className="mt-2 h-12 w-full rounded-xl border-2 border-stone-300 bg-white px-4 text-base text-stone-900 outline-none focus:border-teal-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
        />
      </section>

      {/* Grupos */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => escolherGrupo("")}
          className={`h-9 rounded-full border-2 px-3 text-sm font-bold ${!grupo ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-200"}`}
        >
          Todos
        </button>
        {contagemGrupos.map(([g, n]) => (
          <button
            key={g}
            type="button"
            onClick={() => escolherGrupo(g)}
            className={`h-9 rounded-full border-2 px-3 text-sm font-semibold ${
              grupo === g ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-teal-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            }`}
          >
            {g} <span className="text-xs opacity-70">{n}</span>
          </button>
        ))}
      </div>

      {/* Famílias do grupo (códigos da planilha) */}
      {familias.length > 1 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl border border-stone-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
          <span className="self-center px-1 text-xs font-bold uppercase text-stone-500 dark:text-slate-400">Tipo:</span>
          {familias.map((t) => (
            <button
              key={t.nome}
              type="button"
              onClick={() => {
                setCodigo((atual) => (atual === t.nome ? "" : t.nome));
                setLimite(POR_PAGINA);
              }}
              title={`Código ${[...t.codigos].join(", ")} na planilha`}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                codigo === t.nome ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 text-stone-700 hover:border-teal-600 dark:border-slate-600 dark:text-slate-300"
              }`}
            >
              {t.nome} <span className="opacity-60">{t.n}</span>
            </button>
          ))}
        </div>
      )}

      <p className="text-sm font-semibold text-stone-600 dark:text-slate-300">
        {lista.length.toLocaleString("pt-BR")} fornecedor(es){grupo ? ` em “${grupo}”` : ""}
        {codigo ? ` · ${codigo}` : ""}
      </p>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {lista.slice(0, limite).map((f) => (
          <CartaoFornecedor key={f.l} f={f} nomeCodigo={nomeCodigo} />
        ))}
      </div>
      {lista.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + POR_PAGINA)}
          className="mx-auto h-11 rounded-xl border-2 border-teal-700 px-6 font-bold text-teal-800 dark:text-teal-200"
        >
          Mostrar mais ({(lista.length - limite).toLocaleString("pt-BR")} restantes)
        </button>
      )}
      {!lista.length && <p className="py-8 text-center text-sm text-stone-500 dark:text-slate-400">Nenhum fornecedor com isso.</p>}
    </div>
  );
}

function CartaoFornecedor({ f, nomeCodigo }: { f: Fornecedor; nomeCodigo: (c: string) => string }) {
  const mapa = linkMapa(f);
  const botao =
    "inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 text-sm font-semibold text-stone-800 hover:border-teal-600 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";
  return (
    <article className="flex flex-col gap-1.5 rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="font-bold leading-tight text-stone-900 dark:text-white">{f.nome}</h3>
      {f.cod.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {[...new Map(f.cod.map((c) => [nomeCodigo(c), c])).entries()].map(([nome, c]) => (
            <span key={nome} title={`Código ${c}`} className="rounded bg-teal-50 px-1.5 py-0.5 text-[11px] font-semibold text-teal-900 dark:bg-teal-950/50 dark:text-teal-200">
              {nome}
            </span>
          ))}
        </div>
      )}
      {(f.materiais || f.marcas) && (
        <p className="text-xs text-stone-600 dark:text-slate-300">
          {f.materiais && <span>Materiais: {f.materiais.replace(/\*/g, ", ")}</span>}
          {f.materiais && f.marcas && " · "}
          {f.marcas && <span>Marcas: {f.marcas.replace(/\*/g, ", ")}</span>}
        </p>
      )}
      {f.contato && <p className="text-sm text-stone-700 dark:text-slate-200">👤 {f.contato}</p>}

      <div className="flex flex-wrap gap-1.5">
        {f.fones.map((t) => (
          <a key={t} href={`tel:+${numeros(t)[0] ?? ""}`} className={botao}>
            📞 {t}
          </a>
        ))}
        {f.cel.map((t) => {
          const n = numeros(t)[0] ?? "";
          return (
            <span key={t} className="inline-flex gap-1">
              <a href={`tel:+${n}`} className={botao}>
                📱 {t}
              </a>
              {n.length === 13 && (
                <a href={`https://wa.me/${n}`} target="_blank" rel="noopener noreferrer" className={`${botao} border-green-600 text-green-800 dark:text-green-300`} title="Abrir no WhatsApp">
                  💬
                </a>
              )}
            </span>
          );
        })}
        {f.email && (
          <a href={`mailto:${f.email}`} className={`${botao} max-w-full`}>
            <span className="truncate">✉️ {f.email}</span>
          </a>
        )}
      </div>

      {(f.endereco || f.cidade) && (
        <p className="text-sm text-stone-600 dark:text-slate-300">
          {mapa ? (
            <a href={mapa} target="_blank" rel="noopener noreferrer" className="hover:underline">
              📍 {[f.endereco, [f.cidade, f.uf].filter(Boolean).join(" - "), f.cep].filter(Boolean).join(" · ")}
            </a>
          ) : null}
        </p>
      )}
      {f.cnpj && <p className="text-[11px] text-stone-500 dark:text-slate-400">CNPJ {f.cnpj}</p>}
      {!f.fones.length && !f.cel.length && !f.email && (
        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Sem telefone nem e-mail na planilha</p>
      )}
    </article>
  );
}
