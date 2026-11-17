"use client";

// Pintura — pedido do usuário (17/11/2026): aba principal do menu.
// - Estoque de tinta = planilha original (PCP-Pintura-Estoque.xlsx, lida a cada
//   15 min) + entradas/saídas lançadas aqui pelo celular do felipe.
// - "Chegou tinta": busca que filtra enquanto digita (catálogo + estoque) e
//   preenche fabricante/cor/unidade; o IT sai sequencial, com data/hora e quem
//   lançou; depois dá pra tirar foto.
// - "Saiu tinta": busca rápida no estoque com saldo e botões ¼ ½ 1 2 latas.
// - "Vai ter tinta?": pedidos ativos (Cor 1/Cor 2/Plano) × estoque.
// A planilha original nunca é gravada; o script de 15 min gera uma planilha nova
// organizada no J: com tudo isso (app/pintura_planilha.py).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell, { classeBotaoCabecalho } from "@/components/AppShell";
import EscanerEtiqueta from "@/components/EscanerEtiqueta";
import { chaveEtiqueta, type EtiquetaGs1 } from "@/lib/gs1";
import {
  buscarCodigosPintura,
  enviarFotoPintura,
  excluirMovimentoPintura,
  listarEstoquePintura,
  listarPintura,
  necessidadePintura,
  registrarMovimentoPintura,
  removerFotoPintura,
  urlImagemFollowUp,
} from "@/lib/api";
import { normalizarBusca } from "@/lib/followUp";
import { emailParaLogin } from "@/lib/loginInterno";
import {
  podeCorrigirPintura,
  podeVerPintura,
  type CodigoPintura,
  type FotoPintura,
  type GrupoNecessidade,
  type ItemEstoquePintura,
  type MovimentoPintura,
  type RespostaEstoquePintura,
  type RespostaNecessidade,
  type RespostaPintura,
  type SituacaoNecessidade,
} from "@/lib/pintura";
import { repetirComAbaVisivel } from "@/lib/repetir";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import type { ValorControleObras } from "@/lib/types";

type Aba = "estoque" | "movimentos" | "necessidade" | "catalogo";
type Situacao = "vencido" | "vence" | "ok" | "sem";
type FiltroCartao = "todos" | "com_estoque" | "zerados" | "vencidos" | "vencem";

const DIAS_ALERTA = 60;
const UNIDADES = ["GL", "LA", "BD", "QT", "L", "KG"];
const LADO_MAX = 2000;

// ---------------------------------------------------------------- utilitários

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function ehData(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v);
}

function dataBr(v: unknown): string {
  if (!ehData(v)) return v == null ? "" : String(v);
  const [a, m, d] = v.slice(0, 10).split("-");
  return d === "01" ? `${m}/${a}` : `${d}/${m}/${a}`; // vencimento de tinta costuma ser só mês/ano
}

function dataHora(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

function qtd(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function texto(v: ValorControleObras | undefined): string {
  if (v == null) return "";
  if (ehData(v)) return dataBr(v);
  if (typeof v === "number") return qtd(v);
  return String(v);
}

function situacao(venc: string | null, qt: number, hoje: string, limite: string): Situacao {
  if (!ehData(venc) || qt <= 0) return "sem";
  const d = venc.slice(0, 10);
  if (d < hoje) return "vencido";
  if (d <= limite) return "vence";
  return "ok";
}

// Fabricante: a planilha tem "Weg" e "weg", "Internat." e "International".
function fabricante(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s || s === "0") return "—";
  if (normalizarBusca(s).startsWith("internat")) return "International";
  return s.charAt(0).toLocaleUpperCase("pt-BR") + s.slice(1).toLocaleLowerCase("pt-BR");
}

function casa(termos: string[], ...campos: unknown[]): boolean {
  if (!termos.length) return true;
  const tudo = normalizarBusca(campos.map((c) => (c == null ? "" : String(c))).join(" "));
  return termos.every((t) => tudo.includes(t));
}

function termosDe(busca: string): string[] {
  return normalizarBusca(busca).split(/\s+/).filter(Boolean);
}

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
    return arquivo; // o servidor reduz
  }
}

const ESTILO_SITUACAO: Record<Situacao, string> = {
  vencido: "bg-red-600 text-white",
  vence: "bg-amber-400 text-amber-950",
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  sem: "text-stone-400 dark:text-slate-500",
};

const NECESSIDADE: Record<SituacaoNecessidade, { rotulo: string; classe: string }> = {
  nao_tem: { rotulo: "Não tem", classe: "bg-red-600 text-white" },
  zerada: { rotulo: "Zerada", classe: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300" },
  vencida: { rotulo: "Só vencida", classe: "bg-amber-400 text-amber-950" },
  tem: { rotulo: "Tem", classe: "bg-emerald-600 text-white" },
};

const campo =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 sm:text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-400 dark:focus:ring-cyan-400/20";
const rotulo = "flex flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-slate-400";

function Venc({ v, s }: { v: string | null; s: Situacao }) {
  return ehData(v) ? (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${ESTILO_SITUACAO[s]}`}>{dataBr(v)}</span>
  ) : (
    <span className="text-stone-300 dark:text-slate-600">—</span>
  );
}

function Qt({ q, un }: { q: number; un: string | null }) {
  return (
    <span className={`tabular-nums ${q > 0 ? "font-bold text-stone-800 dark:text-slate-100" : "text-stone-400 dark:text-slate-500"}`}>
      {qtd(q)} <span className="text-[11px] font-normal text-stone-500 dark:text-slate-400">{un ?? ""}</span>
    </span>
  );
}

// ---------------------------------------------------------------- busca rápida

function BuscaRapida<T>({
  opcoes,
  textoBusca,
  render,
  aoEscolher,
  placeholder,
  livre,
  autoFoco,
  inicial,
}: {
  opcoes: T[];
  textoBusca: (o: T) => string;
  render: (o: T) => React.ReactNode;
  aoEscolher: (o: T | string) => void;
  placeholder: string;
  livre?: boolean; // permite usar o texto digitado como valor novo
  autoFoco?: boolean;
  inicial?: string;
}) {
  const [busca, setBusca] = useState(inicial ?? "");
  const termos = termosDe(busca);
  const achados = useMemo(
    () => (termos.length ? opcoes.filter((o) => casa(termos, textoBusca(o))) : opcoes).slice(0, 40),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opcoes, busca],
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <input
          autoFocus={autoFoco}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholder}
          className={`${campo} pl-9`}
          inputMode="search"
          autoComplete="off"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">⌕</span>
      </div>
      <div className="max-h-[45dvh] overflow-auto rounded-lg border border-stone-200 dark:border-slate-700">
        {livre && busca.trim() && (
          <button
            type="button"
            onClick={() => aoEscolher(busca.trim())}
            className="flex w-full items-center gap-2 border-b border-stone-100 bg-blue-50 px-3 py-3 text-left text-sm font-semibold text-blue-700 dark:border-slate-800 dark:bg-cyan-500/10 dark:text-cyan-300"
          >
            ＋ Usar “{busca.trim()}” (produto novo)
          </button>
        )}
        {achados.map((o, i) => (
          <button
            key={i}
            type="button"
            onClick={() => aoEscolher(o)}
            className="block w-full border-b border-stone-100 px-3 py-2.5 text-left hover:bg-blue-50 active:bg-blue-100 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            {render(o)}
          </button>
        ))}
        {!achados.length && <p className="p-4 text-center text-sm text-stone-500 dark:text-slate-400">Nada encontrado.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- fotos

function Fotos({
  movimentoId,
  fotos,
  por,
  podeApagar,
  aoMudar,
}: {
  movimentoId: string;
  fotos: FotoPintura[];
  por: string | null;
  podeApagar: boolean;
  aoMudar: (fotos: FotoPintura[]) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setErro(null);
    let atuais = fotos;
    for (const arq of Array.from(arquivos)) {
      setEnviando((n) => n + 1);
      try {
        const f = await enviarFotoPintura(movimentoId, await reduzir(arq), por);
        atuais = [...atuais, f];
        aoMudar(atuais);
      } catch (e) {
        setErro((e as Error).message);
      } finally {
        setEnviando((n) => n - 1);
      }
    }
  }

  async function apagar(id: string) {
    try {
      await removerFotoPintura(id);
      aoMudar(fotos.filter((f) => f.id !== id));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {fotos.map((f) => (
          <div key={f.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={urlImagemFollowUp(f.sha256)}
              alt="Foto da tinta"
              onClick={() => setAberta(f.sha256)}
              className="h-20 w-20 cursor-zoom-in rounded-lg border border-stone-200 object-cover dark:border-slate-700"
            />
            {podeApagar && (
              <button
                type="button"
                onClick={() => apagar(f.id)}
                title="Apagar foto"
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-300 text-xs font-semibold text-stone-500 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:text-slate-400"
        >
          <span className="text-2xl leading-none">📷</span>
          {enviando ? "Enviando…" : "Foto"}
        </button>
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            enviar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      {aberta && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-3" onClick={() => setAberta(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urlImagemFollowUp(aberta)} alt="Foto da tinta" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- janela base

function Janela({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}
    >
      <div className="flex max-h-[94dvh] w-full max-w-xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-700">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-slate-800">
          <h3 className="text-base font-bold text-stone-800 dark:text-slate-100">{titulo}</h3>
          <button type="button" onClick={aoFechar} className="rounded-md px-2 text-2xl leading-none text-stone-400 hover:text-stone-700 dark:hover:text-white">
            ×
          </button>
        </div>
        <div className="overflow-auto p-4">{children}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- chegou tinta

type OpcaoProduto = { produto: string; fabricante: string | null; cor: string | null; un_a: string | null; un_b: string | null; local: string | null; origem: string };

function JanelaEntrada({
  opcoes,
  por,
  aoFechar,
  aoLancar,
}: {
  opcoes: OpcaoProduto[];
  por: string | null;
  aoFechar: () => void;
  aoLancar: () => void;
}) {
  const [f, setF] = useState<Record<string, string>>({ un_a: "GL", un_b: "GL", qt_a: "1", qt_b: "1" });
  const [escolhido, setEscolhido] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ id: string; it?: string } | null>(null);
  const [fotos, setFotos] = useState<FotoPintura[]>([]);
  const [escaneando, setEscaneando] = useState<"a" | "b" | "auto" | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "novo" | "erro"; texto: string } | null>(null);
  const muda = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  // Quadradinho lido: lote/validade/código vão pro componente; o produto vem do que o app já aprendeu.
  async function aoLerEtiqueta(e: EtiquetaGs1, alvo: "a" | "b" | "auto") {
    setEscaneando(null);
    const chave = chaveEtiqueta(e);
    let conhecido: CodigoPintura | undefined;
    try {
      const r = await buscarCodigosPintura([chave ?? "", e.gtin ?? ""]);
      conhecido = (chave && r[chave]) || (e.gtin ? r[e.gtin] : undefined);
    } catch {
      // sem internet: segue só com lote/validade
    }
    const comp: "a" | "b" =
      alvo !== "auto" ? alvo : conhecido?.componente ? (conhecido.componente.toLowerCase() as "a" | "b") : f.codigo_a ? "b" : "a";
    setF((x) => ({
      ...x,
      [`lote_${comp}`]: e.lote ?? x[`lote_${comp}`] ?? "",
      [`venc_${comp}`]: e.validade ?? x[`venc_${comp}`] ?? "",
      [`codigo_${comp}`]: chave ?? "",
      [`gtin_${comp}`]: e.gtin ?? "",
      ...(conhecido?.un ? { [`un_${comp}`]: conhecido.un } : {}),
      ...(conhecido && !x.produto
        ? { produto: conhecido.produto, fabricante: conhecido.fabricante ?? "", cor: conhecido.cor ?? "" }
        : {}),
    }));
    const parte = `lote ${e.lote ?? "?"}${e.validade ? `, validade ${dataBr(`${e.validade}-01`)}` : ""}`;
    if (conhecido) {
      setEscolhido(true);
      setAviso({ tipo: "ok", texto: `✔ ${conhecido.produto} — componente ${comp.toUpperCase()}, ${parte}. Confira e ponha a quantidade.` });
    } else if (f.produto) {
      setAviso({ tipo: "novo", texto: `Componente ${comp.toUpperCase()}: ${parte}. Código ${chave} novo — fica aprendido ao lançar.` });
    } else {
      setAviso({
        tipo: "novo",
        texto: `Li ${parte}. O código ${chave} ainda é novo: escolha o produto abaixo só desta vez — da próxima, preenche sozinho.`,
      });
    }
  }

  function escolher(o: OpcaoProduto | string) {
    if (typeof o === "string") setF((x) => ({ ...x, produto: o }));
    else
      setF((x) => ({
        ...x,
        produto: o.produto,
        fabricante: o.fabricante ?? "",
        cor: o.cor ?? "",
        un_a: o.un_a || x.un_a,
        un_b: o.un_b || o.un_a || x.un_b,
        local: o.local ?? "",
      }));
    setEscolhido(true);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await registrarMovimentoPintura({
        tipo: "entrada",
        produto: f.produto ?? "",
        fabricante: f.fabricante,
        cor: f.cor,
        un_a: f.un_a,
        qt_a: Number((f.qt_a || "0").replace(",", ".")),
        lote_a: f.lote_a,
        venc_a: f.venc_a,
        un_b: f.un_b,
        qt_b: Number((f.qt_b || "0").replace(",", ".")),
        lote_b: f.lote_b,
        venc_b: f.venc_b,
        local: f.local,
        mac: f.mac,
        obs: f.obs,
        codigo_a: f.codigo_a || undefined,
        gtin_a: f.gtin_a || undefined,
        codigo_b: f.codigo_b || undefined,
        gtin_b: f.gtin_b || undefined,
        por,
      });
      setFeito(r);
      aoLancar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (feito)
    return (
      <Janela titulo="Entrada lançada" aoFechar={aoFechar}>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-emerald-50 p-4 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
            <p className="text-lg font-bold">✔ IT {feito.it} lançado</p>
            <p className="text-sm">
              {f.produto} {f.cor ? `· ${f.cor}` : ""} — {dataHora(new Date().toISOString())}
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-stone-700 dark:text-slate-300">Tirar foto (lata, etiqueta, nota):</p>
            <Fotos movimentoId={feito.id} fotos={fotos} por={por} podeApagar aoMudar={setFotos} />
          </div>
          <button type="button" onClick={aoFechar} className="rounded-xl bg-green-600 py-3 text-base font-bold text-white hover:bg-green-500">
            Concluir
          </button>
        </div>
      </Janela>
    );

  return (
    <Janela titulo="＋ Chegou tinta" aoFechar={aoFechar}>
      {escaneando && (
        <EscanerEtiqueta
          titulo={escaneando === "auto" ? "Escanear etiqueta" : `Escanear componente ${escaneando.toUpperCase()}`}
          aoLer={(e) => aoLerEtiqueta(e, escaneando)}
          aoFechar={() => setEscaneando(null)}
        />
      )}
      {aviso && (
        <p
          className={`mb-3 rounded-lg p-2.5 text-sm font-semibold ${
            aviso.tipo === "ok"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
              : aviso.tipo === "novo"
                ? "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
                : "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
          }`}
        >
          {aviso.texto}
        </p>
      )}
      {!escolhido ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setEscaneando("auto")}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow hover:bg-blue-500 active:scale-[0.98] dark:bg-cyan-500 dark:text-slate-950"
          >
            <span className="text-2xl leading-none">▣</span> Escanear etiqueta (quadradinho)
          </button>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">ou digite parte do nome ou da cor (ex.: “lack”, “n6,5”, “interseal”):</p>
          <BuscaRapida
            autoFoco
            livre
            opcoes={opcoes}
            textoBusca={(o) => `${o.produto} ${o.fabricante ?? ""} ${o.cor ?? ""}`}
            placeholder="Buscar produto…"
            aoEscolher={escolher}
            render={(o) => (
              <div>
                <div className="font-semibold text-stone-800 dark:text-slate-100">{o.produto}</div>
                <div className="text-xs text-stone-500 dark:text-slate-400">
                  {[fabricante(o.fabricante), o.cor, o.origem].filter(Boolean).join(" · ")}
                </div>
              </div>
            )}
          />
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div className="flex items-start justify-between gap-2 rounded-lg bg-stone-100 p-3 dark:bg-slate-800">
            <div>
              <p className="font-bold text-stone-800 dark:text-slate-100">{f.produto}</p>
              <p className="text-xs text-stone-500 dark:text-slate-400">{fabricante(f.fabricante)}</p>
            </div>
            <button type="button" onClick={() => setEscolhido(false)} className="text-xs font-semibold text-blue-600 dark:text-cyan-400">
              Trocar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={rotulo}>
              Fabricante
              <input value={f.fabricante ?? ""} onChange={(e) => muda("fabricante", e.target.value)} className={campo} />
            </label>
            <label className={rotulo}>
              Cor
              <input value={f.cor ?? ""} onChange={(e) => muda("cor", e.target.value)} className={campo} placeholder="ex.: CZ N6,5" />
            </label>
          </div>
          {(["a", "b"] as const).map((c) => (
            <fieldset key={c} className="rounded-xl border border-stone-200 p-3 dark:border-slate-700">
              <legend className="px-1 text-xs font-bold uppercase text-stone-500 dark:text-slate-400">
                Componente {c.toUpperCase()} {c === "b" && <span className="font-normal normal-case">(catalisador — 0 se não tiver)</span>}
              </legend>
              <button
                type="button"
                onClick={() => setEscaneando(c)}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 py-2 text-sm font-semibold text-blue-700 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-300"
              >
                ▣ {f[`codigo_${c}`] ? `Lido: código ${f[`codigo_${c}`]} — escanear de novo` : `Escanear etiqueta do componente ${c.toUpperCase()}`}
              </button>
              <div className="grid grid-cols-[1fr_5.5rem] gap-3">
                <label className={rotulo}>
                  Quantidade
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => muda(`qt_${c}`, String(Math.max(0, Number((f[`qt_${c}`] || "0").replace(",", ".")) - 1)))}
                      className="h-11 w-11 shrink-0 rounded-lg border border-stone-300 text-xl font-bold dark:border-slate-600"
                    >
                      −
                    </button>
                    <input
                      value={f[`qt_${c}`] ?? ""}
                      onChange={(e) => muda(`qt_${c}`, e.target.value)}
                      inputMode="decimal"
                      className={`${campo} text-center font-bold`}
                    />
                    <button
                      type="button"
                      onClick={() => muda(`qt_${c}`, String(Number((f[`qt_${c}`] || "0").replace(",", ".")) + 1))}
                      className="h-11 w-11 shrink-0 rounded-lg border border-stone-300 text-xl font-bold dark:border-slate-600"
                    >
                      +
                    </button>
                  </div>
                </label>
                <label className={rotulo}>
                  Unidade
                  <select value={f[`un_${c}`]} onChange={(e) => muda(`un_${c}`, e.target.value)} className={campo}>
                    {UNIDADES.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className={rotulo}>
                  Lote
                  <input value={f[`lote_${c}`] ?? ""} onChange={(e) => muda(`lote_${c}`, e.target.value)} className={campo} />
                </label>
                <label className={rotulo}>
                  Vencimento
                  <input type="month" value={f[`venc_${c}`] ?? ""} onChange={(e) => muda(`venc_${c}`, e.target.value)} className={campo} />
                </label>
              </div>
            </fieldset>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <label className={rotulo}>
              Local
              <input value={f.local ?? ""} onChange={(e) => muda("local", e.target.value)} className={campo} placeholder="ex.: 2C" />
            </label>
            <label className={rotulo}>
              MAC / obra (opcional)
              <input value={f.mac ?? ""} onChange={(e) => muda("mac", e.target.value)} className={campo} />
            </label>
          </div>
          <label className={rotulo}>
            Observação (opcional)
            <input value={f.obs ?? ""} onChange={(e) => muda("obs", e.target.value)} className={campo} placeholder="ex.: NF 12345" />
          </label>
          {erro && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
          <button
            type="submit"
            disabled={salvando}
            className="rounded-xl bg-green-600 py-3.5 text-base font-bold text-white hover:bg-green-500 disabled:opacity-50"
          >
            {salvando ? "Lançando…" : "Lançar entrada"}
          </button>
        </form>
      )}
    </Janela>
  );
}

// ---------------------------------------------------------------- saiu tinta

const FRACOES = [
  { v: 0.25, r: "¼" },
  { v: 0.5, r: "½" },
  { v: 1, r: "1" },
  { v: 2, r: "2" },
  { v: 3, r: "3" },
];

function JanelaSaida({
  itens,
  inicial,
  por,
  aoFechar,
  aoLancar,
}: {
  itens: ItemEstoquePintura[];
  inicial: ItemEstoquePintura | null;
  por: string | null;
  aoFechar: () => void;
  aoLancar: () => void;
}) {
  const [item, setItem] = useState<ItemEstoquePintura | null>(inicial);
  const temB = !!item && (item.qt_b > 0 || item.qt_inicial_b > 0);
  const [comp, setComp] = useState<"kit" | "a" | "b">("kit");
  const [q, setQ] = useState("1");
  const [mac, setMac] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ id: string; saldo_a?: number; saldo_b?: number } | null>(null);
  const [fotos, setFotos] = useState<FotoPintura[]>([]);
  const [escaneando, setEscaneando] = useState(false);
  const [buscaInicial, setBuscaInicial] = useState<string | undefined>(undefined);
  const [avisoScan, setAvisoScan] = useState<string | null>(null);
  const n = Number(q.replace(",", ".")) || 0;

  // Lata escaneada: acha a tinta pelo lote (A ou B) entre as que têm saldo.
  function aoLerEtiqueta(e: EtiquetaGs1) {
    setEscaneando(false);
    const lote = normalizarBusca(e.lote ?? "");
    const porA = itens.filter((i) => lote && normalizarBusca(String(i.lote_a ?? "")) === lote);
    const porB = itens.filter((i) => lote && normalizarBusca(String(i.lote_b ?? "")) === lote);
    const achados = [...porA, ...porB.filter((i) => !porA.includes(i))];
    if (achados.length === 1) {
      setItem(achados[0]);
      setComp(porA.includes(achados[0]) ? "kit" : "b");
      setAvisoScan(null);
    } else {
      setBuscaInicial(e.lote ?? "");
      setAvisoScan(
        achados.length
          ? `Lote ${e.lote} aparece em ${achados.length} tintas — escolha abaixo.`
          : `Lote ${e.lote ?? "?"} não está no estoque com saldo. Busque pelo nome.`,
      );
      if (!achados.length) setBuscaInicial("");
    }
  }
  const compEfetivo = temB ? comp : "a";
  const qa = compEfetivo === "b" ? 0 : n;
  const qb = compEfetivo === "a" ? 0 : n;

  async function salvar() {
    if (!item) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await registrarMovimentoPintura({ tipo: "saida", item: item.chave, qt_a: qa, qt_b: qb, mac, obs, por });
      setFeito(r);
      aoLancar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (feito && item)
    return (
      <Janela titulo="Baixa lançada" aoFechar={aoFechar}>
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-orange-50 p-4 text-orange-900 dark:bg-orange-500/10 dark:text-orange-200">
            <p className="text-lg font-bold">✔ Saída lançada</p>
            <p className="text-sm">
              {item.produto} {item.cor ? `· ${item.cor}` : ""}
            </p>
            <p className="mt-1 text-sm">
              Ficou: <b>{qtd(feito.saldo_a ?? 0)} {item.un_a}</b>
              {temB && (
                <>
                  {" "}
                  (A) · <b>{qtd(feito.saldo_b ?? 0)} {item.un_b}</b> (B)
                </>
              )}
            </p>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-stone-700 dark:text-slate-300">Foto (opcional):</p>
            <Fotos movimentoId={feito.id} fotos={fotos} por={por} podeApagar aoMudar={setFotos} />
          </div>
          <button type="button" onClick={aoFechar} className="rounded-xl bg-orange-600 py-3 text-base font-bold text-white hover:bg-orange-500">
            Concluir
          </button>
        </div>
      </Janela>
    );

  return (
    <Janela titulo="− Saiu tinta" aoFechar={aoFechar}>
      {escaneando && <EscanerEtiqueta titulo="Escanear a lata que saiu" aoLer={aoLerEtiqueta} aoFechar={() => setEscaneando(false)} />}
      {!item ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setEscaneando(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-base font-bold text-white shadow hover:bg-blue-500 active:scale-[0.98] dark:bg-cyan-500 dark:text-slate-950"
          >
            <span className="text-2xl leading-none">▣</span> Escanear a lata
          </button>
          {avisoScan && (
            <p className="rounded-lg bg-amber-50 p-2.5 text-sm font-semibold text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{avisoScan}</p>
          )}
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">ou digite produto, cor, lote, local ou nº do IT:</p>
          <BuscaRapida
            key={buscaInicial ?? "-"}
            inicial={buscaInicial}
            autoFoco
            opcoes={itens}
            textoBusca={(i) => `${i.it ?? ""} ${i.produto ?? ""} ${i.fabricante ?? ""} ${i.cor ?? ""} ${i.lote_a ?? ""} ${i.local ?? ""}`}
            placeholder="Buscar no estoque…"
            aoEscolher={(i) => typeof i !== "string" && setItem(i)}
            render={(i) => (
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-stone-800 dark:text-slate-100">{i.produto}</div>
                  <div className="text-xs text-stone-500 dark:text-slate-400">
                    {[i.cor, `IT ${i.it}`, i.local && `Local ${i.local}`, i.lote_a && `Lote ${i.lote_a}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <Qt q={i.qt_a} un={i.un_a} />
                  {i.qt_b > 0 && (
                    <div className="text-xs text-stone-500">
                      B: {qtd(i.qt_b)} {i.un_b}
                    </div>
                  )}
                </div>
              </div>
            )}
          />
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div className="flex items-start justify-between gap-2 rounded-lg bg-stone-100 p-3 dark:bg-slate-800">
            <div>
              <p className="font-bold text-stone-800 dark:text-slate-100">{item.produto}</p>
              <p className="text-xs text-stone-500 dark:text-slate-400">
                {[item.cor, `IT ${item.it}`, item.local && `Local ${item.local}`].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-sm">
                Tem: <Qt q={item.qt_a} un={item.un_a} />
                {temB && (
                  <>
                    {" "}
                    (A) · <Qt q={item.qt_b} un={item.un_b} /> (B)
                  </>
                )}
              </p>
            </div>
            {!inicial && (
              <button type="button" onClick={() => setItem(null)} className="text-xs font-semibold text-blue-600 dark:text-cyan-400">
                Trocar
              </button>
            )}
          </div>
          {temB && (
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["kit", "A + B (kit)"],
                  ["a", "Só A"],
                  ["b", "Só B"],
                ] as const
              ).map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setComp(v)}
                  className={`rounded-lg border py-2.5 text-sm font-semibold ${
                    comp === v ? "border-orange-600 bg-orange-600 text-white" : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          <div>
            <p className="mb-2 text-xs font-semibold text-stone-600 dark:text-slate-400">Quanto saiu (latas)?</p>
            <div className="grid grid-cols-5 gap-2">
              {FRACOES.map((x) => (
                <button
                  key={x.v}
                  type="button"
                  onClick={() => setQ(String(x.v))}
                  className={`rounded-xl border py-3 text-xl font-bold ${
                    n === x.v ? "border-orange-600 bg-orange-600 text-white" : "border-stone-300 text-stone-800 dark:border-slate-600 dark:text-slate-100"
                  }`}
                >
                  {x.r}
                </button>
              ))}
            </div>
            <label className={`${rotulo} mt-2`}>
              Outra quantidade
              <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="decimal" className={`${campo} text-center font-bold`} />
            </label>
            <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
              Vai ficar: <b>{qtd(item.qt_a - qa)} {item.un_a}</b>
              {temB && (
                <>
                  {" "}
                  (A) · <b>{qtd(item.qt_b - qb)} {item.un_b}</b> (B)
                </>
              )}
              {(item.qt_a - qa < 0 || item.qt_b - qb < 0) && <span className="ml-1 font-semibold text-red-600">— mais do que tem!</span>}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={rotulo}>
              MAC / obra (opcional)
              <input value={mac} onChange={(e) => setMac(e.target.value)} className={campo} />
            </label>
            <label className={rotulo}>
              Observação
              <input value={obs} onChange={(e) => setObs(e.target.value)} className={campo} />
            </label>
          </div>
          {erro && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
          <button
            type="submit"
            disabled={salvando || n <= 0}
            className="rounded-xl bg-orange-600 py-3.5 text-base font-bold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            {salvando ? "Lançando…" : "Dar baixa"}
          </button>
        </form>
      )}
    </Janela>
  );
}

// ---------------------------------------------------------------- página

export default function PaginaPintura() {
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  const [admin, setAdmin] = useState(false);
  const [planilha, setPlanilha] = useState<RespostaPintura | null>(null);
  const [dados, setDados] = useState<RespostaEstoquePintura | null>(null);
  const [nec, setNec] = useState<RespostaNecessidade | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<Aba>("estoque");
  const [busca, setBusca] = useState("");
  const [fabr, setFabr] = useState<string | null>(null);
  const [tipo, setTipo] = useState<string | null>(null);
  const [cartao, setCartao] = useState<FiltroCartao>("todos");
  const [janela, setJanela] = useState<"entrada" | "saida" | null>(null);
  const [baixaDe, setBaixaDe] = useState<ItemEstoquePintura | null>(null);
  const [detalhe, setDetalhe] = useState<ItemEstoquePintura | null>(null);
  const [aberto, setAberto] = useState<string | null>(null); // grupo da necessidade aberto
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [p, e] = await Promise.all([listarPintura(), listarEstoquePintura()]);
      setPlanilha(p);
      setDados(e);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarNec = useCallback(async () => {
    try {
      setNec(await necessidadePintura());
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let parar: (() => void) | undefined;
    let vivo = true;
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => {
        if (!vivo) return;
        const ok = podeVerPintura(data.user);
        setPermitido(ok);
        setLogin(data.user?.email ? emailParaLogin(data.user.email) : null);
        setAdmin(podeCorrigirPintura(data.user?.email));
        if (!ok) return setCarregando(false);
        carregar();
        parar = repetirComAbaVisivel(carregar, 3 * 60 * 1000);
      });
    return () => {
      vivo = false;
      parar?.();
    };
  }, [carregar]);

  function trocarAba(nova: Aba) {
    setAba(nova);
    setFabr(null);
    setTipo(null);
    setCartao("todos");
    if (nova === "necessidade") carregarNec();
  }

  const hoje = hojeIso();
  const limite = somarDias(hoje, DIAS_ALERTA);

  const estoque = useMemo(
    () =>
      (dados?.estoque ?? []).map((i) => {
        const sa = situacao(i.venc_a, i.qt_a, hoje, limite);
        const sb = situacao(i.venc_b, i.qt_b, hoje, limite);
        const pior = (["vencido", "vence", "ok", "sem"] as Situacao[]).find((s) => s === sa || s === sb) ?? "sem";
        return { ...i, sa, sb, pior, fab: fabricante(i.fabricante), tp: String(i.tipo ?? "").trim() || "—" };
      }),
    [dados, hoje, limite],
  );

  // Catálogo (aba Tinta) como dicionário por campo.
  const catalogo = useMemo(() => {
    const cols = planilha?.status?.colunas.tinta ?? [];
    return (planilha?.linhas.tinta ?? []).map((l) => {
      const v: Record<string, ValorControleObras> = {};
      cols.forEach((c, i) => {
        if (c.campo) v[c.campo] = l.valores[i] ?? null;
      });
      return { linha: l.linha, v, fab: fabricante(v.fabricante), tp: String(v.tipo ?? "").trim() || "—" };
    });
  }, [planilha]);

  // Opções do "Chegou tinta": o que já tem no estoque (com cor/unidade/local) + catálogo.
  const opcoesEntrada = useMemo<OpcaoProduto[]>(() => {
    const vistos = new Set<string>();
    const lista: OpcaoProduto[] = [];
    for (const i of estoque) {
      if (!i.produto) continue;
      const k = normalizarBusca(`${i.produto}|${i.cor ?? ""}`);
      if (vistos.has(k)) continue;
      vistos.add(k);
      lista.push({ produto: i.produto, fabricante: i.fabricante, cor: i.cor, un_a: i.un_a, un_b: i.un_b, local: i.local, origem: "já tem no estoque" });
    }
    for (const c of catalogo) {
      const p = String(c.v.produto_cpa ?? "").trim();
      if (!p || vistos.has(normalizarBusca(`${p}|`))) continue;
      vistos.add(normalizarBusca(`${p}|`));
      const cor = String(c.v.cor ?? "");
      lista.push({ produto: p, fabricante: c.v.fabricante ? String(c.v.fabricante) : null, cor: cor && !cor.includes("*") ? cor : null, un_a: null, un_b: null, local: null, origem: "catálogo" });
    }
    return lista;
  }, [estoque, catalogo]);

  const comSaldo = useMemo(() => estoque.filter((i) => i.qt_a > 0 || i.qt_b > 0), [estoque]);

  const resumo = useMemo(
    () => ({
      todos: estoque.length,
      com_estoque: comSaldo.length,
      zerados: estoque.length - comSaldo.length,
      vencidos: estoque.filter((e) => e.pior === "vencido").length,
      vencem: estoque.filter((e) => e.pior === "vence").length,
    }),
    [estoque, comSaldo],
  );

  const termos = termosDe(busca);
  const estoqueFiltrado = estoque.filter(
    (e) =>
      (!fabr || e.fab === fabr) &&
      (!tipo || e.tp === tipo) &&
      (cartao === "todos" ||
        (cartao === "com_estoque" && (e.qt_a > 0 || e.qt_b > 0)) ||
        (cartao === "zerados" && e.qt_a <= 0 && e.qt_b <= 0) ||
        (cartao === "vencidos" && e.pior === "vencido") ||
        (cartao === "vencem" && e.pior === "vence")) &&
      casa(termos, e.it, e.produto, e.fabricante, e.cor, e.lote_a, e.lote_b, e.local, e.mac, e.tipo),
  );
  const catalogoFiltrado = catalogo.filter((c) => (!fabr || c.fab === fabr) && (!tipo || c.tp === tipo) && casa(termos, ...Object.values(c.v)));
  const movimentos = (dados?.movimentos ?? []).filter((m) => casa(termos, m.it, m.produto, m.cor, m.lote_a, m.mac, m.obs, m.por, m.local));
  const grupos = (nec?.grupos ?? []).filter((g) => casa(termos, g.produto, g.cor, ...g.pedidos.flatMap((p) => [p.po, p.mac, p.cliente])));

  const base = aba === "catalogo" ? catalogo : estoque;
  const contar = (chave: "fab" | "tp") => {
    const m = new Map<string, number>();
    for (const x of base) m.set(x[chave], (m.get(x[chave]) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };

  const st = planilha?.status;
  const hora = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  const chip = (ativo: boolean) =>
    `whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
      ativo
        ? "border-blue-600 bg-blue-600 text-white dark:border-cyan-400 dark:bg-cyan-400 dark:text-slate-950"
        : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
    }`;
  const th = "sticky top-0 z-10 bg-stone-100 px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-stone-500 dark:bg-slate-800 dark:text-slate-400";
  const td = "px-2 py-1.5 align-top";

  function atualizarFotosMov(id: string, fotos: FotoPintura[]) {
    setDados((d) =>
      d
        ? {
            estoque: d.estoque.map((i) => (i.movimento_id === id ? { ...i, fotos } : i)),
            movimentos: d.movimentos.map((m) => (m.id === id ? { ...m, fotos } : m)),
          }
        : d,
    );
  }

  async function excluir(m: MovimentoPintura) {
    if (confirmar !== m.id) {
      setConfirmar(m.id);
      return;
    }
    setConfirmar(null);
    try {
      await excluirMovimentoPintura(m.id, login);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (permitido === false) {
    return (
      <AppShell titulo="Pintura">
        <p className="p-6 text-sm text-stone-600 dark:text-slate-400">Acesso restrito.</p>
      </AppShell>
    );
  }

  const cartoes: { chave: FiltroCartao; rotulo: string; valor: number; cor: string }[] = [
    { chave: "todos", rotulo: "Tintas", valor: resumo.todos, cor: "text-stone-800 dark:text-slate-100" },
    { chave: "com_estoque", rotulo: "Com saldo", valor: resumo.com_estoque, cor: "text-emerald-600 dark:text-emerald-400" },
    { chave: "zerados", rotulo: "Zeradas", valor: resumo.zerados, cor: "text-stone-500 dark:text-slate-400" },
    { chave: "vencidos", rotulo: "Vencidas c/ saldo", valor: resumo.vencidos, cor: "text-red-600 dark:text-red-400" },
    { chave: "vencem", rotulo: `Vencem em ${DIAS_ALERTA} d`, valor: resumo.vencem, cor: "text-amber-600 dark:text-amber-400" },
  ];

  const abas: [Aba, string][] = [
    ["estoque", `Estoque (${comSaldo.length})`],
    ["movimentos", `Movimentos (${dados?.movimentos.length ?? 0})`],
    ["necessidade", "Vai ter tinta?"],
    ["catalogo", `Catálogo (${catalogo.length})`],
  ];

  return (
    <AppShell
      titulo="Pintura"
      subtitulo={
        <span title={st?.arquivo}>
          Planilha lida {hora(st?.ultima_verificacao_em)}
          {st?.ultimo_erro && <span className="text-red-500"> · erro na última leitura</span>}
        </span>
      }
      acoes={
        <button type="button" onClick={() => (carregar(), aba === "necessidade" && carregarNec())} className={classeBotaoCabecalho} title="Atualizar">
          ⟳<span className="hidden sm:inline"> Atualizar</span>
        </button>
      }
    >
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {/* Ações do felipe — grandes pro celular */}
        <div className="grid grid-cols-2 gap-2 sm:max-w-md">
          <button
            type="button"
            onClick={() => setJanela("entrada")}
            className="rounded-2xl bg-green-600 px-3 py-4 text-left text-white shadow-md transition hover:bg-green-500 active:scale-[0.98]"
          >
            <span className="block text-2xl font-black leading-none">＋</span>
            <span className="block text-base font-bold">Chegou tinta</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setBaixaDe(null);
              setJanela("saida");
            }}
            className="rounded-2xl bg-orange-600 px-3 py-4 text-left text-white shadow-md transition hover:bg-orange-500 active:scale-[0.98]"
          >
            <span className="block text-2xl font-black leading-none">−</span>
            <span className="block text-base font-bold">Saiu tinta</span>
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-stone-200 dark:border-slate-800">
          {abas.map(([v, r]) => (
            <button
              key={v}
              type="button"
              onClick={() => trocarAba(v)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${
                aba === v
                  ? "border-blue-600 text-blue-700 dark:border-cyan-400 dark:text-cyan-300"
                  : "border-transparent text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {erro && (
          <div className="flex justify-between rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            {erro}
            <button type="button" onClick={() => setErro(null)} className="ml-3 font-bold">
              ×
            </button>
          </div>
        )}

        {aba === "estoque" && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {cartoes.map((c) => (
              <button
                key={c.chave}
                type="button"
                onClick={() => setCartao(cartao === c.chave ? "todos" : c.chave)}
                className={`rounded-xl border bg-white px-2.5 py-2 text-left shadow-sm transition hover:shadow-md dark:bg-slate-900 ${
                  cartao === c.chave && c.chave !== "todos"
                    ? "border-blue-500 ring-2 ring-blue-500/20 dark:border-cyan-400"
                    : "border-stone-200 dark:border-slate-800"
                }`}
              >
                <div className={`text-xl font-extrabold tabular-nums sm:text-2xl ${c.cor}`}>{carregando ? "…" : c.valor}</div>
                <div className="text-[11px] leading-tight text-stone-500 sm:text-xs dark:text-slate-400">{c.rotulo}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="relative w-full sm:w-96">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={aba === "necessidade" ? "Buscar cor, produto, PO, MAC…" : "Buscar produto, cor, lote, local, IT…"}
              className={`${campo} pl-8`}
              inputMode="search"
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400">⌕</span>
          </div>
          {(aba === "estoque" || aba === "catalogo") && (
            <>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                <span className="self-center pr-1 text-xs font-semibold text-stone-500 dark:text-slate-400">Fabricante:</span>
                <button type="button" className={chip(!fabr)} onClick={() => setFabr(null)}>
                  Todos
                </button>
                {contar("fab").map(([f, n]) => (
                  <button key={f} type="button" className={chip(fabr === f)} onClick={() => setFabr(fabr === f ? null : f)}>
                    {f} <span className="opacity-60">{n}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                <span className="self-center pr-1 text-xs font-semibold text-stone-500 dark:text-slate-400">Tipo:</span>
                <button type="button" className={chip(!tipo)} onClick={() => setTipo(null)}>
                  Todos
                </button>
                {contar("tp").map(([t, n]) => (
                  <button key={t} type="button" className={chip(tipo === t)} onClick={() => setTipo(tipo === t ? null : t)}>
                    {t} <span className="opacity-60">{n}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {carregando && <p className="p-6 text-center text-sm text-stone-500 dark:text-slate-400">Carregando…</p>}

        {/* ------------------------------------------------ Estoque */}
        {aba === "estoque" && !carregando && (
          <>
            {/* Celular: cartões */}
            <div className="flex flex-col gap-2 sm:hidden">
              {estoqueFiltrado.map((e) => (
                <button
                  key={e.chave}
                  type="button"
                  onClick={() => setDetalhe(e)}
                  className={`rounded-xl border border-stone-200 bg-white p-3 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900 ${
                    e.qt_a <= 0 && e.qt_b <= 0 ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-stone-800 dark:text-slate-100">
                        {e.produto} {e.origem === "app" && <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-700 dark:bg-cyan-500/20 dark:text-cyan-300">APP</span>}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-slate-400">
                        {[e.cor, e.fab, `IT ${e.it}`, e.local && `Local ${e.local}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Qt q={e.qt_a} un={e.un_a} />
                      {(e.qt_b > 0 || e.qt_inicial_b > 0) && (
                        <div className="text-xs text-stone-500 dark:text-slate-400">
                          B: {qtd(e.qt_b)} {e.un_b}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                    {e.venc_a && <Venc v={e.venc_a} s={e.sa} />}
                    {e.venc_b && e.sb !== "sem" && e.sb !== "ok" && <Venc v={e.venc_b} s={e.sb} />}
                  </div>
                </button>
              ))}
            </div>
            {/* PC: tabela */}
            <div className="hidden max-h-[calc(100dvh-22rem)] min-h-[16rem] overflow-auto rounded-xl border border-stone-200 bg-white sm:block dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full min-w-[1100px] text-sm text-stone-700 dark:text-slate-300">
                <thead>
                  <tr>
                    <th className={th}>IT</th>
                    <th className={th}>Fabr.</th>
                    <th className={th}>Produto</th>
                    <th className={th}>Cor</th>
                    <th className={th}>Tipo</th>
                    <th className={th}>Local</th>
                    <th className={`${th} border-l border-stone-200 dark:border-slate-700`}>Saldo A</th>
                    <th className={th}>Lote A</th>
                    <th className={th}>Venc. A</th>
                    <th className={`${th} border-l border-stone-200 dark:border-slate-700`}>Saldo B</th>
                    <th className={th}>Lote B</th>
                    <th className={th}>Venc. B</th>
                    <th className={`${th} border-l border-stone-200 dark:border-slate-700`}>MAC</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {estoqueFiltrado.map((e) => (
                    <tr
                      key={e.chave}
                      onClick={() => setDetalhe(e)}
                      className={`cursor-pointer border-t border-stone-100 hover:bg-blue-50/60 dark:border-slate-800 dark:hover:bg-slate-800/60 ${
                        e.qt_a <= 0 && e.qt_b <= 0 ? "opacity-60" : ""
                      }`}
                    >
                      <td className={`${td} tabular-nums text-stone-400`}>{e.it}</td>
                      <td className={td}>{e.fab}</td>
                      <td className={`${td} font-semibold text-stone-800 dark:text-slate-100`}>
                        {e.produto}
                        {e.origem === "app" && (
                          <span className="ml-1.5 rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-700 dark:bg-cyan-500/20 dark:text-cyan-300" title={`Lançada no app por ${e.entrada_por ?? "?"} em ${dataHora(e.entrada_em)}`}>
                            APP
                          </span>
                        )}
                      </td>
                      <td className={td}>{e.cor}</td>
                      <td className={td}>{e.tp === "—" ? "" : e.tp}</td>
                      <td className={`${td} font-mono text-xs`}>{e.local}</td>
                      <td className={`${td} border-l border-stone-100 dark:border-slate-800`}>
                        <Qt q={e.qt_a} un={e.un_a} />
                        {e.saida_a > 0 && <span className="ml-1 text-[10px] text-orange-600">−{qtd(e.saida_a)}</span>}
                      </td>
                      <td className={`${td} font-mono text-xs`}>{e.lote_a}</td>
                      <td className={td}>
                        <Venc v={e.venc_a} s={e.sa} />
                      </td>
                      <td className={`${td} border-l border-stone-100 dark:border-slate-800`}>
                        {e.qt_inicial_b > 0 || e.qt_b !== 0 ? <Qt q={e.qt_b} un={e.un_b} /> : <span className="text-stone-300 dark:text-slate-600">—</span>}
                      </td>
                      <td className={`${td} font-mono text-xs`}>{e.lote_b}</td>
                      <td className={td}>
                        <Venc v={e.venc_b} s={e.sb} />
                      </td>
                      <td className={`${td} border-l border-stone-100 text-xs dark:border-slate-800`}>{e.mac}</td>
                      <td className={td}>
                        {(e.qt_a > 0 || e.qt_b > 0) && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setBaixaDe(e);
                              setJanela("saida");
                            }}
                            className="rounded-md border border-orange-300 px-2 py-0.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 dark:border-orange-500/40 dark:text-orange-300 dark:hover:bg-orange-500/10"
                          >
                            Baixa
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!estoqueFiltrado.length && <p className="p-6 text-center text-sm text-stone-500 dark:text-slate-400">Nada encontrado com esses filtros.</p>}
          </>
        )}

        {/* ------------------------------------------------ Movimentos */}
        {aba === "movimentos" && !carregando && (
          <div className="flex flex-col gap-2">
            {!movimentos.length && (
              <p className="p-6 text-center text-sm text-stone-500 dark:text-slate-400">
                Nenhum lançamento ainda. Use “Chegou tinta” ou “Saiu tinta”.
              </p>
            )}
            {movimentos.map((m) => (
              <div key={m.id} className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                          m.tipo === "entrada" ? "bg-green-600 text-white" : "bg-orange-600 text-white"
                        }`}
                      >
                        {m.tipo === "entrada" ? "＋ Entrada" : "− Saída"}
                      </span>
                      <span className="text-xs text-stone-400">#{m.seq}</span>
                      <span className="text-xs text-stone-500 dark:text-slate-400">
                        {dataHora(m.em)} · {m.por ?? "?"}
                      </span>
                    </div>
                    <p className="mt-1 font-semibold text-stone-800 dark:text-slate-100">
                      {m.produto} {m.cor && <span className="font-normal text-stone-500 dark:text-slate-400">· {m.cor}</span>}
                    </p>
                    <p className="text-sm text-stone-600 dark:text-slate-300">
                      IT {m.it} · A: <b>{qtd(m.qt_a)}</b> {m.un_a}
                      {m.qt_b > 0 && (
                        <>
                          {" "}
                          · B: <b>{qtd(m.qt_b)}</b> {m.un_b}
                        </>
                      )}
                      {m.lote_a && ` · Lote ${m.lote_a}`}
                      {m.venc_a && ` · Venc. ${dataBr(m.venc_a)}`}
                      {m.mac && ` · MAC ${m.mac}`}
                    </p>
                    {m.obs && <p className="text-xs text-stone-500 dark:text-slate-400">{m.obs}</p>}
                  </div>
                  {admin && (
                    <button
                      type="button"
                      onClick={() => excluir(m)}
                      className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold ${
                        confirmar === m.id ? "bg-red-600 text-white" : "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                      }`}
                      title={m.tipo === "entrada" ? "Excluir a entrada (e as saídas dela)" : "Excluir a saída"}
                    >
                      {confirmar === m.id ? "Confirmar?" : "Excluir"}
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <Fotos movimentoId={m.id} fotos={m.fotos} por={login} podeApagar={admin || m.por === login} aoMudar={(f) => atualizarFotosMov(m.id, f)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ------------------------------------------------ Vai ter tinta? */}
        {aba === "necessidade" && (
          <div className="flex flex-col gap-2">
            {!nec && <p className="p-6 text-center text-sm text-stone-500 dark:text-slate-400">Cruzando pedidos com o estoque…</p>}
            {nec && (
              <p className="rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-600 dark:bg-slate-800 dark:text-slate-300">
                {nec.pedidos} pedidos ativos ainda sem pintura concluída. Cruzamento pela <b>Cor 1 / Cor 2</b>
                {nec.planos_lidos > 0 ? (
                  <>
                    {" "}
                    e pelo <b>produto do plano de pintura</b> ({nec.planos_lidos} planos lidos pela IA, uma vez cada)
                  </>
                ) : null}
                .
                {nec.planos_sem_ia > 0 && <> {nec.planos_sem_ia} pedidos têm plano ainda não lido — esses cruzam só pela cor.</>}
              </p>
            )}
            {nec && (
              <div className="flex flex-wrap gap-2 text-xs">
                {(Object.keys(NECESSIDADE) as SituacaoNecessidade[]).map((s) => (
                  <span key={s} className={`rounded-full px-2.5 py-1 font-semibold ${NECESSIDADE[s].classe}`}>
                    {NECESSIDADE[s].rotulo}: {nec.grupos.filter((g) => g.situacao === s).length}
                  </span>
                ))}
              </div>
            )}
            {grupos.map((g: GrupoNecessidade) => {
              const k = `${g.produto ?? ""}|${g.cor ?? ""}`;
              const ab = aberto === k;
              return (
                <div key={k} className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <button type="button" onClick={() => setAberto(ab ? null : k)} className="flex w-full items-start gap-3 p-3 text-left">
                    <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold ${NECESSIDADE[g.situacao].classe}`}>{NECESSIDADE[g.situacao].rotulo}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-stone-800 dark:text-slate-100">
                        {g.produto ?? <span className="font-normal italic text-stone-500">produto não identificado</span>}
                        {g.cor && <span className="font-semibold text-blue-700 dark:text-cyan-300"> · {g.cor}</span>}
                      </p>
                      <p className="text-xs text-stone-500 dark:text-slate-400">
                        {g.pedidos.length} pedido{g.pedidos.length > 1 ? "s" : ""} · {qtd(g.peso_total)} kg
                        {g.micras.length > 0 && ` · ${g.micras.join("/")} µm`}
                        {g.pedidos[0]?.prazo && ` · prazo mais próximo ${dataBr(g.pedidos[0].prazo)}`}
                        {g.situacao === "tem" && ` · saldo ${qtd(g.saldo_a)}`}
                      </p>
                    </div>
                    <span className="text-stone-400">{ab ? "▴" : "▾"}</span>
                  </button>
                  {ab && (
                    <div className="border-t border-stone-100 p-3 text-sm dark:border-slate-800">
                      <p className="mb-1 text-xs font-bold uppercase text-stone-500 dark:text-slate-400">No estoque</p>
                      {g.estoque.length ? (
                        <ul className="mb-3 flex flex-col gap-1">
                          {g.estoque.map((e) => (
                            <li key={e.chave} className="flex justify-between gap-2">
                              <span>
                                {e.produto} <span className="text-stone-500">· {e.cor ?? "—"} · IT {e.it}</span>
                              </span>
                              <span className="shrink-0">
                                <Qt q={e.qt_a} un={e.un_a} />
                                {e.venc_a && <span className="ml-1 text-xs text-stone-500">{dataBr(e.venc_a)}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mb-3 text-stone-500">Nada parecido no estoque.</p>
                      )}
                      <p className="mb-1 text-xs font-bold uppercase text-stone-500 dark:text-slate-400">Pedidos</p>
                      <ul className="flex flex-col gap-1">
                        {g.pedidos.map((p) => (
                          <li key={p.po} className="flex justify-between gap-2 border-b border-stone-100 pb-1 dark:border-slate-800">
                            <span className="min-w-0">
                              <b>{p.po}</b> {p.mac && <span className="text-stone-500">· MAC {p.mac}</span>}
                              <span className="block truncate text-xs text-stone-500">{p.descricao}</span>
                            </span>
                            <span className="shrink-0 text-right text-xs text-stone-500">
                              {p.prazo && dataBr(p.prazo)}
                              <br />
                              {qtd(p.peso_total)} kg
                            </span>
                          </li>
                        ))}
                      </ul>
                      {g.planos.length > 0 && (
                        <details className="mt-2 text-xs text-stone-500 dark:text-slate-400">
                          <summary className="cursor-pointer">Plano de pintura</summary>
                          {g.planos.map((p) => (
                            <p key={p} className="mt-1">
                              {p}
                            </p>
                          ))}
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ------------------------------------------------ Catálogo */}
        {aba === "catalogo" && !carregando && (
          <div className="max-h-[calc(100dvh-20rem)] min-h-[16rem] overflow-auto rounded-xl border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[900px] text-sm text-stone-700 dark:text-slate-300">
              <thead>
                <tr>
                  <th className={th}>Fabricante</th>
                  <th className={th}>Produto</th>
                  <th className={th}>Tipo</th>
                  <th className={th}>Cor</th>
                  <th className={th}>Diluente</th>
                  <th className={th}>Diluição</th>
                  <th className={th}>Sól./Vol</th>
                  <th className={th}>Micras recom.</th>
                  <th className={th}>M2/GL</th>
                  <th className={th}>Composição</th>
                </tr>
              </thead>
              <tbody>
                {catalogoFiltrado.map((c) => (
                  <tr key={c.linha} className="border-t border-stone-100 dark:border-slate-800">
                    <td className={td}>{c.fab}</td>
                    <td className={`${td} font-semibold text-stone-800 dark:text-slate-100`}>{texto(c.v.produto_cpa)}</td>
                    <td className={td}>{c.tp === "—" ? "" : c.tp}</td>
                    <td className={td}>{texto(c.v.cor)}</td>
                    <td className={td}>{texto(c.v.diluente)}</td>
                    <td className={td}>{texto(c.v.diluicao)}</td>
                    <td className={`${td} tabular-nums`}>{texto(c.v.sol_vol)}</td>
                    <td className={`${td} tabular-nums`}>{texto(c.v.micras_recom)}</td>
                    <td className={`${td} tabular-nums`}>{texto(c.v.m2_gl)}</td>
                    <td className={`${td} max-w-[22rem] truncate text-xs text-stone-500 dark:text-slate-400`} title={texto(c.v.composicao)}>
                      {texto(c.v.composicao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-stone-500 dark:text-slate-400">
          Estoque = planilha original do J: (lida a cada 15 min) + lançamentos do app. Tudo vai também pra planilha nova
          “PCP-Pintura-Estoque (FC Nexus).xlsx” na mesma pasta.
        </p>
      </div>

      {detalhe && (
        <Janela titulo={detalhe.produto ?? "Tinta"} aoFechar={() => setDetalhe(null)}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {(
              [
                ["IT", detalhe.it],
                ["Origem", detalhe.origem === "app" ? `App — ${detalhe.entrada_por ?? "?"} em ${dataHora(detalhe.entrada_em)}` : `Planilha (linha ${detalhe.linha})`],
                ["Fabricante", fabricante(detalhe.fabricante)],
                ["Cor", detalhe.cor],
                ["Tipo", detalhe.tipo],
                ["Local", detalhe.local],
                ["Saldo A", `${qtd(detalhe.qt_a)} ${detalhe.un_a ?? ""}${detalhe.saida_a ? ` (saiu ${qtd(detalhe.saida_a)} pelo app)` : ""}`],
                ["Lote A", detalhe.lote_a],
                ["Venc. A", dataBr(detalhe.venc_a)],
                ["Produto B", detalhe.produto_b],
                ["Saldo B", `${qtd(detalhe.qt_b)} ${detalhe.un_b ?? ""}${detalhe.saida_b ? ` (saiu ${qtd(detalhe.saida_b)} pelo app)` : ""}`],
                ["Lote B", detalhe.lote_b],
                ["Venc. B", dataBr(detalhe.venc_b)],
                ["Diluente", detalhe.diluente],
                ["Petrobras", detalhe.petrobras],
                ["MAC", detalhe.mac],
                ["Obs.", detalhe.obs],
              ] as [string, unknown][]
            )
              .filter(([, v]) => v != null && v !== "" && v !== 0)
              .map(([r, v]) => (
                <div key={r} className="border-b border-stone-100 pb-1 dark:border-slate-800">
                  <dt className="text-xs font-semibold text-stone-500 dark:text-slate-400">{r}</dt>
                  <dd className="text-stone-800 dark:text-slate-100">{String(v)}</dd>
                </div>
              ))}
          </dl>
          {detalhe.movimento_id && (
            <div className="mt-3">
              <p className="mb-1 text-xs font-bold uppercase text-stone-500 dark:text-slate-400">Fotos</p>
              <Fotos
                movimentoId={detalhe.movimento_id}
                fotos={detalhe.fotos ?? []}
                por={login}
                podeApagar={admin || detalhe.entrada_por === login}
                aoMudar={(f) => {
                  atualizarFotosMov(detalhe.movimento_id!, f);
                  setDetalhe({ ...detalhe, fotos: f });
                }}
              />
            </div>
          )}
          {(detalhe.qt_a > 0 || detalhe.qt_b > 0) && (
            <button
              type="button"
              onClick={() => {
                setBaixaDe(detalhe);
                setDetalhe(null);
                setJanela("saida");
              }}
              className="mt-4 w-full rounded-xl bg-orange-600 py-3 text-base font-bold text-white hover:bg-orange-500"
            >
              − Dar baixa nesta tinta
            </button>
          )}
        </Janela>
      )}

      {janela === "entrada" && <JanelaEntrada opcoes={opcoesEntrada} por={login} aoFechar={() => setJanela(null)} aoLancar={carregar} />}
      {janela === "saida" && (
        <JanelaSaida
          itens={comSaldo}
          inicial={baixaDe}
          por={login}
          aoFechar={() => {
            setJanela(null);
            setBaixaDe(null);
          }}
          aoLancar={carregar}
        />
      )}
    </AppShell>
  );
}
