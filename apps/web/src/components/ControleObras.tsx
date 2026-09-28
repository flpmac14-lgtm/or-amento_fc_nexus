"use client";

// Controle de obras — pedido explícito do usuário: espelho da aba OBRAS
// (colunas H até AB) do "J:\6 - PCP\Controle de obras.xlsm", atualizado
// sozinho a cada 15 min (Tarefa Agendada na máquina da empresa, ver
// services/calc_engine/scripts/sincronizar_controle_obras.py). Só leitura:
// quem edita é a planilha.

import { useEffect, useMemo, useState } from "react";
import { listarControleObras } from "@/lib/api";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { compararValores, normalizarBusca, situacaoPrazo } from "@/lib/followUp";
import type { ColunaControleObras, RespostaControleObras, ValorControleObras } from "@/lib/types";
import { SeloPrazo } from "@/components/FollowUpDetalhe";

const RECARREGAR_A_CADA_MS = 5 * 60 * 1000;
// Tarefa roda a cada 15 min; sem verificação há mais de 45 min = parada.
const VERIFICACAO_ATRASADA_MS = 45 * 60 * 1000;
const CAMPOS_BUSCA = ["po", "desenho", "descricao", "mac", "nf", "tipar", "obs"];

const classeCampo =
  "w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";
const classeFiltroColuna =
  "w-full min-w-[3.5rem] rounded border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs font-normal normal-case tracking-normal text-stone-800 dark:text-slate-200 outline-none focus:border-green-600 dark:focus:border-cyan-500";

function exibir(valor: ValorControleObras, tipo: ColunaControleObras["tipo"]): string {
  if (valor === null || valor === undefined) return "";
  if (tipo === "data" && typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return formatarDataBr(valor);
  if (tipo === "numero" && typeof valor === "number") {
    return valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return String(valor);
}

// `agora` = momento em que os dados chegaram (render puro, sem Date.now()).
function tempoRelativo(iso: string | null | undefined, agora: number): string {
  if (!iso) return "—";
  const min = Math.round((agora - new Date(iso).getTime()) / 60000);
  const quando = new Date(iso).toLocaleString("pt-BR");
  if (min < 1) return `${quando} (agora)`;
  if (min < 60) return `${quando} (há ${min} min)`;
  return quando;
}

export default function ControleObras() {
  const [dados, setDados] = useState<RespostaControleObras | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [recebidoEm, setRecebidoEm] = useState(0);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [st, setSt] = useState("A");
  const [cl, setCl] = useState("");
  const [prazoDe, setPrazoDe] = useState("");
  const [prazoAte, setPrazoAte] = useState("");
  const [filtrosColuna, setFiltrosColuna] = useState<Record<number, string>>({});
  const [ordem, setOrdem] = useState<{ indice: number; desc: boolean } | null>(null);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(100);

  useEffect(() => {
    let ativo = true;
    function buscar() {
      listarControleObras()
        .then((r) => {
          if (ativo) {
            setDados(r);
            setRecebidoEm(Date.now());
            setErro("");
          }
        })
        .catch((e: Error) => ativo && setErro(e.message))
        .finally(() => ativo && setCarregando(false));
    }
    buscar();
    // Os dados mudam a cada 15 min no servidor — recarrega sozinho enquanto a tela está aberta.
    const id = setInterval(buscar, RECARREGAR_A_CADA_MS);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);

  const colunas = useMemo(() => dados?.status?.colunas ?? [], [dados]);
  const linhas = useMemo(() => dados?.linhas ?? [], [dados]);
  const idx = useMemo(() => {
    const m: Record<string, number> = {};
    colunas.forEach((c, i) => {
      if (c.campo) m[c.campo] = i;
    });
    return m;
  }, [colunas]);

  const opcoes = useMemo(() => {
    const unicos = (campo: string) =>
      [...new Set(linhas.map((l) => l.valores[idx[campo]]).filter((v) => v !== null && v !== "").map(String))].sort(
        (a, b) => a.localeCompare(b, "pt-BR", { numeric: true }),
      );
    return { st: idx.st !== undefined ? unicos("st") : [], cl: idx.cl !== undefined ? unicos("cl") : [] };
  }, [linhas, idx]);

  const filtradas = useMemo(() => {
    const termo = normalizarBusca(busca);
    const iBusca = CAMPOS_BUSCA.map((c) => idx[c]).filter((i) => i !== undefined);
    const ativos = Object.entries(filtrosColuna).filter(([, v]) => v.trim());
    const lista = linhas.filter((l) => {
      const v = l.valores;
      if (st && String(v[idx.st] ?? "") !== st) return false;
      if (cl && String(v[idx.cl] ?? "") !== cl) return false;
      const pz = typeof v[idx.pz_c] === "string" ? (v[idx.pz_c] as string) : "";
      if (prazoDe && (!pz || pz < prazoDe)) return false;
      if (prazoAte && (!pz || pz > prazoAte)) return false;
      if (termo && !normalizarBusca(iBusca.map((i) => String(v[i] ?? "")).join(" ")).includes(termo)) return false;
      for (const [i, f] of ativos) {
        const col = colunas[Number(i)];
        if (!normalizarBusca(exibir(v[Number(i)], col.tipo)).includes(normalizarBusca(f))) return false;
      }
      return true;
    });
    if (ordem) {
      lista.sort((a, b) => {
        const va = a.valores[ordem.indice];
        const vb = b.valores[ordem.indice];
        const vazio = (x: unknown) => x === null || x === undefined || x === "";
        if (vazio(va) || vazio(vb)) return compararValores(va, vb);
        return ordem.desc ? -compararValores(va, vb) : compararValores(va, vb);
      });
    }
    return lista;
  }, [linhas, colunas, idx, busca, st, cl, prazoDe, prazoAte, filtrosColuna, ordem]);

  const totais = useMemo(() => {
    let kg = 0;
    let vencidas = 0;
    for (const l of filtradas) {
      const k = l.valores[idx.kg_tot];
      if (typeof k === "number") kg += k;
      const pz = l.valores[idx.pz_c];
      if (l.valores[idx.st] === "A" && typeof pz === "string" && situacaoPrazo(pz) === "atrasado") vencidas++;
    }
    return { kg, vencidas };
  }, [filtradas, idx]);

  const status = dados?.status ?? null;
  const verificacaoAtrasada =
    status && recebidoEm - new Date(status.ultima_verificacao_em).getTime() > VERIFICACAO_ATRASADA_MS;
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina);
  const temFiltro = busca || st || cl || prazoDe || prazoAte || Object.values(filtrosColuna).some((v) => v);

  function limpar() {
    setBusca("");
    setSt("");
    setCl("");
    setPrazoDe("");
    setPrazoAte("");
    setFiltrosColuna({});
    setPagina(0);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">Controle de obras</h2>
        <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
          Atualizado automaticamente a cada 15 min a partir de{" "}
          <strong>{status?.arquivo ?? "J:\\6 - PCP\\Controle de obras.xlsm"}</strong> (aba {status?.aba ?? "OBRAS"},
          colunas {status?.intervalo ?? "H:AB"}). Só leitura — alterações são feitas na planilha.
        </p>
        {status && (
          <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
            Dados alterados pela última vez em {tempoRelativo(status.ultima_alteracao_em, recebidoEm)} · última verificação da
            planilha: {tempoRelativo(status.ultima_verificacao_em, recebidoEm)}
            {status.arquivo_modificado_em && ` · arquivo salvo em ${new Date(status.arquivo_modificado_em).toLocaleString("pt-BR")}`}
          </p>
        )}
      </div>

      {(erro || status?.ultimo_erro || verificacaoAtrasada) && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm text-amber-800 dark:text-amber-300">
          {erro && <p>{erro}</p>}
          {status?.ultimo_erro && (
            <p>
              A última tentativa de ler a planilha falhou ({tempoRelativo(status.ultimo_erro_em, recebidoEm)}): {status.ultimo_erro}. Os
              dados abaixo são da última leitura bem-sucedida.
            </p>
          )}
          {verificacaoAtrasada && (
            <p>
              A planilha não é verificada há mais de 45 min — a sincronização roda num computador da empresa (Tarefa
              Agendada “FCNexus - Sincronizar Controle de obras”); confira se ele está ligado e com o J: acessível.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border border-green-600/30 dark:border-cyan-500/30 bg-white dark:bg-slate-900/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">Kg total</p>
          <p className="font-mono text-2xl font-bold text-green-700 dark:text-cyan-300">
            {formatarNumero(totais.kg, 2)} <span className="text-sm font-normal">kg</span>
          </p>
          <p className="text-[11px] text-stone-500 dark:text-slate-500">soma de “Kg tot” das linhas filtradas</p>
        </div>
        <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">Linhas</p>
          <p className="font-mono text-2xl font-bold text-stone-900 dark:text-white">{filtradas.length}</p>
          <p className="text-[11px] text-stone-500 dark:text-slate-500">de {linhas.length} na planilha</p>
        </div>
        <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">PZ-C vencido</p>
          <p className="font-mono text-2xl font-bold text-red-600 dark:text-red-400">{totais.vencidas}</p>
          <p className="text-[11px] text-stone-500 dark:text-slate-500">ST = A com prazo passado</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="Pesquisar PO, desenho, descrição, MAC, NF, Tipar ou OBS…"
            className={`${classeCampo} min-w-[16rem] flex-1`}
          />
          <button
            type="button"
            onClick={limpar}
            disabled={!temFiltro}
            className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-sm text-stone-700 dark:text-slate-300 hover:border-red-400 disabled:opacity-40"
          >
            Limpar filtros
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
            ST
            <select
              value={st}
              onChange={(e) => {
                setSt(e.target.value);
                setPagina(0);
              }}
              className={classeCampo}
            >
              <option value="">Todos</option>
              {opcoes.st.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
            CL (cliente)
            <select
              value={cl}
              onChange={(e) => {
                setCl(e.target.value);
                setPagina(0);
              }}
              className={classeCampo}
            >
              <option value="">Todos</option>
              {opcoes.cl.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
            PZ-C de
            <input
              type="date"
              value={prazoDe}
              onChange={(e) => {
                setPrazoDe(e.target.value);
                setPagina(0);
              }}
              className={classeCampo}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
            até
            <input
              type="date"
              value={prazoAte}
              onChange={(e) => {
                setPrazoAte(e.target.value);
                setPagina(0);
              }}
              className={classeCampo}
            />
          </label>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-stone-100 dark:bg-slate-900 text-left text-[11px] uppercase tracking-wide text-stone-600 dark:text-slate-400">
            <tr>
              {colunas.map((c, i) => (
                <th
                  key={c.letra}
                  className={`border-b border-stone-200 dark:border-slate-800 px-2 pt-2 pb-1 font-semibold ${
                    i === 0 ? "sticky left-0 z-20 bg-stone-100 dark:bg-slate-900" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOrdem((o) => (o?.indice !== i ? { indice: i, desc: false } : o.desc ? null : { indice: i, desc: true }));
                      setPagina(0);
                    }}
                    className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-green-700 dark:hover:text-cyan-300"
                    title={`Coluna ${c.letra} da planilha`}
                  >
                    {c.cabecalho || c.letra}
                    <span className="text-[10px]">{ordem?.indice === i ? (ordem.desc ? "▼" : "▲") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              {colunas.map((c, i) => (
                <th
                  key={c.letra}
                  className={`border-b border-stone-200 dark:border-slate-800 px-1.5 pb-1.5 ${
                    i === 0 ? "sticky left-0 z-20 bg-stone-100 dark:bg-slate-900" : ""
                  }`}
                >
                  <input
                    value={filtrosColuna[i] ?? ""}
                    onChange={(e) => {
                      setFiltrosColuna((f) => ({ ...f, [i]: e.target.value }));
                      setPagina(0);
                    }}
                    placeholder="filtrar"
                    aria-label={`Filtrar ${c.cabecalho}`}
                    className={classeFiltroColuna}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.linha} className="text-stone-800 dark:text-slate-200 hover:bg-green-50 dark:hover:bg-cyan-950/30">
                {colunas.map((c, i) => {
                  const v = l.valores[i];
                  const ativa = l.valores[idx.st] === "A";
                  return (
                    <td
                      key={c.letra}
                      className={`border-b border-stone-100 dark:border-slate-800/80 px-2 py-1.5 align-middle text-xs ${
                        i === 0 ? "sticky left-0 z-[1] bg-white dark:bg-slate-900 font-mono" : ""
                      } ${c.tipo === "codigo" || c.tipo === "numero" ? "font-mono" : ""} ${
                        c.tipo === "numero" ? "text-right" : ""
                      } ${c.campo === "descricao" || c.campo === "obs" ? "max-w-[22rem] truncate" : "whitespace-nowrap"}`}
                      title={c.campo === "descricao" || c.campo === "obs" ? exibir(v, c.tipo) : undefined}
                    >
                      {c.campo === "pz_c" && ativa && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? (
                        <SeloPrazo prazo={v} compacto />
                      ) : (
                        exibir(v, c.tipo)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, colunas.length)} className="px-3 py-10 text-center text-stone-500 dark:text-slate-500">
                  {carregando
                    ? "Carregando… (o servidor pode levar até 1 minuto para acordar)"
                    : !status
                      ? "Ainda não houve sincronização da planilha."
                      : "Nenhuma linha com esses filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600 dark:text-slate-400">
        <span>
          {filtradas.length === 0
            ? "0 linhas"
            : `Mostrando ${paginaAtual * porPagina + 1}–${Math.min((paginaAtual + 1) * porPagina, filtradas.length)} de ${filtradas.length}`}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={porPagina}
            onChange={(e) => {
              setPorPagina(Number(e.target.value));
              setPagina(0);
            }}
            className="rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
          >
            {[50, 100, 200, 500].map((n) => (
              <option key={n} value={n}>
                {n} por página
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPagina(Math.max(0, paginaAtual - 1))}
            disabled={paginaAtual === 0}
            className="rounded border border-stone-300 dark:border-slate-700 px-2 py-1 disabled:opacity-40"
          >
            ‹ Anterior
          </button>
          <span>
            {paginaAtual + 1} / {totalPaginas}
          </span>
          <button
            type="button"
            onClick={() => setPagina(Math.min(totalPaginas - 1, paginaAtual + 1))}
            disabled={paginaAtual >= totalPaginas - 1}
            className="rounded border border-stone-300 dark:border-slate-700 px-2 py-1 disabled:opacity-40"
          >
            Próxima ›
          </button>
        </div>
      </div>
    </div>
  );
}
