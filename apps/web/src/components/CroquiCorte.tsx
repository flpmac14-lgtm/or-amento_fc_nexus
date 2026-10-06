"use client";

// Croqui de corte — pedido explícito do usuário: "filha" do Material de
// compra (aba MACLM), como o Follow up é da Controle de obras. Importada da
// aba "Croqui 2" do "Croqui de corte rev 01.1.xlsb"; agora é editada aqui.
// Fixas (PROCV pelo Pedido, travadas): Mac, Descrição, Desenho, MP, L, Pos,
// QT, QT_1, QTT, UN. Editáveis: Status, Projetista, Nº do programa,
// Observação — Status "Fazendo" grava Dt.Fazendo e "Feito" grava Dt.Feito
// (no servidor, ver services/calc_engine/app/croqui_corte.py).

import { useEffect, useMemo, useRef, useState } from "react";
import { editarItemCroquiCorte, editarLoteCroquiCorte, listarCroquiCorte, listarNotificacoesCroquiCorte } from "@/lib/api";
import { formatarNumero } from "@/lib/format";
import { compararValores, normalizarBusca } from "@/lib/followUp";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import type { ItemCroquiCorte } from "@/lib/types";
import { CelulaEditavel, IconeCadeado } from "@/components/FollowUpEdicao";
import FollowUpSino from "@/components/FollowUpSino";
import { NumeroPrograma, usePdfsCorte } from "@/components/PdfPrograma";
import { useLimparComF4 } from "@/lib/atalhoLimpar";

const RECARREGAR_A_CADA_MS = 5 * 60 * 1000;

// Cores da formatação condicional da planilha (Status).
const COR_STATUS: Record<string, string> = {
  "Sem Corte": "#44B3E1",
  Fazendo: "#FFFF00",
  Feito: "#DAF2D0",
  Terceirizado: "#C4A7E7",
  "Corte Manual": "#F8CBAD",
  "Aguardando revisão": "#FF0000",
};

// Colunas que dá pra "puxar" como no Excel (arrastar o quadradinho do canto).
const PUXAVEIS = new Set<Campo>(["status", "projetista", "n_programa", "observacao"]);

type Campo = keyof ItemCroquiCorte;
type Tipo = "codigo" | "texto" | "numero" | "datahora" | "status" | "lista" | "editavel" | "edicao" | "programa";

interface Coluna {
  campo: Campo;
  rotulo: string;
  tipo: Tipo;
  fixa?: boolean;
  maxW?: string;
  // Coluna mínima (até 4 algarismos): sem cadeado no cabeçalho e menos espaço.
  estreita?: boolean;
}

// Mesma ordem da aba Croqui 2 + quem editou por último.
const COLUNAS: Coluna[] = [
  { campo: "pedido", rotulo: "Pedido", tipo: "codigo" },
  // Larguras enxutas (pedido do usuário): ver até o Projetista sem rolar; o
  // texto cortado aparece inteiro ao passar o mouse.
  { campo: "mac", rotulo: "Mac", tipo: "codigo", fixa: true, maxW: "max-w-[5.5rem]" },
  { campo: "descricao", rotulo: "Descrição", tipo: "texto", fixa: true, maxW: "max-w-[11rem]" },
  { campo: "desenho", rotulo: "Desenho", tipo: "codigo", fixa: true, maxW: "max-w-[8rem]" },
  { campo: "mp", rotulo: "MP", tipo: "texto", fixa: true, maxW: "max-w-[6rem]" },
  { campo: "l", rotulo: "L", tipo: "texto", fixa: true, maxW: "max-w-[2.25rem]", estreita: true },
  { campo: "pos", rotulo: "Pos", tipo: "codigo", fixa: true, maxW: "max-w-[2.25rem]", estreita: true },
  { campo: "status", rotulo: "Status", tipo: "status" },
  // Pedido do usuário: Nº do programa logo depois do Status.
  { campo: "n_programa", rotulo: "Nº do programa", tipo: "programa" },
  // Validação de dados (pedido do usuário): lista só com os projetistas.
  { campo: "projetista", rotulo: "Projetista", tipo: "lista" },
  { campo: "observacao", rotulo: "Observação", tipo: "editavel", maxW: "max-w-[14rem]" },
  { campo: "dt_fazendo", rotulo: "Dt.Fazendo", tipo: "datahora" },
  { campo: "dt_feito", rotulo: "Dt.Feito", tipo: "datahora" },
  { campo: "qt", rotulo: "QT", tipo: "numero", fixa: true },
  { campo: "qt_1", rotulo: "QT_1", tipo: "numero", fixa: true },
  { campo: "qtt", rotulo: "QTT", tipo: "numero", fixa: true },
  { campo: "un", rotulo: "UN", tipo: "texto", fixa: true },
  { campo: "editado_em", rotulo: "Última edição", tipo: "edicao" },
];

const classeCampo =
  "w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";
const classeFiltroColuna =
  "w-full min-w-[2rem] rounded border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs font-normal normal-case tracking-normal text-stone-800 dark:text-slate-200 outline-none focus:border-green-600 dark:focus:border-cyan-500";

function dataHora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function exibir(item: ItemCroquiCorte, col: Coluna): string {
  const v = item[col.campo];
  if (v === null || v === undefined) return "";
  if (col.tipo === "datahora") return dataHora(v as string);
  if (col.tipo === "edicao") return `${item.editado_por ?? ""} ${dataHora(item.editado_em)}`.trim();
  if (col.tipo === "numero" && typeof v === "number") return formatarNumero(v, Number.isInteger(v) ? 0 : 2);
  return String(v);
}

// Nº do programa + subprogramas — pedido do usuário: um mesmo corte pode gerar
// vários programas; o "+" acrescenta outro na mesma linha. Fica tudo no mesmo
// campo separado por vírgula ("380, 381"), que a aba Corte (app/corte.py) já
// separa em um programa por número — cada um com as peças desta linha.
function CelulaProgramas({ valor, salvar }: { valor: string; salvar: (novo: string) => Promise<void> }) {
  const partes = valor.split(",").map((p) => p.trim()).filter(Boolean);
  const [novo, setNovo] = useState<string | null>(null);
  // Pedido do usuário: como no Excel, nº com PDF na pasta de corte = link (duplo clique abre).
  const { pdfsDe, abrir } = usePdfsCorte();

  function gravar(lista: string[]) {
    return salvar(lista.map((p) => p.trim()).filter(Boolean).join(", "));
  }
  function confirmarNovo() {
    const n = (novo ?? "").trim();
    setNovo(null);
    if (n) void gravar([...partes, n]).catch(() => {});
  }

  if (partes.length === 0) {
    return (
      <CelulaEditavel
        valor=""
        tipo="texto"
        exibicao={<span className="text-xs text-stone-300 dark:text-slate-600">+</span>}
        salvar={(v) => gravar([v])}
      />
    );
  }
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {partes.map((p, k) => (
        <div
          key={`${k}-${p}`}
          className={k === 0 ? "" : "rounded bg-stone-100 px-1 dark:bg-slate-800"}
          title={k === 0 ? undefined : "Subprograma — apague o número para tirar"}
        >
          <CelulaEditavel
            valor={p}
            tipo="texto"
            exibicao={<NumeroPrograma programa={p} className="text-xs" />}
            salvar={(v) => gravar(partes.map((x, j) => (j === k ? v : x)))}
            aoDuploClique={pdfsDe(p).length ? () => abrir(p) : undefined}
          />
        </div>
      ))}
      {novo !== null ? (
        <input
          autoFocus
          inputMode="numeric"
          value={novo}
          onChange={(e) => setNovo(e.target.value.replace(/\D/g, ""))}
          onBlur={confirmarNovo}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmarNovo();
            if (e.key === "Escape") setNovo(null);
          }}
          placeholder="nº"
          className="w-14 rounded border border-green-600 bg-white px-1 py-0.5 text-xs text-stone-900 outline-none dark:border-cyan-500 dark:bg-slate-900 dark:text-slate-100"
        />
      ) : (
        <button
          type="button"
          onClick={() => setNovo("")}
          title="Adicionar subprograma (mesmo corte gerou mais de um programa)"
          className="rounded px-1 text-sm font-bold leading-none text-green-600 hover:bg-green-100 hover:text-green-700 dark:text-green-400 dark:hover:bg-green-950 dark:hover:text-green-300"
        >
          +
        </button>
      )}
    </div>
  );
}

export default function CroquiCorte({ telaCheia = false }: { telaCheia?: boolean }) {
  const [itens, setItens] = useState<ItemCroquiCorte[]>([]);
  const [opcoesStatus, setOpcoesStatus] = useState<string[]>([]);
  const [opcoesProjetista, setOpcoesProjetista] = useState<string[]>(["João", "Honório"]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editadoPor, setEditadoPor] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [projetista, setProjetista] = useState("");
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, string>>({});
  const [ordem, setOrdem] = useState<{ campo: Campo; desc: boolean } | null>(null);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(100);
  // "Salvar tudo" — pedido do usuário, igual ao do Follow up.
  const pendentes = useRef(new Set<Promise<unknown>>());
  const falhas = useRef(new Set<string>());
  const [salvandoTudo, setSalvandoTudo] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  // Puxar como no Excel: índices (na página) de onde começou e até onde foi.
  const [arraste, setArraste] = useState<{ campo: Campo; valor: string | null; de: number; ate: number } | null>(null);
  const tabela = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ativo = true;
    function buscar() {
      listarCroquiCorte()
        .then((r) => {
          if (!ativo) return;
          setItens(r.itens);
          setOpcoesStatus(r.status_opcoes);
          setOpcoesProjetista(r.projetista_opcoes ?? ["João", "Honório"]);
          setErro("");
        })
        .catch((e: Error) => ativo && setErro(e.message))
        .finally(() => ativo && setCarregando(false));
    }
    buscar();
    const id = setInterval(buscar, RECARREGAR_A_CADA_MS);
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => ativo && data.user?.email && setEditadoPor(emailParaLogin(data.user.email)));
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);

  function acompanhar<T>(envio: Promise<T>, chave: string): Promise<T> {
    pendentes.current.add(envio);
    setAviso(null);
    return envio
      .then((r) => {
        falhas.current.delete(chave);
        return r;
      })
      .catch((e: Error) => {
        falhas.current.add(chave);
        throw e;
      })
      .finally(() => pendentes.current.delete(envio));
  }

  function trocarItens(novos: ItemCroquiCorte[]) {
    const m = new Map(novos.map((i) => [i.id, i]));
    setItens((lista) => lista.map((i) => m.get(i.id) ?? i));
  }

  async function salvar(item: ItemCroquiCorte, campo: string, valor: string) {
    const atualizado = await acompanhar(editarItemCroquiCorte(item.id, { [campo]: valor }, editadoPor), `${item.pedido} — ${campo}`);
    trocarItens([atualizado]);
  }

  async function salvarTudo() {
    setSalvandoTudo(true);
    setAviso(null);
    (document.activeElement as HTMLElement | null)?.blur?.(); // o campo em edição salva ao perder o foco
    await new Promise((r) => setTimeout(r, 50));
    await Promise.allSettled([...pendentes.current]);
    try {
      const r = await listarCroquiCorte();
      setItens(r.itens);
      const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setAviso(
        falhas.current.size === 0
          ? { ok: true, texto: `✓ Tudo salvo — ${hora}` }
          : { ok: false, texto: `${falhas.current.size} campo(s) não salvaram: ${[...falhas.current].join("; ")}` },
      );
    } catch (e) {
      setAviso({ ok: false, texto: `Não consegui confirmar com o servidor: ${(e as Error).message}` });
    } finally {
      setSalvandoTudo(false);
    }
  }

  const projetistas = useMemo(
    () => [...new Set(itens.map((i) => i.projetista).filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [itens],
  );

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca);
    const ativos = Object.entries(filtrosColuna).filter(([, v]) => v.trim());
    const lista = itens.filter((i) => {
      if (status === "__vazio" ? i.status : status && i.status !== status) return false;
      if (projetista === "__vazio" ? i.projetista : projetista && i.projetista !== projetista) return false;
      if (termo) {
        const alvo = normalizarBusca(
          [i.pedido, i.mac, i.descricao, i.desenho, i.mp, i.n_programa, i.observacao].filter(Boolean).join(" "),
        );
        if (!alvo.includes(termo)) return false;
      }
      for (const [campo, f] of ativos) {
        const col = COLUNAS.find((c) => c.campo === campo)!;
        if (!normalizarBusca(exibir(i, col)).includes(normalizarBusca(f))) return false;
      }
      return true;
    });
    if (ordem) {
      lista.sort((a, b) => {
        const va = a[ordem.campo];
        const vb = b[ordem.campo];
        const vazio = (x: unknown) => x === null || x === undefined || x === "";
        if (vazio(va) || vazio(vb)) return compararValores(va, vb);
        return ordem.desc ? -compararValores(va, vb) : compararValores(va, vb);
      });
    }
    return lista;
  }, [itens, busca, status, projetista, filtrosColuna, ordem]);

  const contagem = useMemo(() => {
    const c = { semStatus: 0, fazendo: 0, feito: 0 };
    for (const i of filtrados) {
      if (!i.status) c.semStatus++;
      else if (i.status === "Fazendo") c.fazendo++;
      else if (i.status === "Feito") c.feito++;
    }
    return c;
  }, [filtrados]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtrados.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina);

  // Soltou o mouse: grava o valor da célula de origem em todas as linhas do intervalo.
  useEffect(() => {
    if (!arraste) return;
    const a = arraste;
    function soltar() {
      setArraste(null);
      const [ini, fim] = a.de <= a.ate ? [a.de, a.ate] : [a.ate, a.de];
      const alvo = visiveis.slice(ini, fim + 1).filter((_, k) => ini + k !== a.de);
      if (!alvo.length) return;
      const ids = alvo.map((i) => i.id);
      // Mostra na hora; o servidor devolve as linhas (com as datas de Fazendo/Feito).
      setItens((lista) => lista.map((i) => (ids.includes(i.id) ? { ...i, [a.campo]: a.valor } : i)));
      // Salva na hora ao soltar (pedido do usuário: como no Excel) e avisa.
      acompanhar(editarLoteCroquiCorte(ids, { [a.campo]: a.valor ?? "" }, editadoPor), `${ids.length} linhas — ${a.campo}`)
        .then((novos) => {
          trocarItens(novos);
          const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          setAviso({ ok: true, texto: `✓ ${ids.length} linha(s) salvas — ${hora}` });
        })
        .catch((e: Error) => setAviso({ ok: false, texto: `Não salvou o arraste: ${e.message}` }));
    }
    window.addEventListener("mouseup", soltar);
    return () => window.removeEventListener("mouseup", soltar);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao arraste
  }, [arraste]);

  function naFaixa(indice: number, campo: Campo): boolean {
    if (!arraste || arraste.campo !== campo) return false;
    const [ini, fim] = arraste.de <= arraste.ate ? [arraste.de, arraste.ate] : [arraste.ate, arraste.de];
    return indice >= ini && indice <= fim;
  }
  const temFiltro = busca || status || projetista || Object.values(filtrosColuna).some((v) => v);

  function limparFiltros() {
    setBusca("");
    setStatus("");
    setProjetista("");
    setFiltrosColuna({});
    setPagina(0);
  }
  useLimparComF4("croqui", limparFiltros);

  function celula(item: ItemCroquiCorte, col: Coluna) {
    if (col.tipo === "status") {
      const cor = item.status ? COR_STATUS[item.status] : undefined;
      return (
        <select
          value={item.status ?? ""}
          onChange={(e) => {
            salvar(item, "status", e.target.value).catch((err: Error) => setErro(err.message));
          }}
          title="Fazendo grava a data e hora em Dt.Fazendo; Feito grava em Dt.Feito"
          className="rounded border border-stone-300 dark:border-slate-600 px-1 py-0.5 text-xs font-semibold text-stone-900 dark:text-slate-100"
          style={cor ? { backgroundColor: `color-mix(in srgb, ${cor} 55%, white)`, color: "#1c1917" } : undefined}
        >
          <option value="">—</option>
          {[...new Set([...opcoesStatus, ...(item.status ? [item.status] : [])])].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      );
    }
    if (col.tipo === "lista") {
      return (
        <select
          value={item.projetista ?? ""}
          onChange={(e) => {
            salvar(item, "projetista", e.target.value).catch((err: Error) => setErro(err.message));
          }}
          className="rounded border border-stone-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-1 py-0.5 text-xs text-stone-900 dark:text-slate-100"
        >
          <option value="">—</option>
          {[...new Set([...opcoesProjetista, ...(item.projetista ? [item.projetista] : [])])].map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      );
    }
    if (col.tipo === "editavel") {
      const v = (item[col.campo] as string | null) ?? "";
      return (
        <CelulaEditavel
          valor={v}
          tipo="texto"
          exibicao={v ? <span className="text-xs">{v}</span> : <span className="text-xs text-stone-300 dark:text-slate-600">+</span>}
          salvar={(novo) => salvar(item, col.campo, novo)}
        />
      );
    }
    if (col.tipo === "programa") {
      return <CelulaProgramas valor={item.n_programa ?? ""} salvar={(novo) => salvar(item, "n_programa", novo)} />;
    }
    if (col.tipo === "edicao") {
      return item.editado_em ? (
        <span className="block whitespace-nowrap text-[11px] leading-tight">
          <span className="font-semibold">{item.editado_por ?? "—"}</span>
          <span className="block font-mono text-stone-500 dark:text-slate-400">{dataHora(item.editado_em)}</span>
        </span>
      ) : (
        <span className="text-xs text-stone-300 dark:text-slate-600">—</span>
      );
    }
    return exibir(item, col);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`${telaCheia ? "hidden" : ""} rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4`}>
        <h2 className="text-lg font-bold text-stone-900 dark:text-white">Croqui de corte</h2>
        <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
          Filha do <strong>Material de compra</strong>: pedidos ST = A novos entram sozinhos (a cada 15 min) e as colunas{" "}
          <IconeCadeado /> vêm da MACLM pelo Pedido — não são editáveis. Status, Projetista, Nº do programa e Observação: edite na
          célula, salva sozinho. No Nº do programa, o <strong>+</strong> acrescenta subprogramas na mesma linha (cada um aparece
          na aba Corte). Status <strong>Fazendo</strong> grava a data e hora em Dt.Fazendo; <strong>Feito</strong>, em
          Dt.Feito. Para repetir um valor em várias linhas, arraste o quadradinho do canto da célula (como no Excel).
        </p>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
          {erro}
        </div>
      )}

      <div className={`${telaCheia ? "hidden" : "grid"} grid-cols-2 gap-3 lg:grid-cols-4`}>
        {[
          { r: "Linhas", v: filtrados.length, d: `de ${itens.length}` },
          { r: "Sem status", v: contagem.semStatus, d: "a fazer" },
          { r: "Fazendo", v: contagem.fazendo, d: "em andamento", cor: "text-amber-600 dark:text-amber-400" },
          { r: "Feito", v: contagem.feito, d: "concluídos", cor: "text-green-700 dark:text-cyan-300" },
        ].map((k) => (
          <div key={k.r} className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">{k.r}</p>
            <p className={`font-mono text-2xl font-bold ${k.cor ?? "text-stone-900 dark:text-white"}`}>{k.v}</p>
            <p className="text-[11px] text-stone-500 dark:text-slate-500">{k.d}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3">
        <input
          type="search"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setPagina(0);
          }}
          placeholder="Pesquisar pedido, Mac, descrição, desenho, MP, programa ou observação…"
          className={`${classeCampo} min-w-[16rem] flex-1`}
        />
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPagina(0);
            }}
            className={classeCampo}
          >
            <option value="">Todos</option>
            <option value="__vazio">Sem status</option>
            {opcoesStatus.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
          Projetista
          <select
            value={projetista}
            onChange={(e) => {
              setProjetista(e.target.value);
              setPagina(0);
            }}
            className={classeCampo}
          >
            <option value="">Todos</option>
            <option value="__vazio">Sem projetista</option>
            {projetistas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={limparFiltros}
          disabled={!temFiltro}
          title="Limpar filtros (F4)"
          className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-sm text-stone-700 dark:text-slate-300 hover:border-red-400 disabled:opacity-40"
        >
          Limpar filtros <kbd className="ml-1 rounded border border-stone-300 dark:border-slate-600 px-1 font-mono text-[10px] text-stone-500 dark:text-slate-400">F4</kbd>
        </button>
        <button
          type="button"
          onClick={salvarTudo}
          disabled={salvandoTudo}
          title="Cada campo já salva sozinho — este botão confirma tudo: termina o campo em edição, espera os envios e recarrega do servidor"
          className="rounded-lg bg-green-600 dark:bg-cyan-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 dark:hover:bg-cyan-500 disabled:opacity-50"
        >
          {salvandoTudo ? "Salvando…" : "Salvar tudo"}
        </button>
        {aviso && (
          <span className={`text-sm ${aviso.ok ? "text-green-700 dark:text-cyan-300" : "text-red-600 dark:text-red-400"}`}>
            {aviso.texto}
          </span>
        )}
        {/* Sininho — pedido do usuário: mesmo critério do Follow up, só pedidos ativos (ST = A) novos. */}
        <FollowUpSino
          carregar={listarNotificacoesCroquiCorte}
          chaveVisto="fcnexus.croquicorte.notificacoes.vistoAte"
          titulo="Pedidos novos do Material de compra"
          dica="Pedidos ativos (ST = A) novos que entraram na Croqui de corte (atualiza a cada 15 min)"
          vazio="Nenhum ainda. Aparecem aqui os pedidos ativos novos que o Material de compra trouxer (15 min)."
          onAbrirItem={(id) => {
            const item = itens.find((i) => i.id === id);
            if (!item) return;
            // Mostra só esse pedido na tabela.
            setBusca(item.pedido);
            setStatus("");
            setProjetista("");
            setFiltrosColuna({});
            setPagina(0);
          }}
        />
      </div>

      <div
        ref={tabela}
        onMouseMove={(e) => {
          // Arrastando perto da borda: rola a tabela sozinha (como no Excel).
          if (!arraste || !tabela.current) return;
          const r = tabela.current.getBoundingClientRect();
          if (e.clientY > r.bottom - 40) tabela.current.scrollTop += 18;
          else if (e.clientY < r.top + 70) tabela.current.scrollTop -= 18;
        }}
        className={`${telaCheia ? "max-h-[calc(100vh-9.5rem)]" : "max-h-[70vh]"} overflow-auto rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 ${
          arraste ? "cursor-crosshair select-none" : ""
        }`}
      >
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-stone-100 dark:bg-slate-900 text-left text-[11px] uppercase tracking-wide text-stone-600 dark:text-slate-400">
            <tr>
              {COLUNAS.map((c, i) => (
                <th
                  key={c.campo}
                  className={`border-b border-stone-200 dark:border-slate-800 ${c.estreita ? "px-0.5" : "px-1.5"} pt-2 pb-1 font-semibold ${
                    i === 0 ? "sticky left-0 z-20 bg-stone-100 dark:bg-slate-900" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOrdem((o) => (o?.campo !== c.campo ? { campo: c.campo, desc: false } : o.desc ? null : { campo: c.campo, desc: true }));
                      setPagina(0);
                    }}
                    title={c.fixa ? `${c.rotulo} — vem do Material de compra (PROCV pelo Pedido), não editável` : undefined}
                    className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-green-700 dark:hover:text-cyan-300"
                  >
                    {c.rotulo}
                    {c.fixa && !c.estreita && <IconeCadeado />}
                    <span className="text-[10px]">{ordem?.campo === c.campo ? (ordem.desc ? "▼" : "▲") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
            <tr>
              {COLUNAS.map((c, i) => (
                <th
                  key={c.campo}
                  className={`border-b border-stone-200 dark:border-slate-800 ${c.estreita ? "px-0.5" : "px-1.5"} pb-1.5 ${
                    i === 0 ? "sticky left-0 z-20 bg-stone-100 dark:bg-slate-900" : ""
                  }`}
                >
                  <input
                    value={filtrosColuna[c.campo] ?? ""}
                    onChange={(e) => {
                      setFiltrosColuna((f) => ({ ...f, [c.campo]: e.target.value }));
                      setPagina(0);
                    }}
                    placeholder="filtrar"
                    aria-label={`Filtrar ${c.rotulo}`}
                    className={`${classeFiltroColuna} ${c.estreita ? "!min-w-0 !px-0.5" : ""}`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((item, indice) => (
              <tr
                key={item.id}
                onMouseEnter={() => arraste && setArraste((a) => (a ? { ...a, ate: indice } : a))}
                className="text-stone-800 dark:text-slate-200 hover:bg-green-50 dark:hover:bg-cyan-950/30"
              >
                {COLUNAS.map((c, i) => (
                  <td
                    key={c.campo}
                    className={`group/celula border-b border-stone-100 dark:border-slate-800/80 ${c.estreita ? "px-0.5 text-center" : "px-2"} py-1 align-middle text-xs ${
                      PUXAVEIS.has(c.campo) ? "relative" : ""
                    } ${naFaixa(indice, c.campo) ? "outline-2 -outline-offset-2 outline-dashed outline-green-600 dark:outline-cyan-400" : ""} ${
                      i === 0 ? "sticky left-0 z-[1] bg-white dark:bg-slate-900 font-mono" : ""
                    } ${c.tipo === "codigo" || c.tipo === "numero" ? "font-mono" : ""} ${c.tipo === "numero" ? "text-right" : ""} whitespace-nowrap`}
                    title={c.maxW ? exibir(item, c) : undefined}
                  >
                    {c.maxW ? <div className={`${c.maxW} truncate`}>{celula(item, c)}</div> : celula(item, c)}
                    {PUXAVEIS.has(c.campo) && !arraste && (
                      <span
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setArraste({ campo: c.campo, valor: (item[c.campo] as string | null) ?? null, de: indice, ate: indice });
                        }}
                        title="Arraste para copiar este valor para as linhas de baixo ou de cima (como no Excel)"
                        className="absolute bottom-0 right-0 hidden h-2.5 w-2.5 cursor-crosshair border border-white bg-green-600 group-hover/celula:block dark:bg-cyan-400"
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={COLUNAS.length} className="px-3 py-10 text-center text-stone-500 dark:text-slate-500">
                  {carregando ? "Carregando… (o servidor pode levar até 1 minuto para acordar)" : "Nenhuma linha com esses filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600 dark:text-slate-400">
        <span>
          {filtrados.length === 0
            ? "0 linhas"
            : `Mostrando ${paginaAtual * porPagina + 1}–${Math.min((paginaAtual + 1) * porPagina, filtrados.length)} de ${filtrados.length}`}
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
