"use client";

import { useEffect, useState } from "react";
import { urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { CampoEditavel, IconeCadeado, valorParaEdicao } from "@/components/FollowUpEdicao";
import FollowUpRegistros from "@/components/FollowUpRegistros";
import {
  CAMPOS_EDITAVEIS,
  ETAPAS,
  ROTULO_PRAZO,
  corGrupoPintura,
  corTextoSobre,
  diasParaPrazo,
  situacaoEtapa,
  situacaoPrazo,
  type ContextoRegras,
  corCondicional,
} from "@/lib/followUp";
import type { ImagemFollowUp, ItemFollowUp } from "@/lib/types";

// --- Peças visuais compartilhadas com a tabela --------------------------------

export function BarraEtapa({
  valor,
  cor,
  max = 100,
  compacta = false,
}: {
  valor: number | null;
  cor: string;
  max?: number;
  compacta?: boolean;
}) {
  const situacao = situacaoEtapa(valor);
  const pct = valor === null ? 0 : Math.max(0, Math.min(100, (valor / (max || 100)) * 100));
  const texto = valor === null ? "—" : `${formatarNumero(valor, Number.isInteger(valor) ? 0 : 1)}%`;
  return (
    <div
      className={`relative overflow-hidden rounded ${compacta ? "h-6 min-w-[3.25rem]" : "h-7 w-full"} ${
        situacao === "pendente"
          ? "bg-stone-100 dark:bg-slate-800/70"
          : "bg-stone-100 dark:bg-slate-800"
      }`}
      title={situacao === "concluida" ? "Concluída" : situacao === "parcial" ? `Em andamento (${texto})` : "Pendente"}
    >
      {pct > 0 && <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, backgroundColor: cor }} />}
      <span
        className={`relative flex h-full items-center justify-center gap-1 text-xs font-semibold ${
          situacao === "pendente"
            ? "text-stone-400 dark:text-slate-500"
            : situacao === "concluida"
              ? "text-white"
              : "text-stone-900 dark:text-white"
        }`}
      >
        {situacao === "concluida" && (
          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.4">
            <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {texto}
      </span>
    </div>
  );
}

const ESTILO_PRAZO: Record<string, string> = {
  atrasado: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/40",
  hoje: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/40",
  proximo: "bg-amber-400/20 text-amber-800 dark:text-amber-300 border-amber-500/40",
  no_prazo: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  sem_prazo: "bg-stone-400/10 text-stone-500 dark:text-slate-400 border-stone-400/30",
};

export function SeloPrazo({ prazo, compacto = false }: { prazo: string | null; compacto?: boolean }) {
  const s = situacaoPrazo(prazo);
  const dias = diasParaPrazo(prazo);
  const detalhe =
    dias === null ? "" : dias < 0 ? `${-dias} dia(s) de atraso` : dias === 0 ? "vence hoje" : `faltam ${dias} dia(s)`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${ESTILO_PRAZO[s]}`}
      title={`${ROTULO_PRAZO[s]}${detalhe ? ` — ${detalhe}` : ""}`}
    >
      <span className="font-mono">{prazo ? formatarDataBr(prazo) : "—"}</span>
      {!compacto && prazo && <span className="opacity-80">· {ROTULO_PRAZO[s]}</span>}
    </span>
  );
}

// compacto: na tabela — corta o texto longo ("Falta Montagem, Solda...") e mostra inteiro ao passar o mouse.
export function SeloStatus({ item, ctx, compacto = false }: { item: ItemFollowUp; ctx: ContextoRegras; compacto?: boolean }) {
  const corte = compacto ? " max-w-[8.5rem] truncate align-middle" : "";
  const cond = corCondicional(ctx, item, "status");
  if (!item.status) return <span className="text-stone-400 dark:text-slate-600">—</span>;
  if (cond?.fundo) {
    return (
      <span
        className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold${corte}`}
        title={compacto ? item.status : undefined}
        style={{ backgroundColor: cond.fundo, color: cond.fonte ?? corTextoSobre(cond.fundo) }}
      >
        {item.status}
      </span>
    );
  }
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border border-stone-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-0.5 text-xs font-semibold text-stone-800 dark:text-slate-200${corte}`}
      title={compacto ? item.status : undefined}
    >
      {item.status}
    </span>
  );
}

// --- Galeria -----------------------------------------------------------------

export function GaleriaImagens({
  imagens,
  indice,
  titulo,
  onIndice,
  onFechar,
  onAdicionar,
  onRemover,
}: {
  imagens: ImagemFollowUp[];
  indice: number;
  titulo: string;
  onIndice: (i: number) => void;
  onFechar: () => void;
  onAdicionar?: () => void; // abre a janela de colar/escolher imagem
  onRemover?: (imagem: ImagemFollowUp) => Promise<void>; // só imagem enviada pelo app
}) {
  const atual = imagens[indice];
  const [removendo, setRemovendo] = useState(false);
  const [erroRemover, setErroRemover] = useState("");
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      // Esc com a janela de anexar aberta por cima fecha só ela.
      if (e.key === "Escape" && !document.querySelector(".z-\\[70\\]")) onFechar();
      if (e.key === "ArrowRight" && imagens.length > 1) onIndice((indice + 1) % imagens.length);
      if (e.key === "ArrowLeft" && imagens.length > 1) onIndice((indice - 1 + imagens.length) % imagens.length);
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [indice, imagens.length, onFechar, onIndice]);
  if (!atual) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={onFechar}>
      <div
        className="flex max-h-full w-full max-w-4xl flex-col gap-3 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-semibold text-stone-800 dark:text-slate-200">{titulo}</p>
          <div className="flex items-center gap-3 text-xs text-stone-500 dark:text-slate-400">
            {onAdicionar && (
              <button
                type="button"
                onClick={onAdicionar}
                className="rounded border border-green-600/50 dark:border-cyan-500/50 px-2 py-1 text-green-700 dark:text-cyan-300 hover:bg-green-600/10 dark:hover:bg-cyan-500/10"
              >
                + Adicionar imagem
              </button>
            )}
            {onRemover && atual.origem === "enviada_app" && (
              <button
                type="button"
                disabled={removendo}
                onClick={async () => {
                  setRemovendo(true);
                  setErroRemover("");
                  try {
                    await onRemover(atual);
                  } catch (e) {
                    setErroRemover((e as Error).message);
                  } finally {
                    setRemovendo(false);
                  }
                }}
                className="rounded border border-red-400/50 px-2 py-1 text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                {removendo ? "Removendo…" : "Remover esta"}
              </button>
            )}
            {imagens.length > 1 && (
              <span>
                {indice + 1} de {imagens.length}
              </span>
            )}
            <button
              type="button"
              onClick={onFechar}
              className="rounded border border-stone-300 dark:border-slate-700 px-2 py-1 hover:border-red-400"
            >
              Fechar
            </button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2">
          {imagens.length > 1 && (
            <button
              type="button"
              onClick={() => onIndice((indice - 1 + imagens.length) % imagens.length)}
              className="rounded-full border border-stone-300 dark:border-slate-700 px-3 py-2 text-lg hover:border-green-600 dark:hover:border-cyan-500"
              aria-label="Imagem anterior"
            >
              ‹
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem vem do calc_engine, fora do next/image */}
          <img
            src={urlImagemFollowUp(atual.sha256)}
            alt={titulo}
            className="max-h-[70vh] min-w-0 max-w-full rounded bg-white object-contain"
          />
          {imagens.length > 1 && (
            <button
              type="button"
              onClick={() => onIndice((indice + 1) % imagens.length)}
              className="rounded-full border border-stone-300 dark:border-slate-700 px-3 py-2 text-lg hover:border-green-600 dark:hover:border-cyan-500"
              aria-label="Próxima imagem"
            >
              ›
            </button>
          )}
        </div>
        <p className="text-center text-xs text-stone-500 dark:text-slate-500">
          {atual.origem === "enviada_app"
            ? "Adicionada pelo app"
            : atual.origem === "imagem_na_celula"
              ? "Imagem dentro da célula"
              : "Imagem flutuante"}{" "}
          {atual.celula ?? ""}
          {atual.largura && atual.altura ? ` · ${atual.largura}×${atual.altura}px` : ""}
        </p>
        {erroRemover && <p className="text-center text-xs text-red-600 dark:text-red-400">{erroRemover}</p>}
        {imagens.length > 1 && (
          <div className="flex justify-center gap-2 overflow-x-auto">
            {imagens.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onIndice(i)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded border-2 bg-white ${
                  i === indice ? "border-green-600 dark:border-cyan-400" : "border-transparent opacity-70"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urlImagemFollowUp(img.sha256)} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Detalhe do registro -------------------------------------------------------

function Campo({
  rotulo,
  children,
  largo = false,
  mae = false,
}: {
  rotulo: string;
  children: React.ReactNode;
  largo?: boolean;
  mae?: boolean; // vem da Controle de obras (PROCV) — não editável
}) {
  return (
    <div className={largo ? "sm:col-span-2" : ""}>
      <dt
        className="text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500"
        title={mae ? "Vem da Controle de obras (PROCV pelo PO) — não editável" : undefined}
      >
        {rotulo} {mae && <IconeCadeado />}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-stone-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-stone-200 dark:border-slate-800 p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-green-700 dark:text-cyan-400">{titulo}</h3>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

const vazio = <span className="text-stone-400 dark:text-slate-600">—</span>;

function texto(v: string | null | undefined) {
  return v === null || v === undefined || v === "" ? vazio : v;
}

export default function FollowUpDetalhe({
  item,
  ctx,
  corBarra,
  maxBarra,
  onFechar,
  onAbrirImagem,
  onSalvarCampo,
  onAnexarImagem,
  onRelatorioObra,
  autor,
}: {
  item: ItemFollowUp;
  ctx: ContextoRegras;
  corBarra: string;
  maxBarra: number;
  onFechar: () => void;
  onAbrirImagem: (indice: number) => void;
  onSalvarCampo: (campo: string, valor: string) => Promise<void>;
  onAnexarImagem: () => void;
  onRelatorioObra: () => void; // relatório da obra do item (por PO ou MAC)
  autor: string | null; // login de quem está usando (registro diário)
}) {
  // Campo de acompanhamento: sempre editável aqui, salva sozinho.
  const editavel = (campo: keyof ItemFollowUp, longo = false) => {
    const tipo = CAMPOS_EDITAVEIS[campo as string];
    return (
      <CampoEditavel
        key={`${item.id}-${String(campo)}`}
        valor={valorParaEdicao(item[campo] as string | number | null, tipo)}
        tipo={tipo}
        longo={longo}
        salvar={(v) => onSalvarCampo(campo as string, v)}
      />
    );
  };
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      // Galeria / janela de anexar abertas por cima: Esc fecha só elas.
      if (e.key === "Escape" && !document.querySelector(".z-\\[60\\], .z-\\[70\\]")) onFechar();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);


  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onFechar}>
      <aside
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-500 dark:text-slate-500">
              PO · linha {item.linha_planilha} da planilha
            </p>
            <h2 className="font-mono text-xl font-bold text-stone-900 dark:text-white">{item.po}</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{item.descricao}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <SeloStatus item={item} ctx={ctx} />
              <SeloPrazo prazo={item.prazo_contratual} />
              {!item.presente_na_ultima_importacao && (
                <span className="rounded border border-stone-400/40 px-2 py-0.5 text-xs text-stone-500 dark:text-slate-400">
                  Saiu da planilha na última importação
                </span>
              )}
              {item.oculta_na_planilha && (
                <span className="rounded border border-stone-400/40 px-2 py-0.5 text-xs text-stone-500 dark:text-slate-400">
                  Linha oculta na planilha (segmentação)
                </span>
              )}
              {item.grupo_pintura && (
                <span className="inline-flex items-center gap-1 text-xs text-stone-500 dark:text-slate-400">
                  <span
                    className="h-3 w-3 rounded-sm border border-black/10"
                    style={{ backgroundColor: corGrupoPintura(item.grupo_pintura) }}
                  />
                  Grupo de pintura {item.grupo_pintura}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onRelatorioObra}
              title="Resumo de toda a obra deste item (por PO ou por MAC) numa folha A4"
              className="inline-flex items-center gap-1.5 rounded border border-green-600/50 dark:border-cyan-500/50 px-3 py-1 text-sm text-green-700 dark:text-cyan-300 hover:bg-green-600/10 dark:hover:bg-cyan-500/10"
            >
              Relatório da obra
            </button>
            <button
              type="button"
              onClick={() => window.open(`/follow-up/relatorio/${item.id}`, "_blank")}
              title="Relatório completo do item (imprimir ou salvar em PDF)"
              className="inline-flex items-center gap-1.5 rounded border border-green-600/50 dark:border-cyan-500/50 px-3 py-1 text-sm text-green-700 dark:text-cyan-300 hover:bg-green-600/10 dark:hover:bg-cyan-500/10"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d="M5 2.5h7l3.5 3.5v11.5H5z" strokeLinejoin="round" />
                <path d="M12 2.5V6h3.5M7.5 10h5M7.5 13h5" strokeLinecap="round" />
              </svg>
              Relatório
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="rounded border border-stone-300 dark:border-slate-700 px-3 py-1 text-sm text-stone-600 dark:text-slate-300 hover:border-red-400"
            >
              Fechar
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <FollowUpRegistros key={item.id} itemId={item.id} autor={autor} />

          <Secao titulo="Identificação">
            <Campo rotulo="PO">
              <span className="font-mono">{item.po}</span>
            </Campo>
            <Campo rotulo="Cliente" mae>
              {texto(item.cliente)}
            </Campo>
            <Campo rotulo="MAC" mae>
              <span className="font-mono">{texto(item.mac)}</span>
            </Campo>
            <Campo rotulo="Desenho" mae>
              <span className="font-mono">{texto(item.desenho)}</span>
            </Campo>
            <Campo rotulo="Descrição" largo mae>
              {texto(item.descricao)}
            </Campo>
            <Campo rotulo="Quantidade" mae>
              {item.quantidade ?? vazio}
            </Campo>
          </Secao>

          <Secao titulo="Prazo">
            <Campo rotulo="Prazo contratual" mae>
              <SeloPrazo prazo={item.prazo_contratual} />
            </Campo>
            <Campo rotulo="Coleta">{editavel("coleta")}</Campo>
            <Campo rotulo="Status" largo>
              <SeloStatus item={item} ctx={ctx} />
              <span className="ml-2 text-[11px] text-stone-500 dark:text-slate-500">
                calculado pelas etapas (mesma fórmula da planilha)
              </span>
            </Campo>
          </Secao>

          <section className="rounded-lg border border-stone-200 dark:border-slate-800 p-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-green-700 dark:text-cyan-400">Produção</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ETAPAS.map((e) => (
                <div key={e.campo}>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-slate-500">
                    {e.rotulo} <span className="normal-case tracking-normal">· {e.nome}</span>
                  </p>
                  <BarraEtapa valor={item[e.campo]} cor={corBarra} max={maxBarra} />
                  <div className="mt-1">{editavel(e.campo)}</div>
                </div>
              ))}
            </div>
          </section>

          <Secao titulo="Pintura">
            <Campo rotulo="COR2" mae>
              {texto(item.cor2)}
            </Campo>
            <Campo rotulo="COR-2" mae>
              {texto(item.cor_2)}
            </Campo>
            <Campo rotulo="Plano de pintura" largo mae>
              {texto(item.plano_pintura)}
            </Campo>
          </Secao>

          <Secao titulo="Comercial / terceiros">
            <Campo rotulo="Fornecedor">{editavel("fornecedor")}</Campo>
            <Campo rotulo="Orçamento terceirizado (unid, R$)">{editavel("orcamento_terceirizado_unid")}</Campo>
            <Campo rotulo="Custo Macfab (unid, R$)">{editavel("orcamento_custo_macfab_unid")}</Campo>
            <Campo rotulo="Preço previsto (R$)">{editavel("preco_previsto")}</Campo>
          </Secao>

          <Secao titulo="Observações">
            <Campo rotulo="Obs. Felipe / Marcelo" largo>
              {editavel("obs_felipe_marcelo", true)}
            </Campo>
            <Campo rotulo="Obs. Alisson (OBS da Controle de obras)" largo mae>
              {texto(item.obs_alisson)}
            </Campo>
          </Secao>

          <Secao titulo="Expedição / documentação">
            <Campo rotulo="ST" mae>
              {texto(item.st)}
            </Campo>
            <Campo rotulo="NF" mae>
              <span className="font-mono">{texto(item.nf)}</span>
            </Campo>
            <Campo rotulo="Tipagem" mae>
              <span className="font-mono">{texto(item.tipagem)}</span>
            </Campo>
            <Campo rotulo="Ano">{item.ano ?? vazio}</Campo>
          </Secao>

          <Secao titulo="Peso">
            <Campo rotulo="Peso unitário" mae>
              {item.peso_unid !== null ? `${formatarNumero(item.peso_unid, 2)} kg` : vazio}
            </Campo>
            <Campo rotulo="Peso total" mae>
              {item.peso_total !== null ? `${formatarNumero(item.peso_total, 2)} kg` : vazio}
            </Campo>
          </Secao>

          <section className="rounded-lg border border-stone-200 dark:border-slate-800 p-3">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-green-700 dark:text-cyan-400">
              Anexos ({item.imagens.length})
              <button
                type="button"
                onClick={onAnexarImagem}
                className="ml-3 rounded border border-green-600/50 dark:border-cyan-500/50 px-2 py-0.5 text-[11px] normal-case tracking-normal text-green-700 dark:text-cyan-300 hover:bg-green-600/10 dark:hover:bg-cyan-500/10"
              >
                + Adicionar imagem (colar)
              </button>
            </h3>
            {item.imagens.length === 0 ? (
              <p className="text-sm text-stone-500 dark:text-slate-500">Nenhuma imagem ainda.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {item.imagens.map((img, i) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => onAbrirImagem(i)}
                    className="h-28 w-28 overflow-hidden rounded border border-stone-200 dark:border-slate-700 bg-white hover:border-green-600 dark:hover:border-cyan-500"
                    title={img.origem === "enviada_app" ? "Adicionada pelo app" : `${img.origem === "imagem_na_celula" ? "Imagem na célula" : "Imagem flutuante"} ${img.celula ?? ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urlImagemFollowUp(img.sha256)} alt="" loading="lazy" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <p className="text-xs text-stone-500 dark:text-slate-500">
            {item.origem === "controle_obras" && "Entrou sozinho vindo da Controle de obras. "}
            {item.editado_em
              ? `Última edição: ${new Date(item.editado_em).toLocaleString("pt-BR")}${item.editado_por ? ` por ${item.editado_por}` : ""}.`
              : `Atualizado em ${new Date(item.updated_at).toLocaleString("pt-BR")}.`}
          </p>
        </div>
      </aside>
    </div>
  );
}
