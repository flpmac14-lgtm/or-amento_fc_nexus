"use client";

// Editar apontamento no totem — pedido do usuário (24/11/2026): na conta "apontamento",
// o encarregado corrige a hora, o tipo (produção/preparação) ou cancela um apontamento.
// Abre pelo link discreto do topo (tela do crachá) e pede a senha; a senha é conferida
// no servidor (/api/follow-up/producao/totem, ações editar_*) a cada chamada.

import { useEffect, useMemo, useState } from "react";
import { api } from "@/components/ProducaoComum";
import { ROTULO_TIPO, fmtDataHora, numeroOP, type TipoApontamento } from "@/lib/producao";

const URL = "/api/follow-up/producao/totem";

type ApEdit = {
  id: string;
  operador_nome: string | null;
  cracha: string | null;
  tipo: TipoApontamento;
  motivo: string | null;
  inicio: string;
  fim: string | null;
  etapa_id: string | null;
  qtde: number | null;
  prod_ops: { numero: number; descricao: string | null } | null;
  prod_op_etapas: { posicao: number; operacao_desc: string | null; centro: string | null } | null;
};

function paraCampo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function descricao(a: ApEdit): string {
  if (a.tipo === "parada") return `Parada — ${a.motivo ?? ""}`;
  if (a.tipo === "interno") return `Serviço interno — ${a.motivo ?? ""}`;
  const op = a.prod_ops ? numeroOP(a.prod_ops.numero) : "OP";
  const et = a.prod_op_etapas ? `${a.prod_op_etapas.posicao} ${a.prod_op_etapas.operacao_desc ?? ""}` : "";
  return `${op} · ${et}`;
}

const campo = "mt-1 w-full rounded-xl border border-white/20 bg-black/30 px-4 py-3 text-xl text-slate-100 outline-none focus:border-teal-400";
const botaoLeve = "rounded-xl border-2 border-white/25 px-5 py-3 text-lg font-bold hover:bg-white/10 active:scale-95 disabled:opacity-40";

export default function TotemEdicao({ fechar }: { fechar: () => void }) {
  const [senha, setSenha] = useState("");
  const [liberado, setLiberado] = useState(false);
  const [lista, setLista] = useState<ApEdit[]>([]);
  const [filtro, setFiltro] = useState("");
  const [sel, setSel] = useState<ApEdit | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function carregar(s = senha, silencioso = false) {
    setOcupado(true);
    setErro("");
    try {
      const r = await api<{ apontamentos: ApEdit[] }>(URL, { acao: "editar_listar", senha: s, dias: 7 });
      setLista(r.apontamentos);
      setLiberado(true);
    } catch (e) {
      if (!silencioso) setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(false);
    }
  }

  // flpmac14 entra direto (o servidor libera sem senha); a conta apontamento cai no pedido de senha.
  useEffect(() => {
    const id = setTimeout(() => void carregar("", true), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtrados = useMemo(() => {
    const f = filtro.trim().toUpperCase();
    if (!f) return lista;
    return lista.filter((a) => `${a.operador_nome ?? ""} ${a.cracha ?? ""} ${descricao(a)}`.toUpperCase().includes(f));
  }, [lista, filtro]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b1f24] text-slate-100">
      <div className="flex items-center gap-4 border-b border-white/10 bg-black/20 px-4 py-3 sm:px-8">
        <p className="text-lg font-bold">Editar apontamentos</p>
        <button type="button" onClick={fechar} className={`ml-auto ${botaoLeve}`}>
          Fechar
        </button>
      </div>
      <div className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {erro && (
          <div className="rounded-xl border border-red-400/50 bg-red-500/15 px-5 py-3 text-center text-lg font-semibold text-red-100" onClick={() => setErro("")}>
            {erro}
          </div>
        )}
        {!liberado && (
          <form
            className="mx-auto mt-10 w-full max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void carregar();
            }}
          >
            <label className="text-sm text-slate-400">
              Senha do encarregado
              <input type="password" inputMode="numeric" autoFocus className={`${campo} text-center font-mono text-3xl tracking-[0.4em]`} value={senha} onChange={(e) => setSenha(e.target.value)} />
            </label>
            <button type="submit" disabled={ocupado || !senha} className="mt-4 w-full rounded-xl bg-teal-500 py-4 text-xl font-bold text-slate-950 hover:bg-teal-400 disabled:opacity-40">
              Entrar
            </button>
          </form>
        )}
        {liberado && !sel && (
          <>
            <input className={campo} placeholder="Buscar operador, crachá ou OP…" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <p className="text-xs text-slate-500">Abertos e dos últimos 7 dias · toque pra editar</p>
            {filtrados.length === 0 && <p className="py-10 text-center text-slate-400">Nenhum apontamento.</p>}
            {filtrados.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setSel(a)}
                className={`flex items-center gap-3 rounded-xl border border-white/10 border-l-4 bg-white/5 px-4 py-3 text-left hover:bg-white/10 ${a.fim ? "border-l-slate-500" : a.tipo === "parada" ? "border-l-red-500" : a.tipo === "setup" ? "border-l-amber-400" : "border-l-emerald-500"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold">
                    {a.operador_nome} <span className="text-sm font-normal text-slate-400">· crachá {a.cracha ?? "—"} · {ROTULO_TIPO[a.tipo]}</span>
                  </p>
                  <p className="truncate text-sm text-slate-300">{descricao(a)}</p>
                </div>
                <div className="text-right text-sm">
                  <p>{fmtDataHora(a.inicio)}</p>
                  <p className={a.fim ? "text-slate-400" : "font-bold text-emerald-300"}>{a.fim ? fmtDataHora(a.fim) : "em aberto"}</p>
                </div>
              </button>
            ))}
          </>
        )}
        {liberado && sel && (
          <Editor
            ap={sel}
            senha={senha}
            voltar={() => setSel(null)}
            pronto={async () => {
              setSel(null);
              await carregar();
            }}
          />
        )}
      </div>
    </div>
  );
}

function Editor({ ap, senha, voltar, pronto }: { ap: ApEdit; senha: string; voltar: () => void; pronto: () => Promise<void> }) {
  const [inicio, setInicio] = useState(paraCampo(ap.inicio));
  const [fim, setFim] = useState(paraCampo(ap.fim));
  const [tipo, setTipo] = useState<TipoApontamento>(ap.tipo);
  const [confirmaCancelar, setConfirmaCancelar] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!confirmaCancelar) return;
    const id = setTimeout(() => setConfirmaCancelar(false), 5000);
    return () => clearTimeout(id);
  }, [confirmaCancelar]);

  async function chamar(corpo: Record<string, unknown>) {
    setOcupado(true);
    setErro("");
    try {
      await api(URL, { senha, apontamento_id: ap.id, ...corpo });
      await pronto();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-2xl font-bold">{ap.operador_nome}</p>
      <p className="text-slate-300">{descricao(ap)}</p>
      {ap.etapa_id && (
        <div className="mt-4">
          <p className="text-sm text-slate-400">Tipo</p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["producao", "setup"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`rounded-xl border-2 py-3 text-lg font-bold ${tipo === t ? (t === "producao" ? "border-emerald-400 bg-emerald-500/20" : "border-amber-400 bg-amber-400/20") : "border-white/15 text-slate-300"}`}
              >
                {ROTULO_TIPO[t]}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-400">
          Início
          <input type="datetime-local" className={campo} value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label className="text-sm text-slate-400">
          Fim (vazio = continua em aberto)
          <input type="datetime-local" className={campo} value={fim} onChange={(e) => setFim(e.target.value)} />
        </label>
      </div>
      {!ap.fim && (
        <button type="button" className="mt-2 text-sm text-teal-300 underline-offset-4 hover:underline" onClick={() => setFim(paraCampo(new Date().toISOString()))}>
          Encerrar agora (fim = hora atual)
        </button>
      )}
      {erro && <p className="mt-3 rounded-xl bg-red-500/15 px-4 py-2 text-red-100">{erro}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => (confirmaCancelar ? chamar({ acao: "editar_cancelar" }) : setConfirmaCancelar(true))}
          className={`mr-auto rounded-xl px-5 py-3 text-lg font-bold disabled:opacity-40 ${confirmaCancelar ? "bg-red-500 text-white" : "border-2 border-red-400/60 text-red-200 hover:bg-red-500/10"}`}
        >
          {confirmaCancelar ? "Confirmar cancelamento" : "Cancelar apontamento"}
        </button>
        <button type="button" onClick={voltar} disabled={ocupado} className={botaoLeve}>
          Voltar
        </button>
        <button
          type="button"
          disabled={ocupado || !inicio}
          onClick={() =>
            chamar({
              acao: "editar_salvar",
              inicio: new Date(inicio).toISOString(),
              fim: fim ? new Date(fim).toISOString() : null,
              tipo,
            })
          }
          className="rounded-xl bg-teal-500 px-6 py-3 text-lg font-bold text-slate-950 hover:bg-teal-400 disabled:opacity-40"
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
