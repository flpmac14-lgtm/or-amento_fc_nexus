"use client";

// Totem de apontamento da fábrica — pedido do usuário (07/11/2026): PCs/totens
// com tela de toque; o operador digita (ou bipa) o nº do crachá do Sectra e
// aponta início, pausa e fim das etapas das OPs liberadas pelo PCP.
// Fluxo: Crachá → (o que está fazendo agora) → Iniciar etapa / Pausar /
// Finalizar / Parada → "Apontamento registrado" → volta pro crachá.
// Sai sozinho depois de 45 s sem toque. API: /api/follow-up/producao/totem.
// 13/11/2026 — fluxo produtivo / improdutivo (pedido do usuário): ao bipar o
// crachá o totem avisa o que está em aberto; no produtivo aponta peças
// conformes e não conformes (com código do refugo) e escolhe continuar,
// sair, ir pra outra obra ou finalizar a operação; "Apontar parada" pausa o
// produtivo e conta o improdutivo; na volta oferece retomar a mesma obra ou
// outra (pedindo as peças, se ainda não informou). Tudo volta pro crachá.

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
type Tela =
  | { t: "cracha" }
  | { t: "inicio" }
  | { t: "op"; opId: string }
  | { t: "tipo"; opId: string; etapaId: string }
  | { t: "qtde"; modo: ModoQtde; depois: Depois }
  | { t: "pausar" }
  | { t: "parada" }
  | { t: "ok"; titulo: string; sub?: string };

// Quantidade: do apontamento aberto, ao trocar de obra, ou do trecho pausado pela parada.
type ModoQtde = "aberto" | "trocar" | "pausado";
// O que fazer depois de apontar a quantidade (troca de obra / retomada).
type Depois = { k: "nada" } | { k: "retomar" } | { k: "iniciar"; opId: string; etapaId: string; tipo: "setup" | "producao" };
export type Quantidades = { qtde: number; qtde_refugo: number; motivo_refugo: string | null; observacao: string };
type Passo = Record<string, unknown>;

const INATIVO_MS = 45000;
const MOTIVOS_PAUSA = ["Almoço / intervalo", "Fim do expediente", "Falta de material", "Aguardando engenharia", "Aguardando inspeção", "Máquina em manutenção", "Ferramenta / dispositivo", "Outro serviço urgente"];

// Produção pausada pela parada que ainda está sem as peças informadas.
function pausadoSemQtde(s: Sessao | null): boolean {
  const p = s?.aberto?.tipo === "parada" ? s.pausado : null;
  return !!p && p.qtde === null && !p.qtde_refugo;
}

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

  // Um ou mais passos em sequência (ex.: apontar as peças do anterior e começar a nova obra).
  async function enviar(corpo: Passo | Passo[], ok: { titulo: string; sub?: string }) {
    setOcupado(true);
    setErro("");
    let feitos = 0;
    let opEncerrada = false;
    try {
      for (const p of Array.isArray(corpo) ? corpo : [corpo]) {
        const r = await api<{ opEncerrada?: boolean }>("/api/follow-up/producao/totem", { cracha, ...p });
        opEncerrada ||= !!r.opEncerrada;
        feitos++;
      }
      setTela({ t: "ok", ...ok, sub: opEncerrada ? `${ok.sub ?? ""} · OP concluída! 🎉` : ok.sub });
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      // Parte já gravada: recarrega o que ele tem em aberto pra tela não mentir.
      if (feitos > 0) {
        try {
          const s = await api<Sessao>("/api/follow-up/producao/totem", { acao: "identificar", cracha });
          setSessao(s);
          setTela({ t: "inicio" });
        } catch {
          // fica a mensagem de erro
        }
      }
    } finally {
      setOcupado(false);
    }
  }

  // Começar uma etapa: se está produzindo outra, ou se a produção pausada pela parada
  // ainda está sem as peças, pede a quantidade antes.
  function irParaEtapa(opId: string, etapaId: string, tipo: "setup" | "producao") {
    const s = sessao!;
    const a = s.aberto;
    if (a && a.tipo !== "parada" && a.etapa_id !== etapaId) return setTela({ t: "qtde", modo: "trocar", depois: { k: "iniciar", opId, etapaId, tipo } });
    if (a?.tipo === "parada" && pausadoSemQtde(s)) return setTela({ t: "qtde", modo: "pausado", depois: { k: "iniciar", opId, etapaId, tipo } });
    iniciar(opId, etapaId, tipo, []);
  }
  function iniciar(opId: string, etapaId: string, tipo: "setup" | "producao", antes: Passo[]) {
    const op = sessao!.ops.find((o) => o.id === opId);
    const et = op?.etapas.find((e) => e.id === etapaId);
    enviar([...antes, { acao: "iniciar", etapa_id: etapaId, tipo }], {
      titulo: tipo === "setup" ? "Preparação iniciada" : "Produção iniciada",
      sub: op && et ? `${numeroOP(op.numero)} · etapa ${et.posicao} ${et.operacao_desc ?? ""} · ${et.centro}` : undefined,
    });
  }
  function retomar(antes: Passo[]) {
    const s = sessao!;
    const op = s.pausado?.op_id ? s.ops.find((o) => o.id === s.pausado!.op_id) : null;
    const et = op?.etapas.find((e) => e.id === s.pausado?.etapa_id);
    enviar([...antes, { acao: "retomar" }], {
      titulo: "Produção retomada",
      sub: op && et ? `${numeroOP(op.numero)} · etapa ${et.posicao} ${et.operacao_desc ?? ""} · parada encerrada` : "Parada encerrada",
    });
  }

  // Confirmação da tela de quantidade.
  function confirmarQtde(modo: ModoQtde, depois: Depois, q: Quantidades, acao: "parcial" | "sair" | "encerrar" | "outra" | "pular") {
    const pecas = { qtde: q.qtde, qtde_refugo: q.qtde_refugo, motivo_refugo: q.motivo_refugo, observacao: q.observacao };
    const sub = `${fmtQtd(q.qtde)} conforme(s)${q.qtde_refugo ? ` · ${fmtQtd(q.qtde_refugo)} não conforme(s)` : ""}`;
    if (modo === "aberto") {
      if (acao === "parcial") return enviar({ acao: "parcial", ...pecas }, { titulo: "Peças apontadas — continua produzindo", sub });
      if (acao === "outra")
        return enviar({ acao: "pausar", motivo: "Foi para outra obra", ...pecas }, { titulo: "Apontamento encerrado", sub: `${sub} · bipe o crachá de novo e escolha a outra obra` });
      return enviar({ acao: "finalizar", encerrar_etapa: acao === "encerrar", ...pecas }, { titulo: acao === "encerrar" ? "Operação finalizada" : "Apontamento encerrado", sub });
    }
    const antes: Passo[] = [];
    if (modo === "trocar") {
      antes.push(acao === "encerrar" ? { acao: "finalizar", encerrar_etapa: true, ...pecas } : { acao: "pausar", motivo: "Foi para outra obra", ...pecas });
    } else if (acao !== "pular") {
      antes.push({ acao: "apontar_pausado", ap_id: sessao!.pausado!.id, encerrar_etapa: acao === "encerrar", ...pecas });
    }
    if (depois.k === "iniciar") return iniciar(depois.opId, depois.etapaId, depois.tipo, antes);
    if (depois.k === "retomar") return retomar(antes);
    return enviar(antes, { titulo: "Peças apontadas", sub });
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
            apontarQtde={() => setTela({ t: "qtde", modo: "aberto", depois: { k: "nada" } })}
            informarPausado={() => setTela({ t: "qtde", modo: "pausado", depois: { k: "nada" } })}
            parada={() => setTela({ t: "parada" })}
            voltarParada={() => enviar({ acao: "finalizar" }, { titulo: "Parada encerrada", sub: "Você está livre — escolha uma obra quando for começar." })}
            retomar={() => (pausadoSemQtde(sessao) ? setTela({ t: "qtde", modo: "pausado", depois: { k: "retomar" } }) : retomar([]))}
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
              iniciar={(tipo) => irParaEtapa(op.id, et.id, tipo)}
            />
          );
        })()}
        {sessao && tela.t === "qtde" && (() => {
          const ap = tela.modo === "pausado" ? sessao.pausado : sessao.aberto;
          if (!ap) return null;
          const destino = tela.depois.k === "iniciar" ? tela.depois : null;
          const opD = destino ? sessao.ops.find((o) => o.id === destino.opId) : null;
          const etD = opD?.etapas.find((e) => e.id === destino?.etapaId);
          return (
            <TelaQuantidade
              key={`${tela.modo}-${ap.id}`}
              s={sessao}
              ap={ap}
              modo={tela.modo}
              depois={tela.depois}
              destino={opD && etD ? `${numeroOP(opD.numero)} · etapa ${etD.posicao} ${etD.operacao_desc ?? ""}` : null}
              ocupado={ocupado}
              voltar={() => setTela({ t: "inicio" })}
              confirmar={(q, acao) => confirmarQtde(tela.modo, tela.depois, q, acao)}
            />
          );
        })()}
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
            titulo="Apontar parada — qual o motivo?"
            sub={
              sessao.aberto && sessao.aberto.tipo !== "parada"
                ? "A produção que está rodando fica PAUSADA e o tempo passa a contar como improdutivo. Na volta é só bipar o crachá e retomar."
                : "Tempo improdutivo: conta até você encerrar a parada ou começar uma obra."
            }
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
  apontarQtde,
  informarPausado,
  parada,
  voltarParada,
  retomar,
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
  apontarQtde: () => void;
  informarPausado: () => void;
  parada: () => void;
  voltarParada: () => void;
  retomar: () => void;
}) {
  const a = s.aberto;
  const opA = a?.op_id ? s.ops.find((o) => o.id === a.op_id) : null;
  const etA = a?.etapa_id ? opA?.etapas.find((e) => e.id === a.etapa_id) : null;
  const p = a?.tipo === "parada" ? s.pausado ?? null : null;
  const opP = p?.op_id ? s.ops.find((o) => o.id === p.op_id) : null;
  const etP = p?.etapa_id ? opP?.etapas.find((e) => e.id === p.etapa_id) : null;
  const semQtdeP = pausadoSemQtde(s);
  // Aberto desde antes de hoje (esqueceu de fechar ontem): avisa.
  const deOutroDia = a && new Date(a.inicio).toDateString() !== agora.toDateString();
  // Visual enxuto (pedido do usuário, 13/11/2026): com produtivo rodando a lista de
  // obras fica escondida — só aparece em "Trocar de obra".
  const produzindo = !!a && a.tipo !== "parada";
  const [verLista, setVerLista] = useState(false);
  const mostrarLista = !produzindo || verLista;
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
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-3 pt-3">

      {/* O que está fazendo agora — o totem sempre avisa o que está em aberto */}
      {a ? (
        <div className={`rounded-3xl border-2 p-4 ${a.tipo === "parada" ? "border-red-500/60 bg-red-500/10" : a.tipo === "setup" ? "border-amber-400/60 bg-amber-400/10" : "border-emerald-500/60 bg-emerald-500/10"}`}>
          <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white">
            <span className="h-3 w-3 animate-pulse rounded-full bg-current" /> {s.operador.apelido}, você tem apontamento em aberto
          </p>
          {deOutroDia && (
            <p className="mb-2 rounded-xl bg-amber-400/20 px-3 py-1.5 text-base font-semibold text-amber-100">
              ⚠ Aberto desde {new Date(a.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} — se esqueceu de fechar, feche agora e avise o PCP.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-300">
                {a.tipo === "parada" ? "IMPRODUTIVO — você está PARADO" : a.tipo === "setup" ? "PRODUTIVO — PREPARAÇÃO rodando" : "PRODUTIVO — PRODUÇÃO rodando"}
              </p>
              {a.tipo === "parada" ? (
                <>
                  <p className="text-3xl font-bold capitalize text-red-200">{(a.motivo ?? "").toLowerCase()}</p>
                  {opP && etP && (
                    <p className="mt-1 text-lg text-slate-200">
                      ⏸ Produção pausada: <b>{numeroOP(opP.numero)} · etapa {etP.posicao} {etP.operacao_desc}</b> ({etP.centro})
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold">{opA ? numeroOP(opA.numero) : "OP"} · Etapa {etA?.posicao} {etA?.operacao_desc}</p>
                  <p className="truncate text-lg text-slate-300">{etA?.centro} · {opA?.descricao}</p>
                  {etA && opA && <p className="text-base text-slate-400">{fmtQtd(etA.qtde_produzida)} de {fmtQtd(opA.quantidade)} pç já apontadas nesta etapa</p>}
                </>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">tempo</p>
              <p className="font-mono text-5xl font-bold tabular-nums">{fmtMin(minutosApontamento(a.inicio, agora))}</p>
            </div>
          </div>
          {a.tipo === "parada" ? (
            <div className="mt-4 flex flex-col gap-3">
              {semQtdeP && (
                <button type="button" onClick={informarPausado} className="rounded-2xl border-2 border-sky-400/60 bg-sky-500/15 px-5 py-3 text-left text-xl font-bold text-sky-100 active:scale-[0.99]">
                  📦 Você ainda não informou as peças da produção pausada — informar agora
                </button>
              )}
              <div className={`grid gap-3 ${opP && etP ? "sm:grid-cols-2" : ""}`}>
                {opP && etP && (
                  <BotaoGrande cor="emerald" onClick={retomar}>
                    ▶ Retomar a mesma obra
                    <span className="block text-base font-semibold">{numeroOP(opP.numero)} · etapa {etP.posicao}</span>
                  </BotaoGrande>
                )}
                <BotaoGrande cor="slate" onClick={voltarParada}>■ Encerrar parada (ficar livre)</BotaoGrande>
              </div>
              <p className="text-base text-slate-300">Ou escolha <b className="text-white">outra obra</b> abaixo — a parada fecha sozinha ao começar.</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <BotaoGrande cor="emerald" onClick={apontarQtde}>📦 Peças / finalizar</BotaoGrande>
              <BotaoGrande cor="sky" onClick={() => setVerLista((v) => !v)}>↪ {verLista ? "Esconder obras" : "Trocar de obra"}</BotaoGrande>
              <BotaoGrande cor="red" onClick={parada}>⛔ Parada</BotaoGrande>
              <BotaoGrande cor="amber" onClick={pausar}>⏸ Pausar / sair</BotaoGrande>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-3xl border-2 border-dashed border-slate-700 px-5 py-3">
          <p className="min-w-0 flex-1 text-2xl text-slate-200">
            Olá, <b className="text-white">{s.operador.apelido}</b>! Nada em aberto — <b className="text-white">toque na obra</b> ou bipe a etapa.
          </p>
          <button type="button" onClick={parada} className="rounded-2xl border-2 border-red-500/60 bg-red-500/10 px-5 py-3 text-xl font-bold text-red-200 active:scale-95">
            ⛔ Parada (improdutivo)
          </button>
        </div>
      )}

      {/* Escolher OP */}
      {mostrarLista && (<>
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && enter(busca)}
          placeholder="🔍 Bipe o código da etapa ou procure OP / PO / desenho"
          className="min-w-[18rem] flex-1 rounded-2xl border-2 border-slate-700 bg-slate-900 px-5 py-3 text-xl outline-none focus:border-cyan-500"
        />
        {a?.tipo === "parada" && (
          <button type="button" onClick={parada} className="rounded-2xl border-2 border-red-500/60 bg-red-500/10 px-5 py-3 text-lg font-bold text-red-200 active:scale-95">
            Trocar motivo da parada
          </button>
        )}
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
              <button key={o.id} type="button" onClick={() => abrirOp(o.id)} className="flex items-center gap-3 rounded-2xl border-2 border-slate-800 bg-slate-900 p-2.5 text-left transition active:scale-[0.98] hover:border-cyan-500">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-800">
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
                  <p className="line-clamp-1 text-base font-semibold text-slate-200">{o.descricao}</p>
                  <p className="truncate text-sm">
                    {prox && <span className="text-cyan-300">Próxima: {prox.posicao} {prox.operacao_desc} ({prox.centro})</span>}
                    {dias !== null && <span className={`ml-2 ${dias < 0 ? "font-bold text-red-400" : dias <= 3 ? "text-amber-300" : "text-slate-400"}`}>prazo {fmtData(o.prazo)}</span>}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
      </>)}

      {s.hoje.length > 0 && !verLista && (
        <div className="rounded-2xl bg-slate-900/70 px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-500">Seus apontamentos de hoje</p>
          <ul className="flex flex-col gap-0.5 text-base text-slate-300">
            {s.hoje.slice(0, 4).map((h) => {
              const o = h.op_id ? s.ops.find((x) => x.id === h.op_id) : null;
              return (
                <li key={h.id} className="flex gap-3">
                  <span className="w-28 font-mono text-slate-500">
                    {new Date(h.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}–{h.fim ? new Date(h.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "agora"}
                  </span>
                  <span className="flex-1 truncate">
                    {h.tipo === "parada" ? `Parada: ${h.motivo}` : `${o ? numeroOP(o.numero) : "OP"} · ${h.tipo === "setup" ? "preparação" : "produção"}`}
                    {h.qtde !== null && h.tipo !== "parada" && <span className="text-emerald-300"> · {fmtQtd(h.qtde)} ok</span>}
                    {!!h.qtde_refugo && <span className="text-red-300"> · {fmtQtd(h.qtde_refugo)} NC</span>}
                  </span>
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
          {s.aberto!.tipo === "parada"
            ? "A parada aberta fecha sozinha ao começar esta etapa."
            : "Você está produzindo em outra etapa — antes de começar, aponte as peças dela (e diga se a operação terminou)."}
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

function TelaQuantidade({
  s,
  ap,
  modo,
  depois,
  destino,
  ocupado,
  voltar,
  confirmar,
}: {
  s: Sessao;
  ap: Apontamento;
  modo: ModoQtde;
  depois: Depois;
  destino: string | null;
  ocupado: boolean;
  voltar: () => void;
  confirmar: (q: Quantidades, acao: "parcial" | "sair" | "encerrar" | "outra" | "pular") => void;
}) {
  const op = s.ops.find((o) => o.id === ap.op_id);
  const et = op?.etapas.find((e) => e.id === ap.etapa_id);
  const faltam = op && et ? Math.max(0, op.quantidade - et.qtde_produzida) : 0;
  const [ok, setOk] = useState("");
  const [nc, setNc] = useState("");
  const [campo, setCampo] = useState<"ok" | "nc">("ok");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [obs, setObs] = useState("");
  const motivos = s.motivos_refugo ?? [];
  const set = campo === "ok" ? setOk : setNc;
  const tecla = (k: string) => set((q) => (k === "⌫" ? q.slice(0, -1) : k === "C" ? "" : (q === "0" ? k : q + k).slice(0, 5)));
  const nOk = Number(ok) || 0;
  const nNc = Number(nc) || 0;
  const falta = nNc > 0 && !motivo ? "Escolha o código do refugo" : "";
  const q: Quantidades = { qtde: nOk, qtde_refugo: nNc, motivo_refugo: nNc > 0 ? motivo : null, observacao: obs };
  const titulo = modo === "pausado" ? "Peças da produção pausada" : modo === "trocar" ? "Antes de trocar de obra: peças desta etapa" : "Apontar peças";

  const acoes: { acao: "parcial" | "sair" | "encerrar" | "outra" | "pular"; cor: "emerald" | "amber" | "slate" | "sky"; titulo: string; sub: string }[] =
    modo === "aberto"
      ? [
          { acao: "parcial", cor: "sky", titulo: "▶ Continuar produzindo", sub: "aponta as peças e segue rodando nesta etapa" },
          { acao: "sair", cor: "slate", titulo: "■ Encerrar meu apontamento", sub: "a operação continua aberta (eu ou outro termina)" },
          { acao: "encerrar", cor: "emerald", titulo: "✔ Finalizar a operação", sub: "a etapa terminou — a OP segue pra próxima" },
        ]
      : modo === "trocar"
        ? [
            { acao: "outra", cor: "amber", titulo: "↪ Ir para a nova obra", sub: "esta operação fica aberta pra voltar depois" },
            { acao: "encerrar", cor: "emerald", titulo: "✔ Finalizar esta operação e ir", sub: "a etapa terminou — a OP segue pra próxima" },
          ]
        : [
            { acao: "sair", cor: "sky", titulo: depois.k === "retomar" ? "▶ Salvar e retomar" : depois.k === "iniciar" ? "▶ Salvar e ir para a nova obra" : "✔ Salvar peças", sub: "a operação continua aberta" },
            ...(depois.k === "retomar"
              ? []
              : [{ acao: "encerrar" as const, cor: "emerald" as const, titulo: "✔ Salvar e finalizar a operação", sub: "a etapa terminou — a OP segue pra próxima" }]),
            { acao: "pular", cor: "slate", titulo: "Não fiz peças — pular", sub: depois.k === "nada" ? "volta sem gravar" : "segue sem apontar peças" },
          ];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 pt-4">
      <div className="flex items-center gap-4">
        <BotaoVoltar onClick={voltar} />
        <div className="min-w-0">
          <p className="text-lg text-slate-400">
            {op ? numeroOP(op.numero) : ""} · Etapa {et?.posicao} {et?.operacao_desc} ({et?.centro})
          </p>
          <p className="text-3xl font-bold">{titulo}</p>
          {destino && <p className="text-lg text-cyan-300">Depois: {destino}</p>}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <p className="text-base text-slate-400">
            Já apontadas nesta etapa: {fmtQtd(et?.qtde_produzida)} de {fmtQtd(op?.quantidade)} · faltam {fmtQtd(faltam)}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setCampo("ok")} className={`rounded-3xl border-4 p-3 text-center ${campo === "ok" ? "border-emerald-400 bg-emerald-500/15" : "border-slate-700 bg-slate-900"}`}>
              <span className="block text-lg font-bold text-emerald-300">✔ CONFORMES</span>
              <span className="block font-mono text-6xl font-black">{ok || "0"}</span>
            </button>
            <button type="button" onClick={() => setCampo("nc")} className={`rounded-3xl border-4 p-3 text-center ${campo === "nc" ? "border-red-400 bg-red-500/15" : "border-slate-700 bg-slate-900"}`}>
              <span className="block text-lg font-bold text-red-300">✖ NÃO CONFORMES</span>
              <span className="block font-mono text-6xl font-black">{nc || "0"}</span>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((k) => (
              <button key={k} type="button" onClick={() => tecla(k)} className="h-16 rounded-2xl bg-slate-800 text-2xl font-bold active:scale-95">
                {k}
              </button>
            ))}
          </div>
          {faltam > 0 && campo === "ok" && (
            <button type="button" onClick={() => setOk(String(faltam))} className="rounded-2xl bg-slate-800 py-3 text-lg font-semibold text-slate-200 active:scale-95">
              Conformes = todas as que faltam ({fmtQtd(faltam)})
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          {nNc > 0 && (
            <div className="rounded-3xl border-2 border-red-500/50 bg-red-500/10 p-3">
              <p className="mb-2 text-lg font-bold text-red-200">Código do motivo do refugo ({fmtQtd(nNc)} não conforme{nNc > 1 ? "s" : ""}):</p>
              <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                {motivos.map((m) => {
                  const v = `${m.codigo} - ${m.descricao}`;
                  return (
                    <button
                      key={m.codigo}
                      type="button"
                      onClick={() => setMotivo(v)}
                      className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2 text-left text-base font-semibold active:scale-[0.98] ${motivo === v ? "border-red-300 bg-red-500/40 text-white" : "border-slate-700 bg-slate-900 text-slate-200"}`}
                    >
                      <span className="flex h-10 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800 font-mono text-lg font-black">{m.codigo}</span>
                      <span className="capitalize">{m.descricao.toLowerCase()}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observação (opcional): problema, medida…" className="rounded-2xl border-2 border-slate-700 bg-slate-900 px-4 py-3 text-lg outline-none focus:border-cyan-500" />
          {falta && <p className="rounded-2xl bg-red-500/20 px-4 py-2 text-lg font-semibold text-red-200">⚠ {falta}</p>}
          <div className={`grid gap-3 ${acoes.length > 2 ? "sm:grid-cols-2" : ""}`}>
            {acoes.map((x) => (
              <BotaoGrande key={x.acao} cor={x.cor} disabled={ocupado || (x.acao !== "pular" && !!falta)} onClick={() => confirmar(q, x.acao)} className="text-left">
                {ocupado ? "Gravando…" : x.titulo}
                <span className="block text-sm font-semibold opacity-80">{x.sub}</span>
              </BotaoGrande>
            ))}
          </div>
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

function BotaoGrande({ cor, onClick, children, disabled, className = "" }: { cor: "emerald" | "amber" | "red" | "slate" | "sky"; onClick: () => void; children: React.ReactNode; disabled?: boolean; className?: string }) {
  const c = {
    emerald: "from-emerald-500 to-cyan-500 text-slate-950",
    amber: "from-amber-400 to-orange-400 text-slate-950",
    red: "from-red-500 to-rose-500 text-white",
    slate: "from-slate-600 to-slate-700 text-white",
    sky: "from-sky-400 to-cyan-400 text-slate-950",
  }[cor];
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
