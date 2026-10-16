"use client";

// Fotos de qualidade do setor — pedido do usuário (16/10/2026): o felipe
// (Pintura) tira foto PELO PRÓPRIO APP no celular dos registros de qualidade
// de cada pedido (medição de espessura/micragem, aderência, rugosidade...) e
// ela já fica salva; a Qualidade e o resto do pessoal veem as fotos.
//   - FotosDoPedido: aba "📷 Fotos" dentro do pedido (tirar / ver / apagar);
//   - FotosSetor: aba "📷 Fotos" da tela do setor (todas, por pedido).
//   - Foto geral (pedido do usuário, 16/10/2026): FotosDoPedido sem pedido
//     (item null) = aba "📸 Foto geral" — cabine, medidor, ambiente...
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

// --- Baixar e excluir várias (pedido do usuário, 16/10/2026) ------------------
// Seleciona as fotos e baixa escolhendo a pasta (Chrome/Edge: showDirectoryPicker,
// igual aos certificados da Qualidade); sem isso (celular, Firefox), download normal.
interface PastaEscolhida {
  getFileHandle(nome: string, op: { create: boolean }): Promise<{
    createWritable(): Promise<{ write(d: Blob): Promise<void>; close(): Promise<void> }>;
  }>;
}
type JanelaComPasta = Window & {
  showDirectoryPicker?: (op?: { id?: string; mode?: "readwrite" }) => Promise<PastaEscolhida>;
};

function limparNome(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);
}

function nomeDaFoto(f: FotoSetor, titulo: string, usados: Set<string>): string {
  const d = new Date(f.em);
  const p = (n: number) => String(n).padStart(2, "0");
  const quandoArq = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
  const base = limparNome([titulo, f.tipo, f.observacao, quandoArq].filter(Boolean).join(" - "));
  let nome = base;
  for (let n = 2; usados.has(nome.toLowerCase()); n++) nome = `${base} (${n})`;
  usados.add(nome.toLowerCase());
  return nome;
}

async function baixarFotos(
  fotos: FotoSetor[],
  tituloDe: (f: FotoSetor) => string,
  aoAvancar: (feitas: number) => void,
): Promise<string> {
  // Escolher a pasta tem que ser logo no clique (exigência do navegador).
  const escolher = (window as JanelaComPasta).showDirectoryPicker;
  let pasta: PastaEscolhida | null = null;
  if (escolher) {
    try {
      pasta = await escolher({ id: "fotos-qualidade", mode: "readwrite" });
    } catch {
      return ""; // cancelou a escolha da pasta
    }
  }
  const usados = new Set<string>();
  let feitas = 0;
  const erros: string[] = [];
  for (const f of fotos) {
    try {
      const r = await fetch(urlImagemFollowUp(f.sha256));
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
      const nome = `${nomeDaFoto(f, tituloDe(f), usados)}.${ext}`;
      if (pasta) {
        const w = await (await pasta.getFileHandle(nome, { create: true })).createWritable();
        await w.write(blob);
        await w.close();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nome;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        await new Promise((ok) => setTimeout(ok, 300)); // navegador bloqueia downloads em rajada
      }
      feitas++;
      aoAvancar(feitas);
    } catch {
      erros.push(f.tipo);
    }
  }
  return (
    `✔ ${feitas} de ${fotos.length} foto(s) baixada(s)${pasta ? " na pasta escolhida" : " (pasta Downloads)"}` +
    (erros.length ? ` · ${erros.length} falharam` : "")
  );
}

/** Barra "Selecionar → Baixar / Excluir" e a seleção das fotos. */
function useSelecao(fotos: FotoSetor[]) {
  const [selecionando, setSelecionando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const visiveis = new Set(fotos.map((f) => f.id));
  const escolhidas = fotos.filter((f) => marcadas.has(f.id));
  return {
    selecionando,
    marcadas,
    escolhidas,
    iniciar: () => setSelecionando(true),
    sair: () => {
      setSelecionando(false);
      setMarcadas(new Set());
    },
    alternar: (id: string) =>
      setMarcadas((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    todas: () =>
      setMarcadas((s) => ([...visiveis].every((id) => s.has(id)) ? new Set() : new Set(visiveis))),
    todasMarcadas: fotos.length > 0 && fotos.every((f) => marcadas.has(f.id)),
    limpar: (ids: string[]) =>
      setMarcadas((s) => {
        const n = new Set(s);
        for (const id of ids) n.delete(id);
        return n;
      }),
  };
}

function BarraSelecao({
  sel,
  total,
  tituloDe,
  onExcluir,
}: {
  sel: ReturnType<typeof useSelecao>;
  total: number;
  tituloDe: (f: FotoSetor) => string;
  onExcluir?: (fotos: FotoSetor[]) => Promise<void>; // sem = só consulta (não exclui)
}) {
  const [baixando, setBaixando] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [msg, setMsg] = useState("");
  const n = sel.escolhidas.length;

  async function baixar() {
    setMsg("");
    setBaixando(0);
    const r = await baixarFotos(sel.escolhidas, tituloDe, setBaixando);
    setBaixando(null);
    if (r) setMsg(r);
  }

  async function excluir() {
    if (!onExcluir) return;
    setExcluindo(true);
    setMsg("");
    try {
      await onExcluir(sel.escolhidas);
      setMsg(`🗑️ ${n} foto(s) excluída(s)`);
      setConfirmar(false);
      sel.sair();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setExcluindo(false);
    }
  }

  if (!total) return null;
  const botao = "h-12 rounded-xl border-2 px-3 text-sm font-bold active:scale-[0.97] disabled:opacity-40";
  return (
    <div className="flex flex-col gap-2">
      {!sel.selecionando ? (
        <button
          type="button"
          onClick={() => {
            setMsg("");
            sel.iniciar();
          }}
          className={`${botao} border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-200`}
        >
          ☑ Selecionar fotos pra baixar{onExcluir ? " ou excluir" : ""}
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl border-2 border-sky-500 bg-sky-50 p-2 dark:border-sky-700 dark:bg-sky-950/30">
          <p className="text-center text-sm font-bold text-stone-800 dark:text-sky-100">
            {n ? `${n} foto(s) marcada(s)` : "Toque nas fotos pra marcar"}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" onClick={sel.todas} className={`${botao} border-sky-500 bg-white text-sky-800 dark:bg-slate-900 dark:text-sky-200`}>
              {sel.todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
            </button>
            <button
              type="button"
              disabled={!n || baixando !== null}
              onClick={baixar}
              className={`${botao} border-green-700 bg-green-600 text-white`}
            >
              {baixando !== null ? `Baixando ${baixando}/${n}…` : `⬇️ Baixar (${n})`}
            </button>
            {onExcluir && (
              <button
                type="button"
                disabled={!n || excluindo}
                onClick={() => setConfirmar(true)}
                className={`${botao} border-red-500 bg-white text-red-700 dark:bg-slate-900 dark:text-red-400`}
              >
                🗑️ Excluir ({n})
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setConfirmar(false);
                sel.sair();
              }}
              className={`${botao} border-stone-300 bg-white text-stone-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300`}
            >
              Cancelar
            </button>
          </div>
          {confirmar && (
            <div className="flex flex-col gap-2 rounded-xl border-2 border-red-500 bg-red-50 p-2 dark:bg-red-950/40">
              <p className="text-center text-sm font-bold text-red-800 dark:text-red-200">
                Excluir {n} foto(s)? Não dá pra desfazer.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={excluindo} onClick={excluir} className={`${botao} border-red-700 bg-red-600 text-white`}>
                  {excluindo ? "Excluindo…" : "🗑️ Sim, excluir"}
                </button>
                <button
                  type="button"
                  disabled={excluindo}
                  onClick={() => setConfirmar(false)}
                  className={`${botao} border-stone-300 bg-white text-stone-700 dark:bg-slate-900 dark:text-slate-300`}
                >
                  Não
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {msg && <p className="rounded-lg bg-stone-100 p-2 text-center text-sm font-bold text-stone-800 dark:bg-slate-800 dark:text-slate-200">{msg}</p>}
    </div>
  );
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

// marcada: undefined = fora do modo seleção; true/false = caixinha marcada ou não.
function Miniatura({
  foto,
  onClick,
  grande = false,
  marcada,
}: {
  foto: FotoSetor;
  onClick: () => void;
  grande?: boolean;
  marcada?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={marcada}
      className={`relative flex flex-col overflow-hidden rounded-xl border-2 bg-white text-left active:scale-[0.98] dark:bg-slate-900 ${
        marcada ? "border-sky-600 ring-2 ring-sky-500 dark:border-sky-400" : "border-stone-200 dark:border-slate-700"
      }`}
    >
      {marcada !== undefined && (
        <span
          className={`absolute left-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-lg border-2 text-xl font-bold shadow ${
            marcada ? "border-sky-700 bg-sky-600 text-white" : "border-white bg-black/40 text-white"
          }`}
        >
          {marcada ? "✓" : ""}
        </span>
      )}
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

/** Aba "📷 Fotos" dentro do pedido (ou "📸 Foto geral" com item null): tirar foto
 * (câmera), escolher da galeria, ver e apagar. */
export function FotosDoPedido({
  setor,
  item,
  tipos,
  usuario,
  somenteLeitura,
  onContagem,
}: {
  setor: string;
  item: ItemFollowUp | null;
  tipos: string[];
  usuario: string | null;
  somenteLeitura: boolean;
  onContagem?: (n: number) => void;
}) {
  const itemId = item?.id ?? null;
  const [fotos, setFotos] = useState<FotoSetor[] | null>(null);
  const [tipo, setTipo] = useState(() => lerTipo(tipos));
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState<{ feitas: number; total: number } | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [vendo, setVendo] = useState<FotoSetor | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const sel = useSelecao(fotos ?? []);
  const titulo = item ? (item.desenho ?? `PO ${item.po}`) : "Foto geral";

  useEffect(() => {
    let ativo = true;
    listarFotosSetor(setor, itemId ? { itemId } : { geral: true })
      .then((f) => ativo && setFotos(f))
      .catch((e: Error) => {
        if (!ativo) return;
        setFotos([]);
        setErro(e.message);
      });
    return () => {
      ativo = false;
    };
  }, [setor, itemId]);

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
        novas.push(await enviarFotoSetor(setor, itemId, await reduzir(arquivo), { tipo, observacao: obs, por: usuario }));
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
        onContagem?.(total.length);
      }
    }
  }

  // Apaga uma ou várias; as que já foram apagadas saem da tela mesmo se outra falhar.
  async function apagar(lista: FotoSetor[]) {
    const feitas = new Set<string>();
    try {
      for (const f of lista) {
        await removerFotoSetor(setor, f.id, usuario);
        feitas.add(f.id);
      }
    } finally {
      const resto = (fotos ?? []).filter((x) => !feitas.has(x.id));
      setFotos(resto);
      sel.limpar([...feitas]);
      if (feitas.size) onContagem?.(resto.length);
    }
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
        <div className="mb-2">
          <BarraSelecao
            sel={sel}
            total={fotos?.length ?? 0}
            tituloDe={() => titulo}
            onExcluir={somenteLeitura ? undefined : apagar}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos?.map((f) => (
            <Miniatura
              key={f.id}
              foto={f}
              grande
              marcada={sel.selecionando ? sel.marcadas.has(f.id) : undefined}
              onClick={() => (sel.selecionando ? sel.alternar(f.id) : setVendo(f))}
            />
          ))}
        </div>
      </div>

      {vendo && (
        <Visualizador
          foto={vendo}
          titulo={titulo}
          onFechar={() => setVendo(null)}
          onApagar={somenteLeitura ? undefined : () => apagar([vendo])}
        />
      )}
    </div>
  );
}

const GERAL = "geral"; // grupo das fotos sem pedido

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
  usuario,
  somenteLeitura,
}: {
  setor: string;
  tipos: string[];
  itens: ItemFollowUp[];
  versao: number;
  abrirPedido: (itemId: string) => void;
  usuario: string | null;
  somenteLeitura: boolean;
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
      const i = f.item_id ? porId.get(f.item_id) : undefined;
      const texto = normalizarBusca(
        [i?.po, i?.mac, i?.desenho, i?.descricao, i?.cliente, f.tipo, f.observacao].filter(Boolean).join(" "),
      );
      if (!termos.every((t) => texto.includes(t))) continue;
      const chave = f.item_id ?? GERAL;
      m.set(chave, [...(m.get(chave) ?? []), f]);
    }
    return [...m.entries()]; // já vem da mais recente pra mais antiga
  }, [fotos, tipo, termos, porId]);

  // Seleção vale pras fotos que estão na tela (filtro/busca aplicados).
  const naTela = useMemo(() => grupos.flatMap(([, l]) => l), [grupos]);
  const sel = useSelecao(naTela);

  function tituloDe(f: FotoSetor): string {
    if (!f.item_id) return "Foto geral";
    const i = porId.get(f.item_id);
    return i ? `${i.desenho ?? ""} PO ${i.po}` : "Pedido";
  }

  async function apagar(lista: FotoSetor[]) {
    const feitas = new Set<string>();
    try {
      for (const f of lista) {
        await removerFotoSetor(setor, f.id, usuario);
        feitas.add(f.id);
      }
    } finally {
      setFotos((atual) => (atual ?? []).filter((x) => !feitas.has(x.id)));
      sel.limpar([...feitas]);
    }
  }

  function miniatura(f: FotoSetor) {
    return (
      <Miniatura
        key={f.id}
        foto={f}
        marcada={sel.selecionando ? sel.marcadas.has(f.id) : undefined}
        onClick={() => (sel.selecionando ? sel.alternar(f.id) : setVendo(f))}
      />
    );
  }

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
        <BarraSelecao sel={sel} total={naTela.length} tituloDe={tituloDe} onExcluir={somenteLeitura ? undefined : apagar} />
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
        if (itemId === GERAL)
          return (
            <div key={itemId} className="rounded-xl border-2 border-violet-300 bg-white p-2 dark:border-violet-800 dark:bg-slate-900">
              <p className="mb-2 px-1 text-lg font-bold text-stone-900 dark:text-white">
                📸 Fotos gerais (sem pedido) <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">📷 {lista.length}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{lista.map(miniatura)}</div>
            </div>
          );
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{lista.map(miniatura)}</div>
          </div>
        );
      })}

      {vendo && (
        <Visualizador
          foto={vendo}
          titulo={(() => {
            const i = vendo.item_id ? porId.get(vendo.item_id) : undefined;
            return i ? `${i.desenho ?? ""} · PO ${i.po}` : vendo.item_id ? undefined : "Foto geral";
          })()}
          onFechar={() => setVendo(null)}
          onApagar={somenteLeitura ? undefined : () => apagar([vendo])}
        />
      )}
    </div>
  );
}
