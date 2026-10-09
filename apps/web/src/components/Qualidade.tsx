"use client";

// Aba QUALIDADE — pedido do usuário (09/10/2026), por enquanto SÓ flpmac14:
// lista dos certificados de matéria-prima da pasta do Recebimento
// (J:\5 - Almoxarifado - Recebimento\ISO_SGQ\Recebimento\1. Certificados de
// Matéria-Prima_Ordenados pelo NRI) com NRI, descrição e tipo, e o sininho
// quando um PDF é adicionado, alterado ou excluído na pasta.
// Dados: scripts/sincronizar_certificados.py (ciclo de 15 min) → migration
// 0034 → /api/qualidade/certificados (confere o usuário).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface Certificado {
  nri: string | null; // "26-5097"
  descricao: string;
  tipo: string | null;
  fornecedor: string | null;
  recebido: string | null; // AAAA-MM-DD (planilha do Recebimento)
  codigo: string | null; // código do material no ERP
  arquivo: string; // caminho relativo do PDF na pasta
  modificado: string;
  na_planilha: boolean;
  // Tipo de certificado pelo conteúdo do PDF (ultrassom, LP, material…);
  // null = ainda não analisado (classificar_certificados.py, aos poucos).
  certificado?: string[] | null;
}

// Pasta: a principal (aba QUALIDADE) ou o backup (aba Backup Recebimento).
export type FonteCertificados = "principal" | "backup";

interface Notificacao {
  id: number;
  tipo: "adicionado" | "alterado" | "excluido" | "varios";
  nri: string | null;
  arquivo: string | null;
  descricao: string | null;
  criado_em: string;
}

const URL_API = "/api/qualidade/certificados";
const RECARREGAR_SINO_MS = 5 * 60 * 1000;
const chaveVisto = (fonte: FonteCertificados) =>
  fonte === "backup" ? "fcnexus.qualidade.backup.notificacoes.vistoAte" : "fcnexus.qualidade.notificacoes.vistoAte";
const SEM_ANALISE = "Analisando…";
const POR_PAGINA = 300;
const SEM_TIPO = "Outros";

const ROTULO_AVISO = {
  adicionado: { texto: "Adicionado", classe: "bg-green-600 text-white" },
  alterado: { texto: "Alterado", classe: "bg-amber-500 text-white" },
  excluido: { texto: "Excluído", classe: "bg-red-600 text-white" },
  varios: { texto: "Vários", classe: "bg-stone-600 text-white" },
} as const;

function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function data(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function lerVisto(chave: string): number {
  try {
    return Number(localStorage.getItem(chave) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function baixarCsv(itens: Certificado[]) {
  const linhas = [
    ["NRI", "Descrição", "Tipo", "Tipo de certificado", "Fornecedor", "Recebido", "Arquivo"],
    ...itens.map((i) => [
      i.nri ?? "",
      i.descricao,
      i.tipo ?? SEM_TIPO,
      i.certificado?.join(" + ") ?? "",
      i.fornecedor ?? "",
      data(i.recebido),
      i.arquivo,
    ]),
  ];
  const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificados-materia-prima-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Sino({
  lista,
  onAbrir,
  chave,
}: {
  lista: Notificacao[];
  onAbrir: (n: Notificacao) => void;
  chave: string;
}) {
  // Só monta no navegador (depois do login), então já dá pra ler o localStorage.
  const [vistoAte, setVistoAte] = useState(() => lerVisto(chave));
  const [destaqueAte, setDestaqueAte] = useState(() => lerVisto(chave));
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const naoVistas = lista.filter((n) => n.id > vistoAte).length;

  function alternar() {
    if (!aberto && lista.length) {
      const maior = Math.max(...lista.map((n) => n.id));
      try {
        localStorage.setItem(chave, String(maior));
      } catch {
        // sem localStorage: o número volta na próxima visita
      }
      setDestaqueAte(vistoAte);
      setVistoAte(maior);
    }
    setAberto((a) => !a);
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={alternar}
        title="PDFs adicionados, alterados ou excluídos na pasta de certificados (confere a cada 15 min)"
        aria-label="Notificações"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-700 hover:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-500"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" strokeLinejoin="round" />
          <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {naoVistas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
            {naoVistas > 99 ? "99+" : naoVistas}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 top-11 z-[58] max-h-[70vh] w-[28rem] max-w-[90vw] overflow-auto rounded-lg border border-stone-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <p className="sticky top-0 border-b border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-900 dark:border-slate-800 dark:bg-slate-900 dark:text-white">
            Pasta de certificados
          </p>
          {lista.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-stone-500 dark:text-slate-400">
              Nenhuma ainda. Aparecem aqui os PDFs adicionados, alterados ou excluídos (confere a cada 15 min).
            </p>
          ) : (
            lista.map((n) => (
              <button
                key={n.id}
                type="button"
                disabled={!n.nri}
                onClick={() => {
                  onAbrir(n);
                  setAberto(false);
                }}
                title={n.arquivo ?? undefined}
                className={`flex w-full items-start gap-2 border-b border-stone-100 px-3 py-1.5 text-left hover:bg-green-50 dark:border-slate-800 dark:hover:bg-cyan-950/30 ${n.id > destaqueAte ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}`}
              >
                <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${ROTULO_AVISO[n.tipo].classe}`}>
                  {ROTULO_AVISO[n.tipo].texto}
                </span>
                <span className="min-w-0 flex-1">
                  {n.nri && (
                    <span className="font-mono text-xs font-semibold text-stone-900 dark:text-white">NRI {n.nri}</span>
                  )}
                  <span className="block truncate text-xs text-stone-600 dark:text-slate-400">{n.descricao}</span>
                  <span className="block text-[10px] text-stone-400 dark:text-slate-500">
                    {new Date(n.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Baixar os PDFs (pedido do usuário: montar data book, escolhendo a pasta).
// Sob demanda: o PC da fábrica sobe o PDF quando pedido (/api/qualidade/pdf,
// scripts/servir_certificados.py). Chrome/Edge: o usuário escolhe a pasta uma
// vez e todos são gravados lá; outros navegadores: download normal.
const URL_PDF = "/api/qualidade/pdf";
const ESPERA_MAX_MS = 90_000;

interface PastaEscolhida {
  getFileHandle(nome: string, op: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}
type JanelaComPasta = Window & {
  showDirectoryPicker?: (op?: { id?: string; mode?: "readwrite" }) => Promise<PastaEscolhida>;
};

interface Progresso {
  total: number;
  salvos: number;
  erros: string[];
  fim?: string;
}

function nomeDoArquivo(arquivo: string): string {
  return arquivo.split("/").pop() ?? arquivo;
}

async function salvar(pasta: PastaEscolhida | null, nome: string, blob: Blob) {
  if (pasta) {
    const w = await (await pasta.getFileHandle(nome, { create: true })).createWritable();
    await w.write(blob);
    await w.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// Pede os PDFs ao PC da fábrica e chama aoPronto(arquivo, url assinada) pra cada
// um que chegar; devolve o progresso final (salvos = quantos aoPronto deu certo).
async function pedirPdfs(
  fonte: FonteCertificados,
  lista: Certificado[],
  aoAvancar: (p: Progresso) => void,
  aoPronto: (arquivo: string, url: string) => Promise<void>,
): Promise<{ p: Progresso; semResposta: number }> {
  const p: Progresso = { total: lista.length, salvos: 0, erros: [] };
  aoAvancar({ ...p });
  let corpo: { ids?: Record<string, number>; erro?: string } = {};
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(URL_PDF, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fonte, itens: lista.map((i) => ({ arquivo: i.arquivo, modificado: i.modificado })) }),
    });
    corpo = await r.json().catch(() => ({}));
    if (r.ok) break;
    // Erro passageiro do Supabase: mais uma tentativa (403 = sem acesso, não adianta).
    if (r.status === 403 || tentativa >= 2) throw new Error(corpo.erro ?? `Erro ${r.status}`);
    await new Promise((res) => setTimeout(res, 1500));
  }
  const faltam = new Map<number, string>(Object.entries(corpo.ids ?? {}).map(([a, id]) => [id, a]));
  const inicio = Date.now();
  while (faltam.size && Date.now() - inicio < ESPERA_MAX_MS) {
    const g = await fetch(`${URL_PDF}?ids=${[...faltam.keys()].join(",")}`, { cache: "no-store" });
    const st = (await g.json().catch(() => ({}))) as {
      pedidos?: { id: number; arquivo: string; status: string; erro: string | null; url: string | null }[];
    };
    for (const ped of st.pedidos ?? []) {
      if (ped.status === "erro") {
        p.erros.push(`${nomeDoArquivo(ped.arquivo)}: ${ped.erro ?? "erro"}`);
        faltam.delete(ped.id);
      } else if (ped.status === "pronto" && ped.url) {
        try {
          await aoPronto(ped.arquivo, ped.url);
          p.salvos++;
        } catch (e) {
          p.erros.push(`${nomeDoArquivo(ped.arquivo)}: ${e instanceof Error ? e.message : e}`);
        }
        faltam.delete(ped.id);
      }
      aoAvancar({ ...p, erros: [...p.erros] });
    }
    if (faltam.size) await new Promise((res) => setTimeout(res, 2000));
  }
  return { p, semResposta: faltam.size };
}

function textoSemResposta(n: number): string {
  return n ? ` ${n} não chegaram: o PC da fábrica precisa estar ligado e com o J: (tente de novo em instantes).` : "";
}

async function baixarPdfs(fonte: FonteCertificados, lista: Certificado[], aoAvancar: (p: Progresso) => void) {
  // Escolher a pasta tem que ser logo no clique (exigência do navegador).
  const escolher = (window as JanelaComPasta).showDirectoryPicker;
  let pasta: PastaEscolhida | null = null;
  if (escolher) {
    try {
      pasta = await escolher({ id: "certificados-databook", mode: "readwrite" });
    } catch {
      return; // cancelou a escolha da pasta
    }
  }
  const { p, semResposta } = await pedirPdfs(fonte, lista, aoAvancar, async (arquivo, url) => {
    const arq = await fetch(url);
    if (!arq.ok) throw new Error(`download ${arq.status}`);
    await salvar(pasta, nomeDoArquivo(arquivo), await arq.blob());
  });
  aoAvancar({
    ...p,
    erros: [...p.erros],
    fim: `${p.salvos} de ${p.total} PDF(s) salvos${pasta ? " na pasta escolhida" : ""}.${textoSemResposta(semResposta)}`,
  });
}

// Arrastar pro Acrobat (pedido do usuário: "Organizar páginas" → soltar o PDF
// dentro do programa aberto). Chrome/Edge: o "DownloadURL" no arraste vira um
// arquivo de verdade ao soltar fora do navegador. Como o navegador não espera
// o download no meio do arraste, o PDF é preparado antes (URL assinada de 1 h).
interface PdfPronto {
  arquivo: string;
  nri: string | null;
  url: string;
  expira: number;
  expirou?: boolean; // marcado ao tentar arrastar depois da validade
}
const VALIDADE_URL_MS = 55 * 60 * 1000; // a rota assina por 60 min

// false = o link já venceu (o arraste é cancelado).
function arrastarPdf(e: React.DragEvent, pdf: PdfPronto): boolean {
  if (Date.now() > pdf.expira) {
    e.preventDefault();
    return false;
  }
  e.dataTransfer.effectAllowed = "copy";
  e.dataTransfer.setData("DownloadURL", `application/pdf:${nomeDoArquivo(pdf.arquivo)}:${pdf.url}`);
  e.dataTransfer.setData("text/uri-list", pdf.url);
  return true;
}

interface Resposta {
  itens: Certificado[] | null;
  gerado_em: string | null;
  notificacoes: Notificacao[];
}

async function buscar(fonte: FonteCertificados, soNotificacoes: boolean): Promise<Resposta> {
  // Mais uma tentativa aqui se o servidor ainda devolver o erro passageiro do
  // Supabase ("JWT issued at future"), igual ao Financeiro.
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(`${URL_API}?fonte=${fonte}${soNotificacoes ? "&so_notificacoes=1" : ""}`, {
      cache: "no-store",
    });
    const corpo = await r.json().catch(() => ({}));
    if (r.ok) return corpo as Resposta;
    if (r.status === 403 || tentativa >= 2) throw new Error(corpo.erro ?? `Erro ${r.status}`);
    await new Promise((res) => setTimeout(res, 1500));
  }
}

// fonte/titulo/descricao: a mesma tela serve a aba QUALIDADE (pasta principal)
// e a aba Backup Recebimento (pasta BACKUP RECEBIMENTO 20260828).
export default function Qualidade({
  fonte = "principal",
  titulo = "Certificados de matéria-prima",
  descricao = "Pasta do Recebimento ordenada pelo NRI",
}: {
  fonte?: FonteCertificados;
  titulo?: string;
  descricao?: string;
}) {
  const [itens, setItens] = useState<Certificado[] | null>(null);
  const [geradoEm, setGeradoEm] = useState<string | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  const [tipoCert, setTipoCert] = useState<string | null>(null);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const baixando = !!progresso && !progresso.fim;
  const [bandeja, setBandeja] = useState<PdfPronto[]>([]);
  const maiorAviso = useRef(0);

  const aplicar = useCallback((d: Resposta) => {
    setNotificacoes(d.notificacoes ?? []);
    if (d.itens) {
      setItens(d.itens);
      setGeradoEm(d.gerado_em);
      maiorAviso.current = d.notificacoes?.[0]?.id ?? 0;
    }
  }, []);

  useEffect(() => {
    buscar(fonte, false)
      .then(aplicar)
      .catch((e) => setErro(String(e.message ?? e)));
    // Sininho: só os avisos a cada 5 min; aviso novo → relê a lista uma vez.
    const id = setInterval(() => {
      buscar(fonte, true)
        .then((d) => {
          aplicar(d);
          if ((d.notificacoes?.[0]?.id ?? 0) > maiorAviso.current) return buscar(fonte, false).then(aplicar);
        })
        .catch(() => {}); // sininho não atrapalha a tela se falhar
    }, RECARREGAR_SINO_MS);
    return () => clearInterval(id);
  }, [aplicar, fonte]);

  const contagem = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of itens ?? []) c.set(i.tipo ?? SEM_TIPO, (c.get(i.tipo ?? SEM_TIPO) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);

  const contagemCert = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of itens ?? []) for (const t of i.certificado ?? [SEM_ANALISE]) c.set(t, (c.get(t) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);

  const filtrados = useMemo(() => {
    const termos = semAcento(busca).split(/\s+/).filter(Boolean);
    return (itens ?? []).filter((i) => {
      if (tipo && (i.tipo ?? SEM_TIPO) !== tipo) return false;
      if (tipoCert && !(i.certificado ?? [SEM_ANALISE]).includes(tipoCert)) return false;
      if (!termos.length) return true;
      const texto = semAcento(
        `${i.nri ?? ""} ${i.descricao} ${i.fornecedor ?? ""} ${i.codigo ?? ""} ${i.arquivo} ${i.certificado?.join(" ") ?? ""}`,
      );
      return termos.every((t) => texto.includes(t));
    });
  }, [itens, busca, tipo, tipoCert]);

  function alternarSelecao(arquivo: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(arquivo)) n.delete(arquivo);
      else n.add(arquivo);
      return n;
    });
  }

  function preparar(lista: Certificado[]) {
    if (!lista.length || baixando) return;
    const nri = new Map(lista.map((i) => [i.arquivo, i.nri]));
    const chegaram: PdfPronto[] = [];
    pedirPdfs(fonte, lista, setProgresso, async (arquivo, url) => {
      chegaram.push({ arquivo, nri: nri.get(arquivo) ?? null, url, expira: Date.now() + VALIDADE_URL_MS });
    })
      .then(({ p, semResposta }) => {
        // Na ordem da lista (a da tabela), sem repetir o que já estava na bandeja.
        const ordem = lista.map((i) => i.arquivo);
        chegaram.sort((a, b) => ordem.indexOf(a.arquivo) - ordem.indexOf(b.arquivo));
        setBandeja((b) => [...b.filter((x) => !chegaram.some((c) => c.arquivo === x.arquivo)), ...chegaram]);
        setProgresso({
          ...p,
          fim: `${p.salvos} de ${p.total} PDF(s) prontos na bandeja: arraste cada um pro Acrobat ou pra uma pasta.${textoSemResposta(semResposta)}`,
        });
      })
      .catch((e) =>
        setProgresso({ total: lista.length, salvos: 0, erros: [], fim: `Erro: ${e instanceof Error ? e.message : e}` }),
      );
  }

  function baixar(lista: Certificado[]) {
    if (!lista.length || baixando) return;
    baixarPdfs(fonte, lista, setProgresso).catch((e) =>
      setProgresso({ total: lista.length, salvos: 0, erros: [], fim: `Erro: ${e instanceof Error ? e.message : e}` }),
    );
  }

  const visiveis = filtrados.slice(0, limite);
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((i) => selecionados.has(i.arquivo));

  if (erro)
    return <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="text-lg font-extrabold tracking-wide text-stone-900 dark:text-white">
            {titulo}
          </h2>
          <p className="text-xs text-stone-500 dark:text-slate-400">
            {descricao} · descrição pela planilha de recebimento · tipo de certificado lido no PDF · atualiza a cada 15 min
            {geradoEm &&
              ` · última mudança ${new Date(geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
          </p>
        </div>
        <button
          type="button"
          disabled={!filtrados.length}
          onClick={() => baixarCsv(filtrados)}
          className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:border-green-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-cyan-500"
        >
          ⬇ Baixar lista (CSV)
        </button>
        <Sino
          chave={chaveVisto(fonte)}
          lista={notificacoes}
          onAbrir={(n) => {
            setTipo(null);
            setBusca(n.nri ?? "");
            setLimite(POR_PAGINA);
          }}
        />
      </div>

      <input
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setLimite(POR_PAGINA);
        }}
        placeholder="Buscar por NRI, descrição, fornecedor ou código…"
        className="h-11 w-full rounded-xl border-2 border-stone-300 bg-white px-3 text-base text-stone-900 outline-none focus:border-green-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
      />

      {itens && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setTipo(null);
              setLimite(POR_PAGINA);
            }}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tipo === null ? "border-green-700 bg-green-700 text-white dark:border-cyan-600 dark:bg-cyan-600" : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"}`}
          >
            Todos <span className="font-mono">{itens.length}</span>
          </button>
          {contagem.map(([t, n]) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTipo(tipo === t ? null : t);
                setLimite(POR_PAGINA);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tipo === t ? "border-green-700 bg-green-700 text-white dark:border-cyan-600 dark:bg-cyan-600" : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"}`}
            >
              {t} <span className="font-mono">{n}</span>
            </button>
          ))}
        </div>
      )}
      {itens && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold uppercase text-stone-500 dark:text-slate-400">Certificado:</span>
          {contagemCert.map(([t, n]) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTipoCert(tipoCert === t ? null : t);
                setLimite(POR_PAGINA);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tipoCert === t ? "border-sky-700 bg-sky-700 text-white" : "border-sky-300 text-sky-800 dark:border-sky-700 dark:text-sky-300"}`}
            >
              {t} <span className="font-mono">{n}</span>
            </button>
          ))}
        </div>
      )}

      {!itens ? (
        <p className="py-8 text-center text-sm text-stone-500 dark:text-slate-400">Carregando certificados…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-xs text-stone-500 dark:text-slate-400">
              {filtrados.length} certificado(s){filtrados.length > limite && ` · mostrando ${limite}`}
            </p>
            {selecionados.size > 0 && (
              <button
                type="button"
                onClick={() => setSelecionados(new Set())}
                className="text-xs font-semibold text-stone-500 underline dark:text-slate-400"
              >
                limpar seleção
              </button>
            )}
            <button
              type="button"
              disabled={!selecionados.size || baixando}
              onClick={() => baixar((itens ?? []).filter((i) => selecionados.has(i.arquivo)))}
              title="Escolha a pasta (ex.: a do data book) e os PDFs são salvos lá"
              className="h-9 rounded-lg bg-green-700 px-3 text-sm font-bold text-white disabled:opacity-40 dark:bg-cyan-600"
            >
              ⬇ Baixar PDFs selecionados ({selecionados.size})
            </button>
            <button
              type="button"
              disabled={!selecionados.size || baixando}
              onClick={() => preparar((itens ?? []).filter((i) => selecionados.has(i.arquivo)))}
              title="Prepara os PDFs pra arrastar direto pro Acrobat (Organizar páginas) ou pra uma pasta — Chrome/Edge"
              className="h-9 rounded-lg border-2 border-green-700 px-3 text-sm font-bold text-green-800 disabled:opacity-40 dark:border-cyan-500 dark:text-cyan-300"
            >
              ✋ Preparar pra arrastar ({selecionados.size})
            </button>
          </div>
          {bandeja.length > 0 && (
            <div className="rounded-xl border-2 border-dashed border-green-600 bg-green-50/60 p-3 dark:border-cyan-600 dark:bg-cyan-950/20">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="mr-auto text-sm font-bold text-stone-900 dark:text-white">
                  Bandeja · arraste cada PDF pro Acrobat (Organizar páginas) ou pra uma pasta
                </p>
                <button
                  type="button"
                  onClick={() => setBandeja([])}
                  className="text-xs font-semibold text-stone-500 underline dark:text-slate-400"
                >
                  esvaziar bandeja
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {bandeja.map((pdf) => {
                  const expirou = !!pdf.expirou;
                  return (
                    <div
                      key={pdf.arquivo}
                      draggable={!expirou}
                      onDragStart={(e) => {
                        if (!arrastarPdf(e, pdf))
                          setBandeja((b) => b.map((x) => (x.arquivo === pdf.arquivo ? { ...x, expirou: true } : x)));
                      }}
                      title={expirou ? "O link expirou (1 h): prepare de novo" : `Arraste ${nomeDoArquivo(pdf.arquivo)}`}
                      className={`flex select-none items-center gap-2 rounded-lg border bg-white px-3 py-2 shadow-sm dark:bg-slate-900 ${expirou ? "cursor-not-allowed border-stone-300 opacity-50 dark:border-slate-700" : "cursor-grab border-green-600 active:cursor-grabbing dark:border-cyan-500"}`}
                    >
                      <span className="text-xl" aria-hidden>
                        📄
                      </span>
                      <span className="leading-tight">
                        <span className="block font-mono text-sm font-bold text-stone-900 dark:text-white">
                          {pdf.nri ? `NRI ${pdf.nri}` : nomeDoArquivo(pdf.arquivo)}
                        </span>
                        <span className="block text-[10px] text-stone-500 dark:text-slate-400">
                          {expirou ? "expirou — prepare de novo" : "arraste"}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setBandeja((b) => b.filter((x) => x.arquivo !== pdf.arquivo))}
                        aria-label="Tirar da bandeja"
                        className="ml-1 text-xs text-stone-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {progresso && (
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${progresso.fim ? (progresso.erros.length || progresso.salvos < progresso.total ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" : "border-green-500 bg-green-50 text-green-900 dark:bg-green-950/30 dark:text-green-200") : "border-sky-400 bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200"}`}
            >
              <div className="flex items-start gap-2">
                <p className="mr-auto">
                  {progresso.fim ??
                    `Buscando os PDFs no J: da fábrica… ${progresso.salvos} de ${progresso.total} salvo(s)`}
                </p>
                {progresso.fim && (
                  <button type="button" onClick={() => setProgresso(null)} className="text-xs font-bold" aria-label="Fechar">
                    ✕
                  </button>
                )}
              </div>
              {progresso.erros.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {progresso.erros.slice(0, 10).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-stone-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 text-left text-xs uppercase text-stone-600 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="w-8 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={todosVisiveisMarcados}
                      onChange={() =>
                        setSelecionados((s) => {
                          const n = new Set(s);
                          for (const i of visiveis) {
                            if (todosVisiveisMarcados) n.delete(i.arquivo);
                            else n.add(i.arquivo);
                          }
                          return n;
                        })
                      }
                      title="Marcar/desmarcar os que estão na tela"
                      aria-label="Marcar todos da tela"
                      className="h-4 w-4 accent-green-700"
                    />
                  </th>
                  <th className="px-3 py-2">NRI</th>
                  <th className="px-3 py-2">Descrição / produto</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Certificado</th>
                  <th className="hidden px-3 py-2 md:table-cell">Fornecedor</th>
                  <th className="hidden px-3 py-2 sm:table-cell">Recebido</th>
                  <th className="px-2 py-2 text-center">PDF</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((i) => (
                  <tr
                    key={i.arquivo}
                    title={i.arquivo}
                    className={`border-t border-stone-100 dark:border-slate-800 ${selecionados.has(i.arquivo) ? "bg-green-50 dark:bg-cyan-950/30" : "bg-white dark:bg-slate-950"}`}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={selecionados.has(i.arquivo)}
                        onChange={() => alternarSelecao(i.arquivo)}
                        aria-label={`Selecionar NRI ${i.nri ?? i.arquivo}`}
                        className="h-4 w-4 accent-green-700"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono font-bold text-stone-900 dark:text-white">
                      {i.nri ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-stone-800 dark:text-slate-200">
                      {i.descricao}
                      {!i.na_planilha && (
                        <span className="ml-1.5 rounded border border-amber-500 px-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                          fora da planilha
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-stone-700 dark:text-slate-300">
                      {i.tipo ?? <span className="text-stone-400 dark:text-slate-500">{SEM_TIPO}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {i.certificado ? (
                        <span className="flex flex-wrap gap-1">
                          {i.certificado.map((t) => (
                            <span
                              key={t}
                              className="whitespace-nowrap rounded bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-900 dark:bg-sky-950/60 dark:text-sky-200"
                            >
                              {t}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-stone-400 dark:text-slate-500">{SEM_ANALISE}</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-1.5 text-xs text-stone-600 md:table-cell dark:text-slate-400">
                      {i.fornecedor}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-1.5 text-xs text-stone-600 sm:table-cell dark:text-slate-400">
                      {data(i.recebido)}
                    </td>
                    <td className="px-2 py-1 text-center">
                      <button
                        type="button"
                        disabled={baixando}
                        onClick={() => baixar([i])}
                        title={`Baixar ${nomeDoArquivo(i.arquivo)} (escolha a pasta)`}
                        aria-label={`Baixar PDF do NRI ${i.nri ?? i.arquivo}`}
                        className="rounded-md border border-stone-300 px-2 py-0.5 text-sm hover:border-green-600 disabled:opacity-40 dark:border-slate-700 dark:hover:border-cyan-500"
                      >
                        ⬇
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtrados.length > limite && (
            <button
              type="button"
              onClick={() => setLimite((l) => l + POR_PAGINA)}
              className="mx-auto h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-700 dark:border-slate-700 dark:text-slate-300"
            >
              Mostrar mais {Math.min(POR_PAGINA, filtrados.length - limite)}
            </button>
          )}
        </>
      )}
    </div>
  );
}
