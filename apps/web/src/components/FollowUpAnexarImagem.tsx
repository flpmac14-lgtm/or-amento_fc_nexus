"use client";

// Anexar imagem na coluna Foto do Follow up — pedido explícito do usuário:
// clicar e colar (Ctrl+V) uma imagem copiada. Também aceita escolher um
// arquivo ou arrastar. Envia na hora; a janela fecha quando termina.

import { useCallback, useEffect, useRef, useState } from "react";
import { enviarImagemFollowUp } from "@/lib/api";
import type { ItemFollowUp } from "@/lib/types";

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
      if (!imagem.type.startsWith("image/")) {
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

  useEffect(() => {
    function colar(e: ClipboardEvent) {
      const imagem = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      if (imagem) {
        e.preventDefault();
        void enviar(imagem);
      } else {
        setErro("A área de transferência não tem imagem. Copie a imagem (Ctrl+C / botão direito → Copiar imagem) e cole de novo.");
      }
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
          onDrop={(e) => {
            e.preventDefault();
            setArrastando(false);
            const arquivo = e.dataTransfer.files?.[0];
            if (arquivo) void enviar(arquivo);
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
              <button
                type="button"
                onClick={() => inputArquivo.current?.click()}
                className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-sm text-stone-700 dark:text-slate-300 hover:border-green-600 dark:hover:border-cyan-500"
              >
                Escolher arquivo…
              </button>
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
