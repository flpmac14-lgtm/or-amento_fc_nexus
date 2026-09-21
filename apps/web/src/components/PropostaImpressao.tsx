import type { IdentificacaoCliente, ItemChecklistProposta, PropostaConfig } from "@/lib/types";
import { formatarMoeda } from "@/lib/format";
import {
  AVISO_CONFIDENCIALIDADE,
  CIDADE_EMISSAO,
  ENDERECO_MACFAB,
  OBJETO_PROPOSTA_TEXTO,
  RESPONSAVEL_COMERCIAL,
} from "@/lib/propostaPadrao";

// Cor azul do modelo oficial da Macfab — usada nos títulos numerados, no
// "MAC_..." do cabeçalho e no nome do serviço (ver PDF de referência,
// MAC_0994.26). Isolada numa constante porque se repete em ~15 lugares.
const AZUL_MACFAB = "#1B4F91";

function formatarDataPorExtenso(iso: string | null): string {
  const data = iso ? new Date(`${iso}T12:00:00`) : new Date();
  return data.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

// Só os itens marcados aparecem no PDF final (pedido explícito do
// usuário) — desmarcados somem, mas continuam salvos (o usuário pode
// remarcar depois sem perder o texto). Sublista (Acabamento/Proteção)
// segue o mesmo padrão em "-" do modelo, um nível de recuo a mais.
function ListaChecklist({ itens }: { itens: ItemChecklistProposta[] }) {
  const marcados = itens.filter((i) => i.marcado);
  if (marcados.length === 0) return null;
  return (
    <ul className="list-none pl-0 leading-[1.25]">
      {marcados.map((i) => (
        <li key={i.id}>
          <span>&bull; {i.texto}{i.subitens && i.subitens.some((s) => s.marcado) ? ":" : ";"}</span>
          {i.subitens && i.subitens.some((s) => s.marcado) && (
            <ul className="list-none pl-3">
              {i.subitens.filter((s) => s.marcado).map((s) => (
                <li key={s.id}>- {s.texto};</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

interface Props {
  mac: string;
  identificacaoCliente: IdentificacaoCliente;
  proposta: PropostaConfig;
  // true = pré-visualização em tela (ver PainelProposta.tsx); default
  // false = só aparece na impressão (window.print(), igual RelatorioImpressao).
  preview?: boolean;
}

/**
 * Reprodução fiel do modelo oficial de proposta comercial da Macfab
 * (pedido explícito do usuário, ver PDF de referência MAC_0994.26) — igual
 * a RelatorioImpressao.tsx, fica escondida por padrão e só aparece na
 * impressão (`hidden print:block`), a não ser em modo `preview`, onde
 * fica visível na tela dentro da aba PROPOSTA pra mostrar exatamente o
 * que vai sair no PDF antes de gerar de verdade.
 */
export default function PropostaImpressao({ mac, identificacaoCliente, proposta, preview }: Props) {
  const dataEmissao = formatarDataPorExtenso(proposta.dataEmissao);

  return (
    <div
      // "folha-proposta" liga a página nomeada A4 paisagem definida em
      // globals.css (pedido explícito do usuário — o modelo de referência
      // da Macfab é horizontal, não retrato) só quando ISSO imprime, sem
      // afetar o Relatório do orçamento (que continua em retrato).
      className={`folha-proposta ${preview ? "block" : "hidden print:block"} print:text-black mx-auto w-full max-w-[297mm] bg-white p-2 text-[9.5px] leading-[1.25] text-black`}
      style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
    >
      <p className="text-right text-[8px] text-zinc-500">Pág. 1</p>

      <header className="mb-1.5 flex items-start justify-between">
        <div>
          <h1 className="text-sm font-bold" style={{ color: AZUL_MACFAB }}>
            {mac || "MAC — "}
          </h1>
          <p className="text-[11px] font-medium" style={{ color: AZUL_MACFAB }}>
            {proposta.tituloServico || "—"}
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/macfab-logo.png" alt="Macfab" className="h-7 w-auto shrink-0" />
      </header>

      <div className="mb-1.5 border border-black">
        <p className="py-0.5 text-center text-xs font-bold" style={{ color: AZUL_MACFAB }}>
          {identificacaoCliente.nomeCliente || "—"}
        </p>
        {proposta.contatoCliente && (
          <p className="pb-0.5 text-center text-[9px] text-blue-700">{proposta.contatoCliente}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-6">
        {/* Coluna esquerda */}
        <div className="flex flex-col gap-1">
          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>1. OBJETO:</p>
            <p>{OBJETO_PROPOSTA_TEXTO}</p>
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>2. PREÇO:</p>
            <table className="w-full border-collapse border border-black text-[10px]">
              <thead>
                <tr>
                  <th className="border border-black px-1 py-0.5 font-bold">ITEM</th>
                  <th className="border border-black px-1 py-0.5 font-bold">QTD</th>
                  <th className="border border-black px-1 py-0.5 font-bold">DISCRIMINAÇÃO</th>
                  <th className="border border-black px-1 py-0.5 font-bold">R$ TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {proposta.itensPreco.map((item, i) => (
                  <tr key={i} className="break-inside-avoid">
                    <td className="border border-black px-1 py-0.5 text-center">{item.item}</td>
                    <td className="border border-black px-1 py-0.5 text-center">{item.quantidade}</td>
                    <td className="border border-black px-1 py-0.5 whitespace-pre-line">{item.discriminacao}</td>
                    <td className="border border-black px-1 py-0.5 text-right font-medium">
                      {formatarMoeda(item.valorTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>3. IMPOSTOS:</p>
            <table className="w-full border-collapse border border-black text-[10px]">
              <tbody>
                <tr>
                  <td className="border border-black px-1 py-0.5">IPI: {proposta.ipi}</td>
                  <td className="border border-black px-1 py-0.5">ICMS - PIS-COFINS: {proposta.icmsPisCofins}</td>
                  <td className="border border-black px-1 py-0.5">NCM: {proposta.ncm || "—"}</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>4. CONDIÇÕES DE PAGAMENTO:</p>
            <p>{identificacaoCliente.condicaoPagamento || "—"}</p>
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>5. PRAZO DE ENTREGA:</p>
            <p>{proposta.prazoEntrega}</p>
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>6. LOCAL DE ENTREGA:</p>
            <p>{proposta.localEntrega || "—"}</p>
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>7. ESCOPO / FORNECIDO PELA MACFAB:</p>
            <ListaChecklist itens={proposta.escopoMacfab} />
          </section>
        </div>

        {/* Coluna direita */}
        <div className="flex flex-col gap-1">
          <section className="break-inside-avoid border border-black p-1">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>8. EXCLUSÕES / FORNECIDO PELO CLIENTE:</p>
            <ListaChecklist itens={proposta.exclusoesCliente} />
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>9. VALIDADE:</p>
            <p>{proposta.validade}</p>
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>10. GARANTIA:</p>
            <p>{proposta.garantia}</p>
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>11. QUALIDADE:</p>
            <p>{proposta.qualidade}</p>
          </section>

          <section className="break-inside-avoid">
            <p className="font-bold" style={{ color: AZUL_MACFAB }}>12. NOTAS E CONSIDERAÇÕES:</p>
            <p>{proposta.notasConsideracoes}</p>
          </section>

          <section className="break-inside-avoid mt-1 text-right">
            <p>{CIDADE_EMISSAO}, {dataEmissao}</p>
            <p className="mt-1">Cordialmente,</p>
            <p className="mt-1 text-xs font-bold italic" style={{ fontFamily: "'Brush Script MT', cursive" }}>
              {RESPONSAVEL_COMERCIAL.nome}
            </p>
            <p>{RESPONSAVEL_COMERCIAL.email}</p>
            <p>{RESPONSAVEL_COMERCIAL.telefone}</p>
          </section>
        </div>
      </div>

      <footer className="mt-1 border-t border-zinc-300 pt-0.5 text-center text-[8px] text-zinc-600">
        <p className="font-bold">&quot;ADVERTÊNCIA&quot;</p>
        <p>{AVISO_CONFIDENCIALIDADE}</p>
        <p className="text-[7px]">{ENDERECO_MACFAB}</p>
      </footer>
    </div>
  );
}
