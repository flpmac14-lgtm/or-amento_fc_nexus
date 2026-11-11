"use client";

// Documentos — pedido do usuário (11/11/2026): criar pastas (com o nome que
// quiser), anexar PDFs nelas (escolher ou arrastar, vários de uma vez) e
// tirar. Clique no PDF abre numa aba nova. Só o flpmac14 (lib/documentos.ts);
// quem grava é /api/documentos; o arquivo sobe direto pro Storage.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell, { classeBotaoCabecalho } from "@/components/AppShell";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import {
  BUCKET_DOCUMENTOS,
  MAX_BYTES_DOCUMENTO,
  podeVerDocumentos,
  type ArquivoDocumento,
  type PastaDocumentos,
} from "@/lib/documentos";

async function chamar<T>(metodo: string, corpo?: unknown, query = ""): Promise<T> {
  const r = await fetch(`/api/documentos${query}`, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
  return j as T;
}

function tamanhoLegivel(b: number | null): string {
  if (b == null) return "";
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  return `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function IconePasta({ aberta = false }: { aberta?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      {aberta ? (
        <path strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1H7.5a2 2 0 0 0-1.9 1.4L3 19V7Zm0 12 2.6-7.6A2 2 0 0 1 7.5 10H21l-2.7 8.1a1.5 1.5 0 0 1-1.4.9H3Z" />
      ) : (
        <path strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      )}
    </svg>
  );
}

function IconePdf() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <path strokeLinejoin="round" d="M6 3h8l4 4v14H6V3Z" />
      <path strokeLinejoin="round" d="M14 3v4h4" />
      <text x="12" y="17" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
    </svg>
  );
}

type Envio = { nome: string; erro?: string };

export default function PaginaDocumentos() {
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [pastas, setPastas] = useState<PastaDocumentos[]>([]);
  const [arquivos, setArquivos] = useState<ArquivoDocumento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pastaId, setPastaId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  // Janela de nome (nova pasta ou renomear).
  const [nomeando, setNomeando] = useState<{ id?: string; nome: string } | null>(null);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [confirmarApagar, setConfirmarApagar] = useState<{ tipo: "pasta" | "arquivo"; id: string; nome: string } | null>(null);
  const [apagando, setApagando] = useState(false);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await chamar<{ pastas: PastaDocumentos[]; arquivos: ArquivoDocumento[] }>("GET");
      setPastas(r.pastas);
      setArquivos(r.arquivos);
      setPastaId((atual) => (atual && r.pastas.some((p) => p.id === atual) ? atual : (r.pastas[0]?.id ?? null)));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => {
        const ok = podeVerDocumentos(data.user?.email);
        setPermitido(ok);
        if (ok) carregar();
        else setCarregando(false);
      });
  }, [carregar]);

  const pasta = pastas.find((p) => p.id === pastaId) ?? null;
  const qtdPorPasta = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of arquivos) m[a.pasta_id] = (m[a.pasta_id] ?? 0) + 1;
    return m;
  }, [arquivos]);

  const termo = busca.trim().toLowerCase();
  // Com busca: procura em todas as pastas. Sem busca: só a pasta aberta.
  const lista = useMemo(
    () =>
      termo
        ? arquivos.filter((a) => a.nome.toLowerCase().includes(termo))
        : arquivos.filter((a) => a.pasta_id === pastaId),
    [arquivos, pastaId, termo],
  );
  const nomePastaDe = (id: string) => pastas.find((p) => p.id === id)?.nome ?? "";

  async function salvarNome() {
    if (!nomeando || !nomeando.nome.trim()) return;
    setSalvandoNome(true);
    try {
      if (nomeando.id) {
        const { pasta } = await chamar<{ pasta: PastaDocumentos }>("POST", {
          acao: "renomear_pasta",
          id: nomeando.id,
          nome: nomeando.nome,
        });
        setPastas((ps) => ps.map((p) => (p.id === pasta.id ? pasta : p)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      } else {
        const { pasta } = await chamar<{ pasta: PastaDocumentos }>("POST", { acao: "criar_pasta", nome: nomeando.nome });
        setPastas((ps) => [...ps, pasta].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
        setPastaId(pasta.id);
        setBusca("");
      }
      setNomeando(null);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvandoNome(false);
    }
  }

  async function apagar() {
    if (!confirmarApagar) return;
    setApagando(true);
    try {
      const { tipo, id } = confirmarApagar;
      await chamar("DELETE", undefined, `?${tipo}=${encodeURIComponent(id)}`);
      if (tipo === "arquivo") setArquivos((as) => as.filter((a) => a.id !== id));
      else {
        setArquivos((as) => as.filter((a) => a.pasta_id !== id));
        const restantes = pastas.filter((p) => p.id !== id);
        setPastas(restantes);
        if (pastaId === id) setPastaId(restantes[0]?.id ?? null);
      }
      setConfirmarApagar(null);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setApagando(false);
    }
  }

  async function enviar(lista: File[]) {
    if (!pastaId || !lista.length) return;
    const destino = pastaId;
    const supabase = criarClienteSupabaseNavegador();
    setEnvios(lista.map((f) => ({ nome: f.name })));
    const erros: Envio[] = [];
    for (const f of lista) {
      try {
        if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") throw new Error("não é PDF");
        if (f.size > MAX_BYTES_DOCUMENTO) throw new Error("passa de 50 MB");
        const nome = /\.pdf$/i.test(f.name) ? f.name : `${f.name}.pdf`;
        const { objeto, token } = await chamar<{ objeto: string; token: string }>("POST", {
          acao: "preparar_upload",
          pasta_id: destino,
          nome,
          tamanho: f.size,
        });
        const { error } = await supabase.storage
          .from(BUCKET_DOCUMENTOS)
          .uploadToSignedUrl(objeto, token, f, { contentType: "application/pdf" });
        if (error) throw new Error(error.message);
        const { arquivo } = await chamar<{ arquivo: ArquivoDocumento }>("POST", {
          acao: "confirmar_upload",
          pasta_id: destino,
          nome,
          tamanho: f.size,
          objeto,
        });
        setArquivos((as) => [...as, arquivo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
        setEnvios((es) => es.filter((e) => e.nome !== f.name));
      } catch (e) {
        erros.push({ nome: f.name, erro: (e as Error).message });
      }
    }
    setEnvios(erros);
  }

  async function abrir(a: ArquivoDocumento, baixar = false) {
    // Abre a aba já no clique (senão o navegador bloqueia como pop-up) e põe o link assinado depois.
    const aba = baixar ? null : window.open("about:blank", "_blank");
    try {
      const { url } = await chamar<{ url: string }>("GET", undefined, `?abrir=${a.id}${baixar ? "&baixar=1" : ""}`);
      if (aba) aba.location.replace(url);
      else window.location.assign(url);
    } catch (e) {
      aba?.close();
      setErro((e as Error).message);
    }
  }

  const campo =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/20";
  const botaoPrimario =
    "rounded-lg bg-green-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400";

  if (permitido === false) {
    return (
      <AppShell titulo="Documentos">
        <p className="p-6 text-sm text-stone-600 dark:text-slate-400">Acesso restrito.</p>
      </AppShell>
    );
  }

  const enviando = envios.some((e) => !e.erro);

  return (
    <AppShell
      titulo="Documentos"
      subtitulo={
        <span>
          {pastas.length} pasta{pastas.length === 1 ? "" : "s"} · {arquivos.length} PDF{arquivos.length === 1 ? "" : "s"}
        </span>
      }
      acoes={
        <>
          <button type="button" onClick={carregar} className={classeBotaoCabecalho} title="Atualizar">
            ⟳<span className="hidden sm:inline"> Atualizar</span>
          </button>
          <button type="button" onClick={() => setNomeando({ nome: "" })} className={botaoPrimario}>
            ＋<span className="hidden sm:inline"> Nova pasta</span>
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {erro && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {erro}
            <button type="button" onClick={() => setErro(null)} className="text-xs underline">
              fechar
            </button>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[260px_1fr]">
          {/* Pastas */}
          <aside className="rounded-lg border border-stone-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-1 flex items-center justify-between px-2 py-1">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-slate-400">Pastas</span>
              <button
                type="button"
                onClick={() => setNomeando({ nome: "" })}
                className="text-xs font-semibold text-green-700 hover:underline dark:text-cyan-300"
              >
                ＋ Nova
              </button>
            </div>
            {carregando && !pastas.length ? (
              <p className="px-2 py-3 text-sm text-stone-500 dark:text-slate-400">Carregando…</p>
            ) : !pastas.length ? (
              <p className="px-2 py-3 text-sm text-stone-500 dark:text-slate-400">
                Nenhuma pasta ainda. Clique em <b>＋ Nova pasta</b> pra começar.
              </p>
            ) : (
              <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
                {pastas.map((p) => {
                  const ativa = p.id === pastaId && !termo;
                  return (
                    <li key={p.id} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setPastaId(p.id);
                          setBusca("");
                        }}
                        className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                          ativa
                            ? "bg-green-50 font-semibold text-green-800 dark:bg-cyan-500/10 dark:text-cyan-200"
                            : "text-stone-700 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className={ativa ? "text-amber-500" : "text-amber-500/80"}>
                          <IconePasta aberta={ativa} />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                        <span className="rounded-full bg-stone-100 px-1.5 text-[11px] text-stone-600 dark:bg-slate-800 dark:text-slate-400">
                          {qtdPorPasta[p.id] ?? 0}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Arquivos */}
          <section
            className={`flex min-h-[320px] flex-col rounded-lg border bg-white p-3 dark:bg-slate-900 ${
              arrastando ? "border-2 border-dashed border-green-600 dark:border-cyan-400" : "border-stone-200 dark:border-slate-800"
            }`}
            onDragOver={(e) => {
              if (!pasta || termo) return;
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setArrastando(false);
              if (pasta && !termo) void enviar([...e.dataTransfer.files]);
            }}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1">
                {termo ? (
                  <h2 className="text-base font-bold text-stone-900 dark:text-white">Busca: “{busca.trim()}”</h2>
                ) : pasta ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold text-stone-900 dark:text-white">{pasta.nome}</h2>
                    <button
                      type="button"
                      onClick={() => setNomeando({ id: pasta.id, nome: pasta.nome })}
                      className="text-xs text-stone-500 hover:text-green-700 hover:underline dark:text-slate-400 dark:hover:text-cyan-300"
                    >
                      Renomear
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmarApagar({ tipo: "pasta", id: pasta.id, nome: pasta.nome })}
                      className="text-xs text-stone-500 hover:text-red-600 hover:underline dark:text-slate-400 dark:hover:text-red-400"
                    >
                      Excluir pasta
                    </button>
                  </div>
                ) : (
                  <h2 className="text-base font-bold text-stone-500 dark:text-slate-400">Nenhuma pasta selecionada</h2>
                )}
              </div>
              <div className="relative w-full sm:w-60">
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar PDF em todas as pastas…"
                  className={`${campo} pl-8`}
                />
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400">⌕</span>
              </div>
              {pasta && !termo && (
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => inputArquivo.current?.click()}
                  className={botaoPrimario}
                >
                  {enviando ? "Enviando…" : "＋ Anexar PDF"}
                </button>
              )}
              <input
                ref={inputArquivo}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = [...(e.target.files ?? [])];
                  e.target.value = "";
                  void enviar(fs);
                }}
              />
            </div>

            {envios.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1 text-sm">
                {envios.map((e) => (
                  <li
                    key={e.nome}
                    className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 ${
                      e.erro
                        ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                        : "bg-stone-50 text-stone-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    <span className="truncate">
                      {e.erro ? `Não foi: ${e.nome} — ${e.erro}` : `Enviando ${e.nome}…`}
                    </span>
                    {e.erro && (
                      <button type="button" onClick={() => setEnvios((es) => es.filter((x) => x !== e))} className="text-xs underline">
                        ok
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!pasta && !termo ? (
              <div className="flex flex-1 items-center justify-center text-sm text-stone-500 dark:text-slate-400">
                Crie uma pasta pra anexar os PDFs.
              </div>
            ) : lista.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500 dark:border-slate-800 dark:text-slate-400">
                {termo ? (
                  "Nenhum PDF com esse nome."
                ) : (
                  <>
                    <span>Pasta vazia.</span>
                    <span>Arraste PDFs para cá ou clique em “＋ Anexar PDF”.</span>
                  </>
                )}
              </div>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {lista.map((a) => (
                  <li
                    key={a.id}
                    className="group flex items-center gap-2 rounded-lg border border-stone-200 p-2 hover:border-green-600/50 dark:border-slate-800 dark:hover:border-cyan-500/50"
                  >
                    <button type="button" onClick={() => abrir(a)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title="Abrir PDF">
                      <IconePdf />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-stone-800 dark:text-slate-100">{a.nome}</span>
                        <span className="block text-[11px] text-stone-500 dark:text-slate-400">
                          {termo ? `${nomePastaDe(a.pasta_id)} · ` : ""}
                          {tamanhoLegivel(a.tamanho)} · {dataCurta(a.criado_em)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => abrir(a, true)}
                      className="rounded px-1.5 py-1 text-xs text-stone-500 hover:bg-stone-100 hover:text-green-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                      title="Baixar"
                    >
                      ⬇
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmarApagar({ tipo: "arquivo", id: a.id, nome: a.nome })}
                      className="rounded px-1.5 py-1 text-xs text-stone-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                      title="Tirar este PDF"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Nome da pasta (nova / renomear) */}
      {nomeando && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setNomeando(null)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void salvarNome();
            }}
            className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="mb-3 font-bold text-stone-900 dark:text-white">{nomeando.id ? "Renomear pasta" : "Nova pasta"}</h3>
            <input
              autoFocus
              value={nomeando.nome}
              onChange={(e) => setNomeando({ ...nomeando, nome: e.target.value })}
              placeholder="Nome da pasta"
              maxLength={120}
              className={campo}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setNomeando(null)} className={classeBotaoCabecalho}>
                Cancelar
              </button>
              <button type="submit" disabled={salvandoNome || !nomeando.nome.trim()} className={botaoPrimario}>
                {salvandoNome ? "Salvando…" : nomeando.id ? "Salvar" : "Criar pasta"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmar exclusão */}
      {confirmarApagar && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmarApagar(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="mb-2 font-bold text-stone-900 dark:text-white">
              {confirmarApagar.tipo === "pasta" ? "Excluir pasta?" : "Tirar este PDF?"}
            </h3>
            <p className="break-words text-sm text-stone-600 dark:text-slate-300">
              <b>{confirmarApagar.nome}</b>
              {confirmarApagar.tipo === "pasta" &&
                ((qtdPorPasta[confirmarApagar.id] ?? 0) > 0
                  ? ` e os ${qtdPorPasta[confirmarApagar.id]} PDF(s) dentro dela serão apagados.`
                  : " (vazia) será apagada.")}
              {confirmarApagar.tipo === "arquivo" && " será apagado."}
              {" "}Não dá pra desfazer.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmarApagar(null)} className={classeBotaoCabecalho}>
                Cancelar
              </button>
              <button
                type="button"
                disabled={apagando}
                onClick={apagar}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {apagando ? "Apagando…" : confirmarApagar.tipo === "pasta" ? "Excluir pasta" : "Tirar PDF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
