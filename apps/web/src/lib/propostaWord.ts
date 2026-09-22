// Exportação da aba "PROPOSTA" em .docx (Word) — pedido explícito do
// usuário, ao lado do "Gerar PDF" (window.print(), ver PropostaImpressao.tsx)
// que já existia. Gerado 100% no navegador com a lib `docx` (sem endpoint
// novo no backend: os dados da proposta já vivem inteiros no frontend,
// diferente do Excel do orçamento que precisa das fórmulas do calc_engine).
// Não é uma réplica pixel-a-pixel do PDF (esse é o layout oficial de
// impressão) — é a mesma informação, em formato editável no Word.
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { IdentificacaoCliente, ItemChecklistProposta, PropostaConfig } from "./types";
import {
  AVISO_CONFIDENCIALIDADE,
  CIDADE_EMISSAO,
  ENDERECO_MACFAB,
  OBJETO_PROPOSTA_TEXTO,
  RESPONSAVEL_COMERCIAL,
} from "./propostaPadrao";

// docx usa cor hex SEM "#" — mesmo azul do modelo (ver PropostaImpressao.tsx::AZUL_MACFAB).
const AZUL_MACFAB = "1B4F91";

const SEM_BORDA = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
} as const;

const COM_BORDA = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "000000" },
} as const;

function formatarMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataPorExtenso(iso: string | null): string {
  const data = iso ? new Date(`${iso}T12:00:00`) : new Date();
  return data.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

function tituloSecao(texto: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text: texto, bold: true, color: AZUL_MACFAB, size: 19 })],
  });
}

function paragrafoSimples(texto: string): Paragraph {
  return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: texto || "—", size: 18 })] });
}

// Mesma regra de PropostaImpressao.tsx::ListaChecklist — só itens marcados
// aparecem, subitens (Acabamento/Proteção) com "-" e um nível de recuo.
function listaChecklist(itens: ItemChecklistProposta[]): Paragraph[] {
  const paragrafos: Paragraph[] = [];
  for (const item of itens.filter((i) => i.marcado)) {
    const subitensMarcados = item.subitens?.filter((s) => s.marcado) ?? [];
    paragrafos.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [new TextRun({ text: `• ${item.texto}${subitensMarcados.length ? ":" : ";"}`, size: 18 })],
      }),
    );
    for (const sub of subitensMarcados) {
      paragrafos.push(
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 20 },
          children: [new TextRun({ text: `- ${sub.texto};`, size: 18 })],
        }),
      );
    }
  }
  return paragrafos;
}

function celula(children: (Paragraph | Table)[], destaque = false): TableCell {
  return new TableCell({
    borders: COM_BORDA,
    verticalAlign: VerticalAlign.CENTER,
    shading: destaque ? { fill: "E5E7EB" } : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children,
  });
}

function celulaTexto(texto: string, opcoes?: { negrito?: boolean; alinhamento?: (typeof AlignmentType)[keyof typeof AlignmentType] }): TableCell {
  return celula([
    new Paragraph({
      alignment: opcoes?.alinhamento ?? AlignmentType.LEFT,
      children: [new TextRun({ text: texto, bold: opcoes?.negrito, size: 16 })],
    }),
  ]);
}

function tabelaPreco(proposta: PropostaConfig): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: COM_BORDA,
    rows: [
      new TableRow({
        children: [
          celula([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ITEM", bold: true, size: 16 })] })], true),
          celula([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "QTD", bold: true, size: 16 })] })], true),
          celula([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DISCRIMINAÇÃO", bold: true, size: 16 })] })], true),
          celula([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "R$ TOTAL", bold: true, size: 16 })] })], true),
        ],
      }),
      ...proposta.itensPreco.map(
        (item) =>
          new TableRow({
            children: [
              celulaTexto(item.item, { alinhamento: AlignmentType.CENTER }),
              celulaTexto(item.quantidade, { alinhamento: AlignmentType.CENTER }),
              celula(
                (item.discriminacao || "—").split("\n").map((linha) => new Paragraph({ children: [new TextRun({ text: linha, size: 16 })] })),
              ),
              celulaTexto(formatarMoeda(item.valorTotal), { negrito: true, alinhamento: AlignmentType.RIGHT }),
            ],
          }),
      ),
    ],
  });
}

function tabelaImpostos(proposta: PropostaConfig): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: COM_BORDA,
    rows: [
      new TableRow({
        children: [
          celulaTexto(`IPI: ${proposta.ipi}`),
          celulaTexto(`ICMS - PIS-COFINS: ${proposta.icmsPisCofins}`),
          celulaTexto(`NCM: ${proposta.ncm || "—"}`),
        ],
      }),
    ],
  });
}

export async function gerarPropostaWordBlob(
  mac: string,
  identificacaoCliente: IdentificacaoCliente,
  proposta: PropostaConfig,
): Promise<Blob> {
  const logoBuffer = await fetch("/macfab-logo.png").then((r) => r.arrayBuffer());
  const dataEmissao = formatarDataPorExtenso(proposta.dataEmissao);

  const cabecalho = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SEM_BORDA,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: SEM_BORDA,
            width: { size: 75, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: mac || "MAC — ", bold: true, color: AZUL_MACFAB, size: 26 })] }),
              new Paragraph({ children: [new TextRun({ text: proposta.tituloServico || "—", bold: true, color: AZUL_MACFAB, size: 20 })] }),
            ],
          }),
          new TableCell({
            borders: SEM_BORDA,
            width: { size: 25, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new ImageRun({ type: "png", data: logoBuffer, transformation: { width: 110, height: 40 } })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const caixaCliente = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: COM_BORDA,
    rows: [
      new TableRow({
        children: [
          celula([
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: identificacaoCliente.nomeCliente || "—", bold: true, color: AZUL_MACFAB, size: 22 })],
            }),
            ...(proposta.contatoCliente
              ? [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: proposta.contatoCliente, color: "1D4ED8", size: 18 })],
                  }),
                ]
              : []),
          ]),
        ],
      }),
    ],
  });

  const colunaEsquerda: (Paragraph | Table)[] = [
    tituloSecao("1. OBJETO:"),
    paragrafoSimples(OBJETO_PROPOSTA_TEXTO),
    tituloSecao("2. PREÇO:"),
    tabelaPreco(proposta),
    tituloSecao("3. IMPOSTOS:"),
    tabelaImpostos(proposta),
    tituloSecao("4. CONDIÇÕES DE PAGAMENTO:"),
    paragrafoSimples(identificacaoCliente.condicaoPagamento),
    tituloSecao("5. PRAZO DE ENTREGA:"),
    paragrafoSimples(proposta.prazoEntrega),
    tituloSecao("6. LOCAL DE ENTREGA:"),
    paragrafoSimples(proposta.localEntrega),
    tituloSecao("7. ESCOPO / FORNECIDO PELA MACFAB:"),
    ...listaChecklist(proposta.escopoMacfab),
  ];

  const colunaDireita: (Paragraph | Table)[] = [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: COM_BORDA,
      rows: [
        new TableRow({
          children: [
            celula([tituloSecao("8. EXCLUSÕES / FORNECIDO PELO CLIENTE:"), ...listaChecklist(proposta.exclusoesCliente)]),
          ],
        }),
      ],
    }),
    tituloSecao("9. VALIDADE:"),
    paragrafoSimples(proposta.validade),
    tituloSecao("10. GARANTIA:"),
    paragrafoSimples(proposta.garantia),
    tituloSecao("11. QUALIDADE:"),
    paragrafoSimples(proposta.qualidade),
    tituloSecao("12. NOTAS E CONSIDERAÇÕES:"),
    paragrafoSimples(proposta.notasConsideracoes),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 200 }, children: [new TextRun({ text: `${CIDADE_EMISSAO}, ${dataEmissao}`, size: 16 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Cordialmente,", size: 16 })] }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 100 },
      children: [new TextRun({ text: RESPONSAVEL_COMERCIAL.nome, bold: true, italics: true, size: 18 })],
    }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: RESPONSAVEL_COMERCIAL.email, size: 16 })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: RESPONSAVEL_COMERCIAL.telefone, size: 16 })] }),
  ];

  const corpoDuasColunas = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: SEM_BORDA,
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: SEM_BORDA, verticalAlign: VerticalAlign.TOP, margins: { right: 200 }, children: colunaEsquerda }),
          new TableCell({ borders: SEM_BORDA, verticalAlign: VerticalAlign.TOP, margins: { left: 200 }, children: colunaDireita }),
        ],
      }),
    ],
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 500, bottom: 500, left: 500, right: 500 },
          },
        },
        children: [
          cabecalho,
          new Paragraph({ text: "" }),
          caixaCliente,
          new Paragraph({ text: "" }),
          corpoDuasColunas,
          new Paragraph({ spacing: { before: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: '"ADVERTÊNCIA"', bold: true, size: 14 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: AVISO_CONFIDENCIALIDADE, size: 13 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: ENDERECO_MACFAB, size: 12 })] }),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export async function baixarPropostaWord(
  mac: string,
  identificacaoCliente: IdentificacaoCliente,
  proposta: PropostaConfig,
): Promise<void> {
  const blob = await gerarPropostaWordBlob(mac, identificacaoCliente, proposta);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `proposta-${(mac || "orcamento").replace(/[\\/:*?"<>|]/g, "_")}.docx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
