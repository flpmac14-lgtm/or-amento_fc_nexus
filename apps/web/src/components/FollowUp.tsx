"use client";

// Aba FOLLOW UP — pedido explícito do usuário: módulo nativo baseado na aba
// "Gerencia" (importada uma vez do .xlsb). Agora é "filha" do Controle de
// obras: pedidos ST = A novos e os campos de PROCV (prazo, cliente, MAC...)
// chegam sozinhos a cada 15 min e são travados; os campos de
// acompanhamento (etapas, coleta, fornecedor...) são editados aqui e salvos
// na hora (ver services/calc_engine/app/follow_up_mae.py).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { baixarExcelFollowUp, editarItemFollowUp, listarFollowUp, removerImagemFollowUp, urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarMoeda, formatarNumero } from "@/lib/format";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import {
  CAMPOS_DA_MAE,
  CAMPOS_EDITAVEIS,
  ETAPAS,
  ROTULO_PRAZO,
  compararValores,
  corGrupoPintura,
  montarContextoRegras,
  normalizarBusca,
  situacaoEtapa,
  situacaoPrazo,
  type SituacaoEtapa,
  type SituacaoPrazo,
} from "@/lib/followUp";
import type { ItemFollowUp, RespostaFollowUp } from "@/lib/types";
import FollowUpDetalhe, { BarraEtapa, GaleriaImagens, SeloPrazo, SeloStatus } from "@/components/FollowUpDetalhe";
import { CelulaEditavel, IconeCadeado, valorParaEdicao } from "@/components/FollowUpEdicao";
import FollowUpAnexarImagem from "@/components/FollowUpAnexarImagem";
import FollowUpRelatorioColeta from "@/components/FollowUpRelatorioColeta";

// Os pedidos novos da Controle de obras chegam a cada 15 min no servidor.
const RECARREGAR_A_CADA_MS = 5 * 60 * 1000;

type TipoColuna = "foto" | "codigo" | "texto" | "numero" | "prazo" | "etapa" | "status" | "coleta" | "moeda" | "peso";

interface Coluna {
  campo: keyof ItemFollowUp | "foto";
  rotulo: string;
  tipo: TipoColuna;
  principal: boolean;
  largura?: string;
  // Coluna estreita (rótulo curto, filtro pequeno) — pedido do usuário: Cliente e
  // Qtd menores pra caber o avanço das etapas na tela cheia.
  curto?: string;
  // Largura máxima (corta o texto e mostra inteiro ao passar o mouse) —
  // pedido do usuário: MAC e Desenho menores também.
  maxW?: string;
  centro?: boolean;
}

const COLUNAS: Coluna[] = [
  { campo: "foto", rotulo: "Foto", tipo: "foto", principal: true },
  { campo: "po", rotulo: "PO", tipo: "codigo", principal: true },
  { campo: "prazo_contratual", rotulo: "Prazo", tipo: "prazo", principal: true },
  { campo: "cliente", rotulo: "Cliente", tipo: "texto", principal: true, curto: "Cli", centro: true },
  { campo: "quantidade", rotulo: "Qtd", tipo: "numero", principal: true, curto: "Qtd", centro: true },
  { campo: "mac", rotulo: "MAC", tipo: "codigo", principal: true, curto: "MAC", maxW: "max-w-[5.5rem]" },
  { campo: "desenho", rotulo: "Desenho", tipo: "codigo", principal: true, curto: "Des.", maxW: "max-w-[6.5rem]" },
  { campo: "descricao", rotulo: "Descrição", tipo: "texto", principal: true, largura: "min-w-[16rem]" },
  ...ETAPAS.map((e) => ({ campo: e.campo, rotulo: e.rotulo, tipo: "etapa" as const, principal: true })),
  { campo: "coleta", rotulo: "Coleta", tipo: "coleta", principal: true },
  // Pedido do usuário: Obs. Felipe/Marcelo logo depois da Coleta, sempre visível.
  { campo: "obs_felipe_marcelo", rotulo: "Obs. Felipe / Marcelo", tipo: "texto", principal: true, maxW: "max-w-[12rem]" },
  { campo: "status", rotulo: "Status", tipo: "status", principal: true },
  // Colunas de pintura sempre visíveis — pedido do usuário. Plano de pintura é
  // longo: corta e mostra inteiro ao passar o mouse.
  { campo: "cor2", rotulo: "COR2", tipo: "texto", principal: true },
  { campo: "cor_2", rotulo: "COR-2", tipo: "texto", principal: true },
  { campo: "plano_pintura", rotulo: "Plano de pintura", tipo: "texto", principal: true, maxW: "max-w-[16rem]" },
  { campo: "fornecedor", rotulo: "Fornecedor", tipo: "texto", principal: false },
  { campo: "orcamento_terceirizado_unid", rotulo: "Orç. terceirizado unid", tipo: "moeda", principal: false },
  { campo: "orcamento_custo_macfab_unid", rotulo: "Custo Macfab unid", tipo: "moeda", principal: false },
  { campo: "obs_alisson", rotulo: "Obs. Alisson", tipo: "texto", principal: false, largura: "min-w-[14rem]" },
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
  pintura: string; // número do grupo de pintura
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
  pintura: "",
};
// Pedido do usuário: sempre ordenado pelo prazo, do mais próximo ao mais
// adiante (sem prazo no fim).
const ORDEM_PADRAO: { campo: Coluna["campo"]; desc: boolean } = { campo: "prazo_contratual", desc: false };
const FILTROS_VAZIOS: Filtros = { ...FILTROS_PADRAO, st: "" };

const classeCampo =
  "w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500";
const classeFiltroColuna =
  "w-full min-w-[4rem] rounded border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs font-normal normal-case tracking-normal text-stone-800 dark:text-slate-200 outline-none focus:border-green-600 dark:focus:border-cyan-500";

// Colunas congeladas na rolagem horizontal: Foto e PO — pedido do usuário.
// Foto tem largura fixa (4rem = miniatura 3rem + padding) pra o PO encostar nela.
function fixa(campo: Coluna["campo"], fundo: string): string {
  if (campo === "foto") return `sticky left-0 w-16 min-w-16 max-w-16 ${fundo}`;
  if (campo === "po") return `sticky left-16 ${fundo}`;
  return "";
}

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

// telaCheia: modo "só os dados" (ver ModuloFollowUp) — some o texto do topo e os indicadores.
// alvoCards: lugar no topo (ao lado das abas, na tela cheia) onde vão os cards
// de ativos e de cada cliente.
export default function FollowUp({
  telaCheia = false,
  alvoCards = null,
}: {
  telaCheia?: boolean;
  alvoCards?: HTMLElement | null;
}) {
  const [dados, setDados] = useState<RespostaFollowUp | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [editadoPor, setEditadoPor] = useState<string | null>(null);

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [filtrosColuna, setFiltrosColuna] = useState<Record<string, string>>({});
  const [ordem, setOrdem] = useState<{ campo: Coluna["campo"]; desc: boolean } | null>(ORDEM_PADRAO);
  const [todasColunas, setTodasColunas] = useState(false);
  const [mostrarAusentes, setMostrarAusentes] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const [itemAberto, setItemAberto] = useState<ItemFollowUp | null>(null);
  const [galeria, setGaleria] = useState<{ item: ItemFollowUp; indice: number } | null>(null);
  // Janela "colar imagem" (coluna Foto) — item que vai receber a imagem.
  const [anexarPara, setAnexarPara] = useState<ItemFollowUp | null>(null);
  const [exportando, setExportando] = useState(false);
  const [relatorioColeta, setRelatorioColeta] = useState(false);
  // "Salvar tudo" — pedido do usuário: mesmo com cada campo salvando sozinho,
  // um botão que confirma tudo (fecha o campo em edição, espera os envios em
  // andamento, recarrega do servidor e avisa se algo não salvou).
  const pendentes = useRef(new Set<Promise<unknown>>());
  const falhas = useRef(new Set<string>());
  const [salvandoTudo, setSalvandoTudo] = useState(false);
  const [avisoSalvo, setAvisoSalvo] = useState<{ ok: boolean; texto: string } | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    setErro("");
    listarFollowUp()
      .then(setDados)
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    // Carga inicial (carregando já começa true) + recarga periódica — só
    // atualiza estado no retorno. Campo em edição não se perde: cada célula
    // guarda o próprio rascunho.
    let ativo = true;
    function buscar() {
      listarFollowUp()
        .then((r) => ativo && setDados(r))
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

  // Salva um campo de acompanhamento e troca o item pelo que o servidor
  // devolveu (Status recalculado lá, com a mesma fórmula da planilha).
  // Troca o item em todo lugar em que aparece (lista, painel, galeria).
  const aplicarItem = useCallback((atualizado: ItemFollowUp) => {
    setDados((d) => (d ? { ...d, itens: d.itens.map((i) => (i.id === atualizado.id ? atualizado : i)) } : d));
    setItemAberto((aberto) => (aberto?.id === atualizado.id ? atualizado : aberto));
    setGaleria((g) => {
      if (!g || g.item.id !== atualizado.id) return g;
      if (atualizado.imagens.length === 0) return null;
      return { item: atualizado, indice: Math.min(g.indice, atualizado.imagens.length - 1) };
    });
  }, []);

  const salvarCampo = useCallback(
    async (item: ItemFollowUp, campo: string, valor: string) => {
      const chave = `PO ${item.po} — ${campo}`;
      const envio = editarItemFollowUp(item.id, { [campo]: valor }, editadoPor);
      pendentes.current.add(envio);
      setAvisoSalvo(null);
      try {
        aplicarItem(await envio);
        falhas.current.delete(chave);
      } catch (e) {
        falhas.current.add(chave);
        throw e;
      } finally {
        pendentes.current.delete(envio);
      }
    },
    [editadoPor, aplicarItem],
  );

  async function salvarTudo() {
    setSalvandoTudo(true);
    setAvisoSalvo(null);
    // Tira o foco do campo em edição: o onBlur dele dispara o envio.
    (document.activeElement as HTMLElement | null)?.blur?.();
    await new Promise((r) => setTimeout(r, 50));
    await Promise.allSettled([...pendentes.current]);
    try {
      setDados(await listarFollowUp());
      const hora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      setAvisoSalvo(
        falhas.current.size === 0
          ? { ok: true, texto: `✓ Tudo salvo — ${hora}` }
          : { ok: false, texto: `${falhas.current.size} campo(s) não salvaram: ${[...falhas.current].join("; ")}` },
      );
    } catch (e) {
      setAvisoSalvo({ ok: false, texto: `Não consegui confirmar com o servidor: ${(e as Error).message}` });
    } finally {
      setSalvandoTudo(false);
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
    }),
    [base],
  );

  // Grupos de pintura com 2+ pedidos na lista — só esses ganham cor e botão.
  const gruposPintura = useMemo(() => {
    const m = new Map<number, { indice: number; n: number; exemplo: ItemFollowUp }>();
    for (const i of base) {
      if (!i.grupo_pintura) continue;
      const g = m.get(i.grupo_pintura);
      if (g) g.n++;
      else m.set(i.grupo_pintura, { indice: i.grupo_pintura, n: 1, exemplo: i });
    }
    return [...m.values()].filter((g) => g.n >= 2).sort((a, b) => b.n - a.n || a.indice - b.indice);
  }, [base]);
  const coresGrupo = useMemo(
    () => new Map(gruposPintura.map((g) => [g.indice, corGrupoPintura(g.indice)])),
    [gruposPintura],
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
      if (filtros.pintura && String(i.grupo_pintura ?? "") !== filtros.pintura) return false;
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
          // Pedido do usuário: achar as coletas vazias pra marcar a data.
          const vazia = !(i.coleta ?? "").trim() && !i.coleta_data;
          if ((termo === "vazia") !== vazia) return false;
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

  // Cards do topo — pedido do usuário: quantos ativos (ST = A) e um card por
  // cliente. Contam todos os ativos, sem os filtros; clicar filtra o cliente.
  const ativosPorCliente = useMemo(() => {
    const ativos = base.filter((i) => i.st === "A");
    const m = new Map<string, number>();
    for (const i of ativos) m.set(i.cliente ?? "—", (m.get(i.cliente ?? "—") ?? 0) + 1);
    return { total: ativos.length, clientes: [...m.entries()].sort((a, b) => b[1] - a[1]) };
  }, [base]);

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

  // Excel com o que está na tela: mesmos filtros e ordem (todas as páginas).
  async function exportarExcel() {
    setExportando(true);
    setErro("");
    try {
      await baixarExcelFollowUp(filtrados.map((i) => i.id));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setExportando(false);
    }
  }

  function alternarOrdem(campo: Coluna["campo"]) {
    // Terceiro clique volta pro padrão (prazo, do mais próximo ao mais adiante).
    setOrdem((o) => (o?.campo !== campo ? { campo, desc: false } : o.desc ? ORDEM_PADRAO : { campo, desc: true }));
    setPagina(0);
  }

  function renderCelula(item: ItemFollowUp, col: Coluna) {
    const tipoEdicao = CAMPOS_EDITAVEIS[col.campo];
    if (!tipoEdicao) return renderValor(item, col);
    const bruto = col.campo === "coleta" ? item.coleta : (item[col.campo as keyof ItemFollowUp] as number | string | null);
    return (
      <CelulaEditavel
        valor={valorParaEdicao(bruto, tipoEdicao)}
        tipo={tipoEdicao}
        exibicao={
          bruto === null || bruto === "" ? (
            col.tipo === "etapa" ? (
              renderValor(item, col)
            ) : (
              <span className="text-xs text-stone-300 dark:text-slate-600">+</span>
            )
          ) : (
            renderValor(item, col)
          )
        }
        salvar={(v) => salvarCampo(item, col.campo, v)}
      />
    );
  }

  function renderValor(item: ItemFollowUp, col: Coluna) {
    switch (col.tipo) {
      case "foto": {
        const primeira = item.imagens[0];
        if (!primeira)
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAnexarPara(item);
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              title="Anexar imagem — cole com Ctrl+V"
              className="flex h-10 w-12 items-center justify-center rounded border border-dashed border-stone-300 dark:border-slate-700 text-lg text-stone-400 dark:text-slate-500 hover:border-green-600 hover:text-green-600 dark:hover:border-cyan-500 dark:hover:text-cyan-400"
            >
              +
            </button>
          );
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setGaleria({ item, indice: 0 });
            }}
            onDoubleClick={(e) => e.stopPropagation()}
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
        return <SeloStatus item={item} ctx={ctx} compacto />;
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

  // Só as colunas de pintura ganham cor: a do grupo (mesmo Plano + COR2 +
  // COR-2) — as cores da planilha foram tiradas a pedido do usuário.
  function estiloCelula(item: ItemFollowUp, col: Coluna): React.CSSProperties | undefined {
    if (col.campo !== "cor2" && col.campo !== "cor_2" && col.campo !== "plano_pintura") return undefined;
    const cor = item.grupo_pintura ? coresGrupo.get(item.grupo_pintura) : undefined;
    if (!cor) return undefined;
    // Via sombra interna (e não background), igual antes: tom suave, legível
    // nos dois temas.
    return { boxShadow: `inset 0 0 0 999px color-mix(in srgb, ${cor} 40%, transparent)` };
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Cabeçalho da aba: de onde vêm os dados + o que é editável */}
      <div className={`${telaCheia ? "hidden" : "flex"} flex-wrap items-start justify-between gap-3 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4`}>
        <div>
          <h2 className="text-lg font-bold text-stone-900 dark:text-white">Follow up de obras</h2>
          <p className="mt-0.5 text-sm text-stone-600 dark:text-slate-400">
            Pedidos novos com ST = A da <strong>Controle de obras</strong> entram sozinhos (a cada 15 min), junto com os
            campos que vêm por PROCV <IconeCadeado /> — esses não são editáveis. Etapas, coleta, fornecedor, orçamentos,
            obs. Felipe/Marcelo e preço previsto: clique na célula para editar; salva sozinho. Dois cliques na linha abrem o card do item.
          </p>
        </div>
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-stone-700 dark:text-slate-300 hover:border-green-600/50 dark:hover:border-cyan-500/50 disabled:opacity-50"
        >
          Recarregar
        </button>
      </div>

      {erro && (
        <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
          {erro}
        </div>
      )}

      {alvoCards &&
        createPortal(
          <>
            <button
              type="button"
              onClick={() => setFiltro("cliente", "")}
              title="Pedidos ativos (ST = A) — clique para ver todos os clientes"
              className={`rounded-lg border px-2.5 py-1 text-left leading-tight border-green-600/50 bg-white dark:border-cyan-500/50 dark:bg-slate-900`}
            >
              <span className="block text-[10px] font-medium uppercase tracking-wide text-stone-500 dark:text-slate-400">Ativos</span>
              <span className="font-mono text-lg font-bold text-green-700 dark:text-cyan-300">{ativosPorCliente.total}</span>
            </button>
            {ativosPorCliente.clientes.map(([cliente, n]) => {
              const ativo = filtros.cliente === cliente;
              return (
                <button
                  key={cliente}
                  type="button"
                  onClick={() => setFiltro("cliente", ativo || cliente === "—" ? "" : cliente)}
                  title={`${n} pedidos ativos de ${cliente} — clique para filtrar`}
                  className={`rounded-lg border px-2.5 py-1 text-left leading-tight ${
                    ativo
                      ? "border-green-600 bg-green-50 dark:border-cyan-400 dark:bg-cyan-950/40"
                      : "border-stone-200 bg-white hover:border-green-600/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-500/50"
                  }`}
                >
                  <span className="block max-w-[7rem] truncate text-[10px] font-medium uppercase tracking-wide text-stone-500 dark:text-slate-400">
                    {cliente}
                  </span>
                  <span className="font-mono text-lg font-bold text-stone-900 dark:text-white">{n}</span>
                </button>
              );
            })}
          </>,
          alvoCards,
        )}

      {/* Indicadores — recalculados sobre os registros filtrados */}
      <div className={`${telaCheia ? "hidden" : "grid"} grid-cols-2 gap-3 lg:grid-cols-5`}>
        <div className="col-span-2 rounded-lg border border-green-600/30 dark:border-cyan-500/30 bg-white dark:bg-slate-900/40 p-3 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">Peso total</p>
          <p className="font-mono text-2xl font-bold text-green-700 dark:text-cyan-300">
            {formatarNumero(indicadores.peso, 2)} <span className="text-sm font-normal">kg</span>
          </p>
          <p className="text-[11px] text-stone-500 dark:text-slate-500">dos registros filtrados</p>
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
          <button
            type="button"
            onClick={exportarExcel}
            disabled={exportando || filtrados.length === 0}
            title="Baixa em Excel os registros filtrados (todas as páginas e colunas), com a foto de cada pedido"
            className="rounded-lg border border-green-600/60 dark:border-cyan-500/60 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-cyan-300 hover:bg-green-50 dark:hover:bg-cyan-950/30 disabled:opacity-40"
          >
            {exportando ? "Gerando Excel…" : `Exportar Excel (${filtrados.length})`}
          </button>
          <button
            type="button"
            onClick={() => setRelatorioColeta(true)}
            disabled={itens.length === 0}
            title="Relatório dos pedidos de um cliente com coleta numa data — A4 paisagem, agrupado por pintura"
            className="rounded-lg border border-green-600/60 dark:border-cyan-500/60 px-3 py-1.5 text-sm font-medium text-green-700 dark:text-cyan-300 hover:bg-green-50 dark:hover:bg-cyan-950/30 disabled:opacity-40"
          >
            Relatório de coleta
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
          {avisoSalvo && (
            <span
              className={`text-sm ${avisoSalvo.ok ? "text-green-700 dark:text-cyan-300" : "text-red-600 dark:text-red-400"}`}
            >
              {avisoSalvo.texto}
            </span>
          )}
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
        {gruposPintura.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-stone-500 dark:text-slate-400">
            <span>
              Pintura igual (mesmo plano + COR2 + COR-2) — clique para filtrar o grupo
              {filtros.pintura && (
                <button
                  type="button"
                  onClick={() => setFiltro("pintura", "")}
                  className="ml-2 text-green-700 underline dark:text-cyan-300"
                >
                  mostrar todos
                </button>
              )}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {gruposPintura.map((g) => {
                const ativo = filtros.pintura === String(g.indice);
                const e = g.exemplo;
                return (
                  <button
                    key={g.indice}
                    type="button"
                    onClick={() => setFiltro("pintura", ativo ? "" : String(g.indice))}
                    className={`h-6 min-w-7 rounded border-2 px-1 font-mono text-[11px] font-bold text-black/75 ${
                      ativo ? "border-stone-900 dark:border-white" : "border-transparent"
                    } ${filtros.pintura && !ativo ? "opacity-40" : ""}`}
                    style={{ backgroundColor: coresGrupo.get(g.indice) }}
                    title={`${g.n} pedidos
COR2: ${e.cor2 ?? "—"}
COR-2: ${e.cor_2 ?? "—"}
Plano: ${e.plano_pintura ?? "—"}`}
                  >
                    {g.n}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
      <div className={`${telaCheia ? "max-h-[calc(100vh-9.5rem)]" : "max-h-[70vh]"} overflow-auto rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40`}>
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-stone-100 dark:bg-slate-900 text-left text-[11px] uppercase tracking-wide text-stone-600 dark:text-slate-400">
            <tr>
              {colunas.map((col) => (
                <th
                  key={col.campo}
                  className={`border-b border-stone-200 dark:border-slate-800 ${col.curto ? "px-1" : "px-2"} pt-2 pb-1 font-semibold ${
                    fixa(col.campo, "z-20 bg-stone-100 dark:bg-slate-900")
                  } ${col.tipo === "etapa" ? "text-center" : ""}`}
                >
                  {col.tipo === "foto" ? (
                    col.rotulo
                  ) : (
                    <button
                      type="button"
                      onClick={() => alternarOrdem(col.campo)}
                      className="inline-flex items-center gap-1 whitespace-nowrap uppercase hover:text-green-700 dark:hover:text-cyan-300"
                      title={
                        CAMPOS_DA_MAE.has(col.campo)
                          ? `${col.rotulo} — vem da Controle de obras (PROCV pelo PO), não editável`
                          : col.tipo === "etapa"
                            ? `${ETAPAS.find((e) => e.campo === col.campo)?.nome} — clique na célula para editar`
                            : CAMPOS_EDITAVEIS[col.campo]
                              ? "Clique na célula para editar"
                              : undefined
                      }
                    >
                      {col.curto ?? col.rotulo}
                      {CAMPOS_DA_MAE.has(col.campo) && !col.curto && <IconeCadeado />}
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
                  className={`border-b border-stone-200 dark:border-slate-800 ${col.curto ? "px-0.5" : "px-1.5"} pb-1.5 ${
                    fixa(col.campo, "z-20 bg-stone-100 dark:bg-slate-900")
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
                  ) : col.tipo === "coleta" ? (
                    <select
                      value={filtrosColuna.coleta ?? ""}
                      onChange={(e) => setFiltroColuna("coleta", e.target.value)}
                      className={classeFiltroColuna}
                      aria-label="Filtrar coleta"
                    >
                      <option value="">Todas</option>
                      <option value="vazia">Vazias</option>
                      <option value="preenchida">Preenchidas</option>
                    </select>
                  ) : col.tipo === "foto" ? (
                    <select
                      value={filtrosColuna.foto ?? ""}
                      onChange={(e) => setFiltroColuna("foto", e.target.value)}
                      className={`${classeFiltroColuna} !min-w-0 !px-0.5`}
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
                      placeholder={col.curto ? "" : "filtrar"}
                      className={col.curto ? `${classeFiltroColuna} ${col.centro ? "!w-9" : "!w-16"} !min-w-0 !px-1` : classeFiltroColuna}
                      aria-label={`Filtrar ${col.rotulo}`}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((item) => {
              const destaque = item.grupo_pintura ? coresGrupo.get(item.grupo_pintura) : undefined;
              return (
                <tr
                  key={item.id}
                  // Pedido do usuário: 1 clique edita a célula; o card do item só com 2 cliques.
                  onDoubleClick={() => setItemAberto(item)}
                  title="Dois cliques para abrir o card do item"
                  className={`cursor-pointer text-stone-800 dark:text-slate-200 hover:bg-green-50 dark:hover:bg-cyan-950/30 ${
                    item.presente_na_ultima_importacao ? "" : "opacity-50"
                  }`}
                >
                  {colunas.map((col) => (
                    <td
                      key={col.campo}
                      style={estiloCelula(item, col)}
                      className={`border-b border-stone-100 dark:border-slate-800/80 ${col.tipo === "etapa" || col.curto ? "px-1" : "px-2"} py-1.5 align-middle ${col.largura ?? ""} ${
                        fixa(col.campo, "z-[1] bg-white dark:bg-slate-900")
                      } ${col.curto ? "whitespace-nowrap" : ""} ${col.centro ? "text-center" : ""} ${col.maxW ? `${col.maxW} truncate` : ""} ${col.campo === "descricao" ? "max-w-[22rem] truncate" : ""}`}
                      title={
                        col.campo === "descricao"
                          ? item.descricao ?? ""
                          : col.maxW
                            ? String(item[col.campo as keyof ItemFollowUp] ?? "")
                            : undefined
                      }
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
          onSalvarCampo={(campo, valor) => salvarCampo(itemAberto, campo, valor)}
          onAnexarImagem={() => setAnexarPara(itemAberto)}
          autor={editadoPor}
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
          onAdicionar={() => setAnexarPara(galeria.item)}
          onRemover={async (img) => aplicarItem(await removerImagemFollowUp(img.id, editadoPor))}
        />
      )}

      {relatorioColeta && <FollowUpRelatorioColeta itens={itens} onFechar={() => setRelatorioColeta(false)} />}

      {anexarPara && (
        <FollowUpAnexarImagem
          item={anexarPara}
          enviadaPor={editadoPor}
          onEnviada={(atualizado) => {
            aplicarItem(atualizado);
            // Se a galeria estava aberta nesse item, mostra a imagem nova (última).
            setGaleria((g) =>
              g && g.item.id === atualizado.id ? { item: atualizado, indice: atualizado.imagens.length - 1 } : g,
            );
          }}
          onFechar={() => setAnexarPara(null)}
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
