"use client";

// Aba "Ordens de produção" do Follow up / Produção — pedido do usuário (07/11/2026):
// o PCP gera a OP a partir do pedido, escolhendo as etapas da base Sectra, libera
// pra fábrica e acompanha os apontamentos que os operadores fazem nos totens
// (/follow-up/totem). Tudo pela Vercel: /api/follow-up/producao.

import { useCallback, useEffect, useMemo, useState } from "react";
import OrdensProducaoOperadores from "@/components/OrdensProducaoOperadores";
import OrdensProducaoNova, { EditorRoteiro, descCentro, etapasParaEnvio, validarEtapas, type EtapaEditor } from "@/components/OrdensProducaoNova";
import {
  api,
  BarraEtapas,
  classeBotao,
  classeBotaoPerigo,
  classeBotaoPrimario,
  classeCampo,
  classeCartao,
  Prazo,
  SeloPrioridade,
  SeloStatusEtapa,
  SeloStatusOP,
  urlFoto,
  useAgora,
} from "@/components/ProducaoComum";
import { minutosUteis } from "@/lib/jornada";
import {
  ROTULO_TIPO,
  diasParaPrazo,
  fmtDataHora,
  fmtHoras,
  fmtMin,
  fmtQtd,
  horasPrevistas,
  minutosRealizados,
  numeroOP,
  progressoOP,
  proximaEtapa,
  statusEtapa,
  type Apontamento,
  type Cadastros,
  type OP,
  type StatusOP,
} from "@/lib/producao";
import { repetirComAbaVisivel } from "@/lib/repetir";

type Dados = { cadastros: Cadastros; ops: OP[]; apontamentos: Apontamento[]; abertos: Apontamento[]; podeEditar: boolean };
type Sub = "painel" | "nova" | "chao" | "apontamentos" | "operadores";

export default function OrdensProducao() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [sub, setSub] = useState<Sub>("painel");
  const [aberta, setAberta] = useState<string | null>(null);
  const agora = useAgora(30000);

  const carregar = useCallback(() => {
    api<Dados>("/api/follow-up/producao")
      .then((d) => {
        setDados(d);
        setErro("");
      })
      .catch((e: Error) => setErro(e.message));
  }, []);
  useEffect(() => {
    carregar();
    return repetirComAbaVisivel(carregar, 60000);
  }, [carregar]);

  const kpi = useMemo(() => {
    if (!dados) return null;
    const ativas = dados.ops.filter((o) => o.status === "liberada");
    const aguardando = dados.ops.filter((o) => o.status === "aguardando");
    const atrasadas = dados.ops.filter((o) => (o.status === "liberada" || o.status === "aguardando") && (diasParaPrazo(o.prazo) ?? 1) < 0);
    const trabalhando = dados.abertos.filter((a) => a.tipo !== "parada").length;
    const parados = dados.abertos.filter((a) => a.tipo === "parada").length;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const minHoje = dados.apontamentos
      .filter((a) => a.tipo !== "parada" && new Date(a.fim ?? agora) > hoje)
      .reduce((s, a) => s + minutosUteis(new Date(a.inicio) > hoje ? a.inicio : hoje, a.fim ?? agora), 0);
    return { ativas: ativas.length, aguardando: aguardando.length, atrasadas: atrasadas.length, trabalhando, parados, minHoje };
  }, [dados, agora]);

  if (erro && !dados) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>;
  if (!dados || !kpi) return <p className="px-1 py-6 text-sm text-stone-500">Carregando ordens de produção…</p>;

  const op = aberta ? dados.ops.find((o) => o.id === aberta) ?? null : null;
  const semCadastro = !dados.cadastros.operadores.length;

  return (
    <div className="flex flex-col gap-3">
      {/* Cabeçalho + indicadores */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-stone-800 dark:text-slate-100">Ordens de produção</h2>
          <p className="text-xs text-stone-500 dark:text-slate-400">
            Planejamento e controle de apontamento · cadastros do Sectra atualizados {dados.cadastros.gerado_em ? fmtDataHora(dados.cadastros.gerado_em) : "—"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/follow-up/totem" target="_blank" rel="noreferrer" className={classeBotao} title="Abre a tela dos totens da fábrica (pra testar ou deixar num PC)">
            🖥️ Abrir totem
          </a>
          {dados.podeEditar && (
            <button type="button" className={classeBotaoPrimario} onClick={() => setSub("nova")}>
              ＋ Nova OP
            </button>
          )}
        </div>
      </div>
      {semCadastro && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Os cadastros do Sectra (operadores, centros, roteiros) ainda não chegaram — a sincronização roda a cada 15 min nesta rede.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi rotulo="Em produção" valor={kpi.ativas} cor="sky" onClick={() => setSub("painel")} />
        <Kpi rotulo="Aguardando liberação" valor={kpi.aguardando} cor="amber" onClick={() => setSub("painel")} />
        <Kpi rotulo="Atrasadas" valor={kpi.atrasadas} cor={kpi.atrasadas ? "red" : "stone"} onClick={() => setSub("painel")} />
        <Kpi rotulo="Operadores trabalhando" valor={kpi.trabalhando} cor="emerald" onClick={() => setSub("chao")} />
        <Kpi rotulo="Paradas agora" valor={kpi.parados} cor={kpi.parados ? "red" : "stone"} onClick={() => setSub("chao")} />
        <Kpi rotulo="Horas apontadas hoje" valor={fmtMin(kpi.minHoje)} cor="stone" onClick={() => setSub("apontamentos")} />
      </div>

      <div className="flex border-b border-stone-200 dark:border-slate-800">
        {(
          [
            ["painel", "Painel de OPs"],
            ["nova", "Nova OP"],
            ["chao", "Chão de fábrica (agora)"],
            ["apontamentos", "Apontamentos"],
            ["operadores", "Operadores (crachás)"],
          ] as [Sub, string][]
        )
          .filter(([v]) => v !== "nova" || dados.podeEditar)
          .map(([v, t]) => (
            <button
              key={v}
              type="button"
              onClick={() => setSub(v)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                sub === v ? "border-green-700 text-green-800 dark:border-cyan-500 dark:text-cyan-300" : "border-transparent text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {t}
            </button>
          ))}
      </div>

      {sub === "painel" && <PainelOps dados={dados} agora={agora} abrir={setAberta} />}
      {sub === "nova" && (
        <OrdensProducaoNova
          cad={dados.cadastros}
          aoCancelar={() => setSub("painel")}
          aoCriar={({ id, imprimir }) => {
            if (imprimir) window.open(`/follow-up/op?id=${id}`, "_blank");
            setSub("painel");
            carregar();
            setAberta(id);
          }}
        />
      )}
      {sub === "chao" && <ChaoFabrica dados={dados} agora={agora} abrir={setAberta} />}
      {sub === "apontamentos" && <Apontamentos cad={dados.cadastros} />}
      {sub === "operadores" && <OrdensProducaoOperadores cad={dados.cadastros} ops={dados.ops} abertos={dados.abertos} agora={agora} />}

      {op && <DetalheOP op={op} dados={dados} agora={agora} fechar={() => setAberta(null)} recarregar={carregar} />}
    </div>
  );
}

function Kpi({ rotulo, valor, cor, onClick }: { rotulo: string; valor: number | string; cor: "sky" | "amber" | "red" | "emerald" | "stone"; onClick?: () => void }) {
  const cores = {
    sky: "border-l-sky-500",
    amber: "border-l-amber-500",
    red: "border-l-red-500",
    emerald: "border-l-emerald-500",
    stone: "border-l-stone-300 dark:border-l-slate-600",
  };
  return (
    <button type="button" onClick={onClick} className={`${classeCartao} border-l-4 ${cores[cor]} px-3 py-2 text-left transition hover:shadow-md`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-slate-400">{rotulo}</p>
      <p className="text-2xl font-bold text-stone-800 dark:text-slate-100">{valor}</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Painel de OPs
// ---------------------------------------------------------------------------
function PainelOps({ dados, agora, abrir }: { dados: Dados; agora: Date; abrir: (id: string) => void }) {
  const [filtro, setFiltro] = useState<"abertas" | StatusOP | "atrasadas" | "todas">("abertas");
  const [busca, setBusca] = useState("");
  const [centro, setCentro] = useState("");
  const centrosUsados = useMemo(() => {
    const s = new Map<string, string>();
    for (const o of dados.ops) for (const e of o.etapas) if (e.centro) s.set(e.centro, e.centro_desc ?? e.centro);
    return [...s.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [dados.ops]);

  const lista = dados.ops
    .filter((o) =>
      filtro === "todas"
        ? true
        : filtro === "abertas"
          ? o.status === "aguardando" || o.status === "liberada"
          : filtro === "atrasadas"
            ? (o.status === "aguardando" || o.status === "liberada") && (diasParaPrazo(o.prazo) ?? 1) < 0
            : o.status === filtro,
    )
    .filter((o) => !centro || o.etapas.some((e) => e.centro === centro && !e.concluido_em))
    .filter((o) => {
      if (!busca.trim()) return true;
      const t = busca.trim().toUpperCase();
      return [numeroOP(o.numero), String(o.numero), o.po, o.mac, o.desenho, o.descricao, o.cliente].some((v) => (v ?? "").toUpperCase().includes(t));
    })
    .sort((a, b) => {
      const ordem: Record<StatusOP, number> = { liberada: 0, aguardando: 1, encerrada: 2, cancelada: 3 };
      return ordem[a.status] - ordem[b.status] || a.prioridade - b.prioridade || (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999") || a.numero - b.numero;
    });

  const filtros: [typeof filtro, string][] = [
    ["abertas", "Abertas"],
    ["liberada", "Em produção"],
    ["aguardando", "Aguardando"],
    ["atrasadas", "Atrasadas"],
    ["encerrada", "Encerradas (30d)"],
    ["cancelada", "Canceladas"],
    ["todas", "Todas"],
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {filtros.map(([v, t]) => (
            <button
              key={v}
              type="button"
              onClick={() => setFiltro(v)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filtro === v ? "bg-stone-800 text-white dark:bg-cyan-600" : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-slate-800 dark:text-slate-300"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <select className={`${classeCampo} !w-auto max-w-xs`} value={centro} onChange={(e) => setCentro(e.target.value)} title="Só OPs com etapa pendente neste centro">
          <option value="">Todos os centros</option>
          {centrosUsados.map(([c, d]) => (
            <option key={c} value={c}>{c} · {d}</option>
          ))}
        </select>
        <input className={`${classeCampo} max-w-xs`} placeholder="Buscar OP, PO, MAC, desenho…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="ml-auto text-xs text-stone-500">{lista.length} OP(s)</span>
      </div>

      {lista.length === 0 ? (
        <div className={`${classeCartao} px-4 py-10 text-center text-sm text-stone-500`}>
          Nenhuma OP aqui. {dados.podeEditar && "Clique em ＋ Nova OP e escolha um pedido do Follow up."}
        </div>
      ) : (
        <div className={`${classeCartao} overflow-x-auto`}>
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">OP</th>
                <th className="px-2 py-2">Pedido / Peça</th>
                <th className="px-2 py-2 text-right">Qtd</th>
                <th className="px-2 py-2">Prazo</th>
                <th className="px-2 py-2 w-56">Etapas</th>
                <th className="px-2 py-2">Etapa atual</th>
                <th className="px-2 py-2 text-right">Horas prev. / real</th>
                <th className="px-2 py-2">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
              {lista.map((o) => {
                const aps = dados.apontamentos.filter((a) => a.op_id === o.id);
                const st = o.etapas.map((e) => statusEtapa(e, aps));
                const prox = proximaEtapa(o.etapas);
                const naEtapa = prox ? aps.filter((a) => a.etapa_id === prox.id && !a.fim).map((a) => a.operador_nome) : [];
                const prev = o.etapas.reduce((s, e) => s + horasPrevistas(e, o.quantidade), 0);
                const real = minutosRealizados(aps.filter((a) => a.tipo !== "parada"), agora) / 60;
                return (
                  <tr key={o.id} onClick={() => abrir(o.id)} className="cursor-pointer hover:bg-green-50/40 dark:hover:bg-cyan-500/5">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-stone-800 dark:text-slate-100">{numeroOP(o.numero)}</span>
                        {o.prioridade !== 2 && <SeloPrioridade p={o.prioridade} />}
                      </div>
                    </td>
                    <td className="max-w-[22rem] px-2 py-2">
                      <div className="flex items-center gap-2">
                        {o.foto && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={urlFoto(o.foto)!} alt="" className="h-9 w-9 shrink-0 rounded object-cover" loading="lazy" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium text-stone-800 dark:text-slate-100">{o.descricao}</p>
                          <p className="truncate text-[11px] text-stone-500 dark:text-slate-400">
                            {[o.po, o.cliente, o.mac && `MAC ${o.mac}`, o.desenho && `Des. ${o.desenho}`].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-medium">{fmtQtd(o.quantidade)}</td>
                    <td className="px-2 py-2 text-xs"><Prazo prazo={o.prazo} encerrada={o.status === "encerrada" || o.status === "cancelada"} /></td>
                    <td className="px-2 py-2">
                      <BarraEtapas status={st} titulos={o.etapas.map((e, i) => `${e.posicao} ${e.operacao_desc ?? ""} (${e.centro}) — ${st[i]}`)} />
                      <p className="mt-0.5 text-[10px] text-stone-400">{progressoOP(o)}% · {o.etapas.filter((e) => e.concluido_em).length}/{o.etapas.length}</p>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {prox ? (
                        <>
                          <p className="font-medium text-stone-700 dark:text-slate-200">{prox.posicao} · {prox.operacao_desc ?? prox.centro_desc}</p>
                          <p className="text-[11px] text-stone-500">
                            {prox.centro}
                            {naEtapa.length > 0 && <span className="ml-1 font-semibold text-sky-600 dark:text-sky-400">● {naEtapa.join(", ")}</span>}
                          </p>
                        </>
                      ) : (
                        <span className="text-emerald-600">todas concluídas</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      <span className="text-stone-500">{fmtHoras(prev)}</span> / <b className={real > prev && prev > 0 ? "text-red-600" : "text-stone-800 dark:text-slate-100"}>{fmtHoras(real)}</b>
                    </td>
                    <td className="px-2 py-2"><SeloStatusOP status={o.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detalhe da OP (gaveta lateral)
// ---------------------------------------------------------------------------
function DetalheOP({ op, dados, agora, fechar, recarregar }: { op: OP; dados: Dados; agora: Date; fechar: () => void; recarregar: () => void }) {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [etapasEd, setEtapasEd] = useState<EtapaEditor[]>([]);
  const [origemEd, setOrigemEd] = useState("");
  const [cab, setCab] = useState({ quantidade: op.quantidade, prazo: op.prazo ?? "", prioridade: op.prioridade, observacao: op.observacao ?? "" });
  const [corrigir, setCorrigir] = useState<Apontamento | null>(null);
  const aps = dados.apontamentos.filter((a) => a.op_id === op.id);
  const pode = dados.podeEditar;

  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape" && !corrigir) fechar();
    }
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar, corrigir]);

  async function acao(corpo: Record<string, unknown>, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true);
    setErro("");
    try {
      await api("/api/follow-up/producao", { id: op.id, ...corpo });
      recarregar();
      if (corpo.acao === "excluir") fechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  function iniciarEdicao() {
    const usadas = new Set(aps.map((a) => a.etapa_id));
    setEtapasEd(op.etapas.map((e) => ({ ...e, chave: e.id, travada: usadas.has(e.id) })));
    setOrigemEd(op.roteiro_origem ?? "Manual");
    setCab({ quantidade: op.quantidade, prazo: op.prazo ?? "", prioridade: op.prioridade, observacao: op.observacao ?? "" });
    setEditando(true);
  }
  async function salvarEdicao() {
    const v = validarEtapas(etapasEd, dados.cadastros);
    if (v) return setErro(v);
    await acao({ acao: "editar", ...cab, prazo: cab.prazo || null, etapas: etapasParaEnvio(dados.cadastros, etapasEd), roteiro_origem: origemEd });
    setEditando(false);
  }

  const prevTot = op.etapas.reduce((s, e) => s + horasPrevistas(e, op.quantidade), 0);
  const realTot = minutosRealizados(aps.filter((a) => a.tipo !== "parada"), agora) / 60;
  const aberta = op.status === "aguardando" || op.status === "liberada";

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/40" onClick={fechar}>
      <aside className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-stone-50 shadow-2xl dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex flex-wrap items-start gap-3 border-b border-stone-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          {op.foto && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlFoto(op.foto)!} alt="" className="h-16 w-16 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-mono text-xl font-bold text-stone-800 dark:text-slate-100">{numeroOP(op.numero)}</h3>
              <SeloStatusOP status={op.status} grande />
              <SeloPrioridade p={op.prioridade} />
            </div>
            <p className="truncate font-medium text-stone-700 dark:text-slate-200">{op.descricao}</p>
            <p className="text-xs text-stone-500 dark:text-slate-400">
              {[op.po && `PO ${op.po}`, op.cliente, op.mac && `MAC ${op.mac}`, op.desenho && `Des. ${op.desenho}`, `${fmtQtd(op.quantidade)} pç`].filter(Boolean).join(" · ")}
            </p>
            <p className="text-[11px] text-stone-400">
              Criada por {op.criado_por} em {fmtDataHora(op.criado_em)}
              {op.liberado_em && ` · liberada por ${op.liberado_por} em ${fmtDataHora(op.liberado_em)}`}
              {op.encerrado_em && ` · ${op.status === "cancelada" ? "cancelada" : "encerrada"} em ${fmtDataHora(op.encerrado_em)}`}
              {op.roteiro_origem && ` · roteiro: ${op.roteiro_origem}`}
            </p>
          </div>
          <button type="button" onClick={fechar} className="rounded-lg px-2 py-1 text-xl text-stone-500 hover:bg-stone-100 dark:hover:bg-slate-800" aria-label="Fechar">✕</button>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
          <a href={`/follow-up/op?id=${op.id}`} target="_blank" rel="noreferrer" className={classeBotao}>🖨️ Imprimir OP</a>
          {pode && !editando && (
            <>
              {op.status === "aguardando" && (
                <button type="button" disabled={ocupado} className={classeBotaoPrimario} onClick={() => acao({ acao: "liberar" })}>▶ Liberar para produção</button>
              )}
              {op.status === "liberada" && !aps.length && (
                <button type="button" disabled={ocupado} className={classeBotao} onClick={() => acao({ acao: "voltar" })}>↩ Voltar para aguardando</button>
              )}
              {aberta && <button type="button" disabled={ocupado} className={classeBotao} onClick={iniciarEdicao}>✏️ Editar OP / roteiro</button>}
              {aberta && (
                <button type="button" disabled={ocupado} className={classeBotao} onClick={() => acao({ acao: "encerrar" }, `Encerrar a ${numeroOP(op.numero)} mesmo com etapas pendentes?`)}>
                  ■ Encerrar
                </button>
              )}
              {(op.status === "encerrada" || op.status === "cancelada") && (
                <button type="button" disabled={ocupado} className={classeBotao} onClick={() => acao({ acao: "reabrir" })}>↺ Reabrir</button>
              )}
              {aberta && (
                <button
                  type="button"
                  disabled={ocupado}
                  className={classeBotaoPerigo}
                  onClick={() => {
                    const m = window.prompt(`Motivo do cancelamento da ${numeroOP(op.numero)}:`);
                    if (m && m.trim()) void acao({ acao: "cancelar", motivo: m.trim() });
                  }}
                >
                  Cancelar OP
                </button>
              )}
              {op.status === "aguardando" && !aps.length && (
                <button type="button" disabled={ocupado} className={classeBotaoPerigo} onClick={() => acao({ acao: "excluir" }, `Excluir a ${numeroOP(op.numero)}? (some de vez)`)}>
                  🗑 Excluir
                </button>
              )}
            </>
          )}
          <div className="ml-auto flex gap-4 text-right text-xs">
            <div><p className="text-stone-500">Progresso</p><p className="text-base font-bold">{progressoOP(op)}%</p></div>
            <div><p className="text-stone-500">Prazo</p><p className="text-sm"><Prazo prazo={op.prazo} encerrada={!aberta} /></p></div>
            <div><p className="text-stone-500">Horas prev. / real</p><p className="text-base font-bold">{fmtHoras(prevTot)} / <span className={realTot > prevTot && prevTot > 0 ? "text-red-600" : ""}>{fmtHoras(realTot)}</span></p></div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{erro}</p>}
          {op.cancelado_motivo && <p className="mb-3 rounded-lg bg-stone-100 px-3 py-2 text-sm dark:bg-slate-800">Motivo do cancelamento: {op.cancelado_motivo}</p>}
          {op.observacao && !editando && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">📝 {op.observacao}</p>}

          {editando ? (
            <div className="flex flex-col gap-3">
              <div className={`${classeCartao} grid gap-2 p-3 sm:grid-cols-4`}>
                <label className="text-xs">Quantidade<input type="number" min={1} className={classeCampo} value={cab.quantidade} onChange={(e) => setCab({ ...cab, quantidade: Number(e.target.value) || 0 })} /></label>
                <label className="text-xs">Prazo<input type="date" className={classeCampo} value={cab.prazo} onChange={(e) => setCab({ ...cab, prazo: e.target.value })} /></label>
                <label className="text-xs">Prioridade
                  <select className={classeCampo} value={cab.prioridade} onChange={(e) => setCab({ ...cab, prioridade: Number(e.target.value) as 1 | 2 | 3 })}>
                    <option value={1}>Urgente</option><option value={2}>Normal</option><option value={3}>Baixa</option>
                  </select>
                </label>
                <label className="text-xs sm:col-span-4">Observação<input className={classeCampo} value={cab.observacao} onChange={(e) => setCab({ ...cab, observacao: e.target.value })} /></label>
              </div>
              <EditorRoteiro cad={dados.cadastros} desenho={op.desenho} quantidade={cab.quantidade} etapas={etapasEd} setEtapas={(f) => setEtapasEd(f)} setOrigem={setOrigemEd} />
              <div className="flex justify-end gap-2">
                <button type="button" className={classeBotao} onClick={() => setEditando(false)}>Desistir</button>
                <button type="button" className={classeBotaoPrimario} disabled={ocupado} onClick={salvarEdicao}>Salvar alterações</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {op.etapas.map((e) => {
                const meus = aps.filter((a) => a.etapa_id === e.id);
                const st = statusEtapa(e, aps);
                const prev = horasPrevistas(e, op.quantidade);
                const real = minutosRealizados(meus, agora) / 60;
                const setup = minutosRealizados(meus.filter((a) => a.tipo === "setup"), agora) / 60;
                const agoraNela = meus.filter((a) => !a.fim);
                return (
                  <div key={e.id} className={`${classeCartao} overflow-hidden ${st === "andamento" ? "ring-2 ring-sky-400/60" : ""}`}>
                    <div className="flex flex-wrap items-center gap-3 px-3 py-2">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 font-mono text-sm font-bold text-stone-600 dark:bg-slate-800 dark:text-slate-300">{e.posicao}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-stone-800 dark:text-slate-100">
                          {e.operacao_desc ?? "—"} <span className="ml-1 rounded bg-stone-100 px-1.5 py-px font-mono text-[11px] font-medium text-stone-600 dark:bg-slate-800 dark:text-slate-300">{e.centro} · {e.centro_desc ?? descCentro(dados.cadastros, e.centro)}</span>
                        </p>
                        {e.descricao && <p className="text-xs text-stone-500 dark:text-slate-400">{e.descricao}</p>}
                        {agoraNela.length > 0 && (
                          <p className="text-xs font-semibold text-sky-600 dark:text-sky-400">
                            ● Agora: {agoraNela.map((a) => `${a.operador_nome} (${a.tipo === "setup" ? "preparação" : "produção"} há ${fmtMin(minutosUteis(a.inicio, agora))})`).join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-right text-xs">
                        <div><p className="text-stone-400">Peças</p><p className="font-bold">{fmtQtd(e.qtde_produzida)}/{fmtQtd(op.quantidade)}</p></div>
                        <div><p className="text-stone-400">Prev.</p><p className="font-bold">{fmtHoras(prev)}</p></div>
                        <div><p className="text-stone-400">Real{setup > 0 ? ` (setup ${fmtHoras(setup)})` : ""}</p><p className={`font-bold ${real > prev && prev > 0 ? "text-red-600" : ""}`}>{fmtHoras(real)}</p></div>
                      </div>
                      <SeloStatusEtapa status={st} />
                      {pode && aberta && st !== "concluida" && st !== "andamento" && (
                        <button type="button" className={classeBotao} disabled={ocupado} onClick={() => acao({ acao: "concluir_etapa", etapa_id: e.id }, `Marcar a etapa ${e.posicao} como concluída?`)} title="Concluir sem apontamento (ex.: feita fora do totem)">✓ Concluir</button>
                      )}
                      {pode && st === "concluida" && (
                        <button type="button" className={classeBotao} disabled={ocupado} onClick={() => acao({ acao: "reabrir_etapa", etapa_id: e.id })}>↺ Reabrir etapa</button>
                      )}
                    </div>
                    {meus.length > 0 && (
                      <table className="w-full border-t border-stone-100 text-xs dark:border-slate-800">
                        <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
                          {meus.map((a) => (
                            <tr key={a.id} className="text-stone-600 dark:text-slate-300">
                              <td className="py-1 pl-14 pr-2 font-medium">{a.operador_nome}</td>
                              <td className="px-2">{ROTULO_TIPO[a.tipo]}</td>
                              <td className="px-2">{fmtDataHora(a.inicio)} → {a.fim ? fmtDataHora(a.fim) : <b className="text-sky-600">em andamento</b>}</td>
                              <td className="px-2 text-right">{fmtMin(minutosUteis(a.inicio, a.fim ?? agora))}</td>
                              <td className="px-2 text-right">{a.qtde !== null ? `${fmtQtd(a.qtde)} pç` : ""}</td>
                              <td className="px-2 text-stone-400">
                                {a.fim_tipo === "pausa" ? `pausa${a.motivo ? `: ${a.motivo}` : ""}` : a.fim_tipo === "troca" ? "trocou de etapa" : a.fim_tipo === "correcao" ? "corrigido pelo PCP" : a.encerrou_etapa ? "encerrou a etapa" : ""}
                                {a.observacao && ` · ${a.observacao}`}
                              </td>
                              <td className="px-2 text-right">
                                {pode && (
                                  <button type="button" className="text-stone-400 hover:text-green-700 dark:hover:text-cyan-400" title="Corrigir horário / peças" onClick={() => setCorrigir(a)}>✏️</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>
      {corrigir && <CorrigirApontamento ap={corrigir} fechar={() => setCorrigir(null)} salvo={() => { setCorrigir(null); recarregar(); }} />}
    </div>
  );
}

function paraLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function CorrigirApontamento({ ap, fechar, salvo }: { ap: Apontamento; fechar: () => void; salvo: () => void }) {
  const [inicio, setInicio] = useState(paraLocal(ap.inicio));
  const [fim, setFim] = useState(paraLocal(ap.fim));
  const [qtde, setQtde] = useState(ap.qtde === null ? "" : String(ap.qtde));
  const [obs, setObs] = useState(ap.observacao ?? "");
  const [erro, setErro] = useState("");
  async function salvar(fecharAgora = false) {
    try {
      await api("/api/follow-up/producao", {
        acao: fecharAgora ? "fechar_apontamento" : "corrigir_apontamento",
        apontamento_id: ap.id,
        inicio: new Date(inicio).toISOString(),
        fim: fim ? new Date(fim).toISOString() : null,
        qtde: qtde === "" ? null : Number(qtde),
        observacao: obs,
      });
      salvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <div className={`${classeCartao} w-full max-w-md p-4`} onClick={(e) => e.stopPropagation()}>
        <h4 className="font-bold text-stone-800 dark:text-slate-100">Corrigir apontamento — {ap.operador_nome}</h4>
        <p className="text-xs text-stone-500">Use quando o operador esqueceu de pausar/finalizar no totem.</p>
        <div className="mt-3 grid gap-2">
          <label className="text-xs">Início<input type="datetime-local" className={classeCampo} value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
          <label className="text-xs">Fim {!ap.fim && "(vazio = continua em andamento)"}<input type="datetime-local" className={classeCampo} value={fim} onChange={(e) => setFim(e.target.value)} /></label>
          <label className="text-xs">Peças boas<input type="number" min={0} className={classeCampo} value={qtde} onChange={(e) => setQtde(e.target.value)} /></label>
          <label className="text-xs">Observação<input className={classeCampo} value={obs} onChange={(e) => setObs(e.target.value)} /></label>
        </div>
        {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
        <div className="mt-4 flex justify-end gap-2">
          {!ap.fim && <button type="button" className={classeBotao} onClick={() => salvar(true)}>Fechar agora</button>}
          <button type="button" className={classeBotao} onClick={fechar}>Desistir</button>
          <button type="button" className={classeBotaoPrimario} onClick={() => salvar(false)}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chão de fábrica — quem está fazendo o quê agora
// ---------------------------------------------------------------------------
function ChaoFabrica({ dados, agora, abrir }: { dados: Dados; agora: Date; abrir: (id: string) => void }) {
  const opDe = new Map(dados.ops.map((o) => [o.id, o]));
  const etapaDe = new Map(dados.ops.flatMap((o) => o.etapas.map((e) => [e.id, e] as const)));
  const abertos = [...dados.abertos].sort((a, b) => (a.tipo === "parada" ? -1 : 0) - (b.tipo === "parada" ? -1 : 0) || a.inicio.localeCompare(b.inicio));
  // Fila por centro: etapas liberadas ainda não concluídas.
  const fila = new Map<string, { centro: string; desc: string; itens: { op: OP; etapa: OP["etapas"][number]; proxima: boolean }[] }>();
  for (const o of dados.ops.filter((x) => x.status === "liberada")) {
    const prox = proximaEtapa(o.etapas);
    for (const e of o.etapas.filter((x) => !x.concluido_em)) {
      const c = e.centro ?? "—";
      const g = fila.get(c) ?? { centro: c, desc: e.centro_desc ?? "", itens: [] };
      g.itens.push({ op: o, etapa: e, proxima: prox?.id === e.id });
      fila.set(c, g);
    }
  }
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-stone-700 dark:text-slate-200">Apontamentos em aberto ({abertos.length})</h3>
        {abertos.length === 0 && <div className={`${classeCartao} px-4 py-8 text-center text-sm text-stone-500`}>Ninguém apontando agora.</div>}
        {abertos.map((a) => {
          const o = a.op_id ? opDe.get(a.op_id) : null;
          const e = a.etapa_id ? etapaDe.get(a.etapa_id) : null;
          const min = minutosUteis(a.inicio, agora);
          const parada = a.tipo === "parada";
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => o && abrir(o.id)}
              className={`${classeCartao} flex items-center gap-3 border-l-4 px-3 py-2 text-left ${parada ? "border-l-red-500 bg-red-50/60 dark:bg-red-500/5" : a.tipo === "setup" ? "border-l-amber-400" : "border-l-emerald-500"}`}
            >
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${parada ? "bg-red-500" : a.tipo === "setup" ? "bg-amber-500" : "bg-emerald-600"}`}>
                {(a.operador_nome ?? "?").slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-stone-800 dark:text-slate-100">{a.operador_nome}</p>
                <p className="truncate text-xs text-stone-500 dark:text-slate-400">
                  {parada ? `PARADA — ${a.motivo}` : `${o ? numeroOP(o.numero) : "OP"} · ${e?.posicao ?? ""} ${e?.operacao_desc ?? ""} · ${e?.centro ?? ""} · ${ROTULO_TIPO[a.tipo]}`}
                </p>
                {o && <p className="truncate text-[11px] text-stone-400">{o.descricao}</p>}
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${parada ? "text-red-600" : "text-stone-800 dark:text-slate-100"}`}>{fmtMin(min)}</p>
                <p className="text-[10px] text-stone-400">desde {fmtDataHora(a.inicio)}</p>
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-stone-700 dark:text-slate-200">Fila por centro produtivo (OPs liberadas)</h3>
        {fila.size === 0 && <div className={`${classeCartao} px-4 py-8 text-center text-sm text-stone-500`}>Nenhuma OP liberada com etapa pendente.</div>}
        {[...fila.values()].sort((a, b) => a.centro.localeCompare(b.centro)).map((g) => (
          <div key={g.centro} className={classeCartao}>
            <div className="flex items-center justify-between border-b border-stone-100 px-3 py-1.5 dark:border-slate-800">
              <p className="text-sm font-semibold"><span className="font-mono">{g.centro}</span> <span className="text-stone-500">· {g.desc}</span></p>
              <p className="text-xs text-stone-500">{g.itens.length} etapa(s) · {fmtHoras(g.itens.reduce((s, i) => s + horasPrevistas(i.etapa, i.op.quantidade), 0))} prev.</p>
            </div>
            <ul className="divide-y divide-stone-100 text-xs dark:divide-slate-800">
              {g.itens
                .sort((a, b) => a.op.prioridade - b.op.prioridade || (a.op.prazo ?? "9").localeCompare(b.op.prazo ?? "9"))
                .map(({ op, etapa, proxima }) => (
                  <li key={etapa.id}>
                    <button type="button" onClick={() => abrir(op.id)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-stone-50 dark:hover:bg-slate-800/50">
                      <span className="font-mono font-semibold">{numeroOP(op.numero)}</span>
                      <span className="text-stone-400">·{etapa.posicao}</span>
                      <span className="min-w-0 flex-1 truncate">{op.descricao}</span>
                      {proxima ? <span className="rounded bg-green-100 px-1.5 font-semibold text-green-800 dark:bg-green-500/15 dark:text-green-300">pronta</span> : <span className="text-stone-400">aguarda etapa anterior</span>}
                      <Prazo prazo={op.prazo} />
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apontamentos (histórico por período, com totais e CSV)
// ---------------------------------------------------------------------------
function Apontamentos({ cad }: { cad: Cadastros }) {
  const hoje = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const [de, setDe] = useState(iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6)));
  const [ate, setAte] = useState(iso(hoje));
  const [operador, setOperador] = useState("");
  const [r, setR] = useState<{ apontamentos: Apontamento[]; ops: OP[] } | null>(null);
  const [erro, setErro] = useState("");
  const agora = useAgora(60000);

  useEffect(() => {
    let ativo = true;
    api<{ apontamentos: Apontamento[]; ops: OP[] }>(`/api/follow-up/producao?tipo=historico&de=${de}&ate=${ate}`)
      .then((x) => ativo && (setR(x), setErro("")))
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [de, ate]);

  const opDe = new Map((r?.ops ?? []).map((o) => [o.id, o]));
  const etapaDe = new Map((r?.ops ?? []).flatMap((o) => o.etapas.map((e) => [e.id, e] as const)));
  const lista = (r?.apontamentos ?? []).filter((a) => !operador || String(a.operador_codigo) === operador);
  const porOperador = new Map<string, { prod: number; setup: number; parada: number }>();
  const porCentro = new Map<string, number>();
  for (const a of lista) {
    const m = minutosUteis(a.inicio, a.fim ?? agora);
    const k = a.operador_nome ?? String(a.operador_codigo);
    const g = porOperador.get(k) ?? { prod: 0, setup: 0, parada: 0 };
    g[a.tipo === "producao" ? "prod" : a.tipo === "setup" ? "setup" : "parada"] += m;
    porOperador.set(k, g);
    const c = a.etapa_id ? etapaDe.get(a.etapa_id)?.centro : null;
    if (c && a.tipo !== "parada") porCentro.set(c, (porCentro.get(c) ?? 0) + m);
  }

  function csv() {
    const linhas = [["Operador", "Tipo", "OP", "Etapa", "Centro", "Inicio", "Fim", "Minutos uteis", "Pecas", "Motivo/Obs"]];
    for (const a of lista) {
      const o = a.op_id ? opDe.get(a.op_id) : null;
      const e = a.etapa_id ? etapaDe.get(a.etapa_id) : null;
      linhas.push([
        a.operador_nome ?? "",
        ROTULO_TIPO[a.tipo],
        o ? numeroOP(o.numero) : "",
        e ? `${e.posicao} ${e.operacao_desc ?? ""}` : "",
        e?.centro ?? "",
        fmtDataHora(a.inicio),
        a.fim ? fmtDataHora(a.fim) : "em andamento",
        String(minutosUteis(a.inicio, a.fim ?? agora)),
        a.qtde === null ? "" : String(a.qtde),
        [a.motivo, a.observacao].filter(Boolean).join(" · "),
      ]);
    }
    const txt = "﻿" + linhas.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `apontamentos ${de} a ${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">De<input type="date" className={classeCampo} value={de} onChange={(e) => setDe(e.target.value)} /></label>
        <label className="text-xs">Até<input type="date" className={classeCampo} value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        <label className="text-xs">Operador
          <select className={classeCampo} value={operador} onChange={(e) => setOperador(e.target.value)}>
            <option value="">Todos</option>
            {cad.operadores.filter((o) => o.ativo).map((o) => (
              <option key={o.codigo} value={o.codigo}>{o.cracha} · {o.apelido} ({o.nome})</option>
            ))}
          </select>
        </label>
        <button type="button" className={classeBotao} onClick={csv} disabled={!lista.length}>⬇ Exportar CSV (Excel)</button>
        <span className="ml-auto text-xs text-stone-500">{r ? `${lista.length} apontamento(s) · horas só na jornada (7:30–17:18, sem almoço)` : erro || "Carregando…"}</span>
      </div>

      {r && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={classeCartao}>
            <p className="border-b border-stone-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:border-slate-800">Por operador</p>
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] text-stone-400"><tr><th className="px-3 py-1">Operador</th><th className="px-2 text-right">Produção</th><th className="px-2 text-right">Setup</th><th className="px-2 text-right">Parada</th><th className="px-3 text-right">Eficiência*</th></tr></thead>
              <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
                {[...porOperador.entries()].sort((a, b) => b[1].prod - a[1].prod).map(([k, v]) => {
                  const tot = v.prod + v.setup + v.parada;
                  return (
                    <tr key={k}>
                      <td className="px-3 py-1 font-medium">{k}</td>
                      <td className="px-2 text-right">{fmtMin(v.prod)}</td>
                      <td className="px-2 text-right">{fmtMin(v.setup)}</td>
                      <td className={`px-2 text-right ${v.parada ? "text-red-600" : ""}`}>{fmtMin(v.parada)}</td>
                      <td className="px-3 text-right">{tot ? Math.round(((v.prod + v.setup) / tot) * 100) : 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-3 py-1 text-[10px] text-stone-400">* tempo produtivo (produção + setup) ÷ tempo apontado</p>
          </div>
          <div className={classeCartao}>
            <p className="border-b border-stone-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:border-slate-800">Horas por centro produtivo</p>
            <ul className="flex flex-col gap-1 p-3">
              {(() => {
                const max = Math.max(1, ...porCentro.values());
                return [...porCentro.entries()].sort((a, b) => b[1] - a[1]).map(([c, m]) => (
                  <li key={c} className="flex items-center gap-2 text-xs">
                    <span className="w-14 font-mono font-semibold">{c}</span>
                    <span className="h-4 rounded bg-green-600/80 dark:bg-cyan-500/70" style={{ width: `${(m / max) * 70}%` }} />
                    <span>{fmtMin(m)}</span>
                  </li>
                ));
              })()}
              {!porCentro.size && <li className="text-xs text-stone-400">Sem horas no período.</li>}
            </ul>
          </div>
        </div>
      )}

      {r && (
        <div className={`${classeCartao} overflow-x-auto`}>
          <table className="w-full min-w-[56rem] text-xs">
            <thead className="bg-stone-50 text-left text-[11px] uppercase tracking-wide text-stone-500 dark:bg-slate-950">
              <tr><th className="px-3 py-1.5">Operador</th><th className="px-2">Tipo</th><th className="px-2">OP / Etapa</th><th className="px-2">Início</th><th className="px-2">Fim</th><th className="px-2 text-right">Tempo</th><th className="px-2 text-right">Peças</th><th className="px-2">Obs.</th></tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-slate-800">
              {lista.map((a) => {
                const o = a.op_id ? opDe.get(a.op_id) : null;
                const e = a.etapa_id ? etapaDe.get(a.etapa_id) : null;
                return (
                  <tr key={a.id} className={a.tipo === "parada" ? "bg-red-50/50 dark:bg-red-500/5" : ""}>
                    <td className="px-3 py-1 font-medium">{a.operador_nome}</td>
                    <td className="px-2">{ROTULO_TIPO[a.tipo]}</td>
                    <td className="px-2">{a.tipo === "parada" ? a.motivo : `${o ? numeroOP(o.numero) : ""} · ${e?.posicao ?? ""} ${e?.operacao_desc ?? ""} (${e?.centro ?? ""})`}</td>
                    <td className="px-2">{fmtDataHora(a.inicio)}</td>
                    <td className="px-2">{a.fim ? fmtDataHora(a.fim) : <b className="text-sky-600">em andamento</b>}</td>
                    <td className="px-2 text-right">{fmtMin(minutosUteis(a.inicio, a.fim ?? agora))}</td>
                    <td className="px-2 text-right">{a.qtde ?? ""}</td>
                    <td className="px-2 text-stone-500">{[a.fim_tipo === "pausa" && a.tipo !== "parada" ? `pausa${a.motivo ? `: ${a.motivo}` : ""}` : null, a.encerrou_etapa ? "encerrou etapa" : null, a.observacao].filter(Boolean).join(" · ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
