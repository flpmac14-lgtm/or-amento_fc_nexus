"use client";

// Aba Data book — pedido explícito do usuário (13/10/2026): a aba "Geral
// Data book" de "J:\6 - PCP\Controle de databook.xlsm" passa a ser apontada
// aqui pela Qualidade (ana, carol, pedro). É "filha" da Controle de obras:
// as colunas D até O (PROCV pelo PO) vêm travadas e atualizam a cada 15 min;
// a Qualidade preenche o ST.BOOK (coluna P) e a observação. Pedido ativo que
// ainda não estava aqui entra sozinho e aparece no sininho.
// ST.BOOK pronto grava D.FINALIZAÇÃO e AUTOR(A) (app/databook.py).

import { useEffect, useMemo, useRef, useState } from "react";
import { editarDatabook, excluirStatusDatabook, historicoDatabook, listarDatabook, listarNotificacoesDatabook, urlImagemFollowUp } from "@/lib/api";
import { CLIENTES } from "@/lib/clientes";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { normalizarBusca } from "@/lib/followUp";
import { minutosUteis } from "@/lib/jornada";
import { duracao } from "@/lib/painel";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import type { ItemDatabook } from "@/lib/types";
import FollowUpSino from "@/components/FollowUpSino";
import { IconeCadeado } from "@/components/FollowUpEdicao";

const RECARREGAR_A_CADA_MS = 5 * 60 * 1000;
const PAGINA = 200;
const SEM_STATUS = "__sem__";
const COM_FALTA = "__falta__";

// Sugestões de um toque no "Falta p/ finalizar" (pedido do usuário: anotar o que falta pro book).
const SUGESTOES_FALTA = [
  "Falta certificado de material",
  "Falta relatório de pintura",
  "Falta relatório dimensional",
  "Falta LP / ultrassom",
  "Aguardando liberação do cliente",
  "Peças ainda não pintadas",
];

const NOME_CAMPO: Record<string, string> = {
  st_book: "ST.BOOK",
  st_book_excluido: "🗑 ST.BOOK excluído",
  falta: "Falta p/ finalizar",
  observacao: "Obs.",
};

type LinhaRegistro = { campo: string; de: string | null; para: string | null; por: string | null; em: string; desfeito: boolean };

// Tempo do book (FAZENDO → PRONTO, ou até agora), só a jornada — igual à Croqui de corte.
function tempoBook(i: ItemDatabook, agora: number): number | null {
  if (!i.fazendo_em) return null;
  const fim = i.finalizado_em ?? (i.st_book === "FAZENDO" ? new Date(agora) : null);
  return fim ? minutosUteis(i.fazendo_em, fim) : null;
}

function textoTempo(i: ItemDatabook, agora: number): string {
  const m = tempoBook(i, agora);
  return m === null ? "" : `${duracao(m)}${!i.finalizado_em ? " ▶" : ""}`;
}

// Rastreabilidade (pedido do usuário, 14/10/2026): não faz parte do book, mas também se aponta.
const RASTREAB = "RASTREABILIDADE";
const RASTREAB_FIM = "RASTREABILIDADE FINALIZADA";

function textoTempoRastreab(i: ItemDatabook, agora: number): string {
  if (!i.rastreab_inicio_em) return "";
  const fim = i.rastreab_fim_em ?? (i.st_book === RASTREAB ? new Date(agora) : null);
  return fim ? `${duracao(minutosUteis(i.rastreab_inicio_em, fim))}${!i.rastreab_fim_em ? " ▶" : ""}` : "";
}

function autorDica(i: ItemDatabook): string {
  return [
    i.fazendo_por && `Iniciou: ${i.fazendo_por}`,
    i.finalizado_por && `Finalizou: ${i.finalizado_por}`,
    i.editado_por && `Última edição: ${i.editado_por} · ${quando(i.editado_em)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function temFalta(i: ItemDatabook): boolean {
  return !!i.falta?.trim() && !(i.st_book && ["PRONTO", "Pronto Aguardando Coleta"].includes(i.st_book));
}

// Cores do ST.BOOK (formatação condicional da planilha: "vazio" e "Pronto aguardando coleta" destacados).
const COR_ST_BOOK: Record<string, string> = {
  PRONTO: "bg-green-600 text-white",
  FAZENDO: "bg-amber-400 text-stone-900",
  "SEM BOOK": "bg-stone-500 text-white",
  "Pronto Aguardando Coleta": "bg-sky-600 text-white",
  [RASTREAB]: "bg-violet-600 text-white",
  [RASTREAB_FIM]: "bg-violet-200 text-violet-900",
};

// Situação do pedido na Controle de obras (coluna E).
const ROTULO_ST: Record<string, string> = { A: "Ativo", E: "Entregue", C: "Cancelado" };

function dataCurta(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function quando(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Book pendente — regra do usuário (17/10/2026): pedido Encerrado (ST = E) cujo book
// ainda não fechou: vazio/sem nada, FAZENDO, RASTREABILIDADE e RASTREABILIDADE
// FINALIZADA contam. Só sai quando fica PRONTO, Pronto Aguardando Coleta ou SEM BOOK.
const BOOK_FECHADO = new Set(["PRONTO", "PRONTO AGUARDANDO COLETA", "SEM BOOK"]);
function pendente(i: ItemDatabook): boolean {
  return i.st === "E" && !BOOK_FECHADO.has((i.st_book ?? "").trim().toUpperCase());
}

function CelulaTexto({
  atual,
  onSalvar,
  destaque = false,
  sugestoes,
  comAcoes = false,
}: {
  atual: string | null;
  onSalvar: (valor: string) => Promise<void>;
  destaque?: boolean;
  sugestoes?: string;
  comAcoes?: boolean; // botões ✏️ editar e 🗑 apagar (pedido do usuário, 17/10 — "Falta p/ finalizar")
}) {
  const [valor, setValor] = useState(atual ?? "");
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const [de, setDe] = useState(atual ?? "");
  const [salvando, setSalvando] = useState(false);
  if (de !== (atual ?? "")) {
    setDe(atual ?? "");
    setValor(atual ?? "");
  }
  async function salvar() {
    if (valor.trim() === (atual ?? "").trim()) return;
    setSalvando(true);
    try {
      await onSalvar(valor);
    } finally {
      setSalvando(false);
    }
  }
  async function apagar() {
    if (!confirmarApagar) {
      setConfirmarApagar(true);
      setTimeout(() => setConfirmarApagar(false), 3000);
      return;
    }
    setConfirmarApagar(false);
    setValor("");
    setSalvando(true);
    try {
      await onSalvar("");
    } finally {
      setSalvando(false);
    }
  }
  const entrada = (
    <input
      ref={campo}
      value={valor}
      onChange={(e) => setValor(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setValor(atual ?? "");
      }}
      title={valor}
      placeholder="—"
      list={sugestoes}
      className={`w-32 rounded border px-1 py-0.5 text-[11px] outline-none focus:w-64 focus:border-green-600 focus:bg-white dark:focus:border-cyan-500 dark:focus:bg-slate-950 ${
        destaque ? "bg-amber-100 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" : "bg-transparent"
      } ${salvando ? "border-amber-400" : "border-transparent hover:border-stone-300 dark:hover:border-slate-600"}`}
    />
  );
  if (!comAcoes) return entrada;
  return (
    <span className="inline-flex items-center gap-0.5">
      {entrada}
      {(atual ?? "").trim() && (
        <>
          <button
            type="button"
            onClick={() => {
              campo.current?.focus();
              campo.current?.select();
            }}
            title="Editar"
            className="rounded px-1 text-[11px] text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✏️
          </button>
          <button
            type="button"
            onClick={apagar}
            disabled={salvando}
            title="Apagar o que foi anotado"
            className={`rounded px-1 text-[11px] font-bold ${
              confirmarApagar ? "bg-red-600 text-white" : "text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
            }`}
          >
            {confirmarApagar ? "Apagar?" : "🗑"}
          </button>
        </>
      )}
    </span>
  );
}

export default function DataBook() {
  const [itens, setItens] = useState<ItemDatabook[] | null>(null);
  const [opcoes, setOpcoes] = useState<string[]>([]);
  const [erro, setErro] = useState("");
  const [usuario, setUsuario] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState("");
  const [st, setSt] = useState("");
  const [stBook, setStBook] = useState(""); // "" = todos, SEM_STATUS, "pendente" ou uma opção
  const [limite, setLimite] = useState(PAGINA);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState("");
  const [destaque, setDestaque] = useState<string | null>(null);
  const [confirmarExcluir, setConfirmarExcluir] = useState<string | null>(null); // 1º toque no 🗑
  const [agora, setAgora] = useState(0); // hora da última carga (Tempo de quem está FAZENDO)
  const [registro, setRegistro] = useState<{ item: ItemDatabook; linhas: LinhaRegistro[] | null } | null>(null);
  const linhaDestaque = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    let ativo = true;
    function buscar() {
      listarDatabook()
        .then((r) => {
          if (!ativo) return;
          setItens(r.itens);
          setOpcoes(r.st_book_opcoes);
          setAgora(Date.now());
          setErro("");
        })
        .catch((e: Error) => ativo && setErro(e.message));
    }
    buscar();
    const id = setInterval(buscar, RECARREGAR_A_CADA_MS);
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(({ data }) => ativo && data.user?.email && setUsuario(emailParaLogin(data.user.email)));
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    linhaDestaque.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [destaque]);

  const lista = useMemo(() => itens ?? [], [itens]);
  const clientes = useMemo(
    () => [...new Set(lista.map((i) => i.cliente ?? "").filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [lista],
  );
  // Contadores por cliente: book pendente = encerrado e book ainda não fechado (ver pendente()).
  const pendentesPorCliente = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of lista) if (pendente(i)) m.set(i.cliente ?? "—", (m.get(i.cliente ?? "—") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [lista]);
  const contagemStBook = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of lista) m.set(i.st_book ?? SEM_STATUS, (m.get(i.st_book ?? SEM_STATUS) ?? 0) + 1);
    m.set(COM_FALTA, lista.filter(temFalta).length);
    return m;
  }, [lista]);

  // Card "o que cada um está fazendo" (pedido do usuário): ST.BOOK FAZENDO por quem iniciou.
  const fazendoPorPessoa = useMemo(() => {
    const m = new Map<string, ItemDatabook[]>();
    for (const i of lista)
      if (i.st_book === "FAZENDO") m.set(i.fazendo_por ?? "—", [...(m.get(i.fazendo_por ?? "—") ?? []), i]);
      else if (i.st_book === RASTREAB)
        m.set(i.rastreab_inicio_por ?? "—", [...(m.get(i.rastreab_inicio_por ?? "—") ?? []), i]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lista]);

  const filtrados = useMemo(() => {
    const termo = normalizarBusca(busca);
    return lista
      .filter((i) => {
        if (cliente && i.cliente !== cliente) return false;
        if (st && i.st !== st) return false;
        if (
          stBook === "pendente"
            ? !pendente(i)
            : stBook === SEM_STATUS
              ? !!i.st_book
              : stBook === COM_FALTA
                ? !temFalta(i)
                : stBook && i.st_book !== stBook
        )
          return false;
        if (termo && ![i.po, i.mac, i.desenho, i.descricao, i.nf, i.falta, i.st_book, i.observacao].some((v) => normalizarBusca(String(v ?? "")).includes(termo)))
          return false;
        return true;
      })
      .sort((a, b) => b.linha_planilha - a.linha_planilha); // mais novos (fim da planilha) primeiro
  }, [lista, busca, cliente, st, stBook]);

  async function salvar(ids: string[], alteracoes: Record<string, string | null>) {
    setErro("");
    try {
      const atualizados = await editarDatabook(ids, alteracoes, usuario);
      const porId = new Map(atualizados.map((i) => [i.id, i]));
      // A resposta da edição não traz a foto (vem do Follow up): mantém a que já estava.
      setItens((l) => (l ?? []).map((i) => (porId.has(i.id) ? { ...i, ...porId.get(i.id) } : i)));
      setAviso(`✓ Salvo (${ids.length} pedido${ids.length > 1 ? "s" : ""})`);
      setTimeout(() => setAviso(""), 3000);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // Excluir o ST.BOOK marcado errado (pedido do usuário): 1º toque pede confirmação, 2º exclui.
  async function excluirStatus(i: ItemDatabook) {
    if (confirmarExcluir !== i.id) {
      setConfirmarExcluir(i.id);
      setTimeout(() => setConfirmarExcluir((c) => (c === i.id ? null : c)), 4000);
      return;
    }
    setConfirmarExcluir(null);
    setErro("");
    try {
      const novo = await excluirStatusDatabook(i.id, usuario);
      setItens((l) => (l ?? []).map((x) => (x.id === novo.id ? { ...x, ...novo } : x)));
      setAviso(`🗑 Status excluído — ${i.po} voltou para ${novo.st_book ?? "sem ST.BOOK"}`);
      setTimeout(() => setAviso(""), 5000);
      if (registro?.item.id === i.id) abrirRegistro({ ...i, ...novo });
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function abrirRegistro(i: ItemDatabook) {
    setRegistro({ item: i, linhas: null });
    historicoDatabook(i.id)
      .then((linhas) => setRegistro({ item: i, linhas }))
      .catch((e: Error) => setErro(e.message));
  }

  function alternar(id: string) {
    setSelecionados((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  if (erro && !itens) return <p className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300">{erro}</p>;
  if (!itens) return <p className="py-10 text-center text-stone-500">Carregando… (o servidor pode levar até 1 minuto para acordar)</p>;

  const visiveis = filtrados.slice(0, limite);
  // Compacta (pedido do usuário): colunas estreitas, sem espaço em branco; texto longo inteiro no title.
  const th = "whitespace-nowrap border-b border-stone-200 px-1 py-1 text-left text-[10px] font-bold uppercase text-stone-500 dark:border-slate-700 dark:text-slate-400";
  const td = "whitespace-nowrap px-1 py-0.5 text-[11px] leading-tight text-stone-700 dark:text-slate-300";
  const classeFiltro =
    "rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 outline-none focus:border-green-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-cyan-500";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-white">Data book</h2>
        </div>
        <FollowUpSino
          carregar={listarNotificacoesDatabook}
          chaveVisto="fcnexus.databook.notificacoes.vistoAte"
          titulo="Data book — pedidos da Controle de obras"
          dica="Pedidos ativos novos que entraram no Data book e pedidos que saíram de ativo (atualiza a cada 15 min)"
          vazio="Nenhum ainda. Aparecem aqui os pedidos ativos novos e os encerrados a cada atualização (15 min)."
          onAbrirItem={(id) => {
            const item = itens.find((i) => i.id === id);
            if (!item) return;
            setBusca(item.po);
            setCliente("");
            setSt("");
            setStBook("");
            setDestaque(id);
          }}
        />
      </div>

      <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-2 dark:border-amber-800 dark:bg-amber-950/20">
        <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          ▶ O que cada um está fazendo agora
        </p>
        {fazendoPorPessoa.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-slate-400">Ninguém com book em FAZENDO ou em RASTREABILIDADE.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {fazendoPorPessoa.map(([pessoa, lista]) => (
              <div key={pessoa} className="min-w-[13rem] max-w-xs flex-1 rounded-lg border border-amber-300 bg-white p-2 dark:border-amber-800 dark:bg-slate-900">
                <p className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-extrabold capitalize text-stone-900 dark:text-white">
                    {pessoa === "—" ? "Veio da planilha (sem nome)" : pessoa}
                  </span>
                  <span className="text-xs text-stone-500 dark:text-slate-400">{lista.length} book(s)</span>
                </p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {lista.slice(0, 6).map((i) => (
                    <li key={i.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setBusca(i.po);
                          setCliente("");
                          setSt("");
                          setStBook("");
                          setDestaque(i.id);
                        }}
                        title={`${i.descricao ?? ""}${i.falta ? ` — falta: ${i.falta}` : ""}`}
                        className="flex w-full items-baseline justify-between gap-2 rounded px-1 text-left text-xs hover:bg-amber-100 dark:hover:bg-amber-900/30"
                      >
                        <span className="truncate font-mono font-semibold text-stone-800 dark:text-slate-200">
                          {i.po} <span className="font-sans font-normal text-stone-500">{i.cliente}</span>
                          {i.falta && <span className="ml-1 text-amber-700 dark:text-amber-300">⚠</span>}
                          {i.st_book === RASTREAB && (
                            <span className="ml-1 rounded bg-violet-600 px-1 font-sans text-[10px] font-bold text-white">RASTREAB.</span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-stone-500 dark:text-slate-400">
                          {i.st_book === RASTREAB ? textoTempoRastreab(i, agora) : textoTempo(i, agora)}
                        </span>
                      </button>
                    </li>
                  ))}
                  {lista.length > 6 && (
                    <li>
                      <button
                        type="button"
                        onClick={() => setStBook("FAZENDO")}
                        className="px-1 text-xs font-semibold text-amber-700 dark:text-amber-300"
                      >
                        … e mais {lista.length - 6} — ver todos
                      </button>
                    </li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Book pendente por cliente — encerrado e book ainda não pronto (ver pendente()). */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setStBook(stBook === "pendente" ? "" : "pendente")}
          title="Pedidos encerrados (ST = E) com o book ainda não pronto (sem status, FAZENDO ou em rastreabilidade)"
          className={`rounded-lg border px-3 py-1.5 text-left ${
            stBook === "pendente" && !cliente
              ? "border-red-600 bg-red-600 text-white"
              : "border-red-300 bg-white text-red-700 dark:border-red-800 dark:bg-slate-900 dark:text-red-300"
          }`}
        >
          <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-80">Book pendente</span>
          <span className="font-mono text-lg font-bold">{pendentesPorCliente.reduce((s, [, n]) => s + n, 0)}</span>
        </button>
        {pendentesPorCliente.map(([c, n]) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              const ativo = stBook === "pendente" && cliente === c;
              setStBook(ativo ? "" : "pendente");
              setCliente(ativo || c === "—" ? "" : c);
            }}
            title={`${n} book(s) pendente(s) de ${CLIENTES[c] ?? c}`}
            className={`rounded-lg border px-3 py-1.5 text-left ${
              stBook === "pendente" && cliente === c
                ? "border-red-600 bg-red-600 text-white"
                : "border-stone-300 bg-white text-stone-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            }`}
          >
            <span className="block text-[10px] font-semibold uppercase tracking-wide opacity-80">{c}</span>
            <span className="font-mono text-lg font-bold">{n}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setLimite(PAGINA);
          }}
          placeholder="🔎 PO, MAC, desenho, descrição, NF ou ST.BOOK"
          className={`${classeFiltro} w-72`}
        />
        <select value={cliente} onChange={(e) => setCliente(e.target.value)} className={classeFiltro} aria-label="Cliente">
          <option value="">Todos os clientes</option>
          {clientes.map((c) => (
            <option key={c} value={c}>
              {c}
              {CLIENTES[c] ? ` — ${CLIENTES[c]}` : ""}
            </option>
          ))}
        </select>
        {/* Todos os ST.BOOK na barra de filtro (pedido do usuário) — mesmo filtro dos botões abaixo. */}
        <select
          value={stBook}
          onChange={(e) => {
            setStBook(e.target.value);
            setLimite(PAGINA);
          }}
          className={classeFiltro}
          aria-label="ST.BOOK"
        >
          <option value="">ST.BOOK: todos</option>
          {opcoes.map((o) => (
            <option key={o} value={o}>
              {o} ({formatarNumero(contagemStBook.get(o) ?? 0, 0)})
            </option>
          ))}
          <option value={SEM_STATUS}>Sem ST.BOOK ({formatarNumero(contagemStBook.get(SEM_STATUS) ?? 0, 0)})</option>
          <option value={COM_FALTA}>⚠ Com falta p/ finalizar ({formatarNumero(contagemStBook.get(COM_FALTA) ?? 0, 0)})</option>
          <option value="pendente">Book pendente (encerrado, book não pronto)</option>
        </select>
        <select value={st} onChange={(e) => setSt(e.target.value)} className={classeFiltro} aria-label="Status do pedido">
          <option value="">Status: todos</option>
          <option value="A">A — Ativo</option>
          <option value="E">E — Entregue</option>
          <option value="C">C — Cancelado</option>
        </select>
        {(busca || cliente || st || stBook) && (
          <button
            type="button"
            onClick={() => {
              setBusca("");
              setCliente("");
              setSt("");
              setStBook("");
              setDestaque(null);
            }}
            className="rounded-lg px-2 py-1.5 text-sm text-stone-500 hover:bg-stone-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ✕ Limpar filtros
          </button>
        )}
        {aviso && <span className="text-sm font-semibold text-green-700 dark:text-green-400">{aviso}</span>}
      </div>

      {/* ST.BOOK: filtro com a contagem de cada um. */}
      <div className="flex flex-wrap gap-1.5">
        {[["", "Todos", lista.length] as const, ...opcoes.map((o) => [o, o, contagemStBook.get(o) ?? 0] as const), [SEM_STATUS, "Sem ST.BOOK", contagemStBook.get(SEM_STATUS) ?? 0] as const, [COM_FALTA, "⚠ Com falta p/ finalizar", contagemStBook.get(COM_FALTA) ?? 0] as const].map(
          ([valor, rotulo, n]) => (
            <button
              key={valor || "todos"}
              type="button"
              onClick={() => {
                setStBook(valor);
                setLimite(PAGINA);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                stBook === valor
                  ? `border-transparent ${valor === COM_FALTA ? "bg-amber-500 text-white" : (COR_ST_BOOK[valor] ?? "bg-green-600 text-white dark:bg-cyan-600")}`
                  : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
              }`}
            >
              {rotulo} ({formatarNumero(n, 0)})
            </button>
          ),
        )}
      </div>

      {selecionados.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-green-600 bg-green-50 px-3 py-2 text-sm dark:border-cyan-600 dark:bg-cyan-950/40">
          <strong>{selecionados.size} selecionado(s)</strong> — ST.BOOK pra todos:
          {opcoes.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => salvar([...selecionados], { st_book: o }).then(() => setSelecionados(new Set()))}
              className={`rounded px-2 py-1 text-xs font-bold ${COR_ST_BOOK[o] ?? "bg-stone-200"}`}
            >
              {o}
            </button>
          ))}
          <button type="button" onClick={() => setSelecionados(new Set())} className="ml-auto text-xs text-stone-500 dark:text-slate-400">
            Desmarcar
          </button>
        </div>
      )}

      {erro && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
          {erro}
        </p>
      )}

      <p className="text-xs text-stone-500 dark:text-slate-400">
        {formatarNumero(filtrados.length, 0)} pedido(s){filtrados.length > visiveis.length ? ` — mostrando ${visiveis.length}` : ""} · mais
        novos primeiro
      </p>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
        <table className="w-max border-collapse">
          <thead className="bg-stone-50 dark:bg-slate-900">
            <tr>
              <th className={th}>
                <input
                  type="checkbox"
                  aria-label="Selecionar todos os mostrados"
                  checked={visiveis.length > 0 && visiveis.every((i) => selecionados.has(i.id))}
                  onChange={(e) =>
                    setSelecionados(e.target.checked ? new Set([...selecionados, ...visiveis.map((i) => i.id)]) : new Set())
                  }
                />
              </th>
              <th className={th}>Início</th>
              <th className={th} title="D.Finalização (book pronto)">Final.</th>
              <th className={th}>Autor</th>
              <th className={th} title="FAZENDO → PRONTO (ou até agora), só a jornada: seg–sex 7:30–17:17, sem almoço">Tempo</th>
              <th className={th} title="Início da rastreabilidade (ST.BOOK RASTREABILIDADE)">Rastr. início</th>
              <th className={th} title="Finalização da rastreabilidade (ST.BOOK RASTREABILIDADE FINALIZADA)">Rastr. final.</th>
              <th className={th} title="Foto do Follow up pelo PO (ou, sem foto, de outro pedido com o mesmo desenho)">Foto</th>
              <th className={th}>PO</th>
              <th className={th}>ST.BOOK</th>
              <th className={th} title="O que está faltando pra finalizar o book">Falta p/ finalizar</th>
              <th className={th}>Obs.</th>
              <th className={th} title="Registro do pedido">🕘</th>
              <th className={th} title="Cliente — colunas daqui pra frente vêm da Controle de obras">Cli <IconeCadeado /></th>
              <th className={th}>St</th>
              <th className={th}>Qt</th>
              <th className={th}>Desenho</th>
              <th className={th}>Descrição</th>
              <th className={th}>Rev</th>
              <th className={th}>MAC</th>
              <th className={th}>Cor-1</th>
              <th className={th}>Cor-2</th>
              <th className={th}>Plano</th>
              <th className={th}>Prazo</th>
              <th className={th}>NF</th>
              <th className={th}>Meta</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((i) => (
              <tr
                key={i.id}
                ref={destaque === i.id ? linhaDestaque : undefined}
                className={`border-b border-stone-100 dark:border-slate-800 ${
                  destaque === i.id ? "bg-yellow-100 dark:bg-yellow-900/30" : selecionados.has(i.id) ? "bg-green-50 dark:bg-cyan-950/20" : ""
                }`}
              >
                <td className={td}>
                  <input type="checkbox" checked={selecionados.has(i.id)} onChange={() => alternar(i.id)} aria-label={`Selecionar ${i.po}`} />
                </td>
                <td className={td} title={i.fazendo_em ? `${quando(i.fazendo_em)} · ${i.fazendo_por ?? ""}` : undefined}>
                  {dataCurta(i.fazendo_em)}
                </td>
                <td className={td} title={i.finalizado_em ? `${quando(i.finalizado_em)} · ${i.finalizado_por ?? ""}` : undefined}>
                  {dataCurta(i.finalizado_em)}
                </td>
                {/* Autor = o usuário do book (pedido do usuário): quem finalizou, senão quem iniciou, senão quem mexeu. */}
                <td className={`${td} max-w-[5.5rem] truncate font-semibold`} title={autorDica(i)}>
                  {i.finalizado_por ?? i.fazendo_por ?? i.editado_por}
                </td>
                <td className={`${td} font-mono`}>{textoTempo(i, agora)}</td>
                <td
                  className={`${td} text-violet-700 dark:text-violet-300`}
                  title={i.rastreab_inicio_em ? `${quando(i.rastreab_inicio_em)} · ${i.rastreab_inicio_por ?? ""} · tempo ${textoTempoRastreab(i, agora)}` : undefined}
                >
                  {dataCurta(i.rastreab_inicio_em)}
                </td>
                <td
                  className={`${td} text-violet-700 dark:text-violet-300`}
                  title={i.rastreab_fim_em ? `${quando(i.rastreab_fim_em)} · ${i.rastreab_fim_por ?? ""} · tempo ${textoTempoRastreab(i, agora)}` : undefined}
                >
                  {dataCurta(i.rastreab_fim_em)}
                </td>
                <td className="px-0.5 py-0.5">
                  {i.foto ? (
                    <a
                      href={urlImagemFollowUp(i.foto)}
                      target="_blank"
                      rel="noreferrer"
                      title={i.foto_por === "desenho" ? "Foto de outro pedido com o mesmo desenho (Follow up)" : "Foto do Follow up (mesmo PO)"}
                      className="relative block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine */}
                      <img
                        src={urlImagemFollowUp(i.foto)}
                        alt=""
                        loading="lazy"
                        className="h-8 w-12 rounded border border-stone-200 bg-white object-contain dark:border-slate-700"
                      />
                      {i.foto_por === "desenho" && (
                        <span className="absolute -right-1 -top-1 rounded bg-sky-600 px-0.5 text-[8px] font-bold text-white">DES</span>
                      )}
                    </a>
                  ) : (
                    <span className="block h-8 w-12" />
                  )}
                </td>
                <td className={`${td} font-mono font-semibold text-stone-900 dark:text-white`}>
                  {i.po}
                  {i.origem === "controle_obras" && (
                    <span className="ml-0.5 rounded bg-green-100 px-0.5 text-[8px] font-bold text-green-800 dark:bg-green-900/50 dark:text-green-300" title="Entrou sozinho da Controle de obras">
                      NOVO
                    </span>
                  )}
                </td>
                <td className={td}>
                  <select
                    value={i.st_book ?? ""}
                    onChange={(e) => salvar([i.id], { st_book: e.target.value || null })}
                    title={i.editado_por ? `Última edição: ${i.editado_por} · ${quando(i.editado_em)}` : undefined}
                    className={`w-[7.5rem] rounded px-1 py-0.5 text-[11px] font-bold outline-none ${
                      i.st_book ? (COR_ST_BOOK[i.st_book] ?? "bg-stone-200 text-stone-800") : "border border-dashed border-stone-300 bg-transparent text-stone-400 dark:border-slate-600"
                    }`}
                  >
                    <option value="">—</option>
                    {opcoes.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  {i.st_book && (
                    <button
                      type="button"
                      onClick={() => excluirStatus(i)}
                      title="Excluir o status marcado errado — volta pro status anterior"
                      className={`ml-0.5 rounded px-1 text-[11px] font-bold ${
                        confirmarExcluir === i.id ? "bg-red-600 text-white" : "text-stone-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                      }`}
                    >
                      {confirmarExcluir === i.id ? "Excluir?" : "🗑"}
                    </button>
                  )}
                </td>
                <td className={td}>
                  <CelulaTexto
                    atual={i.falta}
                    destaque={temFalta(i)}
                    sugestoes="databook-sugestoes-falta"
                    comAcoes
                    onSalvar={(v) => salvar([i.id], { falta: v || null })}
                  />
                </td>
                <td className={td}>
                  <CelulaTexto atual={i.observacao} onSalvar={(v) => salvar([i.id], { observacao: v || null })} />
                </td>
                <td className={td}>
                  <button
                    type="button"
                    onClick={() => abrirRegistro(i)}
                    title="Ver o registro do pedido (quem mudou o quê e quando)"
                    className="rounded px-0.5 text-xs hover:bg-stone-100 dark:hover:bg-slate-800"
                  >
                    🕘
                  </button>
                </td>
                <td className={td} title={i.cliente ? CLIENTES[i.cliente] : undefined}>{i.cliente}</td>
                <td className={td} title={i.st ? ROTULO_ST[i.st] : undefined}>
                  <span
                    className={`rounded px-1 font-bold ${
                      i.st === "A" ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : i.st === "C" ? "bg-stone-200 text-stone-600 line-through dark:bg-slate-700" : ""
                    }`}
                  >
                    {i.st}
                  </span>
                </td>
                <td className={`${td} text-right font-mono`}>{i.quantidade != null ? formatarNumero(i.quantidade, 0) : ""}</td>
                <td className={`${td} max-w-[7rem] truncate font-mono`} title={i.desenho ?? undefined}>{i.desenho}</td>
                <td className={`${td} max-w-[11rem] truncate`} title={i.descricao ?? undefined}>{i.descricao}</td>
                <td className={td}>{i.revisao}</td>
                <td className={`${td} font-mono`}>{i.mac}</td>
                <td className={`${td} max-w-[5rem] truncate`} title={i.cor1 ?? undefined}>{i.cor1}</td>
                <td className={`${td} max-w-[5rem] truncate`} title={i.cor2 ?? undefined}>{i.cor2}</td>
                <td className={`${td} max-w-[7rem] truncate`} title={i.plano_pintura ?? undefined}>{i.plano_pintura}</td>
                <td className={`${td} font-mono`}>{i.prazo_contratual ? formatarDataBr(i.prazo_contratual).replace(/\/(\d{2})(\d{2})$/, "/$2") : ""}</td>
                <td className={`${td} font-mono`}>{i.nf}</td>
                <td className={`${td} font-mono`}>{i.meta}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && <p className="py-8 text-center text-sm text-stone-500">Nenhum pedido com esses filtros.</p>}
      </div>
      <datalist id="databook-sugestoes-falta">
        {SUGESTOES_FALTA.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      {registro && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setRegistro(null)}>
          <div
            className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-lg border border-stone-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-stone-900 dark:text-white">Registro — {registro.item.po}</h3>
                <p className="text-xs text-stone-500 dark:text-slate-400">{registro.item.descricao}</p>
                {registro.item.st_book && (
                  <button
                    type="button"
                    onClick={() => excluirStatus(registro.item)}
                    className={`mt-1 rounded-lg border px-2 py-1 text-xs font-bold ${
                      confirmarExcluir === registro.item.id
                        ? "border-red-600 bg-red-600 text-white"
                        : "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                    }`}
                  >
                    {confirmarExcluir === registro.item.id
                      ? `Confirmar: excluir "${registro.item.st_book}"?`
                      : `🗑 Excluir status "${registro.item.st_book}" (marcado errado)`}
                  </button>
                )}
              </div>
              <button type="button" onClick={() => setRegistro(null)} className="rounded px-2 text-lg text-stone-500">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-stone-800 dark:text-slate-200">
              <p>
                <span className="block font-semibold uppercase text-stone-500">Início (FAZENDO)</span>
                {quando(registro.item.fazendo_em) || "—"} {registro.item.fazendo_por ?? ""}
              </p>
              <p>
                <span className="block font-semibold uppercase text-stone-500">Finalização</span>
                {quando(registro.item.finalizado_em) || "—"} {registro.item.finalizado_por ?? ""}
              </p>
              <p>
                <span className="block font-semibold uppercase text-stone-500">Tempo</span>
                {textoTempo(registro.item, agora) || "—"}
              </p>
              <p>
                <span className="block font-semibold uppercase text-violet-600 dark:text-violet-400">Rastreabilidade — início</span>
                {quando(registro.item.rastreab_inicio_em) || "—"} {registro.item.rastreab_inicio_por ?? ""}
              </p>
              <p>
                <span className="block font-semibold uppercase text-violet-600 dark:text-violet-400">Rastreabilidade — finalização</span>
                {quando(registro.item.rastreab_fim_em) || "—"} {registro.item.rastreab_fim_por ?? ""}
                {registro.item.rastreab_inicio_em && <span className="block">Tempo: {textoTempoRastreab(registro.item, agora) || "—"}</span>}
              </p>
              <p>
                <span className="block font-semibold uppercase text-stone-500">Falta p/ finalizar</span>
                {registro.item.falta || "—"}
              </p>
            </div>
            {registro.linhas === null ? (
              <p className="text-sm text-stone-500">Carregando…</p>
            ) : registro.linhas.length === 0 ? (
              <p className="text-sm text-stone-500">Nenhuma mudança registrada no app ainda (o que veio da planilha não tem histórico).</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {registro.linhas.map((h, n) => (
                  <li
                    key={n}
                    className={`rounded border px-2 py-1.5 text-sm text-stone-800 dark:text-slate-200 ${
                      h.campo === "st_book_excluido" ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30" : "border-stone-200 dark:border-slate-700"
                    } ${h.desfeito ? "line-through opacity-50" : ""}`}
                    title={h.desfeito ? "Troca desfeita pelo Excluir status" : undefined}
                  >
                    <span className="text-xs text-stone-500 dark:text-slate-400">
                      {quando(h.em)} · <strong>{h.por ?? "—"}</strong>
                    </span>
                    <span className="block">
                      <strong>{NOME_CAMPO[h.campo] ?? h.campo}:</strong> {h.de ?? "—"} → <strong>{h.para ?? "(apagado)"}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {filtrados.length > visiveis.length && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + PAGINA)}
          className="mx-auto rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 dark:border-slate-600 dark:text-slate-300"
        >
          Mostrar mais {Math.min(PAGINA, filtrados.length - visiveis.length)} ▾
        </button>
      )}
    </div>
  );
}
