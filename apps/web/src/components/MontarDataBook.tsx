"use client";

// Montar data book — pedido do usuário (09/10/2026): em vez de arrastar o
// certificado pro Acrobat (ele recebia o link, não o arquivo), uma tela no
// próprio programa igual ao "Organizar páginas": miniaturas das páginas,
// abrir o PDF do data book que está no computador, arrastar os certificados
// selecionados pra entre as páginas, reordenar, girar, apagar, ver grande e
// salvar o PDF final onde quiser.
// Tudo no navegador: PDF.js desenha as miniaturas (worker em
// public/pdf.worker.min.mjs) e o pdf-lib monta o arquivo. Os certificados vêm
// sob demanda do PC da fábrica (lib/certificadosPdf.ts::pedirPdfs).

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  nomeDoArquivo,
  pedirPdfs,
  textoSemResposta,
  type Certificado,
  type FonteCertificados,
  type Progresso,
} from "@/lib/certificadosPdf";

interface Documento {
  id: string;
  nome: string;
  bytes: Uint8Array; // original, pro pdf-lib
  doc: PDFDocumentProxy; // pro PDF.js (miniaturas)
  paginas: number;
}

interface Pagina {
  id: string;
  docId: string;
  indice: number; // 0 = 1ª página do documento de origem
  rotacao: number; // 0/90/180/270 a mais do que a página já tem
}

interface EstadoCert {
  estado: "pedindo" | "pronto" | "erro";
  docId?: string;
  paginas?: number;
  erro?: string;
}

const TIPO_PAGINA = "application/x-fcnexus-pagina";
const TIPO_CERT = "application/x-fcnexus-certificado";
const LARGURA_MINI = 150;

let pdfjsCarregando: Promise<typeof import("pdfjs-dist")> | null = null;
function carregarPdfjs() {
  if (!pdfjsCarregando) {
    pdfjsCarregando = import("pdfjs-dist").then((m) => {
      m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return m;
    });
  }
  return pdfjsCarregando;
}

async function abrirDocumento(nome: string, bytes: Uint8Array): Promise<Documento> {
  const pdfjs = await carregarPdfjs();
  // O PDF.js fica com o buffer que recebe: passa uma cópia e guarda o original.
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  return { id: crypto.randomUUID(), nome, bytes, doc, paginas: doc.numPages };
}

function paginasDe(d: Documento): Pagina[] {
  return Array.from({ length: d.paginas }, (_, i) => ({ id: crypto.randomUUID(), docId: d.id, indice: i, rotacao: 0 }));
}

// Desenha uma página num canvas (só quando aparece na tela).
function Miniatura({ doc, indice, rotacao, largura }: { doc: PDFDocumentProxy; indice: number; rotacao: number; largura: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setVisivel(true), { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!visivel) return;
    let tarefa: RenderTask | null = null;
    let cancelado = false;
    doc.getPage(indice + 1).then((pg) => {
      if (cancelado || !canvas.current) return;
      const giro = (pg.rotate + rotacao) % 360;
      const base = pg.getViewport({ scale: 1, rotation: giro });
      const escala = (largura * (window.devicePixelRatio || 1)) / base.width;
      const vp = pg.getViewport({ scale: escala, rotation: giro });
      const c = canvas.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      tarefa = pg.render({ canvasContext: ctx, viewport: vp });
      tarefa.promise.catch(() => {}); // cancelado ao trocar a rotação
    });
    return () => {
      cancelado = true;
      tarefa?.cancel();
    };
  }, [visivel, doc, indice, rotacao, largura]);

  return <canvas ref={canvas} style={{ width: largura }} className="block bg-white shadow" />;
}

async function salvarPdf(nome: string, bytes: Uint8Array) {
  const arquivo = nome.toLowerCase().endsWith(".pdf") ? nome : `${nome}.pdf`;
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const escolher = (
    window as Window & {
      showSaveFilePicker?: (op: unknown) => Promise<{
        createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>;
      }>;
    }
  ).showSaveFilePicker;
  if (escolher) {
    const h = await escolher({
      suggestedName: arquivo,
      id: "certificados-databook",
      types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
    });
    const w = await h.createWritable();
    await w.write(blob);
    await w.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function MontarDataBook({
  fonte,
  certificados: selecionados,
  onFechar,
}: {
  fonte: FonteCertificados;
  certificados: Certificado[];
  onFechar: () => void;
}) {
  // A lista de trás muda (sininho, busca): fica a seleção de quando a tela abriu.
  const [certificados] = useState(selecionados);
  const [docs, setDocs] = useState<Record<string, Documento>>({});
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [certs, setCerts] = useState<Record<string, EstadoCert>>(() =>
    Object.fromEntries(certificados.map((c) => [c.arquivo, { estado: "pedindo" as const }])),
  );
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null); // onde a página/certificado vai entrar
  const [ampliada, setAmpliada] = useState<Pagina | null>(null);
  const [nome, setNome] = useState("Data book");
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const arquivoInput = useRef<HTMLInputElement>(null);

  // Pede os certificados selecionados ao PC da fábrica assim que a tela abre.
  useEffect(() => {
    if (!certificados.length) return;
    let ativo = true;
    pedirPdfs(fonte, certificados, (p) => ativo && setProgresso(p), async (arquivo, url) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`download ${r.status}`);
      const d = await abrirDocumento(nomeDoArquivo(arquivo), new Uint8Array(await r.arrayBuffer()));
      if (!ativo) return;
      setDocs((x) => ({ ...x, [d.id]: d }));
      setCerts((x) => ({ ...x, [arquivo]: { estado: "pronto", docId: d.id, paginas: d.paginas } }));
    })
      .then(({ p, semResposta }) => {
        if (!ativo) return;
        setCerts((x) => {
          const n = { ...x };
          for (const k of Object.keys(n)) if (n[k].estado === "pedindo") n[k] = { estado: "erro", erro: "não chegou" };
          return n;
        });
        setProgresso({ ...p, fim: `${p.salvos} de ${p.total} certificado(s) prontos.${textoSemResposta(semResposta)}` });
      })
      .catch((e) => ativo && setProgresso({ total: certificados.length, salvos: 0, erros: [], fim: `Erro: ${e.message ?? e}` }));
    return () => {
      ativo = false;
    };
  }, [fonte, certificados]);

  // Esc fecha a página ampliada.
  useEffect(() => {
    if (!ampliada) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAmpliada(null);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ampliada]);

  function inserir(novas: Pagina[], posicao: number | null) {
    setPaginas((ps) => {
      const i = posicao === null ? ps.length : Math.max(0, Math.min(posicao, ps.length));
      return [...ps.slice(0, i), ...novas, ...ps.slice(i)];
    });
  }

  async function abrirArquivos(arquivos: File[], posicao: number | null) {
    const pdfs = arquivos.filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) {
      setAviso("Só arquivos PDF.");
      return;
    }
    let pos = posicao;
    for (const f of pdfs) {
      try {
        const d = await abrirDocumento(f.name, new Uint8Array(await f.arrayBuffer()));
        setDocs((x) => ({ ...x, [d.id]: d }));
        const novas = paginasDe(d);
        inserir(novas, pos);
        if (pos !== null) pos += novas.length;
      } catch (e) {
        setAviso(`Não consegui abrir ${f.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  function inserirCertificado(arquivo: string, posicao: number | null) {
    const c = certs[arquivo];
    const d = c?.docId ? docs[c.docId] : null;
    if (d) inserir(paginasDe(d), posicao);
  }

  function mover(id: string, posicao: number) {
    setPaginas((ps) => {
      const de = ps.findIndex((p) => p.id === id);
      if (de < 0) return ps;
      const resto = ps.filter((p) => p.id !== id);
      const para = posicao > de ? posicao - 1 : posicao;
      return [...resto.slice(0, para), ps[de], ...resto.slice(para)];
    });
  }

  function soltar(e: React.DragEvent) {
    e.preventDefault();
    const pos = alvo ?? paginas.length;
    setAlvo(null);
    const pagina = e.dataTransfer.getData(TIPO_PAGINA);
    const cert = e.dataTransfer.getData(TIPO_CERT);
    if (pagina) mover(pagina, pos);
    else if (cert) inserirCertificado(cert, pos);
    else if (e.dataTransfer.files.length) abrirArquivos([...e.dataTransfer.files], pos);
  }

  function sobrePagina(e: React.DragEvent, i: number) {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAlvo(e.clientX < r.left + r.width / 2 ? i : i + 1);
  }

  async function salvar() {
    if (!paginas.length) return;
    setSalvando(true);
    setAviso(null);
    try {
      const { PDFDocument, degrees } = await import("pdf-lib");
      const saida = await PDFDocument.create();
      const origens = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>();
      for (const p of paginas) {
        let origem = origens.get(p.docId);
        if (!origem) {
          origem = await PDFDocument.load(docs[p.docId].bytes, { ignoreEncryption: true });
          origens.set(p.docId, origem);
        }
        const [copia] = await saida.copyPages(origem, [p.indice]);
        if (p.rotacao) copia.setRotation(degrees((copia.getRotation().angle + p.rotacao) % 360));
        saida.addPage(copia);
      }
      await salvarPdf(nome.trim() || "Data book", await saida.save());
      setAviso(`PDF salvo com ${paginas.length} página(s).`);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setAviso(`Não consegui salvar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSalvando(false);
    }
  }

  function fechar() {
    if (paginas.length && !window.confirm("Fechar a montagem? As páginas que não foram salvas se perdem.")) return;
    onFechar();
  }

  const docAmpliado = ampliada ? docs[ampliada.docId] : null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-stone-100 dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-300 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="mr-2 text-lg font-extrabold text-stone-900 dark:text-white">📚 Montar data book</h2>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label="Nome do arquivo"
          className="h-9 w-56 rounded-lg border border-stone-300 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"
        />
        <span className="text-xs text-stone-500 dark:text-slate-400">.pdf · {paginas.length} página(s)</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => arquivoInput.current?.click()}
            className="h-9 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700 hover:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            📂 Abrir PDF do computador
          </button>
          <input
            ref={arquivoInput}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              abrirArquivos([...(e.target.files ?? [])], null);
              e.target.value = "";
            }}
          />
          {paginas.length > 0 && (
            <button
              type="button"
              onClick={() => window.confirm("Tirar todas as páginas?") && setPaginas([])}
              className="h-9 rounded-lg border border-stone-300 px-3 text-sm font-semibold text-stone-600 dark:border-slate-700 dark:text-slate-300"
            >
              Limpar
            </button>
          )}
          <button
            type="button"
            disabled={!paginas.length || salvando}
            onClick={salvar}
            className="h-9 rounded-lg bg-green-700 px-4 text-sm font-bold text-white disabled:opacity-40 dark:bg-cyan-600"
          >
            {salvando ? "Salvando…" : "💾 Salvar PDF"}
          </button>
          <button
            type="button"
            onClick={fechar}
            className="h-9 rounded-lg border border-stone-400 px-3 text-sm font-semibold text-stone-700 dark:border-slate-600 dark:text-slate-200"
          >
            Fechar
          </button>
        </div>
        {aviso && <p className="w-full text-sm text-amber-700 dark:text-amber-300">{aviso}</p>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="max-h-56 shrink-0 overflow-y-auto border-b border-stone-300 bg-white p-3 md:max-h-none md:w-72 md:border-b-0 md:border-r dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-1 text-sm font-bold text-stone-900 dark:text-white">Certificados selecionados</p>
          <p className="mb-2 text-xs text-stone-500 dark:text-slate-400">
            Arraste pra entre as páginas, ou ➕ pra pôr no fim.
            {progresso && !progresso.fim && ` Buscando no J:… ${progresso.salvos} de ${progresso.total}`}
            {progresso?.fim && ` ${progresso.fim}`}
          </p>
          {!certificados.length && (
            <p className="rounded-lg border border-dashed border-stone-300 p-3 text-xs text-stone-500 dark:border-slate-700 dark:text-slate-400">
              Nenhum selecionado. Feche, marque os certificados na lista e abra de novo — ou abra/arraste PDFs do
              computador direto nas páginas.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {certificados.map((c) => {
              const st = certs[c.arquivo] ?? { estado: "pedindo" };
              const pronto = st.estado === "pronto";
              return (
                <div
                  key={c.arquivo}
                  draggable={pronto}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData(TIPO_CERT, c.arquivo);
                  }}
                  title={c.arquivo}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${pronto ? "cursor-grab border-green-600 bg-green-50 active:cursor-grabbing dark:border-cyan-600 dark:bg-cyan-950/30" : "border-stone-200 dark:border-slate-700"}`}
                >
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block font-mono text-sm font-bold text-stone-900 dark:text-white">
                      {c.nri ? `NRI ${c.nri}` : nomeDoArquivo(c.arquivo)}
                    </span>
                    <span className="block truncate text-[11px] text-stone-600 dark:text-slate-400">{c.descricao}</span>
                    <span className="block text-[10px] text-stone-500 dark:text-slate-500">
                      {st.estado === "pedindo"
                        ? "buscando no J:…"
                        : st.estado === "erro"
                          ? `erro: ${st.erro ?? ""}`
                          : `${st.paginas} página(s)`}
                    </span>
                  </span>
                  {pronto && (
                    <button
                      type="button"
                      onClick={() => inserirCertificado(c.arquivo, null)}
                      title="Pôr no fim do data book"
                      className="rounded border border-green-700 px-1.5 text-sm font-bold text-green-800 dark:border-cyan-500 dark:text-cyan-300"
                    >
                      ➕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        <main
          className="min-h-0 flex-1 overflow-y-auto p-4"
          onDragOver={(e) => {
            e.preventDefault();
            if (e.target === e.currentTarget) setAlvo(paginas.length);
          }}
          onDragLeave={(e) => e.target === e.currentTarget && setAlvo(null)}
          onDrop={soltar}
        >
          {!paginas.length ? (
            <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 rounded-2xl border-4 border-dashed border-stone-300 text-center text-stone-500 dark:border-slate-700 dark:text-slate-400">
              <p className="text-lg font-bold">Arraste aqui o PDF do data book (ou clique em 📂 Abrir PDF do computador)</p>
              <p className="text-sm">e depois os certificados da esquerda, entre as páginas que quiser.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-start gap-x-3 gap-y-5">
              {paginas.map((p, i) => {
                const d = docs[p.docId];
                return (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData(TIPO_PAGINA, p.id);
                    }}
                    onDragOver={(e) => sobrePagina(e, i)}
                    onDrop={soltar}
                    className="group relative flex cursor-grab flex-col items-center gap-1 active:cursor-grabbing"
                    style={{ width: LARGURA_MINI + 12 }}
                  >
                    {alvo === i && <span className="absolute -left-2 top-0 h-full w-1 rounded bg-green-600 dark:bg-cyan-400" />}
                    {alvo === i + 1 && i === paginas.length - 1 && (
                      <span className="absolute -right-2 top-0 h-full w-1 rounded bg-green-600 dark:bg-cyan-400" />
                    )}
                    <button
                      type="button"
                      onClick={() => setAmpliada(p)}
                      title={`${d?.nome ?? ""} — página ${p.indice + 1} (clique pra ver grande)`}
                      className="rounded border-2 border-transparent p-0.5 hover:border-green-600 dark:hover:border-cyan-500"
                    >
                      {d && <Miniatura doc={d.doc} indice={p.indice} rotacao={p.rotacao} largura={LARGURA_MINI} />}
                    </button>
                    <span className="text-xs font-semibold text-stone-700 dark:text-slate-300">{i + 1}</span>
                    <span className="w-full truncate text-center text-[10px] text-stone-500 dark:text-slate-500">{d?.nome}</span>
                    <span className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                      {(
                        [
                          ["⟲", "Girar pra esquerda", () => setPaginas((ps) => ps.map((x) => (x.id === p.id ? { ...x, rotacao: (x.rotacao + 270) % 360 } : x)))],
                          ["⟳", "Girar pra direita", () => setPaginas((ps) => ps.map((x) => (x.id === p.id ? { ...x, rotacao: (x.rotacao + 90) % 360 } : x)))],
                          ["🗑", "Tirar esta página", () => setPaginas((ps) => ps.filter((x) => x.id !== p.id))],
                        ] as const
                      ).map(([icone, dica, acao]) => (
                        <button
                          key={dica}
                          type="button"
                          onClick={acao}
                          title={dica}
                          aria-label={dica}
                          className="flex h-7 w-7 items-center justify-center rounded bg-white/90 text-sm shadow hover:bg-white dark:bg-slate-800/90"
                        >
                          {icone}
                        </button>
                      ))}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {ampliada && docAmpliado && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setAmpliada(null)}
        >
          <div className="max-h-full overflow-auto" onClick={(e) => e.stopPropagation()}>
            <Miniatura
              doc={docAmpliado.doc}
              indice={ampliada.indice}
              rotacao={ampliada.rotacao}
              largura={Math.min(900, typeof window !== "undefined" ? window.innerWidth - 64 : 900)}
            />
          </div>
          <button
            type="button"
            onClick={() => setAmpliada(null)}
            className="absolute right-4 top-4 rounded-lg bg-white px-3 py-1 text-sm font-bold text-stone-800"
          >
            ✕ Fechar (Esc)
          </button>
        </div>
      )}
    </div>
  );
}
