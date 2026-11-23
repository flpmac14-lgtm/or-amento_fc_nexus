"use client";

// Aba "Análise de PIT" (módulo Qualidade) — pedido do usuário (23/11/2026),
// pro lailto e o flpmac14. Sobe o PIT do cliente (Excel ou PDF), a IA extrai
// os itens (/api/qualidade/pit), as regras de lib/pit.ts montam os pontos
// críticos e sai uma folha Word A4 (lib/pitWord.ts). Nada é gravado no banco.

import { useRef, useState } from "react";
import { analisarPit, type AnalisePit as Analise, type LeituraPit } from "@/lib/pit";

const MAX_PDF = 4 * 1024 * 1024;
const CACHE = "fcnexus.pit.leituras"; // leitura por arquivo (hash): o mesmo PIT de novo não chama a IA

// Gastar pouco token do Gemini (pedido do usuário): guarda as últimas leituras no navegador.
async function hashDe(arq: File): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await arq.arrayBuffer());
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}
function lerCache(h: string): LeituraPit | null {
  try {
    return (JSON.parse(localStorage.getItem(CACHE) ?? "{}") as Record<string, LeituraPit>)[h] ?? null;
  } catch {
    return null;
  }
}
function gravarCache(h: string, l: LeituraPit) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? "{}") as Record<string, LeituraPit>;
    delete c[h];
    c[h] = l;
    const chaves = Object.keys(c);
    for (const k of chaves.slice(0, Math.max(0, chaves.length - 20))) delete c[k]; // só as 20 últimas
    localStorage.setItem(CACHE, JSON.stringify(c));
  } catch {
    // sem armazenamento: só não guarda
  }
}

// Excel (.xls/.xlsx/.xlsm) → texto "col | col" por aba, no navegador.
async function excelParaTexto(arq: File): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await arq.arrayBuffer(), { type: "array" });
  const partes: string[] = [];
  for (const nome of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nome], { FS: " | ", blankrows: false, strip: true });
    const linhas = csv.split("\n").filter((x) => x.replace(/[|\s]/g, "").length > 0);
    if (linhas.length) partes.push(`### Aba: ${nome}\n${linhas.join("\n")}`);
  }
  return partes.join("\n\n");
}

// PDF → texto (PDF.js), bem mais barato que mandar o PDF pra IA.
async function pdfParaTexto(arq: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arq.arrayBuffer()) }).promise;
  const paginas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const c = await (await doc.getPage(n)).getTextContent();
    // Junta por linha (mesma altura na página) pra tabela não virar um texto corrido.
    const linhas = new Map<number, { x: number; t: string }[]>();
    for (const i of c.items) {
      if (!("str" in i) || !i.str.trim()) continue;
      const y = Math.round(i.transform[5] / 3);
      linhas.set(y, [...(linhas.get(y) ?? []), { x: i.transform[4], t: i.str.trim() }]);
    }
    paginas.push(
      [...linhas.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, l]) => l.sort((a, b) => a.x - b.x).map((x) => x.t).join(" | "))
        .join("
"),
    );
  }
  return paginas.join("\n\n");
}

export default function AnalisePit() {
  const entrada = useRef<HTMLInputElement>(null);
  const [etapa, setEtapa] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [fora, setFora] = useState<Set<string>>(new Set()); // pontos desmarcados (não vão pro Word)
  const [verItens, setVerItens] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const [gasto, setGasto] = useState<string | null>(null);

  async function processar(arq: File) {
    setFalha(null);
    setAnalise(null);
    setFora(new Set());
    setGasto(null);
    const ext = arq.name.toLowerCase().split(".").pop() ?? "";
    try {
      const h = await hashDe(arq);
      const guardada = lerCache(h);
      if (guardada) {
        setAnalise(analisarPit(guardada, arq.name));
        setGasto("Este arquivo já tinha sido lido — sem nova chamada à IA.");
        return;
      }
      const form = new FormData();
      if (["xls", "xlsx", "xlsm", "xlsb"].includes(ext)) {
        setEtapa("Lendo a planilha…");
        form.set("texto", await excelParaTexto(arq));
      } else if (ext === "pdf") {
        setEtapa("Extraindo o texto do PDF…");
        const texto = await pdfParaTexto(arq).catch(() => "");
        // Só manda o PDF em si se for escaneado (sem texto): custa bem mais token.
        if (texto.replace(/\s/g, "").length >= 300) form.set("texto", texto);
        else if (arq.size <= MAX_PDF) form.set("arquivo", arq);
        else throw new Error("PDF escaneado muito grande (máx. 4 MB).");
      } else {
        throw new Error("Envie o PIT em Excel (.xls/.xlsx) ou PDF.");
      }
      setEtapa("A IA está lendo o PIT (pode levar até 1 minuto)…");
      const r = await fetch("/api/qualidade/pit", { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.erro ?? `Falha (${r.status}).`);
      gravarCache(h, j.leitura as LeituraPit);
      setAnalise(analisarPit(j.leitura as LeituraPit, arq.name));
      if (j.tokens?.entrada != null) setGasto(`IA: ${j.tokens.entrada} tokens de entrada + ${j.tokens.saida ?? 0} de saída.`);
    } catch (e) {
      setFalha(e instanceof Error ? e.message : String(e));
    } finally {
      setEtapa(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  const chave = (t: number, p: number) => `${t}:${p}`;
  function alternar(k: string) {
    setFora((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  async function baixarWord() {
    if (!analise) return;
    const { gerarWordPit } = await import("@/lib/pitWord");
    const topicos = analise.topicos
      .map((t, ti) => ({ ...t, pontos: t.pontos.filter((_, pi) => !fora.has(chave(ti, pi))) }))
      .filter((t) => t.pontos.length);
    const blob = await gerarWordPit({ ...analise, topicos });
    const l = analise.leitura;
    const nome = ["Analise PIT", l.cliente, l.documento, l.revisao && `rev ${l.revisao}`].filter(Boolean).join(" - ").replace(/[\\/:*?"<>|]/g, "_");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome}.docx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  const l = analise?.leitura;
  const r = analise?.resumo;

  return (
    <section className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !etapa) void processar(f);
        }}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center ${
          arrastando ? "border-green-600 bg-green-50 dark:border-cyan-500 dark:bg-cyan-500/10" : "border-stone-300 bg-white dark:border-slate-700 dark:bg-slate-900"
        }`}
      >
        <p className="text-base font-semibold text-stone-800 dark:text-slate-100">Análise de PIT – Plano de Inspeção e Testes</p>
        <p className="max-w-xl text-sm text-stone-600 dark:text-slate-400">
          Envie o PIT do cliente (Vale, Dana, Brevini…) em <strong>Excel</strong> ou <strong>PDF</strong>. A IA extrai os itens, as regras
          destacam os pontos críticos (HOLD, testemunha, END, soldagem, pintura…) e você baixa a folha em Word, numa página A4.
        </p>
        <input
          ref={entrada}
          type="file"
          accept=".xls,.xlsx,.xlsm,.xlsb,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void processar(f);
          }}
        />
        <button
          type="button"
          disabled={!!etapa}
          onClick={() => entrada.current?.click()}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50 dark:bg-cyan-600 dark:hover:bg-cyan-500"
        >
          {etapa ? "Analisando…" : "📄 Escolher PIT"}
        </button>
        <p className="text-xs text-stone-500 dark:text-slate-500">ou arraste o arquivo aqui</p>
        {etapa && <p className="text-sm text-stone-700 dark:text-slate-300">⏳ {etapa}</p>}
        {falha && <p className="text-sm font-medium text-red-600">{falha}</p>}
        {gasto && <p className="text-xs text-stone-500 dark:text-slate-500">{gasto}</p>}
      </div>

      {analise && l && r && (
        <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm text-stone-700 dark:text-slate-300">
              <p className="text-lg font-semibold text-stone-900 dark:text-slate-100">
                {l.cliente ?? "Cliente não identificado"} {l.documento && <span className="font-mono text-base">· {l.documento}</span>}
                {l.revisao && <span className="text-base"> · rev. {l.revisao}</span>}
              </p>
              <p>
                {[l.projeto && `Projeto/pedido: ${l.projeto}`, l.equipamento && `Equipamento: ${l.equipamento}`, l.aviso_previo && `Aviso prévio: ${l.aviso_previo}`]
                  .filter(Boolean)
                  .join("  ·  ") || analise.arquivo}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void baixarWord()}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              ⬇ Baixar Word (A4)
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            {[
              [`${r.itens} itens`, "bg-stone-100 text-stone-800 dark:bg-slate-800 dark:text-slate-200"],
              [`${r.hold} HOLD`, "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-200"],
              [`${r.witness} WITNESS`, "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200"],
              [`${r.revisao} p/ aprovação`, "bg-sky-100 text-sky-900 dark:bg-sky-500/15 dark:text-sky-200"],
              [`${r.end} com END`, "bg-violet-100 text-violet-900 dark:bg-violet-500/15 dark:text-violet-200"],
              [`${r.semCriterio} sem norma/critério`, "bg-stone-100 text-stone-700 dark:bg-slate-800 dark:text-slate-300"],
            ].map(([t, c]) => (
              <span key={t} className={`rounded-full px-3 py-1 font-medium ${c}`}>
                {t}
              </span>
            ))}
          </div>

          <p className="text-xs text-stone-500 dark:text-slate-400">Desmarque o que não deve ir pra folha do Word.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {analise.topicos.map((t, ti) => (
              <div key={ti} className="rounded-lg border border-stone-200 p-3 dark:border-slate-700">
                <p className="mb-1.5 text-sm font-bold uppercase text-blue-800 dark:text-sky-300">{t.titulo}</p>
                <ul className="flex flex-col gap-1">
                  {t.pontos.map((p, pi) => {
                    const k = chave(ti, pi);
                    return (
                      <li key={k}>
                        <label className={`flex cursor-pointer gap-2 text-sm ${fora.has(k) ? "text-stone-400 line-through dark:text-slate-600" : "text-stone-800 dark:text-slate-200"}`}>
                          <input type="checkbox" checked={!fora.has(k)} onChange={() => alternar(k)} className="mt-0.5 shrink-0" />
                          <span>{p}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setVerItens((v) => !v)}
            className="self-start text-sm text-stone-600 underline hover:text-stone-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            {verItens ? "Esconder" : "Conferir"} os {l.itens.length} itens lidos do PIT
          </button>
          {verItens && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-xs">
                <thead className="bg-stone-100 text-stone-700 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    {["Item", "Atividade", "Referência", "Critério", "Extensão", "Registro", "Fornec.", "Cliente", "Terceiro"].map((h) => (
                      <th key={h} className="px-2 py-1.5 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {l.itens.map((i, n) => (
                    <tr key={n} className="border-t border-stone-100 align-top text-stone-800 dark:border-slate-800 dark:text-slate-200">
                      <td className="px-2 py-1 font-mono">{i.seq}</td>
                      <td className="px-2 py-1">{i.atividade}</td>
                      <td className="px-2 py-1">{i.referencia}</td>
                      <td className="px-2 py-1">{i.criterio}</td>
                      <td className="px-2 py-1">{i.extensao}</td>
                      <td className="px-2 py-1">{i.registro}</td>
                      <td className="px-2 py-1 font-mono">{i.ponto_fornecedor}</td>
                      <td className="px-2 py-1 font-mono font-semibold">{i.ponto_cliente}</td>
                      <td className="px-2 py-1 font-mono">{i.ponto_terceiro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
