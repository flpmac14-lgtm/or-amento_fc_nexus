"use client";

// Relatório de um item do Follow up — pedido explícito do usuário: botão
// dentro do card do item trazendo todos os dados, a data em que o pedido
// entrou e os registros diários. Folha A4 clara pra imprimir / salvar em PDF
// (Ctrl+P). Fica sob /follow-up, então a conta restrita também acessa.

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { buscarItemFollowUpCompleto, urlImagemFollowUp } from "@/lib/api";
import { formatarDataBr, formatarMoeda, formatarNumero } from "@/lib/format";
import { ETAPAS, ROTULO_PRAZO, diasParaPrazo, situacaoEtapa, situacaoPrazo } from "@/lib/followUp";
import type { ItemFollowUpCompleto } from "@/lib/types";

function v(valor: string | number | null | undefined): string {
  return valor === null || valor === undefined || valor === "" ? "—" : String(valor);
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <tr className="border-b border-stone-200 align-top">
      <th className="w-48 py-1 pr-3 text-left text-xs font-medium uppercase tracking-wide text-stone-500">{rotulo}</th>
      <td className="py-1 text-sm text-stone-900">{valor}</td>
    </tr>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1 border-b-2 border-green-700 pb-0.5 text-sm font-bold uppercase tracking-wider text-green-800">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

export default function RelatorioItemFollowUp() {
  const { id } = useParams<{ id: string }>();
  const [dados, setDados] = useState<ItemFollowUpCompleto | null>(null);
  const [erro, setErro] = useState("");
  const [geradoEm] = useState(() => new Date().toLocaleString("pt-BR"));

  useEffect(() => {
    let ativo = true;
    buscarItemFollowUpCompleto(id)
      .then((d) => {
        if (!ativo) return;
        setDados(d);
        document.title = `Relatório PO ${d.item.po}`; // vira o nome sugerido do PDF
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [id]);

  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!dados) return <p className="p-8 text-stone-500">Carregando relatório…</p>;

  const { item, registros, entrada } = dados;
  const prazoSit = situacaoPrazo(item.prazo_contratual);
  const dias = diasParaPrazo(item.prazo_contratual);
  const historico = [...registros].sort((a, b) =>
    a.data === b.data ? a.created_at.localeCompare(b.created_at) : a.data.localeCompare(b.data),
  );
  const dataEntrada =
    entrada.origem === "controle_obras"
      ? `${new Date(entrada.em).toLocaleString("pt-BR")} — entrou sozinho no Follow up ao aparecer na Controle de obras (ST = A)`
      : `Já estava na aba Gerencia quando o Follow up foi criado (importado de ${v(entrada.importado_de)} em ${
          entrada.importado_em ? new Date(entrada.importado_em).toLocaleString("pt-BR") : "—"
        }). A data real de entrada não consta nas planilhas.`;

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 print:hidden">
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

      <main className="mx-auto flex max-w-[210mm] flex-col gap-4 bg-white p-[12mm] text-stone-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-4 border-green-700 pb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-green-800">FC Nexus · Follow up de obras</p>
            <h1 className="font-mono text-2xl font-bold">PO {item.po}</h1>
            <p className="text-sm text-stone-700">{v(item.descricao)}</p>
          </div>
          <div className="text-right text-xs text-stone-500">
            <p>Relatório gerado em</p>
            <p className="font-medium text-stone-700">{geradoEm}</p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-3 break-inside-avoid">
          <div className="rounded border border-stone-300 p-2">
            <p className="text-[10px] uppercase tracking-wide text-stone-500">Status</p>
            <p className="text-sm font-bold">{v(item.status)}</p>
          </div>
          <div className="rounded border border-stone-300 p-2">
            <p className="text-[10px] uppercase tracking-wide text-stone-500">Prazo contratual</p>
            <p className="text-sm font-bold">
              {item.prazo_contratual ? formatarDataBr(item.prazo_contratual) : "—"}{" "}
              <span className={`font-normal ${prazoSit === "atrasado" ? "text-red-700" : "text-stone-600"}`}>
                ({ROTULO_PRAZO[prazoSit]}
                {dias !== null && dias < 0 ? `, ${-dias} dia(s)` : dias !== null && dias > 0 ? `, faltam ${dias} dia(s)` : ""})
              </span>
            </p>
          </div>
          <div className="rounded border border-stone-300 p-2">
            <p className="text-[10px] uppercase tracking-wide text-stone-500">Entrada no Follow up</p>
            <p className="text-sm font-bold">
              {entrada.origem === "controle_obras" ? new Date(entrada.em).toLocaleDateString("pt-BR") : "Antes do app"}
            </p>
          </div>
        </div>

        <Secao titulo="Identificação">
          <table className="w-full">
            <tbody>
              <Linha rotulo="PO" valor={<span className="font-mono">{item.po}</span>} />
              <Linha rotulo="Cliente" valor={v(item.cliente)} />
              <Linha rotulo="MAC" valor={<span className="font-mono">{v(item.mac)}</span>} />
              <Linha rotulo="Desenho" valor={<span className="font-mono">{v(item.desenho)}</span>} />
              <Linha rotulo="Descrição" valor={v(item.descricao)} />
              <Linha rotulo="Quantidade" valor={v(item.quantidade)} />
              <Linha rotulo="Data de entrada" valor={dataEntrada} />
            </tbody>
          </table>
        </Secao>

        <Secao titulo="Produção">
          <table className="w-full text-center text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-stone-500">
                {ETAPAS.map((e) => (
                  <th key={e.campo} className="py-1 font-medium">
                    {e.rotulo}
                    <br />
                    <span className="normal-case">{e.nome}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {ETAPAS.map((e) => {
                  const valor = item[e.campo];
                  const s = situacaoEtapa(valor);
                  return (
                    <td key={e.campo} className="px-1 py-1">
                      <div className="relative h-5 overflow-hidden rounded border border-stone-300 bg-stone-100">
                        <div
                          className="absolute inset-y-0 left-0 bg-[#63C384]"
                          style={{ width: `${Math.max(0, Math.min(100, valor ?? 0))}%` }}
                        />
                        <span className="relative text-xs font-semibold">
                          {valor === null ? "—" : `${formatarNumero(valor, Number.isInteger(valor) ? 0 : 1)}%`}
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-500">
                        {s === "concluida" ? "concluída" : s === "parcial" ? "em andamento" : "pendente"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
          <table className="mt-1 w-full">
            <tbody>
              <Linha rotulo="Coleta" valor={item.coleta_data ? formatarDataBr(item.coleta_data) : v(item.coleta)} />
            </tbody>
          </table>
        </Secao>

        <div className="grid grid-cols-2 gap-4">
          <Secao titulo="Pintura">
            <table className="w-full">
              <tbody>
                <Linha rotulo="COR2" valor={v(item.cor2)} />
                <Linha rotulo="COR-2" valor={v(item.cor_2)} />
                <Linha rotulo="Plano de pintura" valor={v(item.plano_pintura)} />
              </tbody>
            </table>
          </Secao>
          <Secao titulo="Comercial / terceiros">
            <table className="w-full">
              <tbody>
                <Linha rotulo="Fornecedor" valor={v(item.fornecedor)} />
                <Linha
                  rotulo="Orç. terceirizado (unid)"
                  valor={item.orcamento_terceirizado_unid !== null ? formatarMoeda(item.orcamento_terceirizado_unid) : "—"}
                />
                <Linha
                  rotulo="Custo Macfab (unid)"
                  valor={item.orcamento_custo_macfab_unid !== null ? formatarMoeda(item.orcamento_custo_macfab_unid) : "—"}
                />
                <Linha rotulo="Preço previsto" valor={item.preco_previsto !== null ? formatarMoeda(item.preco_previsto) : "—"} />
              </tbody>
            </table>
          </Secao>
          <Secao titulo="Expedição / documentação">
            <table className="w-full">
              <tbody>
                <Linha rotulo="ST" valor={v(item.st)} />
                <Linha rotulo="NF" valor={<span className="font-mono">{v(item.nf)}</span>} />
                <Linha rotulo="Tipagem" valor={<span className="font-mono">{v(item.tipagem)}</span>} />
                <Linha rotulo="Ano" valor={v(item.ano)} />
              </tbody>
            </table>
          </Secao>
          <Secao titulo="Peso">
            <table className="w-full">
              <tbody>
                <Linha rotulo="Peso unitário" valor={item.peso_unid !== null ? `${formatarNumero(item.peso_unid, 2)} kg` : "—"} />
                <Linha rotulo="Peso total" valor={item.peso_total !== null ? `${formatarNumero(item.peso_total, 2)} kg` : "—"} />
              </tbody>
            </table>
          </Secao>
        </div>

        <Secao titulo="Observações">
          <table className="w-full">
            <tbody>
              <Linha rotulo="Obs. Felipe / Marcelo" valor={<span className="whitespace-pre-wrap">{v(item.obs_felipe_marcelo)}</span>} />
              <Linha rotulo="Obs. Alisson" valor={v(item.obs_alisson)} />
            </tbody>
          </table>
        </Secao>

        <Secao titulo={`Registro diário (${historico.length})`}>
          {historico.length === 0 ? (
            <p className="py-1 text-sm text-stone-500">Nenhum registro.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-300 text-left text-[10px] uppercase tracking-wide text-stone-500">
                  <th className="w-24 py-1 font-medium">Dia</th>
                  <th className="py-1 font-medium">Registro</th>
                  <th className="w-32 py-1 font-medium">Por</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((r) => (
                  <tr key={r.id} className="break-inside-avoid border-b border-stone-200 align-top">
                    <td className="py-1 font-mono text-xs">{formatarDataBr(r.data)}</td>
                    <td className="whitespace-pre-wrap py-1 pr-2">{r.texto}</td>
                    <td className="py-1 text-xs text-stone-600">
                      {v(r.autor)}
                      <br />
                      <span className="text-stone-400">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>

        {item.imagens.length > 0 && (
          <Secao titulo={`Anexos (${item.imagens.length})`}>
            <div className="mt-1 grid grid-cols-2 gap-3">
              {item.imagens.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine
                <img
                  key={img.id}
                  src={urlImagemFollowUp(img.sha256)}
                  alt=""
                  className="max-h-[80mm] w-full break-inside-avoid rounded border border-stone-300 object-contain"
                />
              ))}
            </div>
          </Secao>
        )}

        <footer className="border-t border-stone-300 pt-2 text-[10px] text-stone-500">
          {item.editado_em
            ? `Última edição no app: ${new Date(item.editado_em).toLocaleString("pt-BR")}${item.editado_por ? ` por ${item.editado_por}` : ""}. `
            : ""}
          Campos de prazo, cliente, quantidade, MAC, desenho, descrição, OBS, cores, plano de pintura, ST, NF, tipagem e pesos vêm
          da Controle de obras.
        </footer>
      </main>
    </div>
  );
}
