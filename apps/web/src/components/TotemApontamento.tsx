"use client";

// Totem de apontamento da fábrica — pedido do usuário (07/11/2026): PCs/totens
// com tela de toque; o operador digita (ou bipa) o nº do crachá do Sectra e
// aponta as etapas das OPs liberadas pelo PCP. API: /api/follow-up/producao/totem.
//
// 13/11/2026 — refeito no conceito do apontamento da DUXTK (pedido do usuário):
// uma tela por estado, só com as ações que fazem sentido, sem ícones.
//   Livre ............ escolhe a ordem → etapa → Iniciar setup / Iniciar produção
//                      (ou Registrar parada: improdutivo, ex. começo do dia)
//   Setup ............ Fim do setup · iniciar produção | Registrar parada | Encerrar apontamento
//   Produção ......... Registrar parada | Encerrar apontamento
//   Parada (pausou) .. Retomar produção | Encerrar apontamento
//   Parada (sem OP) .. Encerrar parada, ou escolher a ordem (a parada fecha sozinha)
// Encerrar = peças boas + refugadas (com o motivo do refugo) + se a operação terminou.
// Ir pra outra obra = encerrar este apontamento e abrir outro. Tudo volta pro crachá;
// sai sozinho depois de 45 s sem toque. As horas seguem a jornada e os feriados
// (minutosApontamento), então um apontamento esquecido aberto não soma a noite.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useAgora } from "@/components/ProducaoComum";
import {
  definirFeriadosApontamento,
  diasParaPrazo,
  fmtData,
  fmtHoras,
  fmtMin,
  fmtQtd,
  horasPrevistas,
  lerCodigoEtapa,
  minutosApontamento,
  numeroOP,
  proximaEtapa,
  statusEtapa,
  type Apontamento,
  type Centro,
  type MotivoRefugo,
  type OP,
} from "@/lib/producao";

type Sessao = {
  operador: { codigo: number; nome: string; apelido: string; cracha: string; centro: string | null };
  aberto: Apontamento | null;
  pausado?: Apontamento | null; // trecho produtivo que a parada aberta pausou
  motivos_refugo?: MotivoRefugo[];
  ops: OP[];
  apontamentos: Apontamento[];
  ocupadas: { etapa_id: string; operador_nome: string }[];
  hoje: Apontamento[];
  motivos: string[];
  centros: Centro[];
  feriados?: string[];
};
type Tela = { t: "cracha" } | { t: "inicio" } | { t: "op"; opId: string } | { t: "parada" } | { t: "encerrar" } | { t: "ok"; titulo: string; sub?: string };
type Passo = Record<string, unknown>;

const INATIVO_MS = 45000;
const API = "/api/follow-up/producao/totem";

// Grupo do centro = 1º nível da árvore do Sectra (04 USINAGEM, 03 SOLDA…).
function grupoDoCentro(centros: Centro[], cod: string | null): string {
  const c = centros.find((x) => x.codigo === cod);
  const raiz = (c?.nivel ?? "").split(".")[0];
  return centros.find((x) => x.nivel === raiz)?.descricao ?? c?.descricao ?? "Outros";
}
const hora = (d: string | Date) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const minuscula = (s: string | null | undefined) => {
  const t = (s ?? "").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export default function TotemApontamento() {
  const [tela, setTela] = useState<Tela>({ t: "cracha" });
  const [cracha, setCracha] = useState("");
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [ultimoToque, setUltimoToque] = useState(() => Date.now());
  const agora = useAgora(1000);

  const sair = useCallback(() => {
    setSessao(null);
    setCracha("");
    setErro("");
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

  // Tela de confirmação some sozinha e volta pro crachá.
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
      const s = await api<Sessao>(API, { acao: "identificar", cracha: num });
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

  // Um ou mais passos em sequência (ex.: fechar a parada e apontar as peças da produção pausada).
  async function enviar(passos: Passo[], ok: { titulo: string; sub?: string }) {
    setOcupado(true);
    setErro("");
    let feitos = 0;
    let opEncerrada = false;
    try {
      for (const p of passos) {
        const r = await api<{ opEncerrada?: boolean }>(API, { cracha, ...p });
        opEncerrada ||= !!r.opEncerrada;
        feitos++;
      }
      setTela({ t: "ok", ...ok, sub: opEncerrada ? `${ok.sub ? `${ok.sub} · ` : ""}OP concluída` : ok.sub });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      // Parte já gravada: recarrega o que ele tem em aberto pra tela não mentir.
      if (feitos > 0) {
        try {
          setSessao(await api<Sessao>(API, { acao: "identificar", cracha }));
          setTela({ t: "inicio" });
        } catch {
          // fica a mensagem de erro
        }
      }
    } finally {
      setOcupado(false);
    }
  }

  function descEtapa(opId: string | null, etapaId: string | null) {
    const op = sessao?.ops.find((o) => o.id === opId);
    const et = op?.etapas.find((e) => e.id === etapaId);
    return op && et ? `${numeroOP(op.numero)} · etapa ${et.posicao} ${et.operacao_desc ?? ""}`.trim() : "";
  }

  function iniciar(opId: string, etapaId: string, tipo: "setup" | "producao") {
    enviar([{ acao: "iniciar", etapa_id: etapaId, tipo }], { titulo: tipo === "setup" ? "Setup iniciado" : "Produção iniciada", sub: descEtapa(opId, etapaId) });
  }

  // Leitor de código de barras na tela do operador: "OP12-30" abre a ordem direto.
  function bipouEtapa(txt: string): boolean {
    const c = lerCodigoEtapa(txt);
    if (!c || !sessao) return false;
    const op = sessao.ops.find((o) => o.numero === c.numero);
    if (!op || !op.etapas.some((e) => e.posicao === c.posicao)) {
      setErro(`Etapa ${txt} não encontrada entre as OPs liberadas.`);
      return true;
    }
    setErro("");
    setTela({ t: "op", opId: op.id });
    return true;
  }

  const a = sessao?.aberto ?? null;
  const pausado = a?.tipo === "parada" ? (sessao?.pausado ?? null) : null;

  return (
    <div data-sem-botao-tema className="flex min-h-screen select-none flex-col bg-[#0b1f24] text-slate-100">
      <Topo sessao={sessao} agora={agora} sair={sair} restante={tela.t === "cracha" || tela.t === "ok" ? null : restante} />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-8">
        {erro && (
          <div className="mx-auto mt-4 w-full max-w-5xl rounded-xl border border-red-400/50 bg-red-500/15 px-5 py-3 text-center text-xl font-semibold text-red-100" onClick={() => setErro("")}>
            {erro}
          </div>
        )}
        {tela.t === "cracha" && <TelaCracha ocupado={ocupado} enviar={identificar} />}
        {sessao && tela.t === "inicio" && (
          <TelaInicio
            s={sessao}
            agora={agora}
            ocupado={ocupado}
            bipar={bipouEtapa}
            abrirOp={(opId) => (setErro(""), setTela({ t: "op", opId }))}
            parada={() => setTela({ t: "parada" })}
            encerrar={() => {
              // Parada sem produção por trás: encerra direto, não tem peça pra apontar.
              if (a?.tipo === "parada" && !pausado) enviar([{ acao: "finalizar" }], { titulo: "Parada encerrada" });
              else setTela({ t: "encerrar" });
            }}
            fimSetup={() => a?.etapa_id && enviar([{ acao: "iniciar", etapa_id: a.etapa_id, tipo: "producao" }], { titulo: "Produção iniciada", sub: descEtapa(a.op_id, a.etapa_id) })}
            retomar={() => enviar([{ acao: "retomar" }], { titulo: "Produção retomada", sub: pausado ? descEtapa(pausado.op_id, pausado.etapa_id) : undefined })}
          />
        )}
        {sessao && tela.t === "op" && (
          <TelaOrdem s={sessao} op={sessao.ops.find((o) => o.id === tela.opId)!} ocupado={ocupado} voltar={() => setTela({ t: "inicio" })} iniciar={(etapaId, tipo) => iniciar(tela.opId, etapaId, tipo)} />
        )}
        {sessao && tela.t === "parada" && (
          <TelaMotivos
            s={sessao}
            ocupado={ocupado}
            voltar={() => setTela({ t: "inicio" })}
            escolher={(m) => enviar([{ acao: "parada", motivo: m }], { titulo: "Parada registrada", sub: minuscula(m) })}
          />
        )}
        {sessao && tela.t === "encerrar" && (pausado ?? (a && a.tipo !== "parada" ? a : null)) && (
          <TelaEncerrar
            s={sessao}
            ap={(pausado ?? a)!}
            comParada={!!pausado}
            ocupado={ocupado}
            voltar={() => setTela({ t: "inicio" })}
            confirmar={(q) => {
              const pecas = { qtde: q.boas, qtde_refugo: q.refugo, motivo_refugo: q.motivo, observacao: q.obs, encerrar_etapa: q.concluiu };
              const sub = `${fmtQtd(q.boas)} boa(s)${q.refugo ? ` · ${fmtQtd(q.refugo)} refugada(s)` : ""}`;
              const titulo = q.concluiu ? "Operação concluída" : "Apontamento encerrado";
              if (pausado) enviar([{ acao: "finalizar" }, { acao: "apontar_pausado", ap_id: pausado.id, ...pecas }], { titulo, sub });
              else enviar([{ acao: "finalizar", ...pecas }], { titulo, sub });
            }}
          />
        )}
        {tela.t === "ok" && <TelaOk titulo={tela.titulo} sub={tela.sub} />}
      </div>
    </div>
  );
}

// ---- Cabeçalho -----------------------------------------------------------------
function Topo({ sessao, agora, sair, restante }: { sessao: Sessao | null; agora: Date; sair: () => void; restante: number | null }) {
  function telaCheia() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }
  return (
    <div className="flex items-center gap-4 border-b border-white/10 bg-black/20 px-4 py-3 sm:px-8">
      <div>
        <p className="text-lg font-bold leading-tight tracking-wide">MACFAB · Apontamento de produção</p>
        <p className="text-xs text-slate-400">FC Nexus</p>
      </div>
      <div className="ml-auto flex items-center gap-5">
        {restante !== null && <span className="hidden text-sm text-slate-500 sm:inline">sai em {restante}s</span>}
        <button type="button" onClick={telaCheia} className="hidden text-sm text-slate-500 underline-offset-4 hover:underline sm:inline">
          Tela cheia
        </button>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold tabular-nums">{hora(agora)}</p>
          <p className="text-xs capitalize text-slate-400">{agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}</p>
        </div>
      </div>
      {sessao && (
        <button type="button" onClick={sair} className="rounded-xl border border-white/20 px-5 py-3 text-lg font-bold hover:bg-white/10 active:scale-95">
          Sair
        </button>
      )}
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-300/80">{children}</p>;
}

type CorBotao = "producao" | "setup" | "parada" | "leve";
function Botao({ cor, onClick, children, disabled, className = "" }: { cor: CorBotao; onClick: () => void; children: React.ReactNode; disabled?: boolean; className?: string }) {
  const c = {
    producao: "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
    setup: "bg-amber-400 text-slate-950 hover:bg-amber-300",
    parada: "bg-red-500 text-white hover:bg-red-400",
    leve: "border-2 border-white/25 bg-transparent text-slate-100 hover:bg-white/10",
  }[cor];
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`min-h-[4.5rem] rounded-xl px-6 py-3 text-xl font-bold transition active:scale-[0.98] disabled:opacity-40 ${c} ${className}`}>
      {children}
    </button>
  );
}

// ---- Passo 1: crachá -------------------------------------------------------------
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
    if (k === "Apagar") setNum((n) => n.slice(0, -1));
    else if (k === "Limpar") setNum("");
    else setNum((n) => (n + k).slice(0, 8));
  };
  const entrar = () => {
    enviar(num);
    setNum("");
  };
  return (
    <div className="mx-auto grid w-full max-w-4xl flex-1 items-center gap-8 py-8 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <Rotulo>Passo 1 · Identifique-se</Rotulo>
        <p className="text-4xl font-bold leading-tight">Aproxime o crachá do leitor ou digite o número.</p>
        <label className="mt-2 text-sm text-slate-400" htmlFor="totem-cracha">
          Número do crachá
        </label>
        <input
          id="totem-cracha"
          ref={ref}
          inputMode="numeric"
          autoFocus
          value={num}
          onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 8))}
          onKeyDown={(e) => e.key === "Enter" && entrar()}
          className="w-full rounded-xl border-2 border-white/15 bg-black/30 py-4 text-center font-mono text-6xl font-bold tracking-[0.3em] text-white caret-transparent outline-none focus:border-teal-400"
          aria-label="Número do crachá"
        />
        <Botao cor="producao" disabled={!num || ocupado} onClick={entrar}>
          {ocupado ? "Conferindo…" : "Entrar"}
        </Botao>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Limpar", "0", "Apagar"].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => tecla(k)}
            className={`h-20 rounded-xl font-bold active:scale-95 ${k.length > 1 ? "bg-white/5 text-lg text-slate-300" : "bg-white/10 text-3xl hover:bg-white/15"}`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Operador + o que está aberto ---------------------------------------------
function TelaInicio({
  s,
  agora,
  ocupado,
  bipar,
  abrirOp,
  parada,
  encerrar,
  fimSetup,
  retomar,
}: {
  s: Sessao;
  agora: Date;
  ocupado: boolean;
  bipar: (v: string) => boolean;
  abrirOp: (id: string) => void;
  parada: () => void;
  encerrar: () => void;
  fimSetup: () => void;
  retomar: () => void;
}) {
  const a = s.aberto;
  const p = a?.tipo === "parada" ? (s.pausado ?? null) : null;
  // A ordem mostrada no painel: a do apontamento aberto, ou a que a parada pausou.
  const base = a && a.tipo !== "parada" ? a : p;
  const op = base?.op_id ? s.ops.find((o) => o.id === base.op_id) : null;
  const et = base?.etapa_id ? op?.etapas.find((e) => e.id === base.etapa_id) : null;
  // A lista de ordens só aparece quando dá pra começar algo: livre, ou parada sem produção por trás.
  const escolherOrdem = !a || (a.tipo === "parada" && !p);
  const deOutroDia = a && new Date(a.inicio).toDateString() !== agora.toDateString();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 pt-5">
      <CartaoOperador s={s} />

      {a && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <Rotulo>Apontamento em aberto{op ? ` · ${numeroOP(op.numero)}${et ? ` · etapa ${et.posicao}` : ""}` : ""}</Rotulo>
              <h2 className="mt-1 text-3xl font-bold leading-tight">
                {op ? (op.descricao ?? numeroOP(op.numero)) : "Parada sem ordem"}
                {et && <span className="ml-2 text-xl font-semibold text-slate-400">{[et.operacao_desc, et.centro].filter(Boolean).join(" · ")}</span>}
              </h2>
            </div>
            <Status a={a} />
          </div>

          {deOutroDia && (
            <p className="mt-3 rounded-lg bg-amber-400/15 px-4 py-2 text-base font-semibold text-amber-100">
              Aberto desde {new Date(a.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}. Se esqueceu de
              fechar, encerre agora e avise o PCP. As horas fora do expediente não contam.
            </p>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {op && et ? (
              <Numero rotulo="Produzidas" valor={fmtQtd(et.qtde_produzida)} sub={`de ${fmtQtd(op.quantidade)} peças`} />
            ) : (
              <Numero rotulo="Motivo" valor={minuscula(a.motivo)} sub="tempo improdutivo" pequeno />
            )}
            <Numero rotulo={a.tipo === "parada" ? "Tempo parado" : "Tempo na fase"} valor={fmtMin(minutosApontamento(a.inicio, agora))} sub={`desde ${hora(a.inicio)}`} />
            {op && et ? (
              <Numero rotulo="Tempo padrão" valor={fmtHoras(horasPrevistas(et, op.quantidade))} sub={`setup ${fmtHoras(et.hr_preparo)} · roteiro`} />
            ) : (
              <Numero rotulo="Hoje" valor={fmtMin(s.hoje.reduce((t, h) => t + minutosApontamento(h.inicio, h.fim ?? agora), 0))} sub="apontado no total" />
            )}
          </div>
          {op && et && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, (et.qtde_produzida / Math.max(1, op.quantidade)) * 100)}%` }} />
            </div>
          )}
          <LinhaDoTempo hoje={s.hoje} agora={agora} />

          <div className="mt-5 flex flex-wrap gap-3 [&>*]:flex-1">
            {a.tipo === "setup" && (
              <Botao cor="producao" disabled={ocupado} onClick={fimSetup}>
                Fim do setup · iniciar produção
              </Botao>
            )}
            {a.tipo === "parada" && p && (
              <Botao cor="producao" disabled={ocupado} onClick={retomar}>
                Retomar produção
              </Botao>
            )}
            {a.tipo !== "parada" && (
              <Botao cor="parada" disabled={ocupado} onClick={parada}>
                Registrar parada
              </Botao>
            )}
            <Botao cor="leve" disabled={ocupado} onClick={encerrar}>
              {a.tipo === "parada" && !p ? "Encerrar parada" : "Encerrar apontamento"}
            </Botao>
          </div>
          {a.tipo !== "parada" && <p className="mt-3 text-sm text-slate-400">Vai para outra obra? Encerre este apontamento e abra o outro.</p>}
        </section>
      )}

      {escolherOrdem && <ListaOrdens s={s} bipar={bipar} abrirOp={abrirOp} parada={a ? null : parada} aviso={a ? "Ao iniciar uma ordem, a parada é encerrada sozinha." : null} />}

      {!a && s.hoje.length > 0 && <LinhaDoTempo hoje={s.hoje} agora={agora} titulo />}
    </div>
  );
}

function CartaoOperador({ s }: { s: Sessao }) {
  const ini = s.operador.apelido
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const setor = s.centros.find((c) => c.codigo === s.operador.centro)?.descricao;
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-500/20 text-xl font-black text-teal-200">{ini}</span>
      <div>
        <p className="text-2xl font-bold leading-tight">{s.operador.apelido}</p>
        <p className="text-sm text-slate-400">
          Crachá {s.operador.cracha}
          {setor ? ` · ${minuscula(setor)}` : ""}
        </p>
      </div>
    </div>
  );
}

function Status({ a }: { a: Apontamento }) {
  const [txt, c] =
    a.tipo === "parada"
      ? [`Parada · ${minuscula(a.motivo)}`, "bg-red-500/20 text-red-200 ring-red-400/50"]
      : a.tipo === "setup"
        ? ["Em setup", "bg-amber-400/20 text-amber-100 ring-amber-300/50"]
        : ["Em produção", "bg-emerald-500/20 text-emerald-100 ring-emerald-400/50"];
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-lg font-bold ring-1 ${c}`}>
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-current" />
      {txt}
    </span>
  );
}

function Numero({ rotulo, valor, sub, pequeno }: { rotulo: string; valor: string; sub?: string; pequeno?: boolean }) {
  return (
    <div className="rounded-xl bg-black/25 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{rotulo}</p>
      <p className={`font-mono font-bold tabular-nums ${pequeno ? "truncate font-sans text-2xl" : "text-4xl"}`}>{valor}</p>
      {sub && <p className="text-sm text-slate-400">{sub}</p>}
    </div>
  );
}

// Linha do tempo do dia (setup / produção / parada), como na demo da DUXTK.
function LinhaDoTempo({ hoje, agora, titulo }: { hoje: Apontamento[]; agora: Date; titulo?: boolean }) {
  const seg = [...hoje].sort((x, y) => x.inicio.localeCompare(y.inicio));
  if (!seg.length) return null;
  const ini = new Date(seg[0].inicio).getTime();
  const fim = Math.max(...seg.map((h) => new Date(h.fim ?? agora).getTime()));
  const total = Math.max(1, fim - ini);
  const cor = { producao: "bg-emerald-400", setup: "bg-amber-400", parada: "bg-red-500" };
  return (
    <div className={titulo ? "rounded-2xl border border-white/10 bg-white/[0.04] p-4" : "mt-4"}>
      {titulo && <Rotulo>Seus apontamentos de hoje</Rotulo>}
      <div className={`relative h-4 overflow-hidden rounded-full bg-white/10 ${titulo ? "mt-3" : ""}`}>
        {seg.map((h) => {
          const x = new Date(h.inicio).getTime();
          const w = new Date(h.fim ?? agora).getTime() - x;
          return (
            <span
              key={h.id}
              className={`absolute inset-y-0 ${cor[h.tipo]}`}
              style={{ left: `${((x - ini) / total) * 100}%`, width: `max(3px, ${(w / total) * 100}%)` }}
              title={`${hora(h.inicio)}–${h.fim ? hora(h.fim) : "agora"} · ${h.tipo === "parada" ? minuscula(h.motivo) : h.tipo}`}
            />
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
          Setup
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />
          Produção
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2.5 w-2.5 rounded-sm bg-red-500" />
          Parada
        </span>
        <span className="ml-auto">
          {hora(seg[0].inicio)} – {seg.some((h) => !h.fim) ? "agora" : hora(new Date(fim))} · {fmtMin(seg.reduce((t, h) => t + minutosApontamento(h.inicio, h.fim ?? agora), 0))} apontados
        </span>
      </p>
    </div>
  );
}

// ---- Passo 2: escolha a ordem ----------------------------------------------------
function ListaOrdens({ s, bipar, abrirOp, parada, aviso }: { s: Sessao; bipar: (v: string) => boolean; abrirOp: (id: string) => void; parada: (() => void) | null; aviso: string | null }) {
  const [grupo, setGrupo] = useState("");
  const [busca, setBusca] = useState("");
  // Setores (grupos de centro) que têm etapa pendente.
  const grupos = useMemo(() => {
    const g = new Map<string, number>();
    for (const o of s.ops)
      for (const e of o.etapas.filter((x) => !x.concluido_em)) {
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
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Rotulo>Passo 2 · Escolha a ordem</Rotulo>
          {aviso && <p className="mt-1 text-base text-slate-300">{aviso}</p>}
        </div>
        {parada && (
          <Botao cor="leve" onClick={parada} className="min-h-0 py-3 text-lg">
            Registrar parada
          </Botao>
        )}
      </div>
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && bipar(busca)) setBusca("");
        }}
        placeholder="Bipe o código da etapa ou procure OP, PO ou desenho"
        className="rounded-xl border-2 border-white/15 bg-black/30 px-5 py-3 text-xl outline-none placeholder:text-slate-500 focus:border-teal-400"
      />
      {grupos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip ativo={!grupo} onClick={() => setGrupo("")}>
            Todos
          </Chip>
          {grupos.map(([g, n]) => (
            <Chip key={g} ativo={grupo === g} onClick={() => setGrupo(g)}>
              {minuscula(g)} <span className="opacity-60">{n}</span>
            </Chip>
          ))}
        </div>
      )}
      {ops.length === 0 ? (
        <p className="rounded-xl bg-white/[0.04] px-5 py-10 text-center text-xl text-slate-400">Nenhuma OP liberada{grupo && ` para ${minuscula(grupo)}`}. Procure o PCP.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ops.map((o) => {
            const prox = proximaEtapa(o.etapas);
            const dias = diasParaPrazo(o.prazo);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => abrirOp(o.id)}
                className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-teal-400/60 active:scale-[0.98]"
              >
                <span className="flex items-center gap-2 text-sm font-bold tracking-wide text-teal-300">
                  {numeroOP(o.numero)}
                  {o.prioridade === 1 && <span className="rounded bg-red-500 px-1.5 py-0.5 text-[11px] font-black text-white">URGENTE</span>}
                  <span className="ml-auto font-normal text-slate-400">{fmtQtd(o.quantidade)} peças</span>
                </span>
                <strong className="line-clamp-1 text-xl">{o.descricao}</strong>
                <span className="truncate text-sm text-slate-400">
                  {prox ? `Próxima: ${prox.posicao} ${prox.operacao_desc ?? ""} · ${prox.centro ?? ""}` : "Sem etapa pendente"}
                  {dias !== null && <span className={dias < 0 ? "font-bold text-red-300" : dias <= 3 ? "text-amber-200" : ""}> · prazo {fmtData(o.prazo)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---- Passo 3: etapa + iniciar ------------------------------------------------------
function TelaOrdem({ s, op, ocupado, voltar, iniciar }: { s: Sessao; op: OP; ocupado: boolean; voltar: () => void; iniciar: (etapaId: string, tipo: "setup" | "producao") => void }) {
  const prox = op ? proximaEtapa(op.etapas) : null;
  const [sel, setSel] = useState<string | null>(prox?.id ?? null);
  if (!op) return null;
  const aps = s.apontamentos.filter((a) => a.op_id === op.id);
  const et = op.etapas.find((e) => e.id === sel) ?? null;
  const foraDeOrdem = et && prox && prox.id !== et.id && prox.posicao < et.posicao;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 pt-5">
      <div className="flex items-start gap-4">
        <Botao cor="leve" onClick={voltar} className="min-h-0 px-4 py-2 text-base">
          Voltar
        </Botao>
        <div className="min-w-0 flex-1">
          <Rotulo>Passo 3 · {numeroOP(op.numero)}</Rotulo>
          <h2 className="text-3xl font-bold leading-tight">{op.descricao}</h2>
          <p className="text-base text-slate-400">
            {fmtQtd(op.quantidade)} peças · desenho {op.desenho ?? "—"} · MAC {op.mac ?? "—"} · prazo {fmtData(op.prazo)}
          </p>
          {op.observacao && <p className="mt-2 rounded-lg bg-amber-400/10 px-3 py-1.5 text-base text-amber-100">{op.observacao}</p>}
        </div>
      </div>

      <Rotulo>Qual etapa você vai fazer?</Rotulo>
      <div className="flex flex-col gap-2">
        {op.etapas.map((e) => {
          const st = statusEtapa(e, aps);
          const concluida = st === "concluida";
          const quem = s.ocupadas.filter((o) => o.etapa_id === e.id).map((o) => o.operador_nome);
          const ativo = sel === e.id;
          return (
            <button
              key={e.id}
              type="button"
              disabled={concluida}
              onClick={() => setSel(e.id)}
              className={`flex items-center gap-4 rounded-xl border-2 px-4 py-3 text-left transition ${
                concluida ? "border-transparent bg-white/[0.02] opacity-50" : ativo ? "border-teal-400 bg-teal-400/10" : "border-white/10 bg-white/[0.04] hover:border-white/30"
              }`}
            >
              <span className="w-12 shrink-0 font-mono text-2xl font-black text-slate-300">{e.posicao}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold">
                  {e.operacao_desc ?? "—"} <span className="text-base font-semibold text-slate-400">· {e.centro}</span>
                </p>
                <p className="text-sm text-slate-400">
                  {fmtQtd(e.qtde_produzida)} de {fmtQtd(op.quantidade)} feitas
                  {e.descricao ? ` · ${e.descricao}` : ""}
                  {quem.length > 0 && <span className="text-sky-300"> · {quem.join(", ")} trabalhando</span>}
                </p>
              </div>
              <span className="text-sm font-bold uppercase tracking-wide text-slate-400">
                {concluida ? "Concluída" : prox?.id === e.id ? <span className="text-teal-300">Próxima</span> : st === "andamento" ? "Em andamento" : st === "pausada" ? "Iniciada" : "Pendente"}
              </span>
            </button>
          );
        })}
      </div>

      {et && (
        <div className="sticky bottom-0 mt-auto flex flex-col gap-3 border-t border-white/10 bg-[#0b1f24] pb-2 pt-4">
          {foraDeOrdem && (
            <p className="rounded-lg bg-amber-400/15 px-4 py-2 text-base text-amber-100">
              A etapa {prox!.posicao} ({prox!.operacao_desc}) ainda não foi concluída. Confira com o líder antes de começar esta.
            </p>
          )}
          {s.aberto?.tipo === "parada" && <p className="text-base text-slate-300">A parada aberta é encerrada ao iniciar.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Botao cor="setup" disabled={ocupado} onClick={() => iniciar(et.id, "setup")}>
              Iniciar setup
            </Botao>
            <Botao cor="producao" disabled={ocupado} onClick={() => iniciar(et.id, "producao")}>
              Iniciar produção
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Registrar parada ------------------------------------------------------------
function TelaMotivos({ s, ocupado, voltar, escolher }: { s: Sessao; ocupado: boolean; voltar: () => void; escolher: (m: string) => void }) {
  const motivos = [...new Set([...s.motivos, "MÁQUINA EM MANUTENÇÃO", "TROCA DE FERRAMENTA", "AGUARDANDO INSPEÇÃO", "LIMPEZA / ORGANIZAÇÃO", "TREINAMENTO / REUNIÃO"].map((m) => m.toUpperCase()))];
  const produzindo = s.aberto && s.aberto.tipo !== "parada";
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 pt-5">
      <div>
        <Rotulo>Registrar parada</Rotulo>
        <h2 className="text-3xl font-bold">Qual o motivo da parada?</h2>
        <p className="text-lg text-slate-400">
          {produzindo ? "A produção fica pausada e o tempo passa a contar como parada. Na volta, bipe o crachá e toque em Retomar produção." : "O tempo conta como parada até você encerrar ou iniciar uma ordem."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {motivos.map((m) => (
          <button
            key={m}
            type="button"
            disabled={ocupado}
            onClick={() => escolher(m)}
            className="rounded-xl border-2 border-red-400/30 bg-red-500/10 px-5 py-5 text-left text-xl font-bold text-red-50 transition hover:border-red-400 active:scale-[0.98] disabled:opacity-50"
          >
            {minuscula(m)}
          </button>
        ))}
      </div>
      <button type="button" onClick={voltar} className="self-start text-lg text-slate-400 underline underline-offset-4">
        Cancelar
      </button>
    </div>
  );
}

// ---- Passo 4: encerrar apontamento -------------------------------------------------
type Encerramento = { boas: number; refugo: number; motivo: string | null; concluiu: boolean; obs: string };
function TelaEncerrar({
  s,
  ap,
  comParada,
  ocupado,
  voltar,
  confirmar,
}: {
  s: Sessao;
  ap: Apontamento;
  comParada: boolean;
  ocupado: boolean;
  voltar: () => void;
  confirmar: (q: Encerramento) => void;
}) {
  const op = s.ops.find((o) => o.id === ap.op_id);
  const et = op?.etapas.find((e) => e.id === ap.etapa_id);
  const faltam = op && et ? Math.max(0, op.quantidade - et.qtde_produzida) : 0;
  const [boas, setBoas] = useState("");
  const [refugo, setRefugo] = useState("");
  const [campo, setCampo] = useState<"boas" | "refugo">("boas");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [concluiu, setConcluiu] = useState<boolean | null>(null);
  const [obs, setObs] = useState("");
  const set = campo === "boas" ? setBoas : setRefugo;
  const tecla = (k: string) => set((q) => (k === "Apagar" ? q.slice(0, -1) : k === "Limpar" ? "" : (q === "0" ? k : q + k).slice(0, 5)));
  const nBoas = Number(boas) || 0;
  const nRef = Number(refugo) || 0;
  const pendente = nRef > 0 && !motivo ? "Escolha o motivo do refugo." : concluiu === null ? "Responda se a operação terminou." : "";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 pt-5">
      <div>
        <Rotulo>
          Passo 4 · Encerrar apontamento{op ? ` · ${numeroOP(op.numero)}` : ""}
          {et ? ` · etapa ${et.posicao} ${et.operacao_desc ?? ""}` : ""}
        </Rotulo>
        <h2 className="text-3xl font-bold">Quantas peças você fez?</h2>
        <p className="text-lg text-slate-400">
          Já apontadas nesta etapa: {fmtQtd(et?.qtde_produzida)} de {fmtQtd(op?.quantidade)}.{comParada ? " A parada aberta também é encerrada." : ""}
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Peças boas" valor={boas} ativo={campo === "boas"} cor="emerald" onClick={() => setCampo("boas")} />
            <Campo rotulo="Peças refugadas" valor={refugo} ativo={campo === "refugo"} cor="red" onClick={() => setCampo("refugo")} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Limpar", "0", "Apagar"].map((k) => (
              <button key={k} type="button" onClick={() => tecla(k)} className={`h-16 rounded-xl font-bold active:scale-95 ${k.length > 1 ? "bg-white/5 text-base text-slate-300" : "bg-white/10 text-2xl"}`}>
                {k}
              </button>
            ))}
          </div>
          {faltam > 0 && campo === "boas" && (
            <button type="button" onClick={() => setBoas(String(faltam))} className="text-left text-base text-teal-300 underline underline-offset-4">
              Preencher com as que faltam ({fmtQtd(faltam)})
            </button>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {nRef > 0 && (
            <div>
              <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-red-200">Motivo do refugo</p>
              <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {(s.motivos_refugo ?? []).map((m) => {
                  const v = `${m.codigo} - ${m.descricao}`;
                  return (
                    <button
                      key={m.codigo}
                      type="button"
                      onClick={() => setMotivo(v)}
                      className={`flex items-center gap-3 rounded-lg border-2 px-3 py-2 text-left text-base font-semibold ${motivo === v ? "border-red-300 bg-red-500/30" : "border-white/10 bg-white/[0.04]"}`}
                    >
                      <span className="w-8 shrink-0 font-mono font-black text-red-200">{m.codigo}</span>
                      {minuscula(m.descricao)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-slate-400">A operação terminou?</p>
            <div className="grid grid-cols-2 gap-3">
              <Opcao ativo={concluiu === true} onClick={() => setConcluiu(true)} titulo="Sim, concluída" sub="a OP segue pra próxima etapa" />
              <Opcao ativo={concluiu === false} onClick={() => setConcluiu(false)} titulo="Não, continua" sub="eu ou outro operador termina depois" />
            </div>
          </div>

          <input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Observação (opcional)"
            className="rounded-xl border-2 border-white/15 bg-black/30 px-4 py-3 text-lg outline-none placeholder:text-slate-500 focus:border-teal-400"
          />

          <p className="text-lg text-slate-300">
            Total produzido agora: <b className="text-white">{fmtQtd(nBoas + nRef)}</b> ({fmtQtd(nBoas)} boas{nRef ? `, ${fmtQtd(nRef)} refugadas` : ""})
          </p>
          {pendente && <p className="text-base font-semibold text-amber-200">{pendente}</p>}
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <Botao cor="producao" disabled={ocupado || !!pendente} onClick={() => confirmar({ boas: nBoas, refugo: nRef, motivo: nRef ? motivo : null, concluiu: !!concluiu, obs })}>
              {ocupado ? "Gravando…" : "Confirmar e encerrar"}
            </Botao>
            <Botao cor="leve" onClick={voltar}>
              Voltar
            </Botao>
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ rotulo, valor, ativo, cor, onClick }: { rotulo: string; valor: string; ativo: boolean; cor: "emerald" | "red"; onClick: () => void }) {
  const borda = ativo ? (cor === "emerald" ? "border-emerald-400 bg-emerald-500/10" : "border-red-400 bg-red-500/10") : "border-white/10 bg-black/25";
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border-2 px-4 py-3 text-left ${borda}`}>
      <span className={`block text-xs font-bold uppercase tracking-widest ${cor === "emerald" ? "text-emerald-300" : "text-red-300"}`}>{rotulo}</span>
      <span className="block font-mono text-5xl font-black tabular-nums">{valor || "0"}</span>
    </button>
  );
}

function Opcao({ ativo, onClick, titulo, sub }: { ativo: boolean; onClick: () => void; titulo: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border-2 px-4 py-3 text-left ${ativo ? "border-teal-400 bg-teal-400/15" : "border-white/10 bg-white/[0.04]"}`}>
      <span className="block text-xl font-bold">{titulo}</span>
      <span className="block text-sm text-slate-400">{sub}</span>
    </button>
  );
}

function TelaOk({ titulo, sub }: { titulo: string; sub?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <span className="h-1.5 w-24 rounded-full bg-emerald-400" />
      <p className="text-5xl font-black">{titulo}</p>
      {sub && <p className="max-w-3xl text-2xl text-slate-300">{sub}</p>}
      <p className="mt-4 text-lg text-slate-500">Apontamento registrado. O totem está livre para o próximo.</p>
    </div>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-base font-semibold ${ativo ? "bg-teal-400 text-slate-950" : "bg-white/10 text-slate-300"}`}
    >
      {children}
    </button>
  );
}
