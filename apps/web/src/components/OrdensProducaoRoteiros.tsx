"use client";

// Roteiros padrão do FC Nexus — sub-aba de Ordens de produção, pedido do usuário
// (13/11/2026): "um recurso de Roteiro padrão onde eu montaria um roteiro padrão
// e desse a opção de salvar, exemplo Roteiro padrão Base etc".
// Monta com o mesmo editor da Nova OP (etapas rápidas, roteiros do Sectra,
// catálogo de operações), dá um nome e salva (tabela prod_roteiros_padrao,
// migration 0070). Na Nova OP eles aparecem em "★ Roteiros padrão FC Nexus".
// Criar/editar/excluir: podePlanejarOP (flpmac14 e marcelo/PCP); os outros só olham.

import { useEffect, useState } from "react";
import { api, classeBotao, classeBotaoPerigo, classeBotaoPrimario, classeCampo, classeCartao } from "@/components/ProducaoComum";
import {
  EditorRoteiro,
  descCentro,
  descOperacao,
  etapasParaEnvio,
  listarRoteirosSalvos,
  validarEtapas,
  type EtapaEditor,
  type RoteiroSalvo,
} from "@/components/OrdensProducaoNova";
import { fmtHoras, type Cadastros } from "@/lib/producao";

let seq = 0;
const chave = () => `r${++seq}-${Date.now()}`;

type Edicao = { id: string | null; nome: string; observacao: string; etapas: EtapaEditor[] };

export default function OrdensProducaoRoteiros({ cad, podeEditar }: { cad: Cadastros; podeEditar: boolean }) {
  const [roteiros, setRoteiros] = useState<RoteiroSalvo[] | null>(null);
  const [erroLista, setErroLista] = useState("");
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  function carregar() {
    listarRoteirosSalvos()
      .then((r) => {
        setRoteiros(r);
        setErroLista("");
      })
      .catch((e: Error) => setErroLista(e.message));
  }
  useEffect(carregar, []);

  function editar(r: RoteiroSalvo | null, copia = false) {
    setErro("");
    setAviso("");
    setEdicao({
      id: r && !copia ? r.id : null,
      nome: r ? (copia ? `${r.nome} (cópia)` : r.nome) : "Roteiro padrão ",
      observacao: r?.observacao ?? "",
      etapas: (r?.etapas ?? []).map((e) => ({ ...e, chave: chave() })),
    });
  }

  async function salvar() {
    if (!edicao) return;
    const nome = edicao.nome.trim();
    if (!nome) return setErro("Dê um nome ao roteiro (ex.: Roteiro padrão Base).");
    const v = validarEtapas(edicao.etapas, cad);
    if (v) return setErro(v);
    setSalvando(true);
    setErro("");
    try {
      await api("/api/follow-up/producao", {
        acao: "salvar_roteiro",
        id: edicao.id ?? undefined,
        nome,
        observacao: edicao.observacao,
        etapas: etapasParaEnvio(cad, edicao.etapas).map((e) => ({ ...e, id: undefined })),
      });
      setAviso(`"${nome}" salvo. Já aparece na Nova OP em “★ Roteiros padrão FC Nexus”.`);
      setEdicao(null);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    try {
      await api("/api/follow-up/producao", { acao: "excluir_roteiro", id });
      setExcluindo(null);
      carregar();
    } catch (e) {
      setErroLista(e instanceof Error ? e.message : "Não consegui excluir.");
    }
  }

  // ---- Montando / editando um roteiro ----
  if (edicao) {
    return (
      <div className="flex flex-col gap-3">
        <div className={`${classeCartao} flex flex-wrap items-end gap-3 px-3 py-3`}>
          <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-slate-300">
            Nome do roteiro
            <input
              autoFocus
              className={`${classeCampo} text-base font-semibold`}
              value={edicao.nome}
              onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
              placeholder="Ex.: Roteiro padrão Base"
              maxLength={120}
            />
          </label>
          <label className="flex min-w-[16rem] flex-[2] flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-slate-300">
            Observação (opcional)
            <input
              className={classeCampo}
              value={edicao.observacao}
              onChange={(e) => setEdicao({ ...edicao, observacao: e.target.value })}
              placeholder="Ex.: bases soldadas com usinagem de face"
              maxLength={500}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" className={classeBotao} onClick={() => setEdicao(null)} disabled={salvando}>
              Cancelar
            </button>
            <button type="button" className={classeBotaoPrimario} onClick={salvar} disabled={salvando}>
              💾 {salvando ? "Salvando…" : edicao.id ? "Salvar alterações" : "Salvar roteiro"}
            </button>
          </div>
          {erro && <p className="basis-full text-sm text-red-600">{erro}</p>}
        </div>
        <EditorRoteiro
          cad={cad}
          desenho={null}
          quantidade={1}
          etapas={edicao.etapas}
          setEtapas={(f) => setEdicao((ed) => (ed ? { ...ed, etapas: f(ed.etapas) } : ed))}
          setOrigem={() => {}}
        />
      </div>
    );
  }

  // ---- Lista dos roteiros salvos ----
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {podeEditar && (
          <button type="button" className={classeBotaoPrimario} onClick={() => editar(null)}>
            ＋ Novo roteiro padrão
          </button>
        )}
        <span className="text-xs text-stone-500">
          Monte uma vez, dê um nome (ex.: “Roteiro padrão Base”) e use na Nova OP — aparece em “★ Roteiros padrão FC Nexus”.
        </span>
      </div>
      {aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">{aviso}</p>}
      {erroLista && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroLista}</p>}
      {!roteiros && !erroLista && <p className="text-sm text-stone-500">Carregando roteiros…</p>}
      {roteiros && !roteiros.length && (
        <div className={`${classeCartao} px-4 py-8 text-center text-sm text-stone-500`}>
          Nenhum roteiro padrão salvo ainda.{podeEditar && " Clique em ＋ Novo roteiro padrão pra montar o primeiro."}
        </div>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {(roteiros ?? []).map((r) => {
          const horas = r.etapas.reduce((s, e) => s + (e.hr_preparo || 0) + (e.hr_unitario || 0), 0);
          const expandido = aberto === r.id;
          return (
            <section key={r.id} className={`${classeCartao} flex flex-col`}>
              <header className="flex flex-wrap items-start gap-2 px-3 py-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberto(expandido ? null : r.id)}>
                  <h3 className="font-bold text-stone-800 dark:text-slate-100">{r.nome}</h3>
                  <p className="text-xs text-stone-500 dark:text-slate-400">
                    {r.etapas.length} etapas{horas ? ` · ${fmtHoras(horas)} p/ 1 pç` : ""} · atualizado {new Date(r.atualizado_em).toLocaleDateString("pt-BR")}
                    {r.atualizado_por ? ` por ${r.atualizado_por}` : ""}
                  </p>
                  {r.observacao && <p className="mt-0.5 text-xs text-stone-600 dark:text-slate-300">{r.observacao}</p>}
                </button>
                {podeEditar && (
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" className={classeBotao} onClick={() => editar(r)}>✏️ Editar</button>
                    <button type="button" className={classeBotao} onClick={() => editar(r, true)} title="Criar um roteiro novo a partir deste">⧉ Duplicar</button>
                    {excluindo === r.id ? (
                      <>
                        <button type="button" className={classeBotaoPerigo} onClick={() => excluir(r.id)}>Confirmar exclusão</button>
                        <button type="button" className={classeBotao} onClick={() => setExcluindo(null)}>Não</button>
                      </>
                    ) : (
                      <button type="button" className={classeBotaoPerigo} onClick={() => setExcluindo(r.id)} title="As OPs já criadas com ele não mudam">🗑️</button>
                    )}
                  </div>
                )}
              </header>
              <ol className={`border-t border-stone-100 px-3 py-2 text-sm dark:border-slate-800 ${expandido ? "" : "max-h-40 overflow-hidden"}`}>
                {r.etapas.map((e) => (
                  <li key={e.posicao} className="flex items-baseline gap-2 py-0.5">
                    <span className="w-8 shrink-0 font-mono text-xs text-stone-400">{e.posicao}</span>
                    <span className="font-medium text-stone-800 dark:text-slate-100">{descOperacao(cad, e.operacao) ?? e.operacao ?? "—"}</span>
                    <span className="font-mono text-[11px] text-stone-500">
                      {e.centro} · {descCentro(cad, e.centro)}
                    </span>
                    {e.descricao && <span className="truncate text-xs text-stone-500">— {e.descricao}</span>}
                  </li>
                ))}
              </ol>
              {r.etapas.length > 6 && (
                <button type="button" className="border-t border-stone-100 py-1 text-xs text-stone-500 hover:text-stone-800 dark:border-slate-800" onClick={() => setAberto(expandido ? null : r.id)}>
                  {expandido ? "Mostrar menos" : `Ver as ${r.etapas.length} etapas`}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
