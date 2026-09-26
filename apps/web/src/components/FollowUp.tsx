"use client";

// Aba FOLLOW UP — pedido explícito do usuário: módulo nativo baseado na aba
// "Gerencia" do "Gerenciamento de obras ativas.xlsb". O Excel é só a fonte
// de atualização (botão "Importar / Atualizar Follow Up"); os dados ficam no
// banco do app (ver services/calc_engine/app/follow_up.py).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importarFollowUp, listarFollowUp, urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarMoeda, formatarNumero } from "@/lib/format";
import {
  ETAPAS,
  ROTULO_PRAZO,
  compararValores,
  corCondicional,
  corDestaque,
  montarContextoRegras,
  normalizarBusca,
  situacaoEtapa,
  situacaoPrazo,
  type SituacaoEtapa,
  type SituacaoPrazo,
} from "@/lib/followUp";
import type { ItemFollowUp, RespostaFollowUp, ResultadoImportacaoFollowUp } from "@/lib/types";
import FollowUpDetalhe, { BarraEtapa, GaleriaImagens, SeloPrazo, SeloStatus } from "@/components/FollowUpDetalhe";

type TipoColuna = "foto" | "codigo" | "texto" | "numero" | "prazo" | "etapa" | "status" | "coleta" | "moeda" | "peso";

interface Coluna {
  campo: keyof ItemFollowUp | "foto";
  rotulo: string;
  tipo: TipoColuna;
  principal: boolean;
  largura?: string;
}

const COLUNAS: Coluna[] = [
  { campo: "foto", rotulo: "Foto", tipo: "foto", principal: true },
  { campo: "po", rotulo: "PO", tipo: "codigo", principal: true },
  { campo: "prazo_contratual", rotulo: "Prazo", tipo: "prazo", principal: true },
  { campo: "cliente", rotulo: "Cliente", tipo: "texto", principal: true },
  { campo: "quantidade", rotulo: "Qtd", tipo: "numero", principal: true },
  { campo: "mac", rotulo: "MAC", tipo: "codigo", principal: true },
  { campo: "desenho", rotulo: "Desenho", tipo: "codigo", principal: true },
  { campo: "descricao", rotulo: "Descrição", tipo: "texto", principal: true, largura: "min-w-[16rem]" },
  ...ETAPAS.map((e) => ({ campo: e.campo, rotulo: e.rotulo, tipo: "etapa" as const, principal: true })),
  { campo: "coleta", rotulo: "Coleta", tipo: "coleta", principal: true },
  { campo: "status", rotulo: "Status", tipo: "status", principal: true },
  { campo: "fornecedor", rotulo: "Fornecedor", tipo: "texto", principal: false },
  { campo: "orcamento_terceirizado_unid", rotulo: "Orç. terceirizado unid", tipo: "moeda", principal: false },
  { campo: "orcamento_custo_macfab_unid", rotulo: "Custo Macfab unid", tipo: "moeda", principal: false },
  { campo: "obs_felipe_marcelo", rotulo: "Obs. Felipe / Marcelo", tipo: "texto", principal: false, largura: "min-w-[14rem]" },
  { campo: "obs_alisson", rotulo: "Obs. Alisson", tipo: "texto", principal: false, largura: "min-w-[14rem]" },
  { campo: "cor2", rotulo: "COR2", tipo: "texto", principal: false },
  { campo: "cor_2", rotulo: "COR-2", tipo: "texto", principal: false },
  { campo: "plano_pintura", rotulo: "Plano de pintura", tipo: "texto", principal: false, largura: "min-w-[18rem]" },
  { campo: "st", rotulo: "ST", tipo: "codigo", principal: false },
  { campo: "nf", rotulo: "NF", tipo: "codigo", principal: false },
  { campo: "tipagem", rotulo: "Tipagem", tipo: "codigo", principal: false },
  { campo: "peso_unid", rotulo: "Peso unid", tipo: "peso", principal: false },
  { campo: "peso_total", rotulo: "Peso total", tipo: "peso", principal: false },
  { campo: "ano", rotulo: "Ano", tipo: "numero", principal: false },
  { campo: "preco_previsto", rotulo: "Preço previsto", tipo: "moeda", principal: false },
];

interface Filtros {
  busca: string;
  cliente: string;
  mac: string;
  po: string;
  prazo: SituacaoPrazo | "";
  prazoDe: string;
  prazoAte: string;
  status: string;
  tipagem: string;
  fornecedor: string;
  ano: string;
  st: string;
  destaque: string;
}

// Padrão = o que a planilha mostra: a segmentação da aba Gerencia deixa só
// ST = "A" visível (os "E" ficam ocultos) — com isso o Peso Total bate com
// o SUBTOTAL da célula G1.
const FILTROS_PADRAO: Filtros = {
  busca: "",
  cliente: "",
  mac: "",
  po: "",
  prazo: "",
  prazoDe: "",
  prazoAte: "",
  status: "",
  tipagem: "",
  fornecedor: "",
  ano: "",
  st: "A",
  destaque: "",
};
const FILTROS_VAZIOS: Filtros = { ...FILTROS_PADRAO, st: "" };

const classeCampo =
  "w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";
const classeFiltroColuna =
  "w-full min-w-[4rem] rounded border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs font-normal normal-case tracking-normal text-stone-800 dark:text-slate-200 outline-none focus:border-green-600 dark:focus:border-cyan-500";

function valorCampo(item: ItemFollowUp, campo: Coluna["campo"]): unknown {
  if (campo === "foto") return item.imagens.length;
  if (campo === "coleta") return item.coleta_data ?? item.coleta;
  return item[campo];
}

function unicos(itens: ItemFollowUp[], campo: keyof ItemFollowUp): string[] {
  const s = new Set<string>();
  for (const i of itens) {
    const v = i[campo];
    if (v !== null && v !== undefined && v !== "") s.add(String(v));
  }
  return [...s].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

export default function FollowUp() {
  const [dados, setDados] = useState<RespostaFollowUp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [importando, setImportando] = useState<string | null>(null);
  const [resultadoImportacao, setResultadoImportacao] = useState<ResultadoImportacaoFollowUp | null>(null);
  const [verAvisos, setVerAvisos] = useState(false);

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, string>>({});
  const [ordem, setOrdem] = useState<{ campo: Coluna["campo"]; desc: boolean } | null>(null);
  const [todasColunas, setTodasColunas] = useState(false);
  const [mostrarAusentes, setMostrarAusentes] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const [itemAberto, setItemAberto] = useState<ItemFollowUp | null>(null);
  const [galeria, setGaleria] = useState<{ item: ItemFollowUp; indice: number } | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro("");
    listarFollowUp()
      .then(setDados)
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    // Carga inicial (carregando já começa true) — só atualiza estado no retorno.
    let ativo = true;
    listarFollowUp()
      .then((r) => ativo && setDados(r))
      .catch((e: Error) => ativo && setErro(e.message))
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, []);

  async function importar(arquivo: File) {
    setErro("");
    setResultadoImportacao(null);
    setImportando(`Enviando ${arquivo.name} (${formatarNumero(arquivo.size / 1024 / 1024, 1)} MB)…`);
    try {
      const r = await importarFollowUp(arquivo);
      setResultadoImportacao(r);
      setVerAvisos(false);
      setImportando("Carregando registros atualizados…");
      const novos = await listarFollowUp();
      setDados(novos);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setImportando(null);
    }
  }

  const itens = useMemo(() => dados?.itens ?? [], [dados]);
  const importacao = dados?.importacao ?? null;
  const ctx = useMemo(() => montarContextoRegras(importacao, itens), [importacao, itens]);
  const corBarra = importacao?.barra_etapas?.cor ?? "#63C384";
  const maxBarra = importacao?.barra_etapas?.max ?? 100;

  const base = useMemo(
    () => (mostrarAusentes ? itens : itens.filter((i) => i.presente_na_ultima_importacao)),
    [itens, mostrarAusentes],
  );

  const opcoes = useMemo(
    () => ({
      cliente: unicos(base, "cliente"),
      mac: unicos(base, "mac"),
      po: unicos(base, "po"),
      status: unicos(base, "status"),
      tipagem: unicos(base, "tipagem"),
      fornecedor: unicos(base, "fornecedor"),
      ano: unicos(base, "ano"),
      st: unicos(base, "st"),
      destaque: [...new Set(base.map(corDestaque).filter((c): c is string => !!c))],
    }),
    [base],
  );

  const filtrados = useMemo(() => {
    const busca = normalizarBusca(filtros.busca);
    const contem = (v: unknown, termo: string) => normalizarBusca(String(v ?? "")).includes(normalizarBusca(termo));
    const colunasAtivas = Object.entries(filtrosColuna).filter(([, v]) => v.trim() !== "");
    const lista = base.filter((i) => {
      if (busca) {
        const alvo = normalizarBusca([i.po, i.mac, i.desenho, i.descricao, i.nf].filter(Boolean).join(" "));
        if (!alvo.includes(busca)) return false;
      }
      if (filtros.cliente && i.cliente !== filtros.cliente) return false;
      if (filtros.mac && !contem(i.mac, filtros.mac)) return false;
      if (filtros.po && !contem(i.po, filtros.po)) return false;
      if (filtros.tipagem && !contem(i.tipagem, filtros.tipagem)) return false;
      if (filtros.status && i.status !== filtros.status) return false;
      if (filtros.fornecedor && i.fornecedor !== filtros.fornecedor) return false;
      if (filtros.ano && String(i.ano ?? "") !== filtros.ano) return false;
      if (filtros.st && i.st !== filtros.st) return false;
      if (filtros.destaque && corDestaque(i) !== filtros.destaque) return false;
      if (filtros.prazo && situacaoPrazo(i.prazo_contratual) !== filtros.prazo) return false;
      if (filtros.prazoDe && (!i.prazo_contratual || i.prazo_contratual < filtros.prazoDe)) return false;
      if (filtros.prazoAte && (!i.prazo_contratual || i.prazo_contratual > filtros.prazoAte)) return false;
      for (const [campo, termo] of colunasAtivas) {
        const col = COLUNAS.find((c) => c.campo === campo);
        if (!col) continue;
        if (col.tipo === "etapa") {
          if (situacaoEtapa(i[col.campo as keyof ItemFollowUp] as number | null) !== (termo as SituacaoEtapa)) return false;
        } else if (col.tipo === "foto") {
          if ((termo === "com") !== i.imagens.length > 0) return false;
        } else if (col.tipo === "prazo") {
          if (!contem(formatarDataBr(i.prazo_contratual), termo)) return false;
        } else if (col.tipo === "coleta") {
          if (!contem(i.coleta, termo)) return false;
        } else if (!contem(valorCampo(i, col.campo), termo)) {
          return false;
        }
      }
      return true;
    });
    if (ordem) {
      lista.sort((a, b) => {
        const va = valorCampo(a, ordem.campo);
        const vb = valorCampo(b, ordem.campo);
        const vazioA = va === null || va === undefined || va === "";
        const vazioB = vb === null || vb === undefined || vb === "";
        if (vazioA || vazioB) return compararValores(va, vb); // vazios sempre no fim
        return ordem.desc ? -compararValores(va, vb) : compararValores(va, vb);
      });
    }
    return lista;
  }, [base, filtros, filtrosColuna, ordem]);

  const indicadores = useMemo(() => {
    let peso = 0;
    let prontos = 0;
    let atrasados = 0;
    let vencendo = 0;
    for (const i of filtrados) {
      peso += i.peso_total ?? 0;
      const pronto = normalizarBusca(i.status ?? "") === "pronto";
      if (pronto) prontos++;
      const s = situacaoPrazo(i.prazo_contratual);
      if (!pronto && s === "atrasado") atrasados++;
      if (!pronto && (s === "hoje" || s === "proximo")) vencendo++;
    }
    return { peso, prontos, atrasados, vencendo };
  }, [filtrados]);

  const pesoPlanilha = importacao?.indicadores.find((i) => i.celula === "G1")?.valor;
  const colunas = todasColunas ? COLUNAS : COLUNAS.filter((c) => c.principal);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtrados.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina);
  const filtrosAlterados =
    JSON.stringify(filtros) !== JSON.stringify(FILTROS_VAZIOS) || Object.values(filtrosColuna).some((v) => v);

  // Qualquer mudança de filtro/ordem volta pra 1ª página.
  function setFiltro<K extends keyof Filtros>(chave: K, valor: Filtros[K]) {
    setFiltros((f) => ({ ...f, [chave]: valor }));
    setPagina(0);
  }

  function setFiltroColuna(campo: string, valor: string) {
    setFiltrosColuna((f) => ({ ...f, [campo]: valor }));
    setPagina(0);
  }

  function alternarOrdem(campo: Coluna["campo"]) {
    setOrdem((o) => (o?.campo !== campo ? { campo, desc: false } : o.desc ? null : { campo, desc: true }));
    setPagina(0);
  }

  function renderCelula(item: ItemFollowUp, col: Coluna) {
    switch (col.tipo) {
      case "foto": {
        const primeira = item.imagens[0];
        if (!primeira) return <span className="text-xs text-stone-300 dark:text-slate-700">—</span>;
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setGaleria({ item, indice: 0 });
            }}
            className="relative block h-10 w-12 overflow-hidden rounded border border-stone-200 dark:border-slate-700 bg-white hover:border-green-600 dark:hover:border-cyan-500"
            title={item.imagens.length > 1 ? `${item.imagens.length} imagens` : "Ver imagem"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine */}
            <img src={urlImagemFollowUp(primeira.sha256)} alt="" loading="lazy" className="h-full w-full object-contain" />
            {item.imagens.length > 1 && (
              <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[10px] font-bold text-white">
                {item.imagens.length}
              </span>
            )}
          </button>
        );
      }
      case "etapa":
        return (
          <BarraEtapa valor={item[col.campo as keyof ItemFollowUp] as number | null} cor={corBarra} max={maxBarra} compacta />
        );
      case "status":
        return <SeloStatus item={item} ctx={ctx} />;
      case "prazo":
        return <SeloPrazo prazo={item.prazo_contratual} compacto />;
      case "coleta":
        return item.coleta_data ? (
          <span className="font-mono text-xs">{formatarDataBr(item.coleta_data)}</span>
        ) : (
          <span className="text-xs">{item.coleta ?? ""}</span>
        );
      case "moeda": {
        const v = item[col.campo as keyof ItemFollowUp] as number | null;
        return v === null ? "" : <span className="font-mono text-xs">{formatarMoeda(v)}</span>;
      }
      case "peso": {
        const v = item[col.campo as keyof ItemFollowUp] as number | null;
        return v === null ? "" : <span className="font-mono text-xs">{formatarNumero(v, 2)}</span>;
      }
      case "codigo":
        return <span className="font-mono text-xs">{String(item[col.campo as keyof ItemFollowUp] ?? "")}</span>;
      default: {
        const v = item[col.campo as keyof ItemFollowUp];
        return <span className="text-xs">{v === null || v === undefined ? "" : String(v)}</span>;
      }
    }
  }

  function estiloCelula(item: ItemFollowUp, col: Coluna): React.CSSProperties | undefined {
    if (col.tipo === "foto" || col.tipo === "etapa" || col.tipo === "status") return undefined;
    // Formatação condicional da planilha (ex.: PO duplicado em vermelho) tem
    // precedência sobre a cor manual da célula — como no Excel.
    const cond = corCondicional(ctx, item, col.campo);
    const fundo = cond?.fundo ?? item.cores?.[col.campo]?.fundo;
    if (!fundo) return undefined;
    // Tom suave da mesma cor (e não o preenchimento cheio do Excel): mantém o
    // significado da marcação e continua legível no tema claro e no escuro.
    // Via sombra interna (e não background) pra coluna fixa do PO continuar
    // opaca por baixo quando a tabela rola na horizontal.
    return { boxShadow: `inset 0 0 0 999px color-mix(in srgb, ${fundo} ${cond ? 40 : 28}%, transparent)` };
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho da aba: importação + última atualização */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-white">Follow up de obras</h2>
          <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
            {importacao ? (
              <>
                Última importação: <strong>{importacao.arquivo_nome}</strong> (aba {importacao.aba}) em{" "}
                {new Date(importacao.importado_em).toLocaleString("pt-BR")}
              </>
            ) : carregando ? (
              "Carregando…"
            ) : (
              "Nenhuma importação ainda — importe a planilha para começar."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={carregar}
            disabled={carregando || !!importando}
            className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-stone-700 dark:text-slate-300 hover:border-green-600/50 dark:hover:border-cyan-500/50 disabled:opacity-50"
          >
            Recarregar
          </button>
          <button
            type="button"
            onClick={() => inputArquivo.current?.click()}
            disabled={!!importando}
            className="rounded-lg bg-green-600 dark:bg-cyan-500 px-4 py-2 text-sm font-bold text-white dark:text-slate-950 hover:bg-green-500 dark:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {importando ? "Importando…" : "Importar / Atualizar Follow Up"}
          </button>
          <input
            ref={inputArquivo}
            type="file"
            accept=".xlsb"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = "";
              if (arquivo) importar(arquivo);
            }}
          />
        </div>
      </div>

      {importando && (
        <div className="rounded-lg border border-green-300 dark:border-cyan-800 bg-green-50 dark:bg-cyan-950/30 p-3 text-sm text-green-700 dark:text-cyan-300">
          {importando} Lendo a aba Gerencia, imagens e formatação — o servidor pode levar até 1 minuto se estiver
          “dormindo”.
        </div>
      )}

      {erro && (
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
          {erro}
        </div>
      )}

      {resultadoImportacao && (
        <div className="rounded-lg border border-green-300 dark:border-cyan-800 bg-green-50 dark:bg-cyan-950/30 p-3 text-sm text-green-800 dark:text-cyan-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>
              <strong>Importação concluída</strong> — {resultadoImportacao.linhas_lidas} linhas lidas ·{" "}
              {resultadoImportacao.inseridos} novos · {resultadoImportacao.atualizados} atualizados ·{" "}
              {resultadoImportacao.inalterados} sem alteração · {resultadoImportacao.ausentes} saíram da planilha ·{" "}
              {resultadoImportacao.imagens_vinculadas} imagens vinculadas
            </p>
            <button type="button" onClick={() => setResultadoImportacao(null)} className="text-xs underline">
              fechar
            </button>
          </div>
          <p className="mt-1 text-xs opacity-80">
            Imagens flutuantes na aba: {resultadoImportacao.relatorio.imagens_flutuantes_total}
            {resultadoImportacao.relatorio.imagens_flutuantes_invisiveis > 0 &&
              ` (${resultadoImportacao.relatorio.imagens_flutuantes_invisiveis} com tamanho zero — invisíveis no Excel, restos de linhas apagadas — não vinculadas)`}
            {resultadoImportacao.relatorio.imagens_flutuantes_fora_de_registro > 0 &&
              ` · ${resultadoImportacao.relatorio.imagens_flutuantes_fora_de_registro} fora de linhas de registro`}
            {resultadoImportacao.relatorio.linhas_ignoradas_sem_po > 0 &&
              ` · ${resultadoImportacao.relatorio.linhas_ignoradas_sem_po} linha(s) sem PO ignorada(s)`}
          </p>
          {resultadoImportacao.relatorio.avisos_total > 0 && (
            <div className="mt-1 text-xs">
              <button type="button" onClick={() => setVerAvisos((v) => !v)} className="underline">
                {verAvisos ? "Esconder" : "Ver"} {resultadoImportacao.relatorio.avisos_total} aviso(s) da importação
              </button>
              {verAvisos && (
                <ul className="mt-1 max-h-40 list-disc overflow-y-auto pl-5">
                  {resultadoImportacao.relatorio.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* Indicadores — recalculados sobre os registros filtrados */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 rounded-lg border border-green-600/30 dark:border-cyan-500/30 bg-white dark:bg-slate-900/40 p-3 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">Peso total</p>
          <p className="font-mono text-2xl font-bold text-green-700 dark:text-cyan-300">
            {formatarNumero(indicadores.peso, 2)} <span className="text-sm font-normal">kg</span>
          </p>
          <p className="text-[11px] text-stone-500 dark:text-slate-500">
            dos registros filtrados
            {typeof pesoPlanilha === "number" && ` · planilha (G1): ${formatarNumero(pesoPlanilha, 2)}`}
          </p>
        </div>
        {[
          { rotulo: "Registros", valor: filtrados.length, detalhe: `de ${base.length}` },
          { rotulo: "Prontos", valor: indicadores.prontos, detalhe: "Status = Pronto" },
          { rotulo: "Atrasados", valor: indicadores.atrasados, detalhe: "prazo vencido e não pronto", cor: "text-red-600 dark:text-red-400" },
          {
            rotulo: "Vencendo",
            valor: indicadores.vencendo,
            detalhe: "hoje ou em até 7 dias, não pronto",
            cor: "text-amber-600 dark:text-amber-400",
          },
        ].map((k) => (
          <div key={k.rotulo} className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">{k.rotulo}</p>
            <p className={`font-mono text-2xl font-bold ${k.cor ?? "text-stone-900 dark:text-white"}`}>{k.valor}</p>
            <p className="text-[11px] text-stone-500 dark:text-slate-500">{k.detalhe}</p>
          </div>
        ))}
      </div>

      {/* Filtros rápidos */}
      <div className="flex flex-col gap-3 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={filtros.busca}
            onChange={(e) => setFiltro("busca", e.target.value)}
            placeholder="Pesquisar PO, MAC, desenho, descrição ou NF…"
            className={`${classeCampo} min-w-[16rem] flex-1`}
          />
          <button
            type="button"
            onClick={() => {
              setFiltros(FILTROS_VAZIOS);
              setFiltrosColuna({});
              setPagina(0);
            }}
            disabled={!filtrosAlterados}
            className="rounded-lg border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-sm text-stone-700 dark:text-slate-300 hover:border-red-400 disabled:opacity-40"
          >
            Limpar filtros
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
          <Seletor rotulo="Cliente" valor={filtros.cliente} opcoes={opcoes.cliente} onChange={(v) => setFiltro("cliente", v)} />
          <CampoLista rotulo="MAC" id="fu-mac" valor={filtros.mac} opcoes={opcoes.mac} onChange={(v) => setFiltro("mac", v)} />
          <CampoLista rotulo="PO" id="fu-po" valor={filtros.po} opcoes={opcoes.po} onChange={(v) => setFiltro("po", v)} />
          <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
            Prazo
            <select
              value={filtros.prazo}
              onChange={(e) => setFiltro("prazo", e.target.value as SituacaoPrazo | "")}
              className={classeCampo}
            >
              <option value="">Todos</option>
              {(Object.keys(ROTULO_PRAZO) as SituacaoPrazo[]).map((s) => (
                <option key={s} value={s}>
                  {ROTULO_PRAZO[s]}
                </option>
              ))}
            </select>
          </label>
          <Seletor rotulo="Status" valor={filtros.status} opcoes={opcoes.status} onChange={(v) => setFiltro("status", v)} />
          <CampoLista
            rotulo="Tipagem"
            id="fu-tipagem"
            valor={filtros.tipagem}
            opcoes={opcoes.tipagem}
            onChange={(v) => setFiltro("tipagem", v)}
          />
          <Seletor
            rotulo="Fornecedor"
            valor={filtros.fornecedor}
            opcoes={opcoes.fornecedor}
            onChange={(v) => setFiltro("fornecedor", v)}
          />
          <Seletor rotulo="Ano" valor={filtros.ano} opcoes={opcoes.ano} onChange={(v) => setFiltro("ano", v)} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Seletor
            rotulo="ST"
            valor={filtros.st}
            opcoes={opcoes.st}
            onChange={(v) => setFiltro("st", v)}
            dica="Padrão A = o que a segmentação da planilha mostra"
          />
          <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
            Prazo de
            <input type="date" value={filtros.prazoDe} onChange={(e) => setFiltro("prazoDe", e.target.value)} className={classeCampo} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
            até
            <input type="date" value={filtros.prazoAte} onChange={(e) => setFiltro("prazoAte", e.target.value)} className={classeCampo} />
          </label>
          {opcoes.destaque.length > 0 && (
            <div className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
              Cor de destaque (planilha)
              <div className="flex flex-wrap items-center gap-1">
                {opcoes.destaque.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setFiltro("destaque", filtros.destaque === c ? "" : c)}
                    className={`h-7 w-7 rounded border-2 ${
                      filtros.destaque === c ? "border-green-600 dark:border-cyan-400" : "border-stone-300 dark:border-slate-700"
                    }`}
                    style={{ backgroundColor: c }}
                    title={`Linhas marcadas com ${c} na planilha`}
                  />
                ))}
              </div>
            </div>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-stone-600 dark:text-slate-400">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={todasColunas} onChange={(e) => setTodasColunas(e.target.checked)} />
              Todas as colunas
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={mostrarAusentes} onChange={(e) => {
                  setMostrarAusentes(e.target.checked);
                  setPagina(0);
                }} />
              Incluir itens que saíram da planilha
            </label>
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-stone-100 dark:bg-slate-900 text-left text-[11px] uppercase tracking-wide text-stone-600 dark:text-slate-400">
            <tr>
              {colunas.map((col) => (
                <th
                  key={col.campo}
                  className={`border-b border-stone-200 dark:border-slate-800 px-2 pt-2 pb-1 font-semibold ${
                    col.campo === "po" ? "sticky left-0 z-20 bg-stone-100 dark:bg-slate-900" : ""
                  } ${col.tipo === "etapa" ? "text-center" : ""}`}
                >
                  {col.tipo === "foto" ? (
                    col.rotulo
                  ) : (
                    <button
                      type="button"
                      onClick={() => alternarOrdem(col.campo)}
                      className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-green-700 dark:hover:text-cyan-300"
                      title={col.tipo === "etapa" ? ETAPAS.find((e) => e.campo === col.campo)?.nome : undefined}
                    >
                      {col.rotulo}
                      <span className="text-[10px]">{ordem?.campo === col.campo ? (ordem.desc ? "▼" : "▲") : ""}</span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
            <tr>
              {colunas.map((col) => (
                <th
                  key={col.campo}
                  className={`border-b border-stone-200 dark:border-slate-800 px-1.5 pb-1.5 ${
                    col.campo === "po" ? "sticky left-0 z-20 bg-stone-100 dark:bg-slate-900" : ""
                  }`}
                >
                  {col.tipo === "etapa" ? (
                    <select
                      value={filtrosColuna[col.campo] ?? ""}
                      onChange={(e) => setFiltroColuna(col.campo, e.target.value)}
                      className={classeFiltroColuna}
                      aria-label={`Filtrar ${col.rotulo}`}
                    >
                      <option value="">Todas</option>
                      <option value="concluida">100%</option>
                      <option value="parcial">Parcial</option>
                      <option value="pendente">Pendente</option>
                    </select>
                  ) : col.tipo === "foto" ? (
                    <select
                      value={filtrosColuna.foto ?? ""}
                      onChange={(e) => setFiltroColuna("foto", e.target.value)}
                      className={classeFiltroColuna}
                      aria-label="Filtrar por foto"
                    >
                      <option value="">Todas</option>
                      <option value="com">Com</option>
                      <option value="sem">Sem</option>
                    </select>
                  ) : (
                    <input
                      value={filtrosColuna[col.campo] ?? ""}
                      onChange={(e) => setFiltroColuna(col.campo, e.target.value)}
                      placeholder="filtrar"
                      className={classeFiltroColuna}
                      aria-label={`Filtrar ${col.rotulo}`}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((item) => {
              const destaque = corDestaque(item);
              return (
                <tr
                  key={item.id}
                  onClick={() => setItemAberto(item)}
                  className={`cursor-pointer text-stone-800 dark:text-slate-200 hover:bg-green-50 dark:hover:bg-cyan-950/30 ${
                    item.presente_na_ultima_importacao ? "" : "opacity-50"
                  }`}
                >
                  {colunas.map((col) => (
                    <td
                      key={col.campo}
                      style={estiloCelula(item, col)}
                      className={`border-b border-stone-100 dark:border-slate-800/80 px-2 py-1.5 align-middle ${col.largura ?? ""} ${
                        col.campo === "po" ? "sticky left-0 z-[1] bg-white dark:bg-slate-900" : ""
                      } ${col.tipo === "etapa" ? "px-1" : ""} ${col.campo === "descricao" ? "max-w-[22rem] truncate" : ""}`}
                      title={col.campo === "descricao" ? item.descricao ?? "" : undefined}
                    >
                      {col.campo === "po" && destaque ? (
                        <span className="flex items-center gap-1.5">
                          <span className="h-4 w-1 shrink-0 rounded" style={{ backgroundColor: destaque }} />
                          {renderCelula(item, col)}
                        </span>
                      ) : (
                        renderCelula(item, col)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={colunas.length} className="px-3 py-10 text-center text-stone-500 dark:text-slate-500">
                  {carregando
                    ? "Carregando… (o servidor pode levar até 1 minuto para acordar)"
                    : itens.length === 0
                      ? "Nenhum registro — clique em “Importar / Atualizar Follow Up”."
                      : "Nenhum registro com esses filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600 dark:text-slate-400">
        <span>
          {filtrados.length === 0
            ? "0 registros"
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
            {[25, 50, 100, 200].map((n) => (
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

      {itemAberto && (
        <FollowUpDetalhe
          item={itemAberto}
          ctx={ctx}
          corBarra={corBarra}
          maxBarra={maxBarra}
          onFechar={() => setItemAberto(null)}
          onAbrirImagem={(indice) => setGaleria({ item: itemAberto, indice })}
        />
      )}

      {galeria && (
        <GaleriaImagens
          imagens={galeria.item.imagens}
          indice={galeria.indice}
          titulo={`PO ${galeria.item.po} — ${galeria.item.descricao ?? ""}`}
          onIndice={(indice) => setGaleria((g) => (g ? { ...g, indice } : g))}
          onFechar={() => setGaleria(null)}
        />
      )}
    </div>
  );
}

function Seletor({
  rotulo,
  valor,
  opcoes,
  onChange,
  dica,
}: {
  rotulo: string;
  valor: string;
  opcoes: string[];
  onChange: (v: string) => void;
  dica?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400" title={dica}>
      {rotulo}
      <select value={valor} onChange={(e) => onChange(e.target.value)} className={classeCampo}>
        <option value="">Todos</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function CampoLista({
  rotulo,
  id,
  valor,
  opcoes,
  onChange,
}: {
  rotulo: string;
  id: string;
  valor: string;
  opcoes: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
      {rotulo}
      <input list={id} value={valor} onChange={(e) => onChange(e.target.value)} placeholder="Todos" className={classeCampo} />
      <datalist id={id}>
        {opcoes.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  );
}
