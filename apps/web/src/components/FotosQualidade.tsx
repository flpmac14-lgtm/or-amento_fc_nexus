"use client";

// Fotos de qualidade do setor — pedido do usuário (16/10/2026): o felipe
// (Pintura) tira foto PELO PRÓPRIO APP no celular dos registros de qualidade
// de cada pedido (medição de espessura/micragem, aderência, rugosidade...) e
// ela já fica salva; a Qualidade e o resto do pessoal veem as fotos.
//   - FotosDoPedido: aba "📷 Fotos" dentro do pedido (tirar / ver / apagar);
//   - FotosSetor: aba "📷 Fotos" da tela do setor (todas, por pedido).
// A foto é reduzida no celular antes de subir (rede da fábrica) e de novo no
// servidor se precisar. Ver app/apontamentos_setor.py (migration 0048).

import { useEffect, useMemo, useRef, useState } from "react";
import { quando } from "@/components/ApontamentoComum";
import {
  enviarFotoSetor,
  listarFotosSetor,
  removerFotoSetor,
  urlImagemFollowUp,
  type FotoSetor,
} from "@/lib/api";
import { normalizarBusca } from "@/lib/busca";
import type { ItemFollowUp } from "@/lib/types";

const LADO_MAX = 2000;
const CHAVE_TIPO = "fcnexus.fotos.tipo"; // último tipo escolhido (conveniência do aparelho)

// Foto de celular tem 4–12 MB: reduz pra ~2000 px em JPEG antes de enviar.
async function reduzir(arquivo: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * escala);
    canvas.height = Math.round(bmp.height * escala);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob && blob.size < arquivo.size ? blob : arquivo;
  } catch {
    return arquivo; // navegador sem suporte (ou HEIC): o servidor reduz
  }
}

function lerTipo(tipos: string[]): string {
  try {
    const t = localStorage.getItem(CHAVE_TIPO);
    if (t && tipos.includes(t)) return t;
  } catch {
    // sem localStorage
  }
  return tipos[0] ?? "";
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Foto em tela cheia, com tipo, observação, quem tirou e (se pode) apagar.
function Visualizador({
  foto,
  titulo,
  onFechar,
  onApagar,
}: {
  foto: FotoSetor;
  titulo?: string;
  onFechar: () => void;
  onApagar?: () => Promise<void>;
}) {
  const [confirmar, setConfirmar] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  async function apagar() {
    if (!onApagar) return;
    setApagando(true);
    setErro("");
    try {
      await onApagar();
      onFechar();
    } catch (e) {
      setErro((e as Error).message);
      setApagando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95" onClick={onFechar}>
      <div className="flex items-start gap-3 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1">
          {titulo && <p className="truncate font-mono text-sm text-white/70">{titulo}</p>}
          <p className="text-lg font-bold">📷 {foto.tipo}</p>
          {foto.observacao && <p className="text-base">{foto.observacao}</p>}
          <p className="text-xs text-white/60">
            {dataHora(foto.em)}
            {foto.por ? ` · ${foto.por}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="h-12 w-12 shrink-0 rounded-xl border-2 border-white/40 text-xl font-semibold"
        >
          ✕
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- mídia do calc_engine */}
        <img
          src={urlImagemFollowUp(foto.sha256)}
          alt={foto.tipo}
          className="max-h-full max-w-full object-contain"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 p-3" onClick={(e) => e.stopPropagation()}>
        <a
          href={urlImagemFollowUp(foto.sha256)}
          target="_blank"
          rel="noreferrer"
          className="flex h-12 items-center rounded-xl border-2 border-white/40 px-4 text-sm font-bold text-white"
        >
          Abrir original
        </a>
        {onApagar &&
          (confirmar ? (
            <>
              <button
                type="button"
                disabled={apagando}
                onClick={apagar}
                className="h-12 rounded-xl bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {apagando ? "Apagando…" : "🗑️ Sim, apagar a foto"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmar(false)}
                className="h-12 rounded-xl border-2 border-white/40 px-4 text-sm font-bold text-white"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmar(true)}
              className="h-12 rounded-xl border-2 border-red-500 px-4 text-sm font-bold text-red-300"
            >
              🗑️ Apagar
            </button>
          ))}
        {erro && <p className="w-full text-center text-sm text-red-300">{erro}</p>}
      </div>
    </div>
  );
}

function Miniatura({ foto, onClick, grande = false }: { foto: FotoSetor; onClick: () => void; grande?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col overflow-hidden rounded-xl border-2 border-stone-200 bg-white text-left active:scale-[0.98] dark:border-slate-700 dark:bg-slate-900"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- mídia do calc_engine */}
      <img
        src={urlImagemFollowUp(foto.sha256)}
        alt={foto.tipo}
        loading="lazy"
        className={`${grande ? "h-36" : "h-24"} w-full bg-stone-100 object-cover dark:bg-slate-800`}
      />
      <span className="flex flex-col px-2 py-1">
        <span className="line-clamp-2 text-xs font-bold leading-tight text-stone-900 dark:text-white">{foto.tipo}</span>
        {foto.observacao && <span className="truncate text-xs text-stone-700 dark:text-slate-300">{foto.observacao}</span>}
        <span className="truncate text-[11px] text-stone-500 dark:text-slate-400">
          {quando(foto.em)}
          {foto.por ? ` · ${foto.por}` : ""}
        </span>
      </span>
    </button>
  );
}

/** Aba "📷 Fotos" dentro do pedido: tirar foto (câmera), escolher da galeria, ver e apagar. */
export function FotosDoPedido({
  setor,
  item,
  tipos,
  usuario,
  somenteLeitura,
  onContagem,
}: {
  setor: string;
  item: ItemFollowUp;
  tipos: string[];
  usuario: string | null;
  somenteLeitura: boolean;
  onContagem: (n: number) => void;
}) {
  const [fotos, setFotos] = useState<FotoSetor[] | null>(null);
  const [tipo, setTipo] = useState(() => lerTipo(tipos));
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState<{ feitas: number; total: number } | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [vendo, setVendo] = useState<FotoSetor | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ativo = true;
    listarFotosSetor(setor, { itemId: item.id })
      .then((f) => ativo && setFotos(f))
      .catch((e: Error) => {
        if (!ativo) return;
        setFotos([]);
        setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [setor, item.id]);

  function escolherTipo(t: string) {
    setTipo(t);
    try {
      localStorage.setItem(CHAVE_TIPO, t);
    } catch {
      // sem localStorage
    }
  }

  async function enviar(arquivos: File[]) {
    if (!arquivos.length) return;
    if (!tipo) {
      setErro("Escolha o tipo da foto.");
      return;
    }
    setErro("");
    setAviso("");
    const novas: FotoSetor[] = [];
    try {
      for (const [n, arquivo] of arquivos.entries()) {
        setEnviando({ feitas: n, total: arquivos.length });
        novas.push(await enviarFotoSetor(setor, item.id, await reduzir(arquivo), { tipo, observacao: obs, por: usuario }));
      }
      setObs("");
      setAviso(`✔ ${novas.length === 1 ? "Foto salva" : `${novas.length} fotos salvas`} — ${tipo}`);
      setTimeout(() => setAviso(""), 5000);
    } catch (e) {
      setErro((e as Error).message + (novas.length ? ` (${novas.length} de ${arquivos.length} já foram salvas)` : ""));
    } finally {
      setEnviando(null);
      if (novas.length) {
        const total = [...[...novas].reverse(), ...(fotos ?? [])];
        setFotos(total);
        onContagem(total.length);
      }
    }
  }

  async function apagar(f: FotoSetor) {
    await removerFotoSetor(setor, f.id, usuario);
    const resto = (fotos ?? []).filter((x) => x.id !== f.id);
    setFotos(resto);
    onContagem(resto.length);
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {!somenteLeitura && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-violet-300 bg-white p-3 dark:border-violet-800 dark:bg-slate-900">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">O que a foto mostra?</span>
            <div className="grid grid-cols-2 gap-2">
              {tipos.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => escolherTipo(t)}
                  aria-pressed={tipo === t}
                  className={`min-h-12 rounded-xl border-2 px-2 py-1.5 text-sm font-bold leading-tight active:scale-[0.97] ${
                    tipo === t
                      ? "border-violet-700 bg-violet-600 text-white"
                      : "border-stone-300 bg-white text-stone-800 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">Valor / observação (opcional)</span>
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              maxLength={200}
              autoComplete="off"
              placeholder="Ex.: Fundo 120 µm · Acabamento 250 µm · Grau 0"
              className="h-14 rounded-xl border-2 border-stone-300 bg-white px-3 text-lg text-stone-900 outline-none focus:border-violet-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            />
          </label>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <button
              type="button"
              disabled={!!enviando}
              onClick={() => camera.current?.click()}
              className="h-20 rounded-2xl bg-violet-600 text-2xl font-extrabold text-white shadow active:scale-[0.98] disabled:opacity-50"
            >
              {enviando ? `Enviando ${enviando.feitas + 1}/${enviando.total}…` : "📷 Tirar foto"}
            </button>
            <button
              type="button"
              disabled={!!enviando}
              onClick={() => galeria.current?.click()}
              className="h-20 rounded-2xl border-2 border-violet-500 text-base font-bold text-violet-700 active:scale-[0.98] disabled:opacity-50 dark:text-violet-300"
            >
              🖼️ Da galeria
            </button>
          </div>
          {/* capture="environment": no celular abre direto a câmera traseira. */}
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const arquivos = [...(e.target.files ?? [])];
              e.target.value = "";
              void enviar(arquivos);
            }}
          />
          <input
            ref={galeria}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const arquivos = [...(e.target.files ?? [])];
              e.target.value = "";
              void enviar(arquivos);
            }}
          />
          {aviso && <p className="rounded-lg bg-green-50 p-2 text-center text-base font-bold text-green-700 dark:bg-green-950/50 dark:text-green-300">{aviso}</p>}
        </div>
      )}

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{erro}</div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
          Fotos de qualidade {fotos && fotos.length > 0 ? `(${fotos.length})` : ""}
        </p>
        {fotos === null && <p className="text-sm text-stone-500">Carregando…</p>}
        {fotos?.length === 0 && <p className="text-sm text-stone-500 dark:text-slate-400">Nenhuma foto ainda.</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos?.map((f) => <Miniatura key={f.id} foto={f} grande onClick={() => setVendo(f)} />)}
        </div>
      </div>

      {vendo && (
        <Visualizador
          foto={vendo}
          titulo={item.desenho ?? `PO ${item.po}`}
          onFechar={() => setVendo(null)}
          onApagar={somenteLeitura ? undefined : () => apagar(vendo)}
        />
      )}
    </div>
  );
}

const PERIODOS = [
  [7, "7 dias"],
  [30, "30 dias"],
  [90, "90 dias"],
  [365, "1 ano"],
] as const;

/** Aba "📷 Fotos" da tela do setor: todas as fotos recentes, agrupadas por pedido. */
export function FotosSetor({
  setor,
  tipos,
  itens,
  versao,
  abrirPedido,
}: {
  setor: string;
  tipos: string[];
  itens: ItemFollowUp[];
  versao: number;
  abrirPedido: (itemId: string) => void;
}) {
  const [dias, setDias] = useState<number>(30);
  const [fotos, setFotos] = useState<FotoSetor[] | null>(null);
  const [erro, setErro] = useState("");
  const [tipo, setTipo] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [vendo, setVendo] = useState<FotoSetor | null>(null);

  useEffect(() => {
    let ativo = true;
    listarFotosSetor(setor, { dias })
      .then((f) => {
        if (!ativo) return;
        setFotos(f);
        setErro("");
      })
      .catch((e: Error) => {
        if (!ativo) return;
        setFotos([]);
        setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [setor, dias, versao]);

  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);
  const termos = useMemo(() => normalizarBusca(busca).split(" ").filter(Boolean), [busca]);

  const grupos = useMemo(() => {
    const m = new Map<string, FotoSetor[]>();
    for (const f of fotos ?? []) {
      if (tipo && f.tipo !== tipo) continue;
      const i = porId.get(f.item_id);
      const texto = normalizarBusca(
        [i?.po, i?.mac, i?.desenho, i?.descricao, i?.cliente, f.tipo, f.observacao].filter(Boolean).join(" "),
      );
      if (!termos.every((t) => texto.includes(t))) continue;
      m.set(f.item_id, [...(m.get(f.item_id) ?? []), f]);
    }
    return [...m.entries()]; // já vem da mais recente pra mais antiga
  }, [fotos, tipo, termos, porId]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:p-4">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          type="search"
          autoComplete="off"
          placeholder="🔍 Desenho, MAC, PO, valor…"
          className="h-14 rounded-xl border-2 border-stone-300 bg-white px-4 text-lg text-stone-900 outline-none focus:border-green-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {PERIODOS.map(([d, r]) => (
            <button
              key={d}
              type="button"
              onClick={() => {
                if (d === dias) return;
                setFotos(null);
                setDias(d);
              }}
              className={`shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold ${
                dias === d
                  ? "border-green-600 bg-green-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                  : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[null, ...tipos].map((t) => (
            <button
              key={t ?? "todos"}
              type="button"
              onClick={() => setTipo(t)}
              className={`shrink-0 rounded-full border-2 px-3 py-1.5 text-sm font-semibold ${
                tipo === t
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
              }`}
            >
              {t ?? `Todos os tipos (${fotos?.length ?? 0})`}
            </button>
          ))}
        </div>
        <p className="text-sm text-stone-500 dark:text-slate-400">
          Pra tirar foto: abra o pedido em 📋 Pedidos → aba <strong>📷 Fotos</strong>.
        </p>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">{erro}</div>
      )}
      {fotos === null && <p className="py-10 text-center text-stone-500 dark:text-slate-400">Carregando…</p>}
      {fotos && grupos.length === 0 && !erro && (
        <p className="py-10 text-center text-stone-500 dark:text-slate-400">Nenhuma foto nesse período.</p>
      )}

      {grupos.map(([itemId, lista]) => {
        const i = porId.get(itemId);
        return (
          <div key={itemId} className="rounded-xl border-2 border-stone-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              disabled={!i}
              onClick={() => abrirPedido(itemId)}
              className="mb-2 flex w-full flex-col items-start rounded-lg px-1 text-left hover:bg-stone-50 disabled:cursor-default dark:hover:bg-slate-800"
            >
              <span className="font-mono text-lg font-bold text-stone-900 dark:text-white">
                {i ? (i.desenho ?? i.po) : "Pedido que saiu do Follow up"} <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">📷 {lista.length}</span>
              </span>
              {i && (
                <span className="truncate text-xs text-stone-500 dark:text-slate-400">
                  {i.mac ?? "—"} · PO {i.po} · {i.descricao ?? ""}
                </span>
              )}
            </button>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {lista.map((f) => <Miniatura key={f.id} foto={f} onClick={() => setVendo(f)} />)}
            </div>
          </div>
        );
      })}

      {vendo && (
        <Visualizador
          foto={vendo}
          titulo={(() => {
            const i = porId.get(vendo.item_id);
            return i ? `${i.desenho ?? ""} · PO ${i.po}` : undefined;
          })()}
          onFechar={() => setVendo(null)}
        />
      )}
    </div>
  );
}
