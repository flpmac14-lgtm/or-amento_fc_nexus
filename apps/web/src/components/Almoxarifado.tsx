"use client";

// Aba Almoxarifado (leandro) — pedido do usuário (28/10/2026): digitar a MAC ou
// o pedido e ver, organizado, tudo o que o Compras pensou pra obra:
//   1. Pedidos de compra do Sectra (o que o comprador comprou, com a NF de entrada);
//   2. Lista do projeto (lista mãe = Material de compra/MACLM), por conjunto e
//      por PO, com a imagem e o pedido de compra/NF do Sectra de cada peça do Follow up;
//   3. Fotos do que chegou.
// Em cada linha: "✔ Chegou" (quem e quando fica gravado) e "📷 Foto" (como na
// Pintura). Feito pra celular: botões grandes e passo a passo no topo.
// Dados: /api/follow-up/almoxarifado (lib/almoxarifado.ts, migration 0061).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUS_PC, type CompraValdir } from "@/components/FollowUpCompras";
import {
  chavePc,
  datasDaMac,
  hojeIso,
  macBase,
  urlImagemAlmox,
  type Conferencia,
  type DetalheMac,
  type FotoAlmox,
  type ItemAlmox,
  type LinhaLista,
  type OpcaoMac,
  type RespostaAlmox,
} from "@/lib/almoxarifado";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { normalizarBusca } from "@/lib/busca";

const API = "/api/follow-up/almoxarifado";
const CHAVE_RECENTES = "fcnexus.almox.recentes";
const LADO_MAX = 2000;

type Filtro = "todos" | "falta" | "chegou";

function lerRecentes(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
function gravarRecente(mac: string) {
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify([mac, ...lerRecentes().filter((m) => m !== mac)].slice(0, 8)));
  } catch {
    // sem armazenamento: só não lembra
  }
}

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Foto de celular tem 4–12 MB: reduz pra ~2000 px em JPEG (a Vercel aceita até 4,5 MB).
async function reduzir(arquivo: File): Promise<{ blob: Blob; largura: number; altura: number }> {
  const bmp = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) throw new Error("Não consegui preparar a foto.");
  return { blob, largura: canvas.width, altura: canvas.height };
}

// --- peças ------------------------------------------------------------------------

function BotaoChegou({ conf, mudar, pequeno = false }: { conf: Conferencia | undefined; mudar: (chegou: boolean) => void; pequeno?: boolean }) {
  const ok = !!conf;
  return (
    <button
      type="button"
      onClick={() => mudar(!ok)}
      aria-pressed={ok}
      title={ok ? `Conferido por ${conf.por ?? "—"} em ${dataHora(conf.em)} — toque pra desmarcar` : "Marcar que chegou"}
      className={`flex shrink-0 items-center justify-center gap-1 rounded-lg border-2 font-bold print:border-0 print:p-0 ${
        pequeno ? "h-9 min-w-[5.5rem] px-2 text-xs" : "h-11 min-w-[7rem] px-3 text-sm"
      } ${
        ok
          ? "border-green-700 bg-green-700 text-white dark:border-green-500 dark:bg-green-600"
          : "border-stone-300 bg-white text-stone-600 hover:border-green-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
      }`}
    >
      {ok ? "✔ Chegou" : "☐ Chegou?"}
    </button>
  );
}

function QuemConferiu({ conf }: { conf: Conferencia | undefined }) {
  if (!conf) return null;
  return (
    <p className="text-[11px] font-semibold text-green-700 dark:text-green-400">
      ✔ {conf.por ?? "—"} · {dataHora(conf.em)}
    </p>
  );
}

function BotaoFoto({ enviar, quantas, pequeno = false }: { enviar: (f: File) => Promise<void>; quantas: number; pequeno?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setEnviando(true);
          try {
            await enviar(f);
          } finally {
            setEnviando(false);
          }
        }}
      />
      <button
        type="button"
        disabled={enviando}
        onClick={() => ref.current?.click()}
        title="Tirar foto do que chegou"
        className={`relative flex shrink-0 items-center justify-center gap-1 rounded-lg border-2 border-sky-600 bg-white font-bold text-sky-700 hover:bg-sky-50 disabled:opacity-60 dark:border-sky-500 dark:bg-slate-900 dark:text-sky-300 print:hidden ${
          pequeno ? "h-9 px-2 text-xs" : "h-11 px-3 text-sm"
        }`}
      >
        {enviando ? "Enviando…" : "📷 Foto"}
        {quantas > 0 && (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-sky-600 px-1 text-[10px] text-white">{quantas}</span>
        )}
      </button>
    </>
  );
}

function Miniaturas({ fotos, abrir }: { fotos: { sha: string; titulo: string }[]; abrir: (sha: string, titulo: string) => void }) {
  if (!fotos.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {fotos.map((f, i) => (
        <button key={`${f.sha}-${i}`} type="button" onClick={() => abrir(f.sha, f.titulo)} className="overflow-hidden rounded-md border border-stone-200 dark:border-slate-700">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem da rota própria, com cache */}
          <img src={urlImagemAlmox(f.sha)} alt={f.titulo} loading="lazy" className="h-16 w-16 object-cover print:h-24 print:w-24" />
        </button>
      ))}
    </div>
  );
}

// Prazo contratual / próxima coleta / nº do pedido do cliente — pedido do usuário (28/10/2026).
function DatasMac({
  prazo,
  coleta,
  pedidos,
  grande = false,
}: {
  prazo?: string | null;
  coleta?: string | null;
  pedidos?: string[];
  grande?: boolean;
}) {
  if (!prazo && !coleta && !pedidos?.length) return null;
  const atrasado = !!prazo && prazo < hojeIso();
  const tam = grande ? "text-sm px-2 py-1" : "text-[11px] px-1.5 py-0.5";
  return (
    <span className="mt-1 flex flex-wrap gap-1 font-semibold">
      {!!pedidos?.length && (
        <span className={`rounded ${tam} bg-sky-100 font-mono text-sky-900 dark:bg-sky-950/50 dark:text-sky-200`} title={pedidos.join(", ")}>
          🧾 Pedido {pedidos.length > 3 ? `${pedidos.slice(0, 3).join(", ")} +${pedidos.length - 3}` : pedidos.join(", ")}
        </span>
      )}
      {prazo && (
        <span className={`rounded ${tam} ${atrasado ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" : "bg-stone-100 text-stone-700 dark:bg-slate-800 dark:text-slate-200"}`}>
          📅 Prazo {formatarDataBr(prazo)}
          {atrasado ? " · atrasado" : ""}
        </span>
      )}
      {coleta && (
        <span className={`rounded ${tam} bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300`}>🚚 Coleta {formatarDataBr(coleta)}</span>
      )}
    </span>
  );
}

function DatasConjunto({ itens }: { itens: ItemAlmox[] }) {
  const d = datasDaMac(itens, hojeIso());
  return <DatasMac prazo={d.prazo} coleta={d.coleta} />;
}

// Cartão da MAC: imagem que o Follow up anexou na obra (referência), MAC, cliente,
// nº do pedido, prazo contratual e próxima coleta — pedido do usuário (28/10/2026).
function CartaoMac({ o, abrir }: { o: OpcaoMac; abrir: () => void }) {
  return (
    <button
      type="button"
      onClick={abrir}
      className="flex gap-2.5 rounded-xl border-2 border-stone-200 bg-white p-2 text-left hover:border-teal-600 dark:border-slate-700 dark:bg-slate-900"
    >
      {o.foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem da rota própria, com cache
        <img src={urlImagemAlmox(o.foto)} alt={`Obra ${o.mac}`} loading="lazy" className="h-20 w-20 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-2xl text-stone-400 dark:bg-slate-800">⚙</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-lg font-black leading-tight text-stone-900 dark:text-white">MAC {o.mac}</span>
        <span className="block truncate text-xs text-stone-500 dark:text-slate-400">
          {o.motivo ?? o.cliente ?? "—"}
          {o.itens ? ` · ${o.itens} peça(s) ativa(s)` : ""}
        </span>
        <DatasMac prazo={o.prazo} coleta={o.coleta} pedidos={o.pedidos} />
      </span>
    </button>
  );
}

function Titulo({ icone, texto, sub }: { icone: string; texto: string; sub: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-base font-extrabold text-stone-900 dark:text-white">
        <span className="mr-1">{icone}</span>
        {texto}
      </h2>
      <p className="text-xs text-stone-500 dark:text-slate-400">{sub}</p>
    </div>
  );
}

function Progresso({ feitos, total }: { feitos: number; total: number }) {
  const pct = total ? Math.round((feitos / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs font-semibold text-stone-600 dark:text-slate-300">
        <span>
          {feitos} de {total} conferidos
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-700">
        <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// --- tela -------------------------------------------------------------------------

export default function Almoxarifado() {
  const [texto, setTexto] = useState("");
  const [opcoes, setOpcoes] = useState<OpcaoMac[] | null>(null);
  const [macsAtivas, setMacsAtivas] = useState<OpcaoMac[]>([]);
  // Só monta no navegador (depois do login): dá pra ler o localStorage direto.
  const [recentes, setRecentes] = useState<string[]>(lerRecentes);
  const [dados, setDados] = useState<DetalheMac | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [ampliada, setAmpliada] = useState<{ sha: string; titulo: string } | null>(null);
  const [imprimindo, setImprimindo] = useState(false);

  const abrirMac = useCallback(async (consulta: { q?: string; mac?: string }) => {
    setCarregando(true);
    setErro("");
    setOpcoes(null);
    try {
      const qs = consulta.mac ? `mac=${encodeURIComponent(consulta.mac)}` : `q=${encodeURIComponent(consulta.q ?? "")}`;
      const r = await fetch(`${API}?${qs}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as RespostaAlmox & { erro?: string };
      if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
      if ("detalhe" in j) {
        setDados(j.detalhe);
        gravarRecente(j.detalhe.mac);
        setRecentes(lerRecentes());
        const url = new URL(window.location.href);
        url.searchParams.set("mac", j.detalhe.mac);
        window.history.replaceState(null, "", url);
      } else {
        setDados(null);
        setOpcoes(j.opcoes);
      }
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const mac = macBase(new URLSearchParams(window.location.search).get("mac"));
    // Volta na MAC que estava aberta (?mac= no endereço, ex.: depois de recarregar).
    if (mac) void Promise.resolve().then(() => abrirMac({ mac }));
    fetch(API, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { opcoes?: OpcaoMac[] }) => setMacsAtivas(j.opcoes ?? []))
      .catch(() => {});
  }, [abrirMac]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(""), 3000);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    if (!imprimindo) return;
    const t = setTimeout(() => {
      window.print();
      setImprimindo(false);
    }, 300);
    return () => clearTimeout(t);
  }, [imprimindo]);

  function voltar() {
    setDados(null);
    setOpcoes(null);
    setTexto("");
    const url = new URL(window.location.href);
    url.searchParams.delete("mac");
    window.history.replaceState(null, "", url);
  }

  const confPorChave = useMemo(() => new Map((dados?.conferencias ?? []).map((c) => [c.chave, c])), [dados]);
  const fotosPorChave = useMemo(() => {
    const m = new Map<string, FotoAlmox[]>();
    for (const f of dados?.fotos ?? []) m.set(f.chave ?? "", [...(m.get(f.chave ?? "") ?? []), f]);
    return m;
  }, [dados]);

  async function conferir(chave: string, chegou: boolean) {
    if (!dados) return;
    const anterior = dados.conferencias.find((c) => c.chave === chave);
    // Sempre por função: "Marcar tudo do conjunto" chama várias seguidas.
    const trocar = (nova: Conferencia | undefined) =>
      setDados((d) => (d ? { ...d, conferencias: [...d.conferencias.filter((c) => c.chave !== chave), ...(nova ? [nova] : [])] } : d));
    trocar(chegou ? { chave, por: "você", em: new Date().toISOString(), observacao: null } : undefined);
    try {
      const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave, mac: dados.mac, chegou }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
      if (j.conferencia) trocar(j.conferencia);
    } catch (e) {
      trocar(anterior);
      setErro(`Não salvou: ${(e as Error).message}`);
    }
  }

  async function marcarVarios(chaves: string[], chegou: boolean) {
    for (const c of chaves) await conferir(c, chegou);
  }

  async function enviarFoto(chave: string | null, rotulo: string, arquivo: File) {
    if (!dados) return;
    try {
      const { blob, largura, altura } = await reduzir(arquivo).catch(() => ({ blob: arquivo as Blob, largura: 0, altura: 0 }));
      const form = new FormData();
      form.append("file", blob, "foto.jpg");
      form.append("mac", dados.mac);
      if (chave) form.append("chave", chave);
      form.append("rotulo", rotulo);
      if (largura) form.append("largura", String(largura));
      if (altura) form.append("altura", String(altura));
      const r = await fetch(API, { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
      setDados((d) => (d ? { ...d, fotos: [j.foto, ...d.fotos] } : d));
      setAviso("📷 Foto salva");
    } catch (e) {
      setErro(`A foto não foi: ${(e as Error).message}`);
    }
  }

  async function apagarFoto(id: string) {
    const r = await fetch(`${API}?foto=${id}`, { method: "DELETE" });
    if (!r.ok) return setErro("Não consegui apagar a foto.");
    setDados((d) => (d ? { ...d, fotos: d.fotos.filter((f) => f.id !== id) } : d));
  }

  const abrirFoto = (sha: string, titulo: string) => setAmpliada({ sha, titulo });
  const fotosDe = (chave: string) => (fotosPorChave.get(chave) ?? []).map((f) => ({ sha: f.midia_sha256, titulo: f.rotulo ?? "" }));

  // ------------------------------------------------------------------ início / busca
  if (!dados) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <section className="rounded-2xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-900 dark:bg-teal-950/30">
          <h2 className="text-lg font-black text-teal-900 dark:text-teal-100">📦 Conferência de material</h2>
          <ol className="mt-2 grid gap-2 text-sm text-teal-900 dark:text-teal-100 sm:grid-cols-3">
            <li className="rounded-xl bg-white/70 p-2 dark:bg-slate-900/50">
              <b className="block text-base">1. 🔍 Procure</b>Digite a MAC (ex.: 723.26), o PO do cliente ou o nº do pedido de compra.
            </li>
            <li className="rounded-xl bg-white/70 p-2 dark:bg-slate-900/50">
              <b className="block text-base">2. ✔ Confira</b>Quando o material chegar, toque em <b>“Chegou?”</b>. Fica gravado quem conferiu e quando.
            </li>
            <li className="rounded-xl bg-white/70 p-2 dark:bg-slate-900/50">
              <b className="block text-base">3. 📷 Fotografe</b>Toque em <b>“Foto”</b> pra registrar o que chegou (nota, etiqueta, material).
            </li>
          </ol>
        </section>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) void abrirMac({ q: texto });
          }}
          className="flex gap-2"
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            type="search"
            inputMode="search"
            placeholder="MAC, PO ou pedido de compra…"
            className="h-14 min-w-0 flex-1 rounded-xl border-2 border-stone-300 bg-white px-4 text-lg text-stone-900 outline-none focus:border-teal-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
          />
          <button type="submit" disabled={carregando} className="h-14 rounded-xl bg-teal-700 px-5 text-lg font-bold text-white hover:bg-teal-600 disabled:opacity-60">
            {carregando ? "…" : "Buscar"}
          </button>
        </form>
        {erro && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>}

        {opcoes && (
          <section className="rounded-xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="mb-2 text-sm font-bold text-stone-700 dark:text-slate-300">
              {opcoes.length ? `Achei ${opcoes.length} MACs — toque na certa:` : "Não achei nada com isso. Confira o número e tente de novo."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {opcoes.map((o) => (
                <CartaoMac key={o.mac} o={o} abrir={() => abrirMac({ mac: o.mac })} />
              ))}
            </div>
          </section>
        )}

        {recentes.length > 0 && (
          <section>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">Abertas por último</p>
            <div className="flex flex-wrap gap-2">
              {recentes.map((m) => (
                <button key={m} type="button" onClick={() => abrirMac({ mac: m })} className="h-10 rounded-full border-2 border-teal-600 px-4 font-mono font-bold text-teal-800 dark:text-teal-200">
                  {m}
                </button>
              ))}
            </div>
          </section>
        )}

        {macsAtivas.length > 0 && (
          <section>
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-slate-400">MACs em produção (peças ativas no Follow up)</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {macsAtivas.map((o) => (
                <CartaoMac key={o.mac} o={o} abrir={() => abrirMac({ mac: o.mac })} />
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ detalhe da MAC
  return (
    <DetalheMacTela
      dados={dados}
      filtro={filtro}
      setFiltro={setFiltro}
      conf={confPorChave}
      fotosPorChave={fotosPorChave}
      fotosDe={fotosDe}
      conferir={conferir}
      marcarVarios={marcarVarios}
      enviarFoto={enviarFoto}
      apagarFoto={apagarFoto}
      abrirFoto={abrirFoto}
      voltar={voltar}
      recarregar={() => abrirMac({ mac: dados.mac })}
      imprimir={() => setImprimindo(true)}
      imprimindo={imprimindo}
      carregando={carregando}
      erro={erro}
      limparErro={() => setErro("")}
      aviso={aviso}
      ampliada={ampliada}
      fecharFoto={() => setAmpliada(null)}
    />
  );
}

// Lista mãe agrupada: conjunto (MAC1 "723.26.01") → PO do cliente → linhas.
interface GrupoPo {
  po: string;
  item: ItemAlmox | null;
  linhas: LinhaLista[];
}
interface Conjunto {
  mac1: string;
  pos: GrupoPo[];
}

function montarConjuntos(d: DetalheMac): Conjunto[] {
  const porConj = new Map<string, Map<string, GrupoPo>>();
  const grupo = (mac1: string, po: string) => {
    const c = porConj.get(mac1) ?? new Map<string, GrupoPo>();
    porConj.set(mac1, c);
    const g = c.get(po) ?? { po, item: null, linhas: [] };
    c.set(po, g);
    return g;
  };
  for (const i of d.itens) grupo(i.mac ?? d.mac, i.po).item = i;
  for (const l of d.lista) grupo(l.mac1 ?? d.mac, l.po ?? "—").linhas.push(l);
  return [...porConj.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }))
    .map(([mac1, m]) => ({ mac1, pos: [...m.values()].sort((a, b) => a.po.localeCompare(b.po, "pt-BR", { numeric: true })) }));
}

function DetalheMacTela(p: {
  dados: DetalheMac;
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
  conf: Map<string, Conferencia>;
  fotosPorChave: Map<string, FotoAlmox[]>;
  fotosDe: (chave: string) => { sha: string; titulo: string }[];
  conferir: (chave: string, chegou: boolean) => void;
  marcarVarios: (chaves: string[], chegou: boolean) => void;
  enviarFoto: (chave: string | null, rotulo: string, f: File) => Promise<void>;
  apagarFoto: (id: string) => void;
  abrirFoto: (sha: string, titulo: string) => void;
  voltar: () => void;
  recarregar: () => void;
  imprimir: () => void;
  imprimindo: boolean;
  carregando: boolean;
  erro: string;
  limparErro: () => void;
  aviso: string;
  ampliada: { sha: string; titulo: string } | null;
  fecharFoto: () => void;
}) {
  const { dados: d, conf, filtro } = p;
  const [busca, setBusca] = useState("");
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const termo = normalizarBusca(busca.trim());

  // Pedidos de compra do Valdir agrupados por nº do pedido.
  const pedidos = useMemo(() => {
    const m = new Map<number, CompraValdir[]>();
    for (const c of d.compras) m.set(c.pc, [...(m.get(c.pc) ?? []), c]);
    return [...m.entries()].map(([pc, itens]) => ({ pc, itens, chave: chavePc(pc) }));
  }, [d.compras]);
  const conjuntos = useMemo(() => montarConjuntos(d), [d]);

  const passa = (chave: string) => (filtro === "todos" ? true : filtro === "chegou" ? conf.has(chave) : !conf.has(chave));
  const casa = (...t: (string | number | null | undefined)[]) => !termo || normalizarBusca(t.filter((x) => x !== null && x !== undefined).join(" ")).includes(termo);

  const todasChaves = [...pedidos.map((x) => x.chave), ...d.itens.map((i) => i.chave), ...d.lista.map((l) => l.chave)];
  const feitos = todasChaves.filter((c) => conf.has(c)).length;
  const fotosGerais = p.fotosPorChave.get("") ?? [];
  const datas = useMemo(() => datasDaMac(d.itens, hojeIso()), [d.itens]);
  const fotoObra = d.itens.find((i) => i.fotos.length)?.fotos[0] ?? null; // referência da obra

  return (
    <div className="flex flex-col gap-3 print:gap-2">
      {/* Cabeçalho */}
      <section className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <button type="button" onClick={p.voltar} className="mb-1 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300 print:hidden">
              ← Outra MAC
            </button>
            <div className="flex items-center gap-3">
              {fotoObra && (
                <button type="button" onClick={() => p.abrirFoto(fotoObra, `Obra ${d.mac}`)} className="shrink-0 overflow-hidden rounded-lg border border-stone-200 dark:border-slate-700">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem da rota própria, com cache */}
                  <img src={urlImagemAlmox(fotoObra)} alt={`Obra ${d.mac}`} className="h-16 w-16 object-cover sm:h-20 sm:w-20" />
                </button>
              )}
              <h1 className="font-mono text-2xl font-black text-stone-900 dark:text-white">MAC {d.mac}</h1>
            </div>
            <p className="text-sm text-stone-600 dark:text-slate-300">
              {d.cliente ?? "—"} · {d.itens.length} peça(s) ativa(s) · {d.lista.length} linha(s) na lista do projeto · {pedidos.length} pedido(s) de compra
            </p>
            <DatasMac grande prazo={datas.prazo} coleta={datas.coleta} pedidos={datas.pedidos} />
            {datas.coletas.length > 1 && (
              <p className="mt-1 text-xs text-stone-500 dark:text-slate-400">Coletas marcadas: {datas.coletas.map((c) => formatarDataBr(c)).join(" · ")}</p>
            )}
            <p className="hidden text-xs text-stone-500 print:block">Relatório de conferência do almoxarifado · {new Date().toLocaleString("pt-BR")}</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button type="button" onClick={p.recarregar} disabled={p.carregando} className="h-10 rounded-lg border-2 border-stone-300 px-3 text-sm font-semibold text-stone-700 dark:border-slate-600 dark:text-slate-200">
              {p.carregando ? "…" : "↻ Atualizar"}
            </button>
            <button type="button" onClick={p.imprimir} className="h-10 rounded-lg bg-teal-700 px-3 text-sm font-bold text-white hover:bg-teal-600">
              🖨 Relatório
            </button>
          </div>
        </div>
        <div className="mt-3">
          <Progresso feitos={feitos} total={todasChaves.length} />
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row print:hidden">
          <div className="flex rounded-lg border-2 border-stone-300 p-0.5 dark:border-slate-600">
            {(
              [
                ["todos", "Tudo"],
                ["falta", "Falta chegar"],
                ["chegou", "Já chegou"],
              ] as [Filtro, string][]
            ).map(([v, r]) => (
              <button
                key={v}
                type="button"
                onClick={() => p.setFiltro(v)}
                className={`h-9 flex-1 rounded-md px-3 text-sm font-bold ${filtro === v ? "bg-teal-700 text-white" : "text-stone-600 dark:text-slate-300"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            type="search"
            placeholder="🔍 Filtrar: material, desenho, PO, fornecedor…"
            className="h-10 min-w-0 flex-1 rounded-lg border-2 border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-teal-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
          />
        </div>
        {p.erro && (
          <button type="button" onClick={p.limparErro} className="mt-2 w-full rounded-lg bg-red-50 p-2 text-left text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {p.erro} <span className="text-xs">(toque pra fechar)</span>
          </button>
        )}
      </section>

      {/* 1. Pedidos de compra do Sectra */}
      <section className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4 print:break-inside-auto">
        <Titulo
          icone="🛒"
          texto="Pedidos de compra (Sectra)"
          sub={`O que o comprador comprou pra esta MAC (chapa, tubo, parafuso, tinta…). “NF de entrada” = o Sectra já deu entrada na nota.${
            d.compras_em ? ` Atualizado ${dataHora(d.compras_em)}.` : ""
          }`}
        />
        {!pedidos.length ? (
          <p className="py-4 text-center text-sm text-stone-500 dark:text-slate-400">Nenhum pedido de compra do Sectra pra esta MAC.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {pedidos
              .filter((x) => passa(x.chave) && casa(x.pc, ...x.itens.flatMap((i) => [i.m, i.f, i.rq, ...i.nf.map((n) => n[0])])))
              .map(({ pc, itens, chave }) => {
                const c0 = itens[0];
                const nfs = [...new Map(itens.flatMap((i) => i.nf).map((n) => [n[0], n])).values()];
                const st = STATUS_PC[c0.s];
                const ok = conf.get(chave);
                return (
                  <article key={pc} className={`break-inside-avoid rounded-xl border-2 p-3 ${ok ? "border-green-600 bg-green-50/60 dark:bg-green-950/20" : "border-stone-200 dark:border-slate-700"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-lg font-black text-stone-900 dark:text-white">PC {pc}</p>
                        <p className="truncate text-sm font-semibold text-stone-700 dark:text-slate-200">{c0.f || "—"}</p>
                        <p className="text-xs text-stone-500 dark:text-slate-400">
                          Pedido em {formatarDataBr(c0.dp)} · <span className={`font-semibold ${st?.classe ?? ""}`}>{st?.rotulo ?? c0.s}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <BotaoChegou conf={ok} mudar={(v) => p.conferir(chave, v)} />
                        <BotaoFoto quantas={p.fotosDe(chave).length} enviar={(f) => p.enviarFoto(chave, `PC ${pc} · ${c0.f}`, f)} />
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-sm dark:border-slate-800">
                      {itens.map((i) => (
                        <li key={i.rq} className="flex justify-between gap-2">
                          <span className="min-w-0 text-stone-800 dark:text-slate-200">{i.m}</span>
                          <span className="shrink-0 font-mono font-bold text-stone-900 dark:text-white">
                            {formatarNumero(i.q, 0)} {i.u}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className={`mt-2 rounded-lg px-2 py-1 text-xs font-semibold ${nfs.length ? "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300" : "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"}`}>
                      {nfs.length ? `🧾 NF de entrada: ${nfs.map((n) => `${n[0]} (${formatarDataBr(n[1])})`).join(", ")}` : "⏳ Sem NF de entrada no Sectra ainda"}
                    </p>
                    <QuemConferiu conf={ok} />
                    <Miniaturas fotos={p.fotosDe(chave)} abrir={p.abrirFoto} />
                  </article>
                );
              })}
          </div>
        )}
      </section>

      {/* 2. Lista do projeto por conjunto → PO */}
      <section className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
        <Titulo
          icone="📋"
          texto="Lista do projeto (o que o Compras pensou)"
          sub="A lista mãe da obra (Material de compra), por conjunto e por PO, com a imagem e o pedido de compra / NF do Sectra de cada peça."
        />
        {!conjuntos.length && <p className="py-4 text-center text-sm text-stone-500 dark:text-slate-400">Esta MAC não tem linhas na lista do projeto.</p>}
        <div className="flex flex-col gap-3">
          {conjuntos.map((cj) => {
            const chavesCj = cj.pos.flatMap((g) => [...(g.item ? [g.item.chave] : []), ...g.linhas.map((l) => l.chave)]);
            const feitosCj = chavesCj.filter((c) => conf.has(c)).length;
            const aberto = p.imprimindo || !fechados.has(cj.mac1);
            const gruposVisiveis = cj.pos
              .map((g) => ({
                ...g,
                linhas: g.linhas.filter((l) => passa(l.chave) && casa(l.descricao, l.desenho, l.mp, l.codigo, l.po, g.item?.descricao)),
                mostraItem: !!g.item && passa(g.item.chave) && casa(g.po, g.item.desenho, g.item.descricao, g.item.fornecedor),
              }))
              .filter((g) => g.linhas.length || g.mostraItem);
            if (!gruposVisiveis.length) return null;
            return (
              <div key={cj.mac1} className="rounded-xl border border-stone-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() =>
                    setFechados((s) => {
                      const n = new Set(s);
                      if (n.has(cj.mac1)) n.delete(cj.mac1);
                      else n.add(cj.mac1);
                      return n;
                    })
                  }
                  className="flex w-full items-center justify-between gap-2 rounded-t-xl bg-stone-100 px-3 py-2 text-left dark:bg-slate-800"
                >
                  <span className="font-mono text-base font-black text-stone-900 dark:text-white">
                    {aberto ? "▾" : "▸"} Conjunto {cj.mac1}
                  </span>
                  <DatasConjunto itens={cj.pos.flatMap((g) => (g.item ? [g.item] : []))} />
                  <span className={`text-xs font-bold ${feitosCj === chavesCj.length && chavesCj.length ? "text-green-700 dark:text-green-400" : "text-stone-500 dark:text-slate-400"}`}>
                    {feitosCj}/{chavesCj.length} chegou
                  </span>
                </button>
                {aberto && (
                  <div className="divide-y divide-stone-100 dark:divide-slate-800">
                    {chavesCj.some((c) => !conf.has(c)) && (
                      <div className="px-3 py-1.5 text-right print:hidden">
                        <button
                          type="button"
                          onClick={() => p.marcarVarios(chavesCj.filter((c) => !conf.has(c)), true)}
                          className="text-xs font-bold text-green-700 hover:underline dark:text-green-400"
                        >
                          ✔ Marcar tudo deste conjunto como chegou
                        </button>
                      </div>
                    )}
                    {gruposVisiveis.map((g) => (
                      <GrupoPoTela key={g.po} g={g} mostraItem={g.mostraItem} p={p} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Fotos */}
      <section className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <Titulo icone="📷" texto={`Fotos do que chegou (${d.fotos.length})`} sub="Todas as fotos desta MAC. “Foto geral” = sem pedido (ex.: a carga inteira)." />
          <BotaoFoto quantas={fotosGerais.length} enviar={(f) => p.enviarFoto(null, `MAC ${d.mac} · foto geral`, f)} />
        </div>
        {!d.fotos.length ? (
          <p className="py-4 text-center text-sm text-stone-500 dark:text-slate-400">Nenhuma foto ainda.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {d.fotos.map((f) => (
              <figure key={f.id} className="break-inside-avoid overflow-hidden rounded-xl border border-stone-200 dark:border-slate-700">
                <button type="button" onClick={() => p.abrirFoto(f.midia_sha256, f.rotulo ?? "")} className="block w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem da rota própria, com cache */}
                  <img src={urlImagemAlmox(f.midia_sha256)} alt={f.rotulo ?? "foto"} loading="lazy" className="aspect-square w-full object-cover" />
                </button>
                <figcaption className="p-1.5 text-[11px] leading-tight text-stone-600 dark:text-slate-300">
                  <b className="block truncate text-stone-900 dark:text-white">{f.rotulo ?? "—"}</b>
                  {f.por ?? "—"} · {dataHora(f.em)}
                  <ApagarFoto apagar={() => p.apagarFoto(f.id)} />
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {p.aviso && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white shadow-lg dark:bg-white dark:text-stone-900 print:hidden">
          {p.aviso}
        </div>
      )}
      {p.ampliada && (
        <button type="button" onClick={p.fecharFoto} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/85 p-4 print:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem da rota própria, com cache */}
          <img src={urlImagemAlmox(p.ampliada.sha)} alt={p.ampliada.titulo} className="max-h-[85vh] max-w-full rounded-lg object-contain" />
          <span className="text-sm text-white">{p.ampliada.titulo} · toque pra fechar</span>
        </button>
      )}
    </div>
  );
}

function ApagarFoto({ apagar }: { apagar: () => void }) {
  const [certeza, setCerteza] = useState(false);
  return (
    <button
      type="button"
      onClick={() => (certeza ? apagar() : setCerteza(true))}
      className={`mt-1 block text-[11px] font-semibold print:hidden ${certeza ? "text-red-700 dark:text-red-400" : "text-stone-400 hover:text-red-600"}`}
    >
      {certeza ? "Toque de novo pra apagar" : "🗑 Apagar"}
    </button>
  );
}

function dimensoes(l: LinhaLista): string {
  if (l.di) return `Ø${formatarNumero(l.di, 1)}${l.comp ? ` × ${formatarNumero(l.comp, 0)}` : ""}`;
  if (l.larg && l.comp) return `${formatarNumero(l.larg, 0)} × ${formatarNumero(l.comp, 0)}`;
  return "";
}

function GrupoPoTela({
  g,
  mostraItem,
  p,
}: {
  g: GrupoPo;
  mostraItem: boolean;
  p: Parameters<typeof DetalheMacTela>[0];
}) {
  const { conf } = p;
  const i = g.item;
  const c = i?.compras;
  const pcs = c?.pc ?? [];
  const ents = c?.ent ?? [];
  return (
    <div className="break-inside-avoid px-3 py-2.5">
      {/* Peça do Follow up (o PO) */}
      <div className="flex gap-3">
        {i?.fotos[0] ? (
          <button type="button" onClick={() => p.abrirFoto(i.fotos[0], `${g.po} · ${i.descricao ?? ""}`)} className="shrink-0 overflow-hidden rounded-lg border border-stone-200 dark:border-slate-700">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem da rota própria, com cache */}
            <img src={urlImagemAlmox(i.fotos[0])} alt={i.descricao ?? g.po} loading="lazy" className="h-20 w-20 object-cover sm:h-24 sm:w-24" />
          </button>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-2xl text-stone-400 dark:bg-slate-800 sm:h-24 sm:w-24">⚙</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-mono font-black text-stone-900 dark:text-white">PO {g.po}</span>
            {i?.st === "E" && <span className="rounded bg-blue-600 px-1.5 text-[10px] font-bold text-white">ENTREGUE</span>}
            {i?.material_chegou && <span className="rounded bg-green-600 px-1.5 text-[10px] font-bold text-white">M.CHEGOU no Follow up</span>}
            {i?.falta_material && !i.material_chegou && <span className="rounded bg-red-600 px-1.5 text-[10px] font-bold text-white">FALTA MATERIAL</span>}
          </div>
          {i && (
            <p className="text-sm text-stone-700 dark:text-slate-200">
              {i.descricao ?? "—"}
              {i.desenho ? <span className="text-stone-500 dark:text-slate-400"> · des. {i.desenho}</span> : null}
              {i.quantidade !== null ? <b> · {formatarNumero(i.quantidade, 0)} pç</b> : null}
            </p>
          )}
          {i && (i.prazo_contratual || i.coleta_data) && (
            <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs font-semibold">
              {i.prazo_contratual && (
                <span
                  className={`rounded px-1.5 py-0.5 ${
                    i.st !== "E" && i.prazo_contratual < hojeIso()
                      ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                      : "bg-stone-100 text-stone-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  📅 Prazo contratual {formatarDataBr(i.prazo_contratual)}
                  {i.st !== "E" && i.prazo_contratual < hojeIso() ? " · atrasado" : ""}
                </span>
              )}
              {i.coleta_data && (
                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300">
                  🚚 Coleta {formatarDataBr(i.coleta_data)}
                </span>
              )}
            </p>
          )}
          {(pcs.length > 0 || ents.length > 0) && (
            <p className="mt-0.5 text-xs text-stone-600 dark:text-slate-300">
              {pcs.map((x) => (
                <span key={`${x.pc}-${x.it}`} className="mr-2">
                  🛒 PC {x.pc} · {x.f} · <span className={STATUS_PC[x.s]?.classe ?? ""}>{STATUS_PC[x.s]?.rotulo ?? x.s}</span>
                </span>
              ))}
              {ents.map((x) => (
                <span key={x.nf} className="mr-2 font-semibold text-green-700 dark:text-green-400">
                  🧾 NF {x.nf} ({formatarDataBr(x.d)}) · {formatarNumero(x.q, 0)} pç
                </span>
              ))}
            </p>
          )}
          {i && mostraItem && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <BotaoChegou pequeno conf={conf.get(i.chave)} mudar={(v) => p.conferir(i.chave, v)} />
              <BotaoFoto pequeno quantas={p.fotosDe(i.chave).length} enviar={(f) => p.enviarFoto(i.chave, `PO ${g.po} · ${i.descricao ?? ""}`, f)} />
              <QuemConferiu conf={conf.get(i.chave)} />
            </div>
          )}
          {i && <Miniaturas fotos={p.fotosDe(i.chave)} abrir={p.abrirFoto} />}
        </div>
      </div>

      {/* Materiais da lista mãe deste PO */}
      {g.linhas.length > 0 && (
        <ul className="mt-2 divide-y divide-stone-100 rounded-lg border border-stone-200 dark:divide-slate-800 dark:border-slate-700">
          {g.linhas.map((l) => {
            const ok = conf.get(l.chave);
            const dim = dimensoes(l);
            return (
              <li key={l.chave} className={`flex items-center gap-2 px-2 py-1.5 ${ok ? "bg-green-50/70 dark:bg-green-950/20" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900 dark:text-white">
                    {l.mp || l.descricao || "—"}
                    {dim && <span className="font-normal text-stone-500 dark:text-slate-400"> · {dim}</span>}
                  </p>
                  <p className="truncate text-[11px] text-stone-500 dark:text-slate-400">
                    {l.po_it_pos}
                    {l.mp && l.descricao ? ` · ${l.descricao}` : ""}
                    {l.codigo && l.codigo !== l.desenho ? ` · cód. ${l.codigo}` : l.desenho ? ` · des. ${l.desenho}` : ""}
                    {l.pzc ? ` · PZC ${formatarDataBr(l.pzc)}` : ""}
                  </p>
                  <QuemConferiu conf={ok} />
                  <Miniaturas fotos={p.fotosDe(l.chave)} abrir={p.abrirFoto} />
                </div>
                <span className="shrink-0 text-right font-mono text-sm font-bold text-stone-900 dark:text-white">
                  {l.qtt !== null ? formatarNumero(l.qtt, 2) : "—"} <span className="text-xs font-normal">{l.un ?? ""}</span>
                </span>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <BotaoChegou pequeno conf={ok} mudar={(v) => p.conferir(l.chave, v)} />
                  <BotaoFoto pequeno quantas={p.fotosDe(l.chave).length} enviar={(f) => p.enviarFoto(l.chave, `${l.po_it_pos ?? ""} · ${l.mp ?? l.descricao ?? ""}`, f)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
