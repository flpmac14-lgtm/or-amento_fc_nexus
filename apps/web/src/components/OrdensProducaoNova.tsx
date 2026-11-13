"use client";

// Nova ordem de produção (e edição do roteiro) — pedido do usuário (07/11/2026):
// "clico no pedido e aparece pra eu ir selecionando as etapas conforme está na
// base Sectra". Passo 1: pedido do Follow up; passo 2: roteiro (etapas do
// roteiro do desenho no Sectra, dos roteiros padrão ou do catálogo de
// operações); passo 3: quantidade, prazo, prioridade e salvar / liberar.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  classeBotao,
  classeBotaoPrimario,
  classeCampo,
  classeCartao,
  Prazo,
  urlFoto,
} from "@/components/ProducaoComum";
import { MOTIVO_FORA_DA_OP, centroForaDaOP, etapaForaDaOP, ondeApontaFora, fmtHoras, fmtQtd, horasPrevistas, numeroOP, type Cadastros, type Centro, type EtapaModelo, type OP } from "@/lib/producao";

/** OP já criada, usada como modelo de roteiro (GET ?tipo=modelos). */
type ModeloOP = {
  id: string;
  numero: number;
  desenho: string | null;
  descricao: string | null;
  cliente: string | null;
  criado_em: string;
  mesmoDesenho: boolean;
  etapas: EtapaModelo[];
};

/** Roteiro padrão do FC Nexus (montado e salvo pelo PCP — migration 0070). */
export type RoteiroSalvo = {
  id: string;
  nome: string;
  observacao: string | null;
  etapas: EtapaModelo[];
  criado_por: string | null;
  criado_em: string;
  atualizado_por: string | null;
  atualizado_em: string;
};

export async function listarRoteirosSalvos(): Promise<RoteiroSalvo[]> {
  const r = await api<{ roteiros: RoteiroSalvo[] }>("/api/follow-up/producao?tipo=roteiros");
  return r.roteiros.map((x) => ({
    ...x,
    etapas: [...(x.etapas ?? [])]
      .sort((a, b) => a.posicao - b.posicao)
      .map((e) => ({ ...e, hr_preparo: Number(e.hr_preparo) || 0, hr_unitario: Number(e.hr_unitario) || 0 })),
  }));
}

export type PedidoFU = {
  id: string;
  po: string | null;
  mac: string | null;
  cliente: string | null;
  desenho: string | null;
  descricao: string | null;
  quantidade: number | null;
  prazo_contratual: string | null;
  status: string | null;
  fornecedor: string | null;
  foto: string | null;
  ops: { numero: number; status: string; quantidade: number }[];
};

export type EtapaEditor = EtapaModelo & { chave: string; id?: string; travada?: boolean };

// Etapas rápidas (fabricação) — pedido do usuário (07/11/2026): a Dobra quase não
// aparece nos roteiros do Sectra, então fica num botão direto, com a máquina já escolhida.
// Inspeções (pedido do usuário, 07/11/2026): duas etapas com a operação 02.10 INSPEÇÃO
// do Sectra no posto ISP01, separadas pela descrição — uma depois da caldeiraria/solda,
// outra depois da usinagem.
type EtapaRapida = { op: string; rotulo?: string; descricao?: string; centro?: string };
const ETAPAS_RAPIDAS: EtapaRapida[] = [
  { op: "01.00" }, // caldeiraria
  { op: "01.20" }, // solda
  { op: "00.90" }, // usinagem
  { op: "00.70" }, // dobra
  { op: "00.80" }, // calandra
  { op: "01.10" }, // montagem
  { op: "01.30" }, // acabamento
  { op: "02.10", rotulo: "Inspeção Caldeiraria/Solda", descricao: "INSPEÇÃO CALDEIRARIA / SOLDA", centro: "ISP01" },
  { op: "02.10", rotulo: "Inspeção Usinagem", descricao: "INSPEÇÃO USINAGEM", centro: "ISP01" },
];
// Máquina padrão quando a operação não aparece em nenhum roteiro do Sectra.
const CENTRO_PADRAO: Record<string, string> = {
  "00.70": "DOB01",
  "00.80": "CAL01",
  "00.90": "UC",
  "01.00": "CA",
  "01.10": "MTG01",
  "01.20": "SOLD",
  "01.30": "AC",
};

let seq = 0;
const novaChave = () => `e${++seq}-${Date.now()}`;
const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export function descOperacao(cad: Cadastros, cod: string | null) {
  return cad.operacoes.find((o) => o.codigo === cod)?.descricao ?? null;
}
export function descCentro(cad: Cadastros, cod: string | null) {
  return cad.centros.find((c) => c.codigo === cod)?.descricao ?? null;
}

/** Centros em árvore (pelo NIVEL do Sectra: 04 USINAGEM › 04.01 UC › 04.01.03 FRD01). */
function centrosOrdenados(centros: Centro[]) {
  return centros
    .filter((c) => c.ativo)
    .slice()
    .sort((a, b) => (a.nivel ?? "").localeCompare(b.nivel ?? "", undefined, { numeric: true }))
    .map((c) => ({ ...c, prof: Math.max(0, (c.nivel ?? "").split(".").length - 1) }));
}

/** Roteiros do Sectra que servem pro desenho (pelo nº do desenho do Sectra ou o código da peça do cliente). */
export function roteirosDoDesenho(cad: Cadastros, desenho: string | null) {
  const d = norm(desenho);
  if (!d) return [];
  return cad.roteiros_desenho.filter((r) => norm(r.cod_cliente) === d || norm(r.desenho) === d);
}

// ---------------------------------------------------------------------------
// Editor de roteiro: fontes do Sectra à esquerda, etapas escolhidas à direita.
// ---------------------------------------------------------------------------
export function EditorRoteiro({
  cad,
  desenho,
  quantidade,
  etapas,
  setEtapas,
  setOrigem,
}: {
  cad: Cadastros;
  desenho: string | null;
  quantidade: number;
  etapas: EtapaEditor[];
  setEtapas: (f: (e: EtapaEditor[]) => EtapaEditor[]) => void;
  setOrigem: (o: string) => void;
}) {
  const doDesenho = useMemo(() => roteirosDoDesenho(cad, desenho), [cad, desenho]);
  // OPs já criadas (ficam salvas) — usar o roteiro de uma delas como modelo; as do mesmo desenho primeiro.
  const [anteriores, setAnteriores] = useState<ModeloOP[]>([]);
  useEffect(() => {
    let ativo = true;
    api<{ modelos: ModeloOP[] }>(`/api/follow-up/producao?tipo=modelos&desenho=${encodeURIComponent(desenho ?? "")}`)
      .then((r) => ativo && setAnteriores(r.modelos))
      .catch(() => {}); // sem modelo não impede montar o roteiro
    return () => {
      ativo = false;
    };
  }, [desenho]);
  // Roteiros padrão do FC Nexus (aba "Roteiros padrão") — pedido do usuário (13/11/2026).
  const [salvos, setSalvos] = useState<RoteiroSalvo[]>([]);
  useEffect(() => {
    let ativo = true;
    listarRoteirosSalvos()
      .then((r) => ativo && setSalvos(r))
      .catch(() => {}); // sem roteiro salvo não impede montar
    return () => {
      ativo = false;
    };
  }, []);
  type Fonte = { chave: string; titulo: string; sub: string; etapas: EtapaModelo[]; mesmo?: boolean };
  const fontes: Fonte[] = useMemo(
    () => [
      ...doDesenho.map((r) => ({
        chave: `d${r.opcao}`,
        titulo: `Roteiro do desenho ${r.desenho}${r.cod_cliente ? ` (${r.cod_cliente})` : ""}`,
        sub: `${r.nome ?? ""}${r.padrao ? " · padrão" : ""} · ${r.etapas.length} etapas`,
        etapas: r.etapas,
      })),
      ...salvos.map((r) => ({
        chave: `f${r.id}`,
        titulo: r.nome,
        sub: `${r.etapas.length} etapas${r.observacao ? ` · ${r.observacao}` : ""}`,
        etapas: r.etapas,
      })),
      ...anteriores.map((o) => ({
        chave: `m${o.id}`,
        titulo: `${numeroOP(o.numero)} · ${o.descricao ?? ""}${o.desenho ? ` · Des. ${o.desenho}` : ""}${o.cliente ? ` · ${o.cliente}` : ""}`.slice(0, 110),
        sub: `${o.mesmoDesenho ? "mesmo desenho · " : ""}criada em ${new Date(o.criado_em).toLocaleDateString("pt-BR")} · ${o.etapas.length} etapas`,
        etapas: o.etapas,
        mesmo: o.mesmoDesenho,
      })),
      ...cad.roteiros_padrao.map((r) => ({
        chave: `p${r.codigo}`,
        titulo: `Roteiro padrão ${r.codigo} - ${(r.descricao ?? "").replace(/^ROTEI[RT]O PADR[AÃ]O\s*[-–]?\s*/i, "") || r.descricao}`,
        sub: `${r.etapas.length} etapas`,
        etapas: r.etapas,
      })),
    ],
    [cad, doDesenho, anteriores, salvos],
  );
  const [fonte, setFonte] = useState<string>(() => fontes[0]?.chave ?? "op");
  const [buscaOp, setBuscaOp] = useState("");
  const atual = fontes.find((f) => f.chave === fonte);
  const centros = useMemo(() => centrosOrdenados(cad.centros).filter((c) => !centroForaDaOP(cad.centros, c.codigo)), [cad.centros]);
  const fora = (m: EtapaModelo) => etapaForaDaOP(cad.centros, m);
  const arrastando = useRef<string | null>(null);
  // Máquina sugerida de cada operação: a mais usada nos roteiros do Sectra; senão a padrão da fábrica.
  const centroPadrao = useMemo(() => {
    const conta = new Map<string, Map<string, number>>();
    for (const r of [...cad.roteiros_padrao, ...cad.roteiros_desenho])
      for (const e of r.etapas)
        if (e.operacao && e.centro && !fora(e)) {
          const m = conta.get(e.operacao) ?? new Map<string, number>();
          m.set(e.centro, (m.get(e.centro) ?? 0) + 1);
          conta.set(e.operacao, m);
        }
    const existe = (c: string) => cad.centros.some((x) => x.codigo === c);
    return (op: string): string | null => {
      const m = conta.get(op);
      const top = m ? [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined;
      const c = top ?? CENTRO_PADRAO[op];
      return c && existe(c) ? c : null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cad]);
  const etapaDoCatalogo = (op: string): EtapaModelo => ({ posicao: 0, operacao: op, centro: centroPadrao(op), descricao: null, hr_preparo: 0, hr_unitario: 0 });
  const rapidas = ETAPAS_RAPIDAS.filter((r) => cad.operacoes.some((o) => o.codigo === r.op));
  const etapaRapida = (r: EtapaRapida): EtapaModelo => {
    const e = etapaDoCatalogo(r.op);
    const centro = r.centro && cad.centros.some((c) => c.codigo === r.centro) ? r.centro : e.centro;
    return { ...e, centro, descricao: r.descricao ?? null };
  };

  function proximaPosicao(lista: EtapaEditor[]) {
    return (lista.reduce((m, e) => Math.max(m, e.posicao), 0) || 0) + 10;
  }
  function adicionar(modelos: EtapaModelo[], origem?: string) {
    setEtapas((lista) => {
      let pos = proximaPosicao(lista);
      const novas = modelos.map((m) => {
        const e: EtapaEditor = { ...m, chave: novaChave(), posicao: pos };
        pos += 10;
        return e;
      });
      return [...lista, ...novas];
    });
    if (origem) setOrigem(origem);
  }
  // Botão "usar roteiro padrão" — pedido do usuário (13/11/2026): troca as etapas da OP
  // pelas do roteiro salvo (as já apontadas ficam), numerando depois delas.
  function usarRoteiro(r: RoteiroSalvo) {
    setEtapas((lista) => {
      const travadas = lista.filter((e) => e.travada);
      let pos = travadas.reduce((m, e) => Math.max(m, e.posicao), 0) + 10;
      const novas = r.etapas
        .filter((m) => !fora(m))
        .map((m) => {
          const e: EtapaEditor = { ...m, chave: novaChave(), posicao: pos };
          pos += 10;
          return e;
        });
      return [...travadas, ...novas];
    });
    setOrigem(r.nome);
  }
  function jaTem(m: EtapaModelo) {
    return etapas.some((e) => e.operacao === m.operacao && e.centro === m.centro && (e.descricao ?? "") === (m.descricao ?? ""));
  }
  function mudar(chave: string, campos: Partial<EtapaEditor>) {
    setEtapas((l) => l.map((e) => (e.chave === chave ? { ...e, ...campos } : e)));
  }
  function mover(chave: string, dir: -1 | 1) {
    setEtapas((l) => {
      const i = l.findIndex((e) => e.chave === chave);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= l.length) return l;
      const n = [...l];
      [n[i], n[j]] = [n[j], n[i]];
      return renumerar(n);
    });
  }
  function renumerar(l: EtapaEditor[]) {
    // Etapa já apontada mantém o número; as outras seguem 10, 20, 30… sem repetir.
    const usadas = new Set(l.filter((e) => e.travada).map((e) => e.posicao));
    let pos = 10;
    return l.map((e) => {
      if (e.travada) return e;
      while (usadas.has(pos)) pos += 10;
      const r = { ...e, posicao: pos };
      pos += 10;
      return r;
    });
  }
  const totalPrev = etapas.reduce((s, e) => s + horasPrevistas(e, quantidade), 0);
  const ops = cad.operacoes.filter((o) => !etapaForaDaOP(cad.centros, { operacao: o.codigo })).filter((o) => !buscaOp || norm(`${o.codigo} ${o.descricao}`).includes(norm(buscaOp)));

  return (
    <div className="flex flex-col gap-3">
      {/* Roteiros padrão salvos (aba "Roteiros padrão") — um clique troca as etapas pelo roteiro. */}
      <div className={`${classeCartao} flex flex-wrap items-center gap-1.5 border-amber-300/70 bg-amber-50/40 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/5`}>
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">★ Usar roteiro padrão</span>
        {salvos.length ? (
          salvos.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => usarRoteiro(r)}
              title={[
                `Troca as etapas pelas ${r.etapas.length} do "${r.nome}"${etapas.some((e) => e.travada) ? " (as já apontadas ficam)" : ""}:`,
                ...r.etapas.map((e) => `${e.posicao} · ${descOperacao(cad, e.operacao) ?? e.operacao ?? ""} · ${e.centro ?? ""}`),
              ].join("\n")}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-white px-3 py-1 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-500/15"
            >
              {r.nome}
              <span className="text-[10px] font-medium opacity-70">{r.etapas.length} etapas</span>
            </button>
          ))
        ) : (
          <span className="text-xs text-stone-500 dark:text-slate-400">Nenhum roteiro padrão salvo ainda — monte na sub-aba “Roteiros padrão”.</span>
        )}
      </div>
      {/* Etapas rápidas — fabricação (pedido do usuário: Dobra não vem nos roteiros do Sectra) */}
      <div className={`${classeCartao} flex flex-wrap items-center gap-1.5 px-3 py-2`}>
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Etapas rápidas</span>
        {rapidas.map((r) => {
          const e = etapaRapida(r);
          const c = e.centro;
          const inspecao = r.op === "02.10";
          return (
            <button
              key={r.rotulo ?? r.op}
              type="button"
              onClick={() => adicionar([e], "Manual (catálogo Sectra)")}
              title={`Adiciona ${r.rotulo ?? descOperacao(cad, r.op)}${c ? ` no posto ${c} · ${descCentro(cad, c)}` : ""} no fim do roteiro`}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold ${
                inspecao
                  ? "border-violet-500/40 bg-violet-50 text-violet-800 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-200 dark:hover:bg-violet-500/20"
                  : "border-green-600/40 bg-green-50 text-green-800 hover:bg-green-100 dark:border-cyan-500/40 dark:bg-cyan-500/10 dark:text-cyan-200 dark:hover:bg-cyan-500/20"
              }`}
            >
              ＋ {r.rotulo ?? (descOperacao(cad, r.op) ?? r.op).toLowerCase().replace(/^./, (x) => x.toUpperCase())}
              {c && <span className="font-mono text-[10px] font-medium opacity-70">{c}</span>}
            </button>
          );
        })}
      </div>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Fontes do Sectra */}
      <div className={`${classeCartao} flex min-h-0 flex-col`}>
        <div className="border-b border-stone-200 px-3 py-2 dark:border-slate-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">1 · Base Sectra — escolha de onde vêm as etapas</p>
          <select className={`${classeCampo} mt-1.5`} value={fonte} onChange={(e) => setFonte(e.target.value)}>
            {doDesenho.length > 0 && (
              <optgroup label="★ Roteiro cadastrado para este desenho">
                {fontes.filter((f) => f.chave.startsWith("d")).map((f) => (
                  <option key={f.chave} value={f.chave}>{f.titulo}</option>
                ))}
              </optgroup>
            )}
            {fontes.some((f) => f.chave.startsWith("m") && f.mesmo) && (
              <optgroup label="★ OPs anteriores deste desenho (salvas)">
                {fontes.filter((f) => f.chave.startsWith("m") && f.mesmo).map((f) => (
                  <option key={f.chave} value={f.chave}>{f.titulo}</option>
                ))}
              </optgroup>
            )}
            {salvos.length > 0 && (
              <optgroup label="★ Roteiros padrão FC Nexus (salvos)">
                {fontes.filter((f) => f.chave.startsWith("f")).map((f) => (
                  <option key={f.chave} value={f.chave}>{f.titulo}</option>
                ))}
              </optgroup>
            )}
            <optgroup label="Roteiros padrão do Sectra">
              {fontes.filter((f) => f.chave.startsWith("p")).map((f) => (
                <option key={f.chave} value={f.chave}>{f.titulo}</option>
              ))}
            </optgroup>
            {fontes.some((f) => f.chave.startsWith("m") && !f.mesmo) && (
              <optgroup label="OPs anteriores (usar como modelo)">
                {fontes.filter((f) => f.chave.startsWith("m") && !f.mesmo).map((f) => (
                  <option key={f.chave} value={f.chave}>{f.titulo}</option>
                ))}
              </optgroup>
            )}
            <option value="op">Catálogo de operações (montar etapa por etapa)</option>
          </select>
          <p className="mt-1 text-[11px] text-stone-500 dark:text-slate-400">Só fabricação (caldeiraria, solda, usinagem…). {MOTIVO_FORA_DA_OP}</p>
          {doDesenho.length === 0 && desenho && (
            <p className="mt-1 text-[11px] text-stone-500 dark:text-slate-400">Desenho {desenho} ainda não tem roteiro cadastrado no Sectra — use um roteiro padrão ou o catálogo.</p>
          )}
        </div>
        <div className="max-h-[52vh] min-h-0 flex-1 overflow-y-auto p-2">
          {atual ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <p className="text-xs text-stone-500 dark:text-slate-400">{atual.sub} — clique em ＋ para incluir</p>
                <button type="button" className={classeBotao} onClick={() => adicionar(atual.etapas.filter((m) => !jaTem(m) && !fora(m)), atual.titulo)}>
                  ＋ Incluir todas
                </button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {atual.etapas.map((m, i) => {
                  const tem = jaTem(m);
                  if (fora(m))
                    return (
                      <li key={i} className="flex items-center gap-2 rounded-lg border border-dashed border-stone-200 px-2.5 py-1.5 text-xs text-stone-400 dark:border-slate-700" title={MOTIVO_FORA_DA_OP}>
                        <span className="w-7 font-mono">{m.posicao}</span>
                        <span className="flex-1 line-through">{descOperacao(cad, m.operacao) ?? m.operacao} · {m.centro}</span>
                        <span className="no-underline">apontado em: {ondeApontaFora(cad.centros, m)}</span>
                      </li>
                    );
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        disabled={tem}
                        onClick={() => adicionar([m], atual.titulo)}
                        className={`group flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                          tem
                            ? "border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10"
                            : "border-stone-200 hover:border-green-600 hover:bg-green-50/50 dark:border-slate-700 dark:hover:border-cyan-500 dark:hover:bg-cyan-500/5"
                        }`}
                      >
                        <span className="mt-0.5 w-7 shrink-0 font-mono text-xs text-stone-400">{m.posicao}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-stone-800 dark:text-slate-100">
                            {descOperacao(cad, m.operacao) ?? m.operacao ?? "—"}
                            <span className="ml-1.5 rounded bg-stone-100 px-1.5 py-px font-mono text-[10px] font-medium text-stone-600 dark:bg-slate-800 dark:text-slate-300">
                              {m.centro} · {descCentro(cad, m.centro)}
                            </span>
                          </span>
                          {m.descricao && <span className="mt-0.5 block text-xs text-stone-500 dark:text-slate-400">{m.descricao}</span>}
                          <span className="mt-0.5 block text-[11px] text-stone-400">
                            Prep. {fmtHoras(m.hr_preparo)} · Unit. {fmtHoras(m.hr_unitario)}
                          </span>
                        </span>
                        <span className={`shrink-0 text-lg font-bold ${tem ? "text-emerald-600" : "text-green-700 group-hover:scale-110 dark:text-cyan-400"}`}>{tem ? "✓" : "＋"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <input className={`${classeCampo} mb-2`} placeholder="Procurar operação…" value={buscaOp} onChange={(e) => setBuscaOp(e.target.value)} />
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {ops.map((o) => (
                  <li key={o.codigo}>
                    <button
                      type="button"
                      onClick={() => adicionar([etapaDoCatalogo(o.codigo)], "Manual (catálogo Sectra)")}
                      className="flex w-full items-center gap-2 rounded-lg border border-stone-200 px-2.5 py-2 text-left text-sm hover:border-green-600 hover:bg-green-50/50 dark:border-slate-700 dark:hover:border-cyan-500 dark:hover:bg-cyan-500/5"
                    >
                      <span className="font-mono text-[11px] text-stone-400">{o.codigo}</span>
                      <span className="flex-1 font-medium text-stone-800 dark:text-slate-100">{o.descricao}</span>
                      <span className="font-bold text-green-700 dark:text-cyan-400">＋</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Etapas escolhidas */}
      <div className={`${classeCartao} flex min-h-0 flex-col`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-3 py-2 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">2 · Roteiro desta OP ({etapas.length} etapas)</p>
            <p className="text-[11px] text-stone-400">Arraste ou use ↑↓ para mudar a ordem · confira o centro (máquina/posto) de cada etapa</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-stone-500 dark:text-slate-400">Horas previstas ({fmtQtd(quantidade)} pç)</p>
            <p className="text-lg font-bold text-stone-800 dark:text-slate-100">{fmtHoras(totalPrev)}</p>
          </div>
        </div>
        <div className="max-h-[52vh] min-h-[12rem] flex-1 overflow-y-auto p-2">
          {etapas.length === 0 ? (
            <div className="flex h-full min-h-[10rem] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-200 text-center text-sm text-stone-400 dark:border-slate-700">
              <span className="text-2xl">⟵</span>
              Escolha as etapas na base Sectra ao lado
            </div>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {etapas.map((e, i) => (
                <li
                  key={e.chave}
                  draggable={!e.travada}
                  onDragStart={() => (arrastando.current = e.chave)}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={() => {
                    const de = arrastando.current;
                    arrastando.current = null;
                    if (!de || de === e.chave) return;
                    setEtapas((l) => {
                      const n = [...l];
                      const a = n.findIndex((x) => x.chave === de);
                      const [item] = n.splice(a, 1);
                      n.splice(n.findIndex((x) => x.chave === e.chave), 0, item);
                      return renumerar(n);
                    });
                  }}
                  className={`rounded-lg border p-2 ${e.travada ? "border-sky-200 bg-sky-50/50 dark:border-sky-500/30 dark:bg-sky-500/5" : "border-stone-200 bg-stone-50/50 dark:border-slate-700 dark:bg-slate-950/40"}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex w-12 shrink-0 flex-col items-center gap-0.5">
                      <span className="cursor-grab select-none text-stone-300 dark:text-slate-600" title="Arraste para reordenar">⋮⋮</span>
                      <input
                        type="number"
                        value={e.posicao}
                        disabled={e.travada}
                        onChange={(ev) => mudar(e.chave, { posicao: Number(ev.target.value) || 0 })}
                        className="w-12 rounded border border-stone-300 bg-white px-1 py-0.5 text-center font-mono text-xs dark:border-slate-700 dark:bg-slate-900"
                        title="Posição (ordem) da etapa"
                      />
                    </div>
                    <div className="grid min-w-0 flex-1 gap-1.5 sm:grid-cols-2">
                      <select className={classeCampo} value={e.operacao ?? ""} onChange={(ev) => mudar(e.chave, { operacao: ev.target.value || null })}>
                        <option value="">Operação…</option>
                        {cad.operacoes.filter((o) => !etapaForaDaOP(cad.centros, { operacao: o.codigo })).map((o) => (
                          <option key={o.codigo} value={o.codigo}>{o.codigo} · {o.descricao}</option>
                        ))}
                      </select>
                      <select
                        className={`${classeCampo} ${!e.centro ? "border-amber-400 dark:border-amber-500/60" : ""}`}
                        value={e.centro ?? ""}
                        onChange={(ev) => mudar(e.chave, { centro: ev.target.value || null })}
                      >
                        <option value="">Centro produtivo (máquina/posto)…</option>
                        {centros.map((c) => (
                          <option key={c.codigo} value={c.codigo}>
                            {"  ".repeat(c.prof)}{c.codigo} · {c.descricao}
                          </option>
                        ))}
                      </select>
                      <input
                        className={`${classeCampo} sm:col-span-2`}
                        placeholder="Instrução para o operador (opcional)"
                        value={e.descricao ?? ""}
                        onChange={(ev) => mudar(e.chave, { descricao: ev.target.value })}
                      />
                      <div className="flex items-center gap-2 text-xs text-stone-500 sm:col-span-2 dark:text-slate-400">
                        <label className="flex items-center gap-1">
                          Prep. (h)
                          <input type="number" min={0} step={0.25} value={e.hr_preparo} onChange={(ev) => mudar(e.chave, { hr_preparo: Number(ev.target.value) || 0 })} className="w-16 rounded border border-stone-300 bg-white px-1 py-0.5 text-right dark:border-slate-700 dark:bg-slate-900" />
                        </label>
                        <label className="flex items-center gap-1">
                          Unit. (h/pç)
                          <input type="number" min={0} step={0.25} value={e.hr_unitario} onChange={(ev) => mudar(e.chave, { hr_unitario: Number(ev.target.value) || 0 })} className="w-16 rounded border border-stone-300 bg-white px-1 py-0.5 text-right dark:border-slate-700 dark:bg-slate-900" />
                        </label>
                        <span className="ml-auto font-medium">= {fmtHoras(horasPrevistas(e, quantidade))}</span>
                        {e.travada && <span className="rounded bg-sky-100 px-1.5 py-px text-[10px] font-semibold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">já apontada</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <button type="button" className="rounded px-1.5 text-stone-500 hover:bg-stone-200 disabled:opacity-30 dark:hover:bg-slate-800" disabled={i === 0} onClick={() => mover(e.chave, -1)} title="Subir">↑</button>
                      <button type="button" className="rounded px-1.5 text-stone-500 hover:bg-stone-200 disabled:opacity-30 dark:hover:bg-slate-800" disabled={i === etapas.length - 1} onClick={() => mover(e.chave, 1)} title="Descer">↓</button>
                      <button type="button" className="rounded px-1.5 text-red-500 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-500/10" disabled={e.travada} onClick={() => setEtapas((l) => l.filter((x) => x.chave !== e.chave))} title={e.travada ? "Etapa já apontada não sai do roteiro" : "Tirar do roteiro"}>✕</button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
        {etapas.length > 0 && (
          <div className="flex justify-end gap-2 border-t border-stone-200 px-3 py-2 dark:border-slate-800">
            <button type="button" className={classeBotao} onClick={() => setEtapas((l) => renumerar([...l].sort((a, b) => a.posicao - b.posicao)))}>Renumerar 10, 20, 30…</button>
            <button type="button" className={classeBotao} onClick={() => setEtapas((l) => l.filter((e) => e.travada))}>Limpar</button>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

export function etapasParaEnvio(cad: Cadastros, etapas: EtapaEditor[]) {
  return etapas.map((e) => ({
    id: e.id,
    posicao: e.posicao,
    operacao: e.operacao,
    operacao_desc: descOperacao(cad, e.operacao),
    centro: e.centro,
    centro_desc: descCentro(cad, e.centro),
    descricao: e.descricao,
    hr_preparo: e.hr_preparo,
    hr_unitario: e.hr_unitario,
  }));
}

export function validarEtapas(etapas: EtapaEditor[], cad?: Cadastros): string | null {
  if (!etapas.length) return "Escolha pelo menos uma etapa.";
  const foraOp = cad ? etapas.filter((e) => !e.travada && etapaForaDaOP(cad.centros, e)) : [];
  if (foraOp.length) return `Etapa ${foraOp.map((e) => e.posicao).join(", ")}: ${MOTIVO_FORA_DA_OP}`;
  const semCentro = etapas.filter((e) => !e.centro);
  if (semCentro.length) return `Escolha o centro produtivo da etapa ${semCentro.map((e) => e.posicao).join(", ")} — é por ele que o operador acha a etapa no totem.`;
  const pos = etapas.map((e) => e.posicao);
  if (new Set(pos).size !== pos.length) return "Tem posição repetida no roteiro — use Renumerar.";
  return null;
}

// ---------------------------------------------------------------------------
// Assistente "Nova OP"
// ---------------------------------------------------------------------------
export default function OrdensProducaoNova({
  cad,
  aoCriar,
  aoCancelar,
}: {
  cad: Cadastros;
  aoCriar: (op: { id: string; numero: number; imprimir: boolean }) => void;
  aoCancelar: () => void;
}) {
  const [passo, setPasso] = useState<1 | 2 | 3>(1);
  const [q, setQ] = useState("");
  const [pedidos, setPedidos] = useState<PedidoFU[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroBusca, setErroBusca] = useState("");
  const [pedido, setPedido] = useState<PedidoFU | null>(null);
  const [avulsa, setAvulsa] = useState(false);
  const [dados, setDados] = useState({ descricao: "", desenho: "", mac: "", cliente: "", po: "" });
  const [quantidade, setQuantidade] = useState(1);
  const [prazo, setPrazo] = useState("");
  const [prioridade, setPrioridade] = useState<1 | 2 | 3>(2);
  const [observacao, setObservacao] = useState("");
  const [etapas, setEtapasState] = useState<EtapaEditor[]>([]);
  const [origem, setOrigem] = useState("Manual");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const setEtapas = (f: (e: EtapaEditor[]) => EtapaEditor[]) => setEtapasState(f);

  useEffect(() => {
    let ativo = true;
    const t = setTimeout(() => {
      setCarregando(true);
      api<{ pedidos: PedidoFU[] }>(`/api/follow-up/producao?tipo=pedidos&q=${encodeURIComponent(q)}`)
        .then((r) => ativo && (setPedidos(r.pedidos), setErroBusca("")))
        .catch((e: Error) => ativo && setErroBusca(e.message))
        .finally(() => ativo && setCarregando(false));
    }, q ? 300 : 0);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [q]);

  function escolher(p: PedidoFU | null) {
    setPedido(p);
    setAvulsa(!p);
    setQuantidade(p?.quantidade && p.quantidade > 0 ? p.quantidade : 1);
    setPrazo(p?.prazo_contratual ?? "");
    setDados({ descricao: p?.descricao ?? "", desenho: p?.desenho ?? "", mac: p?.mac ?? "", cliente: p?.cliente ?? "", po: p?.po ?? "" });
    // Já sugere o roteiro do desenho cadastrado no Sectra, se existir.
    const r = p ? roteirosDoDesenho(cad, p.desenho) : [];
    if (r.length) {
      const pref = r.find((x) => x.padrao) ?? r[0];
      setEtapasState(pref.etapas.filter((m) => !etapaForaDaOP(cad.centros, m)).map((m) => ({ ...m, chave: novaChave() })));
      setOrigem(`Roteiro do desenho ${pref.desenho} (Sectra)`);
    } else {
      setEtapasState([]);
      setOrigem("Manual");
    }
    setPasso(2);
  }

  async function salvar(liberar: boolean, imprimir: boolean) {
    const v = validarEtapas(etapas, cad);
    if (v) return setErro(v);
    if (!(quantidade > 0)) return setErro("Informe a quantidade.");
    if (avulsa && !dados.descricao.trim()) return setErro("Informe a descrição da OP.");
    setSalvando(true);
    setErro("");
    try {
      const r = await api<{ id: string; numero: number }>("/api/follow-up/producao", {
        acao: "criar",
        item_id: pedido?.id ?? null,
        ...dados,
        quantidade,
        prazo: prazo || null,
        prioridade,
        observacao,
        roteiro_origem: origem,
        liberar,
        etapas: etapasParaEnvio(cad, etapas),
      });
      aoCriar({ id: r.id, numero: r.numero, imprimir });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  }

  const passos = ["Pedido", "Roteiro (etapas)", "Revisar e gerar"];

  return (
    <div className="flex flex-col gap-3">
      {/* Trilha de passos */}
      <div className={`${classeCartao} flex flex-wrap items-center gap-2 px-3 py-2.5`}>
        {passos.map((t, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const feito = passo > n;
          const ativo = passo === n;
          return (
            <div key={t} className="flex items-center gap-2">
              <button
                type="button"
                disabled={n > passo || (n > 1 && !pedido && !avulsa)}
                onClick={() => setPasso(n)}
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
                  ativo ? "bg-green-700 text-white dark:bg-cyan-600" : feito ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-stone-100 text-stone-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-xs font-bold">{feito ? "✓" : n}</span>
                {t}
              </button>
              {i < passos.length - 1 && <span className="text-stone-300 dark:text-slate-600">›</span>}
            </div>
          );
        })}
        <button type="button" className={`${classeBotao} ml-auto`} onClick={aoCancelar}>Cancelar</button>
      </div>

      {(pedido || avulsa) && passo > 1 && <ResumoPedido pedido={pedido} dados={dados} />}

      {passo === 1 && (
        <div className={`${classeCartao} p-3`}>
          <div className="flex flex-wrap items-center gap-2">
            <input autoFocus className={`${classeCampo} max-w-xl flex-1`} placeholder="Procurar pedido ativo do Follow up — PO, MAC, desenho, descrição ou cliente…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className={classeBotao} onClick={() => escolher(null)} title="OP sem pedido do Follow up (ex.: serviço interno, estoque)">
              OP avulsa (sem pedido)
            </button>
          </div>
          <p className="mt-1.5 text-xs text-stone-500 dark:text-slate-400">
            {carregando ? "Procurando…" : erroBusca || `${pedidos?.length ?? 0} pedidos ativos${q ? " encontrados" : " (ordenados por prazo)"} — clique no pedido para montar a OP.`}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {(pedidos ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => escolher(p)}
                className="group flex gap-3 rounded-xl border border-stone-200 bg-white p-2.5 text-left transition hover:-translate-y-0.5 hover:border-green-600 hover:shadow-md dark:border-slate-700 dark:bg-slate-950 dark:hover:border-cyan-500"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-slate-800">
                  {p.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urlFoto(p.foto)!} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-stone-400">sem foto</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-sm font-bold text-stone-800 dark:text-slate-100">{p.po}</span>
                    <span className="shrink-0 rounded bg-stone-100 px-1 text-[10px] font-semibold text-stone-600 dark:bg-slate-800 dark:text-slate-300">{p.cliente}</span>
                  </div>
                  <p className="truncate text-xs text-stone-600 dark:text-slate-300">{p.descricao}</p>
                  <p className="truncate text-[11px] text-stone-500 dark:text-slate-400">
                    MAC {p.mac} · Des. {p.desenho} · {fmtQtd(p.quantidade)} pç
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Prazo prazo={p.prazo_contratual} />
                    {roteirosDoDesenho(cad, p.desenho).length > 0 && (
                      <span className="rounded bg-violet-100 px-1.5 font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">★ roteiro Sectra</span>
                    )}
                    {p.ops.map((o) => (
                      <span key={o.numero} className="rounded bg-sky-100 px-1.5 font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                        já tem {numeroOP(o.numero)}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {passo === 2 && (
        <>
          <EditorRoteiro cad={cad} desenho={pedido?.desenho ?? dados.desenho} quantidade={quantidade} etapas={etapas} setEtapas={setEtapas} setOrigem={setOrigem} />
          <div className="flex items-center justify-between gap-2">
            <button type="button" className={classeBotao} onClick={() => setPasso(1)}>‹ Trocar pedido</button>
            <span className="text-xs text-stone-500 dark:text-slate-400">Origem do roteiro: {origem}</span>
            <button
              type="button"
              className={classeBotaoPrimario}
              onClick={() => {
                const v = validarEtapas(etapas, cad);
                setErro(v ?? "");
                if (!v) setPasso(3);
              }}
            >
              Continuar ›
            </button>
          </div>
          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
        </>
      )}

      {passo === 3 && (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className={`${classeCartao} flex flex-col gap-3 p-3`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Dados da ordem</p>
            {avulsa && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-stone-600 dark:text-slate-300 sm:col-span-2">Descrição *<input className={classeCampo} value={dados.descricao} onChange={(e) => setDados({ ...dados, descricao: e.target.value })} /></label>
                <label className="text-xs text-stone-600 dark:text-slate-300">Desenho<input className={classeCampo} value={dados.desenho} onChange={(e) => setDados({ ...dados, desenho: e.target.value })} /></label>
                <label className="text-xs text-stone-600 dark:text-slate-300">MAC<input className={classeCampo} value={dados.mac} onChange={(e) => setDados({ ...dados, mac: e.target.value })} /></label>
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-stone-600 dark:text-slate-300">
                Quantidade (pç)
                <input type="number" min={1} className={classeCampo} value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value) || 0)} />
                {pedido?.quantidade && quantidade !== pedido.quantidade && <span className="text-[11px] text-amber-600">pedido tem {fmtQtd(pedido.quantidade)} pç</span>}
              </label>
              <label className="text-xs text-stone-600 dark:text-slate-300">
                Prazo da OP
                <input type="date" className={classeCampo} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
              </label>
              <div className="text-xs text-stone-600 dark:text-slate-300">
                Prioridade
                <div className="mt-0.5 flex gap-1">
                  {([1, 2, 3] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPrioridade(p)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                        prioridade === p
                          ? p === 1
                            ? "border-red-600 bg-red-600 text-white"
                            : "border-green-700 bg-green-700 text-white dark:border-cyan-600 dark:bg-cyan-600"
                          : "border-stone-300 bg-white text-stone-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      }`}
                    >
                      {p === 1 ? "Urgente" : p === 2 ? "Normal" : "Baixa"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label className="text-xs text-stone-600 dark:text-slate-300">
              Observação para a fábrica
              <textarea rows={3} className={classeCampo} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: material separado no box 3; inspeção dimensional antes da pintura…" />
            </label>
          </div>
          <div className={`${classeCartao} flex flex-col p-3`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Roteiro — {etapas.length} etapas · {fmtHoras(etapas.reduce((s, e) => s + horasPrevistas(e, quantidade), 0))} previstas</p>
            <ol className="mt-2 flex flex-col divide-y divide-stone-100 text-sm dark:divide-slate-800">
              {etapas.map((e) => (
                <li key={e.chave} className="flex items-center gap-2 py-1.5">
                  <span className="w-8 font-mono text-xs text-stone-400">{e.posicao}</span>
                  <span className="flex-1 font-medium text-stone-800 dark:text-slate-100">{descOperacao(cad, e.operacao) ?? "—"}</span>
                  <span className="rounded bg-stone-100 px-1.5 font-mono text-[11px] text-stone-600 dark:bg-slate-800 dark:text-slate-300">{e.centro}</span>
                  <span className="w-14 text-right text-xs text-stone-500">{fmtHoras(horasPrevistas(e, quantidade))}</span>
                </li>
              ))}
            </ol>
            <div className="mt-auto flex flex-col gap-2 pt-3">
              {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={classeBotao} onClick={() => setPasso(2)}>‹ Voltar ao roteiro</button>
                <button type="button" className={classeBotao} disabled={salvando} onClick={() => salvar(false, false)} title="Fica Aguardando liberação: ainda não aparece no totem">
                  Salvar (aguardando liberação)
                </button>
                <button type="button" className={classeBotaoPrimario} disabled={salvando} onClick={() => salvar(true, true)} title="Já aparece nos totens da fábrica e abre a impressão">
                  {salvando ? "Gerando…" : "Gerar, liberar e imprimir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumoPedido({ pedido, dados }: { pedido: PedidoFU | null; dados: { descricao: string; desenho: string; mac: string; cliente: string; po: string } }) {
  if (!pedido)
    return (
      <div className={`${classeCartao} px-3 py-2 text-sm text-stone-600 dark:text-slate-300`}>
        <b>OP avulsa</b> — sem pedido do Follow up {dados.descricao && `· ${dados.descricao}`}
      </div>
    );
  return (
    <div className={`${classeCartao} flex items-center gap-3 px-3 py-2`}>
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-slate-800">
        {pedido.foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFoto(pedido.foto)!} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate">
          <b className="font-mono">{pedido.po}</b> · {pedido.cliente} · MAC {pedido.mac} · Des. {pedido.desenho}
        </p>
        <p className="truncate text-xs text-stone-500 dark:text-slate-400">
          {pedido.descricao} · {fmtQtd(pedido.quantidade)} pç · Follow up: {pedido.status ?? "—"}
        </p>
      </div>
      <Prazo prazo={pedido.prazo_contratual} />
    </div>
  );
}

export type { OP };
