"use client";

// Anexar imagem na coluna Foto do Follow up — pedido explícito do usuário:
// clicar e colar (Ctrl+V) uma imagem copiada. Também aceita escolher um
// arquivo ou arrastar. Envia na hora; a janela fecha quando termina.

import { useCallback, useEffect, useRef, useState } from "react";
import { enviarImagemFollowUp } from "@/lib/api";
import type { ItemFollowUp } from "@/lib/types";

// --- Achar a imagem no que foi colado/arrastado --------------------------------
// Problema real relatado ("anexo e não vai"): dependendo de onde a imagem é
// copiada (Excel, Explorer do Windows, e-mail, navegador), ela chega à página
// como arquivo sem tipo, como <img> dentro de HTML, ou só como link — não
// como "image/png". Aqui se tenta tudo isso antes de desistir.

const EXTENSOES_IMAGEM = /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i;

function ehArquivoDeImagem(b: Blob): boolean {
  return b instanceof File && EXTENSOES_IMAGEM.test(b.name);
}

async function imagemDeHtml(html: string): Promise<Blob | null> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const img of doc.querySelectorAll("img")) {
    const src = img.getAttribute("src") ?? "";
    if (!/^(data:image\/|https?:)/i.test(src)) continue; // file:/// (Office) o navegador não deixa ler
    try {
      const blob = await (await fetch(src)).blob();
      if (blob.type.startsWith("image/")) return blob;
    } catch {
      // site de origem não permite baixar (CORS) — tenta a próxima
    }
  }
  return null;
}

async function imagemDoTransfer(dt: DataTransfer): Promise<{ imagem: Blob | null; tipos: string[] }> {
  // Tudo lido ANTES do primeiro await: depois dele o navegador bloqueia o
  // acesso ao conteúdo colado/arrastado.
  const tipos = [...new Set([...dt.types, ...[...dt.items].map((i) => i.type || i.kind)])];
  const porItem = [...dt.items].find((i) => i.kind === "file" && i.type.startsWith("image/"))?.getAsFile();
  const arquivo = [...dt.files].find((f) => f.type.startsWith("image/") || EXTENSOES_IMAGEM.test(f.name));
  const html = dt.getData("text/html");
  const link = (dt.getData("text/uri-list") || dt.getData("text/plain")).trim();

  if (porItem) return { imagem: porItem, tipos };
  if (arquivo) return { imagem: arquivo, tipos };
  if (html) {
    const img = await imagemDeHtml(html);
    if (img) return { imagem: img, tipos };
  }
  if (/^https?:\/\/\S+$/i.test(link)) {
    const img = await imagemDeHtml(`<img src="${link.replace(/"/g, "")}">`);
    if (img) return { imagem: img, tipos };
  }
  return { imagem: null, tipos };
}

function mensagemSemImagem(tipos: string[]): string {
  const conteudo = tipos.length ? tipos.join(", ") : "nada";
  if (tipos.some((t) => t.includes("html")))
    return `O que foi copiado não trouxe a imagem em si (veio: ${conteudo}). Se copiou do Excel/Word/e-mail, clique com o botão direito NA IMAGEM → "Copiar" (não a célula), ou salve a imagem e use "Escolher arquivo".`;
  return `A área de transferência não tem imagem (veio: ${conteudo}). Copie a imagem (print com Win+Shift+S, ou botão direito → Copiar imagem) e cole de novo.`;
}

export default function FollowUpAnexarImagem({
  item,
  enviadaPor,
  onEnviada,
  onFechar,
}: {
  item: ItemFollowUp;
  enviadaPor: string | null;
  onEnviada: (atualizado: ItemFollowUp) => void;
  onFechar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const enviar = useCallback(
    async (imagem: Blob) => {
      if (!imagem.type.startsWith("image/") && !ehArquivoDeImagem(imagem)) {
        setErro("Isso não é uma imagem. Copie uma imagem (print, foto) e cole aqui.");
        return;
      }
      setEnviando(true);
      setErro("");
      try {
        onEnviada(await enviarImagemFollowUp(item.id, imagem, enviadaPor));
        onFechar();
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setEnviando(false);
      }
    },
    [item.id, enviadaPor, onEnviada, onFechar],
  );

  // Botão "Colar": lê a área de transferência pela API do navegador — serve
  // quando o Ctrl+V não chega na página (foco em outro lugar etc.).
  async function colarPeloBotao() {
    setErro("");
    if (!navigator.clipboard?.read) {
      setErro("Este navegador não deixa ler a área de transferência pelo botão — use Ctrl+V ou “Escolher arquivo”.");
      return;
    }
    try {
      const tipos: string[] = [];
      for (const it of await navigator.clipboard.read()) {
        tipos.push(...it.types);
        const tipoImagem = it.types.find((t) => t.startsWith("image/"));
        if (tipoImagem) return void enviar(await it.getType(tipoImagem));
        if (it.types.includes("text/html")) {
          const img = await imagemDeHtml(await (await it.getType("text/html")).text());
          if (img) return void enviar(img);
        }
      }
      setErro(mensagemSemImagem([...new Set(tipos)]));
    } catch {
      setErro("O navegador não liberou a leitura da área de transferência. Permita quando ele perguntar, ou use Ctrl+V.");
    }
  }

  useEffect(() => {
    async function colar(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      e.preventDefault();
      const { imagem, tipos } = await imagemDoTransfer(e.clipboardData);
      if (imagem) void enviar(imagem);
      else setErro(mensagemSemImagem(tipos));
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("paste", colar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("paste", colar);
      window.removeEventListener("keydown", tecla);
    };
  }, [enviar, onFechar]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={onFechar}>
      <div
        className="w-full max-w-md rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-bold text-stone-900 dark:text-white">Anexar imagem</h3>
            <p className="font-mono text-xs text-stone-500 dark:text-slate-400">PO {item.po}</p>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="rounded border border-stone-300 dark:border-slate-700 px-2 py-1 text-xs text-stone-600 dark:text-slate-300 hover:border-red-400"
          >
            Fechar
          </button>
        </div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setArrastando(false);
            const { imagem, tipos } = await imagemDoTransfer(e.dataTransfer);
            if (imagem) void enviar(imagem);
            else setErro(mensagemSemImagem(tipos));
          }}
          className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-4 py-8 text-center ${
            arrastando
              ? "border-green-600 bg-green-50 dark:border-cyan-400 dark:bg-cyan-950/30"
              : "border-stone-300 dark:border-slate-700"
          }`}
        >
          {enviando ? (
            <p className="text-sm text-green-700 dark:text-cyan-300">Enviando imagem…</p>
          ) : (
            <>
              <p className="text-sm text-stone-700 dark:text-slate-200">
                Aperte <kbd className="rounded border border-stone-300 dark:border-slate-600 px-1.5 py-0.5 font-mono text-xs">Ctrl</kbd>{" "}
                + <kbd className="rounded border border-stone-300 dark:border-slate-600 px-1.5 py-0.5 font-mono text-xs">V</kbd> para
                colar a imagem copiada
              </p>
              <p className="text-xs text-stone-500 dark:text-slate-500">ou arraste um arquivo de imagem para cá</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={colarPeloBotao}
                  className="rounded-lg bg-green-600 dark:bg-cyan-500 px-3 py-1.5 text-sm font-bold text-white dark:text-slate-950 hover:bg-green-500 dark:hover:bg-cyan-400"
                  title="Lê a imagem da área de transferência (o navegador pode pedir permissão)"
                >
                  Colar
                </button>
                <button
                  type="button"
                  onClick={() => inputArquivo.current?.click()}
                  className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-sm text-stone-700 dark:text-slate-300 hover:border-green-600 dark:hover:border-cyan-500"
                >
                  Escolher arquivo…
                </button>
              </div>
              <input
                ref={inputArquivo}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  e.target.value = "";
                  if (arquivo) void enviar(arquivo);
                }}
              />
            </>
          )}
        </div>
        {erro && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{erro}</p>}
      </div>
    </div>
  );
}
