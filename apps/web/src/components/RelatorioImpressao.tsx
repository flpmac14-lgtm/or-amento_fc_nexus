import type { RespostaOrcamentoDePdf } from "@/lib/types";
import {
  formatarMoeda,
  formatarNumero,
  formatarPercentual,
  NOMES_PROCESSO,
} from "@/lib/format";

function valorCampo(campo: { valor: unknown }): string {
  return campo.valor !== null && campo.valor !== undefined && campo.valor !== ""
    ? String(campo.valor)
    : "—";
}

/**
 * Relatório de orçamento pronto pra impressão/PDF. Fica fora da tela por
 * padrão (`hidden`) e só aparece quando o navegador imprime (`print:block`,
 * ver globals.css) — assim o botão "Gerar relatório" chama window.print()
 * e o usuário salva como PDF pelo diálogo nativo, sem depender de biblioteca
 * nenhuma. Ao contrário da tela normal, aqui a memória de cálculo de cada
 * linha vem sempre aberta — é um documento de auditoria, não uma UI
 * interativa.
 */
export default function RelatorioImpressao({
  resultado,
  nomeArquivo,
}: {
  resultado: RespostaOrcamentoDePdf;
  nomeArquivo: string;
}) {
  const { extracao, itens_para_revisao, orcamento } = resultado;
  const id = extracao.identificacao;
  const geradoEm = new Date().toLocaleString("pt-BR");

  return (
    <div className="hidden print:block print:text-black">
      <header className="mb-6 flex items-baseline justify-between border-b-2 border-black pb-3">
        <div>
          <h1 className="text-xl font-bold">FC Nexus — Relatório de Orçamento</h1>
          <p className="text-xs text-zinc-600">Arquivo: {nomeArquivo}</p>
        </div>
        <p className="text-xs text-zinc-600">Gerado em {geradoEm}</p>
      </header>

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">Identificação</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div className="flex justify-between border-b border-zinc-300 py-1">
            <dt className="text-zinc-600">Cliente</dt>
            <dd className="font-medium">{valorCampo(id.cliente)}</dd>
          </div>
          <div className="flex justify-between border-b border-zinc-300 py-1">
            <dt className="text-zinc-600">Número do desenho</dt>
            <dd className="font-medium">{valorCampo(id.numero_desenho)}</dd>
          </div>
          <div className="flex justify-between border-b border-zinc-300 py-1">
            <dt className="text-zinc-600">Revisão</dt>
            <dd className="font-medium">{valorCampo(id.revisao)}</dd>
          </div>
          <div className="flex justify-between border-b border-zinc-300 py-1">
            <dt className="text-zinc-600">Código do equipamento</dt>
            <dd className="font-medium">{valorCampo(id.codigo_equipamento)}</dd>
          </div>
          <div className="col-span-2 flex justify-between border-b border-zinc-300 py-1">
            <dt className="text-zinc-600">Pedido/PO</dt>
            <dd className="font-medium">{valorCampo(id.pedido_po)}</dd>
          </div>
        </dl>
      </section>

      {itens_para_revisao.length > 0 && (
        <section className="mb-5 break-inside-avoid border border-black p-3">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">
            Itens para revisão manual ({itens_para_revisao.length})
          </h2>
          <ul className="list-inside list-disc space-y-0.5 text-xs">
            {itens_para_revisao.map((item, i) => (
              <li key={i}>
                {item.item_numero && <span className="font-medium">Item {item.item_numero}: </span>}
                {item.motivo}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide">
          Detalhamento de custo por processo
        </h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-1 pr-2 font-bold">Processo</th>
              <th className="py-1 pr-2 font-bold">Horas</th>
              <th className="py-1 text-right font-bold">Valor líquido</th>
            </tr>
          </thead>
          <tbody>
            {orcamento.linhas.map((linha) => (
              <tr key={linha.codigo} className="break-inside-avoid border-b border-zinc-300 align-top">
                <td className="py-2 pr-2 font-medium">
                  {NOMES_PROCESSO[linha.codigo] ?? linha.descricao}
                </td>
                <td className="py-2 pr-2">{linha.horas !== null ? `${formatarNumero(linha.horas)} h` : "—"}</td>
                <td className="py-2 text-right font-mono">{formatarMoeda(linha.valor_liquido)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Memória de cálculo completa, linha por linha — é o que torna o
            relatório auditável (mesma regra do README raiz: "todo valor
            final deve poder mostrar 'Ver cálculo'"). */}
        <div className="mt-3 space-y-3">
          {orcamento.linhas.map((linha) => (
            <div key={linha.codigo} className="break-inside-avoid">
              <p className="text-xs font-bold">
                {NOMES_PROCESSO[linha.codigo] ?? linha.descricao} — memória de cálculo
              </p>
              <ul className="list-inside list-disc pl-2 text-[11px] leading-snug text-zinc-700">
                {linha.memoria_calculo.map((m, i) => (
                  <li key={i} className="font-mono">{m}</li>
                ))}
              </ul>
              {(linha.aliquota_icms > 0 || linha.aliquota_pis_cofins > 0) && (
                <p className="text-[11px] text-zinc-700">
                  Bruto {formatarMoeda(linha.valor_bruto)} − ICMS{" "}
                  {formatarPercentual(linha.aliquota_icms)} − PIS/COFINS{" "}
                  {formatarPercentual(linha.aliquota_pis_cofins)} = líquido{" "}
                  {formatarMoeda(linha.valor_liquido)}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="break-inside-avoid border-2 border-black p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide">Resumo comercial</h2>
        <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-zinc-600">Peso líquido</dt>
            <dd className="font-medium">{formatarNumero(orcamento.comercial.peso_liquido_kg)} kg</dd>
          </div>
          <div>
            <dt className="text-zinc-600">Custo industrial</dt>
            <dd className="font-medium">{formatarMoeda(orcamento.comercial.custo_industrial)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600">Margem</dt>
            <dd className="font-medium">
              {formatarMoeda(orcamento.comercial.margem_lucro)} (
              {formatarPercentual(orcamento.comercial.margem_percentual)})
            </dd>
          </div>
          <div>
            <dt className="text-zinc-600">Impostos</dt>
            <dd className="font-medium">{formatarMoeda(orcamento.comercial.imposto_a_pagar)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600">Venda (s/ impostos)</dt>
            <dd className="font-medium">{formatarMoeda(orcamento.comercial.preco_venda_sem_impostos)}</dd>
          </div>
          <div>
            <dt className="text-zinc-600">R$/kg</dt>
            <dd className="font-medium">{formatarMoeda(orcamento.comercial.preco_venda_por_kg)}</dd>
          </div>
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t-2 border-black pt-3">
          <span className="font-medium">Preço de venda (c/ impostos)</span>
          <span className="text-xl font-bold">
            {formatarMoeda(orcamento.comercial.preco_venda_com_impostos)}
          </span>
        </div>
      </section>

      <footer className="mt-6 text-[10px] text-zinc-500">
        A IA não calcula peso, custo, hora ou preço — só estrutura o que o desenho contém. Todo
        cálculo é feito pelo motor determinístico (services/calc_engine). Confiança geral da
        extração: {Math.round(extracao.confianca_geral * 100)}%.
      </footer>
    </div>
  );
}
