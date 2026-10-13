"use client";

// Relatório de coleta — pedido explícito do usuário: igual ao PDF que ele
// tirava da planilha ("Coleta para o dia 29.09"), com os pedidos de um
// cliente cuja COLETA é a data escolhida, agrupados por pintura igual
// (Plano + COR2 + COR-2). Folha A4 paisagem pra imprimir / salvar em PDF
// (Ctrl+P). Fica sob /follow-up, então a conta restrita também acessa.
// Parâmetros: ?data=AAAA-MM-DD&cliente=W1 (cliente vazio = todos)&fracionado=1
// &ativos=1 (só pedidos ativos, ST = A — usado pela aba Consulta).
// Coleta fracionada (pedido do usuário): botão discreto deixa editar a Qtd
// de cada pedido só neste relatório; Qtd 0 tira o pedido da folha.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { listarFollowUp, urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { baixarEml, escaparHtml, imagemParaEml, type ImagemEml } from "@/lib/emailEml";
import { corGrupoPintura } from "@/lib/followUp";
import type { ItemFollowUp } from "@/lib/types";

// Pedido do usuário: sem Prazo, Cliente, pintura (já está na faixa do grupo),
// Coleta (já está no título) e NF; no fim, 3 colunas em branco pra anotar o lote.
const COLUNAS = ["Foto", "PO", "Qtd", "MAC", "Desenho", "Descrição", "Tipagem", "N° Lote 1", "N° Lote 2", "N° Lote 3"];

interface Grupo {
  chave: string;
  indice: number | null;
  cor2: string | null;
  cor_2: string | null;
  plano: string | null;
  itens: ItemFollowUp[];
}

function chavePintura(i: ItemFollowUp): string {
  return [i.plano_pintura, i.cor2, i.cor_2].map((v) => (v ?? "").replace(/\s+/g, " ").trim().toUpperCase()).join("|");
}

// Grupos com mais pedidos primeiro; dentro do grupo, em sequência pelo PO
// (pedido do usuário: -030, -050, -090 — do menor pro maior).
function agrupar(itens: ItemFollowUp[]): Grupo[] {
  const m = new Map<string, Grupo>();
  for (const i of itens) {
    const chave = chavePintura(i);
    let g = m.get(chave);
    if (!g) {
      g = { chave, indice: i.grupo_pintura, cor2: i.cor2, cor_2: i.cor_2, plano: i.plano_pintura, itens: [] };
      m.set(chave, g);
    }
    g.itens.push(i);
  }
  const grupos = [...m.values()];
  for (const g of grupos) g.itens.sort((a, b) => a.po.localeCompare(b.po, "pt-BR", { numeric: true }));
  return grupos.sort((a, b) => b.itens.length - a.itens.length || a.chave.localeCompare(b.chave));
}

// O Outlook não entende hsl() nem color-mix(): cor do grupo em #rrggbb,
// clareada pro branco em `branco` (0 = cor pura, 1 = branco) pro fundo da faixa.
function hslParaHex(hsl: string, branco = 0): string {
  const [h, s, l] = (hsl.match(/[\d.]+/g) ?? ["0", "0", "80"]).map(Number);
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const canal = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round((v + (1 - v) * branco) * 255).toString(16).padStart(2, "0");
  };
  return `#${canal(0)}${canal(8)}${canal(4)}`;
}

function Relatorio() {
  const params = useSearchParams();
  const data = params.get("data") ?? "";
  const cliente = params.get("cliente") ?? "";
  const soAtivos = params.get("ativos") === "1";
  const [itens, setItens] = useState<ItemFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));
  const [fracionado, setFracionado] = useState(() => params.get("fracionado") === "1");
  const [qtdColeta, setQtdColeta] = useState<Record<string, number>>({});
  const [gerandoEmail, setGerandoEmail] = useState(false);

  useEffect(() => {
    document.title = `Coleta ${formatarDataBr(data)}${cliente ? ` - ${cliente}` : ""}`; // nome sugerido do PDF
    let ativo = true;
    listarFollowUp()
      .then((r) => {
        if (!ativo) return;
        // Todos os pedidos com essa coleta (mesmo os que já saíram da planilha / ST ≠ A).
        setItens(
          r.itens.filter((i) => i.coleta_data === data && (!cliente || i.cliente === cliente) && (!soAtivos || i.st === "A")),
        );
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [data, cliente, soAtivos]);

  if (!data) return <p className="p-8 text-red-600">Informe a data da coleta.</p>;
  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!itens) return <p className="p-8 text-stone-500">Carregando relatório… (o servidor pode levar até 1 minuto para acordar)</p>;

  // Quantidade que sai nesta coleta (fracionada ou a do pedido inteiro).
  const qtd = (i: ItemFollowUp) => (fracionado && i.id in qtdColeta ? qtdColeta[i.id] : (i.quantidade ?? 0));
  const pesoColeta = (i: ItemFollowUp) =>
    !fracionado || !i.quantidade ? (i.peso_total ?? 0) : ((i.peso_total ?? 0) * qtd(i)) / i.quantidade;
  const naFolha = fracionado ? itens.filter((i) => qtd(i) > 0) : itens;
  const grupos = agrupar(itens);
  const pecas = naFolha.reduce((s, i) => s + qtd(i), 0);
  const peso = naFolha.reduce((s, i) => s + pesoColeta(i), 0);
  const algumParcial = fracionado && itens.some((i) => qtd(i) !== (i.quantidade ?? 0));

  // Pedido do usuário: igual ao alívio de tensão, o relatório já sai como
  // e-mail do Outlook pra encaminhar (lib/emailEml.ts). Mesmo conteúdo da
  // folha (com a Qtd fracionada), sem as colunas em branco de lote.
  async function criarEmail() {
    setGerandoEmail(true);
    try {
      const titulo = `Coleta para o dia ${formatarDataBr(data)}${cliente ? ` — Cliente ${cliente}` : ""}${algumParcial ? " (parcial)" : ""}`;
      const cidDe = new Map(naFolha.map((i, n) => [i.id, `foto${n}@fcnexus`]));
      const imagens = (
        await Promise.all(
          naFolha.map((i) => (i.imagens[0] ? imagemParaEml(urlImagemFollowUp(i.imagens[0].sha256), cidDe.get(i.id)!) : null)),
        )
      ).filter((im): im is ImagemEml => !!im);
      const temCid = new Set(imagens.map((im) => im.cid));
      const td = "border:1px solid #a8a29e;padding:3px 6px;font-size:12px;text-align:center";
      const colunas = ["Foto", "PO", "Qtd", "MAC", "Desenho", "Descrição", "Tipagem", "Peso (kg)"];
      const linhas = grupos
        .map((g) => {
          const doGrupo = fracionado ? g.itens.filter((i) => qtd(i) > 0) : g.itens;
          if (!doGrupo.length) return "";
          const cor = g.indice ? hslParaHex(corGrupoPintura(g.indice)) : "#d6d3d1";
          const fundo = g.indice ? hslParaHex(corGrupoPintura(g.indice), 0.7) : "#f5f5f4";
          return [
            `<tr><td colspan="${colunas.length}" style="${td};text-align:left;background:${fundo};border-left:8px solid ${cor}">` +
              `<b>Pintura:</b> COR2 <b>${escaparHtml(g.cor2 || "—")}</b> · COR-2 <b>${escaparHtml(g.cor_2 || "—")}</b> · ` +
              `Plano <b>${escaparHtml(g.plano || "—")}</b> — ${doGrupo.length} pedido(s) · ` +
              `${formatarNumero(doGrupo.reduce((s, i) => s + qtd(i), 0), 0)} peça(s)</td></tr>`,
            ...doGrupo.map((i) => {
              const cid = cidDe.get(i.id);
              const foto = cid && temCid.has(cid) ? `<img src="cid:${cid}" width="80" style="max-height:44px;object-fit:contain">` : "";
              return (
                `<tr><td style="${td}">${foto}</td><td style="${td}">${escaparHtml(i.po)}</td>` +
                `<td style="${td}">${qtd(i)}${qtd(i) !== (i.quantidade ?? 0) ? ` <span style="color:#78716c">de ${i.quantidade ?? 0}</span>` : ""}</td>` +
                `<td style="${td}">${escaparHtml(i.mac)}</td><td style="${td}">${escaparHtml(i.desenho)}</td>` +
                `<td style="${td};text-align:left">${escaparHtml(i.descricao)}</td><td style="${td}">${escaparHtml(i.tipagem)}</td>` +
                `<td style="${td}">${formatarNumero(pesoColeta(i), 2)}</td></tr>`
              );
            }),
          ].join("");
        })
        .join("");
      const html =
        `<html><body style="font-family:Calibri,Arial,sans-serif;color:#1c1917">` +
        `<p>Segue a relação de peças da coleta.</p>` +
        `<h2 style="margin:8px 0 2px">${escaparHtml(titulo)}</h2>` +
        `<p style="margin:0 0 8px"><b>${naFolha.length}</b> pedido(s) · <b>${formatarNumero(pecas, 0)}</b> peça(s) · ` +
        `peso total <b>${formatarNumero(peso, 2)} kg</b></p>` +
        `<table style="border-collapse:collapse"><thead><tr style="background:#f5f5f4">` +
        colunas.map((c) => `<th style="${td};font-weight:bold">${c}</th>`).join("") +
        `</tr></thead><tbody>${linhas}</tbody></table></body></html>`;
      baixarEml(`Coleta ${formatarDataBr(data).replace(/\//g, ".")}${cliente ? ` - ${cliente}` : ""}`, titulo, html, imagens);
    } finally {
      setGerandoEmail(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[297mm] items-center justify-end gap-2 print:hidden">
        <button
          type="button"
          onClick={() => setFracionado((f) => !f)}
          title="Editar a quantidade que sai de cada pedido nesta coleta (só neste relatório)"
          className={`mr-auto rounded-lg px-3 py-2 text-xs ${
            fracionado
              ? "border border-amber-500 bg-amber-50 font-semibold text-amber-800"
              : "text-stone-500 hover:bg-stone-300/60 hover:text-stone-800"
          }`}
        >
          {fracionado ? "✓ Coleta fracionada (Qtd editável)" : "Coleta fracionada"}
        </button>
        {fracionado && Object.keys(qtdColeta).length > 0 && (
          <button
            type="button"
            onClick={() => setQtdColeta({})}
            className="rounded-lg px-3 py-2 text-xs text-stone-500 hover:bg-stone-300/60 hover:text-stone-800"
          >
            Voltar às quantidades inteiras
          </button>
        )}
        <button
          type="button"
          onClick={criarEmail}
          disabled={gerandoEmail || naFolha.length === 0}
          title="Baixa um e-mail pronto (.eml): abra o arquivo e o Outlook cria a mensagem nova com o relatório — só pôr o destinatário e enviar"
          className="rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {gerandoEmail ? "Criando e-mail…" : "📧 Criar e-mail (Outlook)"}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-600"
        >
          Imprimir / Salvar PDF
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          Fechar
        </button>
      </div>

      <main className="folha-coleta mx-auto flex max-w-[297mm] flex-col gap-3 bg-white p-[8mm] text-stone-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between gap-4 border-b-4 border-green-700 pb-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-green-800">FC Nexus · Follow up de obras</p>
            <h1 className="text-2xl font-bold">
              Coleta para o dia {formatarDataBr(data)}
              {cliente && <span className="font-normal text-stone-600"> — Cliente {cliente}</span>}
              {algumParcial && <span className="font-normal text-amber-700"> (parcial)</span>}
            </h1>
          </div>
          <div className="flex gap-5 text-right text-xs text-stone-500">
            <p>
              Pedidos <span className="block font-mono text-base font-bold text-stone-900">{naFolha.length}</span>
            </p>
            <p>
              Peças <span className="block font-mono text-base font-bold text-stone-900">{formatarNumero(pecas, 0)}</span>
            </p>
            <p>
              Peso total <span className="block font-mono text-base font-bold text-stone-900">{formatarNumero(peso, 2)} kg</span>
            </p>
            <p>
              Gerado em <span className="block font-medium text-stone-700">{geradoEm}</span>
            </p>
          </div>
        </header>

        {itens.length === 0 ? (
          <p className="py-10 text-center text-stone-500">
            Nenhum pedido{cliente ? ` do cliente ${cliente}` : ""} com coleta em {formatarDataBr(data)}.
          </p>
        ) : (
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-stone-100">
                {COLUNAS.map((c) => (
                  <th key={c} className="border border-stone-400 px-1 py-1 text-center font-bold uppercase">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            {grupos.map((g) => {
              const doGrupo = fracionado ? g.itens.filter((i) => qtd(i) > 0) : g.itens;
              const cor = g.indice ? corGrupoPintura(g.indice) : "#d6d3d1";
              const fundo = `color-mix(in srgb, ${cor} 30%, white)`;
              return (
                <tbody key={g.chave} className={doGrupo.length === 0 ? "print:hidden" : undefined}>
                  <tr className="break-after-avoid" style={{ backgroundColor: fundo }}>
                    <td colSpan={COLUNAS.length} className="border border-stone-400 px-2 py-1 text-[11px]">
                      <span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ backgroundColor: cor }} />
                      <strong>Pintura:</strong> COR2 <strong>{g.cor2 || "—"}</strong> · COR-2 <strong>{g.cor_2 || "—"}</strong> ·
                      Plano <strong>{g.plano || "—"}</strong>
                      <span className="float-right text-stone-600">
                        {doGrupo.length} pedido(s) · {formatarNumero(doGrupo.reduce((s, i) => s + qtd(i), 0), 0)} peça(s)
                      </span>
                    </td>
                  </tr>
                  {g.itens.map((i) => (
                    <tr
                      key={i.id}
                      className={`break-inside-avoid text-center ${fracionado && qtd(i) <= 0 ? "opacity-40 print:hidden" : ""}`}
                    >
                      <td className="w-[22mm] border border-stone-400 p-0.5">
                        {i.imagens[0] && (
                          // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine
                          <img src={urlImagemFollowUp(i.imagens[0].sha256)} alt="" className="mx-auto h-[11mm] w-[20mm] object-contain" />
                        )}
                      </td>
                      <td className="border border-stone-400 px-1 font-mono text-[11px]">{i.po}</td>
                      <td className="border border-stone-400 px-1">
                        {fracionado ? (
                          <>
                            <input
                              type="number"
                              min={0}
                              value={qtd(i)}
                              onChange={(e) => {
                                const v = Math.max(0, Number(e.target.value) || 0);
                                setQtdColeta((q) => ({ ...q, [i.id]: v }));
                              }}
                              className="w-12 rounded border border-amber-400 bg-amber-50 px-1 text-center print:hidden"
                            />
                            <span className="hidden print:inline">{qtd(i)}</span>
                            {qtd(i) !== (i.quantidade ?? 0) && (
                              <span className="block text-[8px] text-stone-500">de {i.quantidade ?? 0}</span>
                            )}
                          </>
                        ) : (
                          (i.quantidade ?? "")
                        )}
                      </td>
                      <td className="border border-stone-400 px-1 font-mono">{i.mac}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.desenho}</td>
                      <td className="border border-stone-400 px-1 text-[9px]">{i.descricao}</td>
                      <td className="border border-stone-400 px-1 font-mono">{i.tipagem}</td>
                      <td className="w-[24mm] border border-stone-400" />
                      <td className="w-[24mm] border border-stone-400" />
                      <td className="w-[24mm] border border-stone-400" />
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        )}
      </main>
    </div>
  );
}

export default function RelatorioColeta() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando relatório…</p>}>
      <Relatorio />
    </Suspense>
  );
}
