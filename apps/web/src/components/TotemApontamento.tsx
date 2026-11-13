"use client";

// Totem de apontamento da fábrica — pedido do usuário (07/11/2026): PCs/totens
// com tela de toque; o operador digita (ou bipa) o nº do crachá do Sectra e
// aponta início, pausa e fim das etapas das OPs liberadas pelo PCP.
// Fluxo: Crachá → (o que está fazendo agora) → Iniciar etapa / Pausar /
// Finalizar / Parada → "Apontamento registrado" → volta pro crachá.
// Sai sozinho depois de 45 s sem toque. API: /api/follow-up/producao/totem.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, urlFoto, useAgora } from "@/components/ProducaoComum";
import {
  definirFeriadosApontamento,
  diasParaPrazo,
  fmtData,
  fmtMin,
  fmtQtd,
  lerCodigoEtapa,
  minutosApontamento,
  numeroOP,
  proximaEtapa,
  statusEtapa,
  type Apontamento,
  type Centro,
  type Etapa,
  type OP,
} from "@/lib/producao";

type Sessao = {
  operador: { codigo: number; nome: string; apelido: string; cracha: string; centro: string | null };
  aberto: Apontamento | null;
  ops: OP[];
  apontamentos: Apontamento[];
  ocupadas: { etapa_id: string; operador_nome: string }[];
  hoje: Apontamento[];
  motivos: string[];
  centros: Centro[];
  feriados?: string[];
};
type Tela =
  | { t: "cracha" }
  | { t: "inicio" }
  | { t: "op"; opId: string }
  | { t: "tipo"; opId: string; etapaId: string }
  | { t: "finalizar" }
  | { t: "pausar" }
  | { t: "parada" }
  | { t: "ok"; titulo: string; sub?: string };

const INATIVO_MS = 45000;
const MOTIVOS_PAUSA = ["Almoço / intervalo", "Fim do expediente", "Falta de material", "Aguardando engenharia", "Aguardando inspeção", "Máquina em manutenção", "Ferramenta / dispositivo", "Outro serviço urgente"];

// Grupo do centro = 1º nível da árvore do Sectra (04 USINAGEM, 03 SOLDA…).
function grupoDoCentro(centros: Centro[], cod: string | null): string {
  const c = centros.find((x) => x.codigo === cod);
  const raiz = (c?.nivel ?? "").split(".")[0];
  return centros.find((x) => x.nivel === raiz)?.descricao ?? c?.descricao ?? "Outros";
}

export default function TotemApontamento() {
  const [tela, setTela] = useState<Tela>({ t: "cracha" });
  const [cracha, setCracha] = useState("");
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [grupo, setGrupo] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [ultimoToque, setUltimoToque] = useState(() => Date.now());
  const agora = useAgora(1000);

  const sair = useCallback(() => {
    setSessao(null);
    setCracha("");
    setErro("");
    setBusca("");
    setGrupo("");
    setTela({ t: "cracha" });
  }, []);

  // Inatividade: volta pro crachá (outro operador vai usar o totem).
  useEffect(() => {
    const toque = () => setUltimoToque(Date.now());
    window.addEventListener("pointerdown", toque);
    window.addEventListener("keydown", toque);
    return () => {
      window.removeEventListener("pointerdown", toque);
      window.removeEventListener("keydown", toque);
    };
  }, []);
  useEffect(() => {
    if (tela.t === "cracha" || tela.t === "ok") return;
    const id = setInterval(() => {
      if (Date.now() - ultimoToque > INATIVO_MS) sair();
    }, 1000);
    return () => clearInterval(id);
  }, [tela.t, sair, ultimoToque]);
  const restante = Math.max(0, Math.ceil((INATIVO_MS - (agora.getTime() - ultimoToque)) / 1000));

  // Tela de sucesso some sozinha.
  useEffect(() => {
    if (tela.t !== "ok") return;
    const id = setTimeout(sair, 3500);
    return () => clearTimeout(id);
  }, [tela, sair]);

  async function identificar(num: string) {
    if (!num) return;
    setOcupado(true);
    setErro("");
    try {
      const s = await api<Sessao>("/api/follow-up/producao/totem", { acao: "identificar", cracha: num });
      definirFeriadosApontamento(s.feriados);
      setSessao(s);
      setCracha(num);
      setUltimoToque(Date.now());
      setTela({ t: "inicio" });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setCracha("");
    } finally {
      setOcupado(false);
    }
  }

  async function enviar(corpo: Record<string, unknown>, ok: { titulo: string; sub?: string }) {
    setOcupado(true);
    setErro("");
    try {
      const r = await api<{ opEncerrada?: boolean }>("/api/follow-up/producao/totem", { cracha, ...corpo });
      setTela({ t: "ok", ...ok, sub: r.opEncerrada ? `${ok.sub ?? ""} · OP concluída! 🎉` : ok.sub });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  // Leitor de código de barras na tela inicial do operador: "OP12-30" abre a etapa direto.
  function bipouEtapa(txt: string): boolean {
    const c = lerCodigoEtapa(txt);
    if (!c || !sessao) return false;
    const op = sessao.ops.find((o) => o.numero === c.numero);
    const et = op?.etapas.find((e) => e.posicao === c.posicao);
    if (!op || !et) {
      setErro(`Etapa ${txt} não encontrada entre as OPs liberadas.`);
      return true;
    }
    setErro("");
    setTela({ t: "tipo", opId: op.id, etapaId: et.id });
    return true;
  }

  return (
    <div data-sem-botao-tema className="flex min-h-screen select-none flex-col bg-slate-950 text-slate-100">
      <Topo sessao={sessao} agora={agora} sair={sair} restante={tela.t === "cracha" || tela.t === "ok" ? null : restante} />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-8">
        {erro && (
          <div className="mx-auto mb-3 w-full max-w-4xl rounded-2xl border border-red-500/50 bg-red-500/15 px-5 py-3 text-center text-xl font-semibold text-red-200" onClick={() => setErro("")}>
            ⚠ {erro}
          </div>
        )}
        {tela.t === "cracha" && <TelaCracha ocupado={ocupado} enviar={identificar} />}
        {sessao && tela.t === "inicio" && (
          <TelaInicio
            s={sessao}
            agora={agora}
            grupo={grupo}
            setGrupo={setGrupo}
            busca={busca}
            setBusca={setBusca}
            enter={(v) => {
              if (bipouEtapa(v)) setBusca("");
            }}
            abrirOp={(opId) => (setErro(""), setTela({ t: "op", opId }))}
            pausar={() => setTela({ t: "pausar" })}
            finalizar={() => setTela({ t: "finalizar" })}
            parada={() => setTela({ t: "parada" })}
            voltarParada={() => enviar({ acao: "finalizar", qtde: null }, { titulo: "Parada encerrada" })}
          />
        )}
        {sessao && tela.t === "op" && (
          <TelaOp
            s={sessao}
            op={sessao.ops.find((o) => o.id === tela.opId)!}
            voltar={() => setTela({ t: "inicio" })}
            escolher={(etapaId) => setTela({ t: "tipo", opId: tela.opId, etapaId })}
          />
        )}
        {sessao && tela.t === "tipo" && (() => {
          const op = sessao.ops.find((o) => o.id === tela.opId)!;
          const et = op.etapas.find((e) => e.id === tela.etapaId)!;
          return (
            <TelaTipo
              op={op}
              etapa={et}
              s={sessao}
              ocupado={ocupado}
              voltar={() => setTela({ t: "op", opId: op.id })}
              iniciar={(tipo) =>
                enviar(
                  { acao: "iniciar", etapa_id: et.id, tipo },
                  { titulo: tipo === "setup" ? "Preparação iniciada" : "Produção iniciada", sub: `${numeroOP(op.numero)} · etapa ${et.posicao} ${et.operacao_desc ?? ""} · ${et.centro}` },
                )
              }
            />
          );
        })()}
        {sessao && tela.t === "finalizar" && sessao.aberto && (
          <TelaFinalizar
            s={sessao}
            ocupado={ocupado}
            voltar={() => setTela({ t: "inicio" })}
            confirmar={(qtde, encerrar, obs) =>
              enviar(
                { acao: "finalizar", qtde, encerrar_etapa: encerrar, observacao: obs },
                { titulo: encerrar ? "Etapa concluída" : "Apontamento finalizado", sub: `${fmtQtd(qtde)} peça(s) apontada(s)` },
              )
            }
          />
        )}
        {sessao && tela.t === "pausar" && (
          <TelaMotivos
            titulo="Por que está pausando?"
            motivos={MOTIVOS_PAUSA}
            cor="amber"
            ocupado={ocupado}
            voltar={() => setTela({ t: "inicio" })}
            escolher={(m) => enviar({ acao: "pausar", motivo: m }, { titulo: "Pausado", sub: m })}
          />
        )}
        {sessao && tela.t === "parada" && (
          <TelaMotivos
            titulo="Registrar parada — qual o motivo?"
            sub="Use quando você está sem conseguir trabalhar em nenhuma OP."
            motivos={[...new Set([...sessao.motivos, "Máquina em manutenção", "Limpeza / organização", "Treinamento / reunião"])]}
            cor="red"
            ocupado={ocupado}
            voltar={() => setTela({ t: "inicio" })}
            escolher={(m) => enviar({ acao: "parada", motivo: m }, { titulo: "Parada registrada", sub: m })}
          />
        )}
        {tela.t === "ok" && <TelaOk titulo={tela.titulo} sub={tela.sub} />}
      </div>
    </div>
  );
}

function Topo({ sessao, agora, sair, restante }: { sessao: Sessao | null; agora: Date; sair: () => void; restante: number | null }) {
  function telaCheia() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  return (
    <div className="flex items-center gap-4 border-b border-slate-800 bg-slate-900/80 px-4 py-3 sm:px-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 text-lg font-black text-slate-950">FC</span>
        <div>
          <p className="text-lg font-bold leading-tight">Apontamento de produção</p>
          <p className="text-xs text-slate-400">MACFAB · FC Nexus</p>
        </div>
      </div>
      {sessao && (
        <div className="ml-4 hidden items-center gap-3 rounded-2xl bg-slate-800 px-4 py-1.5 md:flex">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 font-bold">{sessao.operador.apelido.slice(0, 2)}</span>
          <div>
            <p className="font-bold leading-tight">{sessao.operador.apelido}</p>
            <p className="text-xs text-slate-400">Crachá {sessao.operador.cracha}</p>
          </div>
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        {restante !== null && <span className="hidden text-sm text-slate-500 sm:inline">sai em {restante}s</span>}
        {sessao && (
          <button type="button" onClick={sair} className="rounded-2xl bg-slate-700 px-5 py-3 text-lg font-bold hover:bg-slate-600 active:scale-95">
            Sair
          </button>
        )}
        <div className="text-right">
          <p className="font-mono text-3xl font-bold tabular-nums">{agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
          <p className="text-xs capitalize text-slate-400">{agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</p>
        </div>
        <button type="button" onClick={telaCheia} title="Tela cheia" className="rounded-xl px-2 py-2 text-slate-500 hover:bg-slate-800">⛶</button>
      </div>
    </div>
  );
}

// ---- Crachá ---------------------------------------------------------------
function TelaCracha({ ocupado, enviar }: { ocupado: boolean; enviar: (n: string) => void }) {
  const [num, setNum] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  // Mantém o foco no campo (leitor de crachá USB "digita" o número + Enter).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.activeElement !== ref.current) ref.current?.focus({ preventScroll: true });
    }, 800);
    return () => clearInterval(id);
  }, []);
  const tecla = (k: string) => {
    if (ocupado) return;
    if (k === "⌫") setNum((n) => n.slice(0, -1));
    else if (k === "C") setNum("");
    else if (k === "OK") {
      enviar(num);
      setNum("");
    } else setNum((n) => (n + k).slice(0, 8));
  };
  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 py-6">
      <div className="text-center">
        <p className="text-4xl font-bold">Olá! 👋</p>
        <p className="mt-2 text-xl text-slate-300">Digite o número do seu <b>crachá</b> para apontar</p>
      </div>
      <input
        ref={ref}
        inputMode="numeric"
        autoFocus
        value={num}
        onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 8))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            enviar(num);
            setNum("");
          }
        }}
        className="w-full rounded-3xl border-2 border-slate-700 bg-slate-900 py-5 text-center font-mono text-6xl font-bold tracking-[0.3em] text-white caret-transparent outline-none focus:border-cyan-500"
        placeholder="•••"
        aria-label="Número do crachá"
      />
      <div className="grid w-full grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => tecla(k)}
            className={`h-20 rounded-2xl text-3xl font-bold shadow-lg active:scale-95 ${k === "C" || k === "⌫" ? "bg-slate-700 text-slate-200" : "bg-slate-800 hover:bg-slate-700"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={!num || ocupado}
        onClick={() => tecla("OK")}
        className="h-20 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-3xl font-black text-slate-950 shadow-xl active:scale-[0.98] disabled:opacity-40"
      >
        {ocupado ? "Conferindo…" : "ENTRAR"}
      </button>
    </div>
  );
}

// ---- Início do operador -----------------------------------------------------
function TelaInicio({
  s,
  agora,
  grupo,
  setGrupo,
  busca,
  setBusca,
  enter,
  abrirOp,
  pausar,
  finalizar,
  parada,
  voltarParada,
}: {
  s: Sessao;
  agora: Date;
  grupo: string;
  setGrupo: (g: string) => void;
  busca: string;
  setBusca: (v: string) => void;
  enter: (v: string) => void;
  abrirOp: (id: string) => void;
  pausar: () => void;
  finalizar: () => void;
  parada: () => void;
  voltarParada: () => void;
}) {
  const a = s.aberto;
  const opA = a?.op_id ? s.ops.find((o) => o.id === a.op_id) : null;
  const etA = a?.etapa_id ? opA?.etapas.find((e) => e.id === a.etapa_id) : null;
  // Setores (grupos de centro) que têm etapa pendente; o do operador primeiro.
  const grupos = useMemo(() => {
    const g = new Map<string, number>();
    for (const o of s.ops) for (const e of o.etapas.filter((x) => !x.concluido_em)) {
      const k = grupoDoCentro(s.centros, e.centro);
      g.set(k, (g.get(k) ?? 0) + 1);
    }
    return [...g.entries()].sort((x, y) => y[1] - x[1]);
  }, [s]);
  const termo = busca.trim().toUpperCase();
  const ops = s.ops
    .filter((o) => !grupo || o.etapas.some((e) => !e.concluido_em && grupoDoCentro(s.centros, e.centro) === grupo))
    .filter((o) => !termo || [numeroOP(o.numero), String(o.numero), o.po, o.mac, o.desenho, o.descricao].some((v) => (v ?? "").toUpperCase().includes(termo)))
    .sort((x, y) => x.prioridade - y.prioridade || (x.prazo ?? "9").localeCompare(y.prazo ?? "9"));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 pt-4">
      <p className="text-3xl font-bold">Olá, {s.operador.apelido}!</p>

      {/* O que está fazendo agora */}
      {a ? (
        <div className={`rounded-3xl border-2 p-5 ${a.tipo === "parada" ? "border-red-500/60 bg-red-500/10" : a.tipo === "setup" ? "border-amber-400/60 bg-amber-400/10" : "border-emerald-500/60 bg-emerald-500/10"}`}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-300">
                {a.tipo === "parada" ? "Você está PARADO" : a.tipo === "setup" ? "Você está em PREPARAÇÃO" : "Você está PRODUZINDO"}
              </p>
              {a.tipo === "parada" ? (
                <>
                  <p className="text-3xl font-bold text-red-200">{a.motivo}</p>
                  <p className="text-base text-slate-300">Para voltar ao trabalho é só escolher a OP abaixo — a parada fecha sozinha.</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold">{opA ? numeroOP(opA.numero) : "OP"} · Etapa {etA?.posicao} {etA?.operacao_desc}</p>
                  <p className="truncate text-lg text-slate-300">{etA?.centro} · {opA?.descricao}</p>
                </>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">tempo</p>
              <p className="font-mono text-5xl font-bold tabular-nums">{fmtMin(minutosApontamento(a.inicio, agora))}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {a.tipo === "parada" ? (
              <BotaoGrande cor="emerald" onClick={voltarParada} className="sm:col-span-2">▶ Encerrar parada</BotaoGrande>
            ) : (
              <>
                <BotaoGrande cor="amber" onClick={pausar}>⏸ Pausar</BotaoGrande>
                <BotaoGrande cor="emerald" onClick={finalizar}>✔ Finalizar / apontar peças</BotaoGrande>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl border-2 border-dashed border-slate-700 px-5 py-4 text-xl text-slate-300">
          Você não está apontando nada agora. <b className="text-white">Escolha a OP abaixo</b> ou bipe o código da etapa na folha da OP.
        </div>
      )}

      {/* Escolher OP */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enter(busca)}
          placeholder="🔍 Bipe o código da etapa ou procure OP / PO / desenho"
          className="min-w-[18rem] flex-1 rounded-2xl border-2 border-slate-700 bg-slate-900 px-5 py-4 text-xl outline-none focus:border-cyan-500"
        />
        <button type="button" onClick={parada} className="rounded-2xl border-2 border-red-500/60 bg-red-500/10 px-6 py-4 text-xl font-bold text-red-200 active:scale-95">
          ⛔ Registrar parada
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip ativo={!grupo} onClick={() => setGrupo("")}>Todos os setores</Chip>
        {grupos.map(([g, n]) => (
          <Chip key={g} ativo={grupo === g} onClick={() => setGrupo(g)}>{g} <span className="opacity-60">({n})</span></Chip>
        ))}
      </div>
      {ops.length === 0 ? (
        <p className="rounded-2xl bg-slate-900 px-5 py-10 text-center text-xl text-slate-400">Nenhuma OP liberada {grupo && `para ${grupo}`}. Procure o PCP.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ops.map((o) => {
            const prox = proximaEtapa(o.etapas);
            const dias = diasParaPrazo(o.prazo);
            return (
              <button key={o.id} type="button" onClick={() => abrirOp(o.id)} className="flex gap-3 rounded-3xl border-2 border-slate-800 bg-slate-900 p-3 text-left transition active:scale-[0.98] hover:border-cyan-500">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-800">
                  {o.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urlFoto(o.foto)!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl">⚙️</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-black">{numeroOP(o.numero)}</span>
                    {o.prioridade === 1 && <span className="rounded-lg bg-red-600 px-2 py-0.5 text-xs font-black">URGENTE</span>}
                  </div>
                  <p className="line-clamp-2 text-base font-semibold text-slate-200">{o.descricao}</p>
                  <p className="text-sm text-slate-400">{fmtQtd(o.quantidade)} pç · Des. {o.desenho ?? "—"}</p>
                  <p className="mt-1 text-sm">
                    {prox && <span className="text-cyan-300">Próxima: {prox.posicao} {prox.operacao_desc} ({prox.centro})</span>}
                    {dias !== null && <span className={`ml-2 ${dias < 0 ? "font-bold text-red-400" : dias <= 3 ? "text-amber-300" : "text-slate-400"}`}>prazo {fmtData(o.prazo)}</span>}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {s.hoje.length > 0 && (
        <div className="rounded-2xl bg-slate-900 p-4">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-slate-400">Seus apontamentos de hoje</p>
          <ul className="flex flex-col gap-1 text-base text-slate-300">
            {s.hoje.slice(0, 6).map((h) => {
              const o = h.op_id ? s.ops.find((x) => x.id === h.op_id) : null;
              return (
                <li key={h.id} className="flex gap-3">
                  <span className="w-28 font-mono text-slate-500">
                    {new Date(h.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}–{h.fim ? new Date(h.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "agora"}
                  </span>
                  <span className="flex-1 truncate">{h.tipo === "parada" ? `Parada: ${h.motivo}` : `${o ? numeroOP(o.numero) : "OP"} · ${h.tipo === "setup" ? "preparação" : "produção"}`}</span>
                  <span>{fmtMin(minutosApontamento(h.inicio, h.fim ?? new Date()))}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Etapas da OP -----------------------------------------------------------
function TelaOp({ s, op, voltar, escolher }: { s: Sessao; op: OP; voltar: () => void; escolher: (etapaId: string) => void }) {
  if (!op) return null;
  const aps = s.apontamentos.filter((a) => a.op_id === op.id);
  const prox = proximaEtapa(op.etapas);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 pt-4">
      <div className="flex items-start gap-4">
        <BotaoVoltar onClick={voltar} />
        {op.foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urlFoto(op.foto)!} alt="" className="h-24 w-24 rounded-2xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-mono text-4xl font-black">{numeroOP(op.numero)}</p>
          <p className="text-xl font-semibold text-slate-200">{op.descricao}</p>
          <p className="text-base text-slate-400">{fmtQtd(op.quantidade)} pç · Desenho {op.desenho ?? "—"} · MAC {op.mac ?? "—"} · prazo {fmtData(op.prazo)}</p>
          {op.observacao && <p className="mt-1 rounded-xl bg-amber-400/15 px-3 py-1.5 text-base text-amber-200">📝 {op.observacao}</p>}
        </div>
      </div>
      <p className="text-xl text-slate-300">Toque na etapa que você vai fazer:</p>
      <div className="flex flex-col gap-3">
        {op.etapas.map((e) => {
          const st = statusEtapa(e, aps);
          const quem = s.ocupadas.filter((o) => o.etapa_id === e.id).map((o) => o.operador_nome);
          const concluida = st === "concluida";
          const ehProx = prox?.id === e.id;
          return (
            <button
              key={e.id}
              type="button"
              disabled={concluida}
              onClick={() => escolher(e.id)}
              className={`flex items-center gap-4 rounded-3xl border-2 p-4 text-left transition active:scale-[0.99] ${
                concluida
                  ? "border-slate-800 bg-slate-900/50 opacity-60"
                  : ehProx
                    ? "border-cyan-400 bg-cyan-400/10"
                    : st === "andamento"
                      ? "border-sky-500/60 bg-sky-500/10"
                      : "border-slate-700 bg-slate-900 hover:border-slate-500"
              }`}
            >
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-mono text-xl font-black ${concluida ? "bg-emerald-600" : "bg-slate-800"}`}>
                {concluida ? "✓" : e.posicao}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-bold">
                  {e.operacao_desc ?? "—"} <span className="text-lg font-semibold text-slate-400">· {e.centro} {e.centro_desc && `(${e.centro_desc})`}</span>
                </p>
                {e.descricao && <p className="text-base text-slate-300">{e.descricao}</p>}
                <p className="text-sm text-slate-400">
                  {fmtQtd(e.qtde_produzida)} de {fmtQtd(op.quantidade)} pç feitas
                  {quem.length > 0 && <span className="ml-2 font-semibold text-sky-300">● {quem.join(", ")} trabalhando</span>}
                </p>
              </div>
              <span className={`rounded-xl px-3 py-1 text-sm font-bold ${concluida ? "bg-emerald-600/30 text-emerald-200" : ehProx ? "bg-cyan-400 text-slate-950" : st === "pausada" ? "bg-amber-400/20 text-amber-200" : st === "andamento" ? "bg-sky-500/30 text-sky-200" : "bg-slate-800 text-slate-400"}`}>
                {concluida ? "CONCLUÍDA" : ehProx ? "PRÓXIMA" : st === "pausada" ? "PAUSADA" : st === "andamento" ? "EM ANDAMENTO" : "PENDENTE"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TelaTipo({ op, etapa, s, ocupado, voltar, iniciar }: { op: OP; etapa: Etapa; s: Sessao; ocupado: boolean; voltar: () => void; iniciar: (t: "setup" | "producao") => void }) {
  const prox = proximaEtapa(op.etapas);
  const foraDeOrdem = prox && prox.id !== etapa.id && prox.posicao < etapa.posicao;
  const vaiTrocar = s.aberto && s.aberto.etapa_id !== etapa.id;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 pt-4">
      <div className="flex items-center gap-4">
        <BotaoVoltar onClick={voltar} />
        <div>
          <p className="text-lg text-slate-400">{numeroOP(op.numero)} · {op.descricao}</p>
          <p className="text-3xl font-bold">Etapa {etapa.posicao} · {etapa.operacao_desc} <span className="text-slate-400">({etapa.centro})</span></p>
        </div>
      </div>
      {foraDeOrdem && (
        <p className="rounded-2xl border border-amber-400/50 bg-amber-400/10 px-5 py-3 text-lg text-amber-200">
          ⚠ A etapa {prox!.posicao} ({prox!.operacao_desc}) ainda não foi concluída. Confira com o líder antes de começar esta.
        </p>
      )}
      {vaiTrocar && (
        <p className="rounded-2xl border border-sky-500/50 bg-sky-500/10 px-5 py-3 text-lg text-sky-200">
          O que você está fazendo agora vai ser fechado automaticamente ao começar esta etapa.
        </p>
      )}
      <p className="text-2xl text-slate-200">O que você vai fazer?</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" disabled={ocupado} onClick={() => iniciar("setup")} className="flex h-48 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-amber-400/60 bg-amber-400/10 text-amber-100 active:scale-95 disabled:opacity-50">
          <span className="text-6xl">🔧</span>
          <span className="text-3xl font-black">PREPARAÇÃO</span>
          <span className="text-base text-amber-200/80">setup de máquina, dispositivo, traçagem</span>
        </button>
        <button type="button" disabled={ocupado} onClick={() => iniciar("producao")} className="flex h-48 flex-col items-center justify-center gap-2 rounded-3xl border-2 border-emerald-500/60 bg-emerald-500/15 text-emerald-100 active:scale-95 disabled:opacity-50">
          <span className="text-6xl">▶</span>
          <span className="text-3xl font-black">PRODUÇÃO</span>
          <span className="text-base text-emerald-200/80">começar a fazer as peças</span>
        </button>
      </div>
    </div>
  );
}

function TelaFinalizar({ s, ocupado, voltar, confirmar }: { s: Sessao; ocupado: boolean; voltar: () => void; confirmar: (qtde: number, encerrar: boolean, obs: string) => void }) {
  const a = s.aberto!;
  const op = s.ops.find((o) => o.id === a.op_id);
  const et = op?.etapas.find((e) => e.id === a.etapa_id);
  const faltam = op && et ? Math.max(0, op.quantidade - et.qtde_produzida) : 0;
  const [qtde, setQtde] = useState(a.tipo === "setup" ? "0" : String(faltam));
  const [encerrar, setEncerrar] = useState<boolean | null>(null);
  const [obs, setObs] = useState("");
  const tecla = (k: string) => setQtde((q) => (k === "⌫" ? q.slice(0, -1) : k === "C" ? "" : (q === "0" ? k : q + k).slice(0, 5)));
  const n = Number(qtde) || 0;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 pt-4">
      <div className="flex items-center gap-4">
        <BotaoVoltar onClick={voltar} />
        <div>
          <p className="text-lg text-slate-400">{op ? numeroOP(op.numero) : ""} · Etapa {et?.posicao} {et?.operacao_desc} ({et?.centro})</p>
          <p className="text-3xl font-bold">Finalizar apontamento</p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-xl text-slate-300">Quantas peças <b className="text-white">boas</b> você fez agora?</p>
          <p className="text-base text-slate-400">Já feitas nesta etapa: {fmtQtd(et?.qtde_produzida)} de {fmtQtd(op?.quantidade)}</p>
          <div className="rounded-3xl border-2 border-slate-700 bg-slate-900 py-4 text-center font-mono text-6xl font-black">{qtde || "0"}</div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) => (
              <button key={k} type="button" onClick={() => tecla(k)} className="h-16 rounded-2xl bg-slate-800 text-2xl font-bold active:scale-95">{k}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-xl text-slate-300">A etapa inteira terminou?</p>
          <button type="button" onClick={() => setEncerrar(true)} className={`rounded-3xl border-2 px-5 py-5 text-left text-2xl font-bold ${encerrar === true ? "border-emerald-400 bg-emerald-500/20" : "border-slate-700 bg-slate-900"}`}>
            ✔ SIM — terminei a etapa
            <span className="block text-base font-normal text-slate-400">a OP segue pra próxima etapa</span>
          </button>
          <button type="button" onClick={() => setEncerrar(false)} className={`rounded-3xl border-2 px-5 py-5 text-left text-2xl font-bold ${encerrar === false ? "border-amber-400 bg-amber-400/15" : "border-slate-700 bg-slate-900"}`}>
            ⏸ NÃO — ainda falta (parcial)
            <span className="block text-base font-normal text-slate-400">eu ou outro operador continuamos depois</span>
          </button>
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional): refugo, problema, medida…" className="rounded-2xl border-2 border-slate-700 bg-slate-900 px-4 py-3 text-lg outline-none focus:border-cyan-500" />
          <BotaoGrande cor="emerald" disabled={encerrar === null || ocupado} onClick={() => confirmar(n, !!encerrar, obs)}>
            {ocupado ? "Gravando…" : encerrar === null ? "Responda se a etapa terminou" : `Confirmar ${fmtQtd(n)} peça(s)`}
          </BotaoGrande>
        </div>
      </div>
    </div>
  );
}

function TelaMotivos({ titulo, sub, motivos, cor, ocupado, voltar, escolher }: { titulo: string; sub?: string; motivos: string[]; cor: "amber" | "red"; ocupado: boolean; voltar: () => void; escolher: (m: string) => void }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 pt-4">
      <div className="flex items-center gap-4">
        <BotaoVoltar onClick={voltar} />
        <div>
          <p className="text-3xl font-bold">{titulo}</p>
          {sub && <p className="text-lg text-slate-400">{sub}</p>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {motivos.map((m) => (
          <button
            key={m}
            type="button"
            disabled={ocupado}
            onClick={() => escolher(m)}
            className={`rounded-3xl border-2 px-5 py-6 text-left text-2xl font-bold capitalize active:scale-[0.98] disabled:opacity-50 ${cor === "red" ? "border-red-500/50 bg-red-500/10 text-red-100" : "border-amber-400/50 bg-amber-400/10 text-amber-100"}`}
          >
            {m.toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function TelaOk({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-40 w-40 items-center justify-center rounded-full bg-emerald-500 text-8xl text-slate-950 shadow-[0_0_80px_rgba(16,185,129,0.5)]">✓</div>
      <p className="text-5xl font-black">{titulo}</p>
      {sub && <p className="max-w-3xl text-2xl text-slate-300">{sub}</p>}
      <p className="mt-4 text-lg text-slate-500">Apontamento registrado. Pode sair.</p>
    </div>
  );
}

function BotaoGrande({ cor, onClick, children, disabled, className = "" }: { cor: "emerald" | "amber"; onClick: () => void; children: React.ReactNode; disabled?: boolean; className?: string }) {
  const c = cor === "emerald" ? "from-emerald-500 to-cyan-500 text-slate-950" : "from-amber-400 to-orange-400 text-slate-950";
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`min-h-20 rounded-2xl bg-gradient-to-r px-6 py-4 text-2xl font-black shadow-xl active:scale-[0.98] disabled:opacity-40 ${c} ${className}`}>
      {children}
    </button>
  );
}
function BotaoVoltar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-800 text-3xl active:scale-95" aria-label="Voltar">
      ‹
    </button>
  );
}
function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 text-lg font-semibold ${ativo ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-300"}`}>
      {children}
    </button>
  );
}
