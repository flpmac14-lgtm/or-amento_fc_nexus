"use client";

import { useEffect, useState } from "react";
import PropostaImpressao from "@/components/PropostaImpressao";
import { formatarMoeda, formatarNumero } from "@/lib/format";
import { baixarPropostaWord } from "@/lib/propostaWord";
import {
  criarPropostaInicial,
  GARANTIA_PADRAO,
  NOTAS_PADRAO,
  PRAZO_ENTREGA_PADRAO,
  QUALIDADE_PADRAO,
  VALIDADE_PADRAO,
} from "@/lib/propostaPadrao";
import type {
  IdentificacaoCliente,
  ItemChecklistProposta,
  ItemPrecoProposta,
  PropostaConfig,
  RespostaOrcamentoDePdf,
} from "@/lib/types";

interface Props {
  mac: string;
  resultado: RespostaOrcamentoDePdf | null;
  identificacaoCliente: IdentificacaoCliente;
  proposta: PropostaConfig | null;
  onPropostaChange: (proposta: PropostaConfig) => void;
  onGerarPdf: () => void;
}

type ListaChecklist = "escopoMacfab" | "exclusoesCliente";

// Bloco "9 a 12" — texto padrão com [Editar]/[Restaurar padrão], pedido
// explícito do usuário. Cada um vira só uma linha de configuração aqui
// (chave do PropostaConfig + o texto padrão pra poder restaurar).
const BLOCOS_TEXTO_PADRAO: { chave: keyof PropostaConfig; titulo: string; padrao: string }[] = [
  { chave: "validade", titulo: "9. Validade", padrao: VALIDADE_PADRAO },
  { chave: "garantia", titulo: "10. Garantia", padrao: GARANTIA_PADRAO },
  { chave: "qualidade", titulo: "11. Qualidade", padrao: QUALIDADE_PADRAO },
  { chave: "notasConsideracoes", titulo: "12. Notas e considerações", padrao: NOTAS_PADRAO },
];

function BlocoTextoPadrao({
  titulo, valor, padrao, onChange,
}: {
  titulo: string;
  valor: string;
  padrao: string;
  onChange: (v: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  return (
    <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3 text-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
        {titulo}
      </p>
      {editando ? (
        <textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
        />
      ) : (
        <p className="text-stone-700 dark:text-slate-300">{valor}</p>
      )}
      <div className="mt-2 flex gap-3 text-xs">
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="text-green-600 dark:text-cyan-400 hover:text-green-700 dark:hover:text-cyan-300"
        >
          {editando ? "concluir edição" : "editar"}
        </button>
        {valor !== padrao && (
          <button
            type="button"
            onClick={() => onChange(padrao)}
            className="text-stone-500 dark:text-slate-500 hover:text-stone-700 dark:hover:text-slate-300"
          >
            restaurar padrão
          </button>
        )}
      </div>
    </div>
  );
}

// Checkbox recursivo (Acabamento/Proteção tem subitens; os demais não) —
// clique no texto vira campo editável na hora, só pra essa proposta
// (pedido explícito: nunca altera o template padrão global).
function LinhaChecklist({
  linha, onAlternar, onEditarTexto, onRemover,
}: {
  linha: ItemChecklistProposta;
  onAlternar: (id: string) => void;
  onEditarTexto: (id: string, texto: string) => void;
  onRemover?: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  return (
    <div>
      <label className="flex items-start gap-2 py-0.5">
        <input
          type="checkbox"
          checked={linha.marcado}
          onChange={() => onAlternar(linha.id)}
          className="mt-0.5 accent-green-600 dark:accent-cyan-500"
        />
        {editando ? (
          <input
            type="text"
            autoFocus
            value={linha.texto}
            onChange={(e) => onEditarTexto(linha.id, e.target.value)}
            onBlur={() => setEditando(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditando(false)}
            className="min-w-0 flex-1 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
        ) : (
          <span
            className={`min-w-0 flex-1 text-sm ${linha.marcado ? "text-stone-800 dark:text-slate-200" : "text-stone-400 dark:text-slate-600 line-through"}`}
          >
            {linha.texto}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="shrink-0 text-xs text-green-600 dark:text-cyan-400 hover:text-green-700 dark:hover:text-cyan-300"
        >
          editar
        </button>
        {onRemover && (
          <button
            type="button"
            onClick={() => onRemover(linha.id)}
            className="shrink-0 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
          >
            remover
          </button>
        )}
      </label>
      {linha.subitens && (
        <div className="ml-6 border-l border-stone-200 dark:border-slate-800 pl-3">
          {linha.subitens.map((sub) => (
            <LinhaChecklist
              key={sub.id}
              linha={sub}
              onAlternar={() => onAlternar(sub.id)}
              onEditarTexto={(_, texto) => onEditarTexto(sub.id, texto)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Acha e substitui uma linha (ou subitem) por id, em qualquer nível —
// evita repetir a mesma navegação recursiva pra alternar/editar/remover.
function atualizarChecklist(
  lista: ItemChecklistProposta[],
  id: string,
  atualizar: (linha: ItemChecklistProposta) => ItemChecklistProposta | null,
): ItemChecklistProposta[] {
  return lista
    .map((linha) => {
      if (linha.id === id) return atualizar(linha);
      if (linha.subitens) {
        return { ...linha, subitens: atualizarChecklist(linha.subitens, id, atualizar) };
      }
      return linha;
    })
    .filter((l): l is ItemChecklistProposta => l !== null);
}

export default function PainelProposta({
  mac, resultado, identificacaoCliente, proposta, onPropostaChange, onGerarPdf,
}: Props) {
  const [mostrarPreview, setMostrarPreview] = useState(false);
  const [novoItemEscopo, setNovoItemEscopo] = useState("");
  const [novaExclusao, setNovaExclusao] = useState("");
  const [baixandoWord, setBaixandoWord] = useState(false);
  const [erroWord, setErroWord] = useState<string | null>(null);

  // Primeira vez que a aba é aberta pra esse orçamento — semeia a partir
  // do que já existe (peso/preço calculados) + template padrão. Só roda
  // uma vez: depois disso `proposta` nunca mais é null pra esse orçamento.
  useEffect(() => {
    if (proposta == null) onPropostaChange(criarPropostaInicial(resultado));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposta]);

  if (!resultado) {
    return (
      <p className="py-12 text-center text-sm text-stone-500 dark:text-slate-500">
        Calcule o orçamento primeiro (em &quot;Cálculo manual&quot; ou &quot;Enviar desenho&quot;) —
        a proposta usa o peso e o preço já calculados.
      </p>
    );
  }

  if (!proposta) {
    return <p className="py-12 text-center text-sm text-stone-500 dark:text-slate-500">Carregando…</p>;
  }

  function atualizar(campo: Partial<PropostaConfig>) {
    onPropostaChange({ ...proposta!, ...campo });
  }

  function atualizarItemPreco(indice: number, campo: Partial<ItemPrecoProposta>) {
    const itens = proposta!.itensPreco.map((it, i) => (i === indice ? { ...it, ...campo } : it));
    atualizar({ itensPreco: itens });
  }

  function adicionarItemPreco() {
    const proximo = proposta!.itensPreco.length + 1;
    atualizar({
      itensPreco: [
        ...proposta!.itensPreco,
        { item: `2.${proximo}`, quantidade: "01", discriminacao: "", valorTotal: 0 },
      ],
    });
  }

  function removerItemPreco(indice: number) {
    atualizar({ itensPreco: proposta!.itensPreco.filter((_, i) => i !== indice) });
  }

  function inserirPesoNoItem(indice: number) {
    const peso = resultado?.orcamento.comercial.peso_liquido_kg;
    if (!peso) return;
    const item = proposta!.itensPreco[indice];
    const sufixo = `(Peso aproximado: ${Math.round(peso)} kg)`;
    if (item.discriminacao.includes("Peso aproximado")) return;
    atualizarItemPreco(indice, {
      discriminacao: item.discriminacao ? `${item.discriminacao}\n${sufixo}` : sufixo,
    });
  }

  function alternarChecklistItem(lista: ListaChecklist, id: string) {
    atualizar({
      [lista]: atualizarChecklist(proposta![lista], id, (l) => ({ ...l, marcado: !l.marcado })),
    });
  }

  function editarTextoChecklistItem(lista: ListaChecklist, id: string, texto: string) {
    atualizar({ [lista]: atualizarChecklist(proposta![lista], id, (l) => ({ ...l, texto })) });
  }

  function removerChecklistItem(lista: ListaChecklist, id: string) {
    atualizar({ [lista]: atualizarChecklist(proposta![lista], id, () => null) });
  }

  function adicionarChecklistItem(lista: ListaChecklist, texto: string) {
    if (!texto.trim()) return;
    const novo: ItemChecklistProposta = { id: `custom-${Date.now()}`, texto: texto.trim(), marcado: true };
    atualizar({ [lista]: [...proposta![lista], novo] });
    if (lista === "escopoMacfab") setNovoItemEscopo("");
    else setNovaExclusao("");
  }

  async function handleGerarWord() {
    setErroWord(null);
    setBaixandoWord(true);
    try {
      await baixarPropostaWord(mac, identificacaoCliente, proposta!);
    } catch (e) {
      setErroWord(e instanceof Error ? e.message : "Erro desconhecido ao gerar o Word.");
    } finally {
      setBaixandoWord(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Dados automáticos — pedido explícito: nunca redigitar o que já
          existe no orçamento (MAC/cliente vêm do cabeçalho/identificação
          do cliente; só título do serviço e contato são novos aqui, sem
          fonte existente pra puxar). */}
      <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
          Dados automáticos do orçamento
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className="block text-xs text-stone-500 dark:text-slate-500">MAC</span>
            <span className="text-sm font-medium text-stone-800 dark:text-slate-200">{mac || "—"}</span>
          </div>
          <div>
            <span className="block text-xs text-stone-500 dark:text-slate-500">Cliente</span>
            <span className="text-sm font-medium text-stone-800 dark:text-slate-200">
              {identificacaoCliente.nomeCliente || "—"}
            </span>
          </div>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-stone-500 dark:text-slate-500">
              Nome/título do serviço (aparece abaixo do MAC na proposta)
            </span>
            <input
              type="text"
              value={proposta.tituloServico}
              onChange={(e) => atualizar({ tituloServico: e.target.value })}
              placeholder='ex.: USB-Plataforma de Trabalho da Cruzeta Inferior MB9500'
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-stone-500 dark:text-slate-500">
              Contato do cliente (nome/e-mail, aparece abaixo do nome do cliente)
            </span>
            <input
              type="text"
              value={proposta.contatoCliente}
              onChange={(e) => atualizar({ contatoCliente: e.target.value })}
              placeholder="ex.: rayron.franciscate@andritz.com"
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
            />
          </label>
        </div>
      </div>

      {/* 2. PREÇO */}
      <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
          2. Preço
        </p>
        <div className="flex flex-col gap-3">
          {proposta.itensPreco.map((item, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 rounded-md border border-stone-200 dark:border-slate-800 p-2 sm:grid-cols-[4rem_4rem_1fr_8rem_auto]">
              <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-stone-500 dark:text-slate-500">Item</span>
                <input
                  type="text"
                  value={item.item}
                  onChange={(e) => atualizarItemPreco(i, { item: e.target.value })}
                  className="rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-stone-500 dark:text-slate-500">Qtd</span>
                <input
                  type="text"
                  value={item.quantidade}
                  onChange={(e) => atualizarItemPreco(i, { quantidade: e.target.value })}
                  className="rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-stone-500 dark:text-slate-500">Discriminação</span>
                <textarea
                  value={item.discriminacao}
                  onChange={(e) => atualizarItemPreco(i, { discriminacao: e.target.value })}
                  rows={2}
                  className="rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs">
                <span className="text-stone-500 dark:text-slate-500">R$ total</span>
                <input
                  type="number"
                  step="0.01"
                  value={item.valorTotal}
                  onChange={(e) => atualizarItemPreco(i, { valorTotal: Number(e.target.value) || 0 })}
                  className="rounded border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-1 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
                />
              </label>
              <div className="flex items-end gap-2 text-xs">
                {resultado.orcamento.comercial.peso_liquido_kg > 0 && (
                  <button type="button" onClick={() => inserirPesoNoItem(i)} className="text-green-600 dark:text-cyan-400 hover:text-green-700 dark:hover:text-cyan-300">
                    + peso
                  </button>
                )}
                <button type="button" onClick={() => removerItemPreco(i)} className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
                  remover
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={adicionarItemPreco}
              className="text-xs font-medium text-green-600 dark:text-cyan-400 hover:text-green-700 dark:hover:text-cyan-300"
            >
              + adicionar item
            </button>
            <p className="text-xs text-stone-500 dark:text-slate-500">
              Total: {formatarMoeda(proposta.itensPreco.reduce((s, i) => s + i.valorTotal, 0))} · peso calculado:{" "}
              {formatarNumero(resultado.orcamento.comercial.peso_liquido_kg, 0)} kg
            </p>
          </div>
        </div>
      </div>

      {/* 3. IMPOSTOS */}
      <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
          3. Impostos
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-stone-500 dark:text-slate-500">IPI</span>
            <input type="text" value={proposta.ipi} onChange={(e) => atualizar({ ipi: e.target.value })}
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-stone-500 dark:text-slate-500">ICMS - PIS-COFINS</span>
            <input type="text" value={proposta.icmsPisCofins} onChange={(e) => atualizar({ icmsPisCofins: e.target.value })}
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500" />
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-stone-500 dark:text-slate-500">NCM</span>
            <input type="text" value={proposta.ncm} onChange={(e) => atualizar({ ncm: e.target.value })}
              placeholder="ex.: 8410.90.00"
              className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500" />
          </label>
        </div>
      </div>

      {/* 4. CONDIÇÕES DE PAGAMENTO — só leitura, vem de Identificação do cliente */}
      <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
          4. Condições de pagamento
        </p>
        <p className="text-sm text-stone-800 dark:text-slate-200">{identificacaoCliente.condicaoPagamento || "—"}</p>
        <p className="mt-1 text-xs text-stone-500 dark:text-slate-500">
          Vem do campo &quot;Condição de pagamento&quot; em Identificação do cliente — edite lá se precisar mudar.
        </p>
      </div>

      {/* 5. PRAZO */}
      <label className="flex flex-col gap-1 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
          5. Prazo de entrega
        </span>
        <input
          type="text"
          value={proposta.prazoEntrega}
          onChange={(e) => atualizar({ prazoEntrega: e.target.value })}
          className="mt-1 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
        />
        {proposta.prazoEntrega !== PRAZO_ENTREGA_PADRAO && (
          <button
            type="button"
            onClick={() => atualizar({ prazoEntrega: PRAZO_ENTREGA_PADRAO })}
            className="mt-1 self-start text-xs text-stone-500 dark:text-slate-500 hover:text-stone-700 dark:hover:text-slate-300"
          >
            restaurar padrão
          </button>
        )}
      </label>

      {/* 6. LOCAL */}
      <label className="flex flex-col gap-1 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4 text-sm">
        <span className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
          6. Local de entrega
        </span>
        <input
          type="text"
          value={proposta.localEntrega}
          onChange={(e) => atualizar({ localEntrega: e.target.value })}
          placeholder='ex.: "CIF" entregue na Andritz, Araraquara SP.'
          className="mt-1 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
        />
      </label>

      {/* 7. ESCOPO MACFAB */}
      <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
          7. Escopo / Fornecido pela Macfab
        </p>
        {proposta.escopoMacfab.map((linha) => (
          <LinhaChecklist
            key={linha.id}
            linha={linha}
            onAlternar={(id) => alternarChecklistItem("escopoMacfab", id)}
            onEditarTexto={(id, texto) => editarTextoChecklistItem("escopoMacfab", id, texto)}
            onRemover={linha.padraoId ? undefined : (id) => removerChecklistItem("escopoMacfab", id)}
          />
        ))}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={novoItemEscopo}
            onChange={(e) => setNovoItemEscopo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionarChecklistItem("escopoMacfab", novoItemEscopo)}
            placeholder="novo item de escopo…"
            className="min-w-0 flex-1 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={() => adicionarChecklistItem("escopoMacfab", novoItemEscopo)}
            className="shrink-0 rounded-md border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-slate-300 hover:border-green-600/50 dark:hover:border-cyan-500/50"
          >
            + adicionar item personalizado
          </button>
        </div>
      </div>

      {/* 8. EXCLUSÕES */}
      <div className="rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-500">
          8. Exclusões / Fornecido pelo cliente
        </p>
        {proposta.exclusoesCliente.map((linha) => (
          <LinhaChecklist
            key={linha.id}
            linha={linha}
            onAlternar={(id) => alternarChecklistItem("exclusoesCliente", id)}
            onEditarTexto={(id, texto) => editarTextoChecklistItem("exclusoesCliente", id, texto)}
            onRemover={linha.padraoId ? undefined : (id) => removerChecklistItem("exclusoesCliente", id)}
          />
        ))}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={novaExclusao}
            onChange={(e) => setNovaExclusao(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adicionarChecklistItem("exclusoesCliente", novaExclusao)}
            placeholder="nova exclusão…"
            className="min-w-0 flex-1 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
          />
          <button
            type="button"
            onClick={() => adicionarChecklistItem("exclusoesCliente", novaExclusao)}
            className="shrink-0 rounded-md border border-stone-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-stone-700 dark:text-slate-300 hover:border-green-600/50 dark:hover:border-cyan-500/50"
          >
            + adicionar exclusão personalizada
          </button>
        </div>
      </div>

      {/* 9 a 12 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BLOCOS_TEXTO_PADRAO.map(({ chave, titulo, padrao }) => (
          <BlocoTextoPadrao
            key={chave}
            titulo={titulo}
            valor={proposta[chave] as string}
            padrao={padrao}
            onChange={(v) => atualizar({ [chave]: v })}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-stone-200 dark:border-slate-800 pt-4">
        <button
          type="button"
          onClick={() => setMostrarPreview((v) => !v)}
          className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-stone-800 dark:text-slate-200 hover:border-green-600/50 dark:hover:border-cyan-500/50"
        >
          {mostrarPreview ? "Ocultar pré-visualização" : "Visualizar proposta"}
        </button>
        <button
          type="button"
          onClick={onGerarPdf}
          className="rounded-md bg-green-600 dark:bg-cyan-500 px-4 py-2 text-sm font-medium text-white dark:text-slate-950 hover:bg-green-500 dark:hover:bg-cyan-400"
        >
          Gerar PDF
        </button>
        <button
          type="button"
          onClick={handleGerarWord}
          disabled={baixandoWord}
          className="rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-stone-800 dark:text-slate-200 hover:border-green-600/50 dark:hover:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {baixandoWord ? "Gerando…" : "Gerar Word (.docx)"}
        </button>
        <p className="text-xs text-stone-500 dark:text-slate-500">
          As alterações aqui já ficam salvas no orçamento ao clicar em &quot;Salvar orçamento&quot;, no topo da tela.
        </p>
        {erroWord && <p className="w-full text-xs text-red-600 dark:text-red-400">{erroWord}</p>}
      </div>

      {mostrarPreview && (
        <div className="overflow-x-auto rounded-lg border border-stone-300 dark:border-slate-700 bg-stone-100 dark:bg-slate-950 p-4">
          <PropostaImpressao
            mac={mac}
            identificacaoCliente={identificacaoCliente}
            proposta={proposta}
            preview
          />
        </div>
      )}
    </div>
  );
}
