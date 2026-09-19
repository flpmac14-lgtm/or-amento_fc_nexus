import { buscarPrecoMercado, type ItemEstruturadoIA } from "./api";
import type { ItemCalculado } from "./types";

// Ordena pela POS do desenho (crescente) e numera o "Item" sequencialmente
// a partir de itemNumInicial — usado tanto na inserção automática do
// relatório técnico por IA no Cálculo manual quanto na importação manual de
// Excel (pedido explícito do usuário: manter a posição igual à do desenho,
// item só sequencial).
export function renumerarItensPorPosicao(
  itens: ItemCalculado[],
  itemNumInicial: number,
): { itens: ItemCalculado[]; proximoItemNum: number } {
  const ordenados = [...itens].sort(
    (a, b) => (parseFloat(a.posicao) || 0) - (parseFloat(b.posicao) || 0),
  );
  let itemNum = itemNumInicial;
  const renumerados = ordenados.map((item) => ({
    ...item,
    posicao: `Posição ${item.posicao} - Item ${itemNum++}`,
  }));
  return { itens: renumerados, proximoItemNum: itemNum };
}

const CAMPOS_DIMENSAO: Array<[string, string]> = [
  ["comprimento_mm", "Compr."],
  ["largura_mm", "Larg."],
  ["espessura_mm", "Esp."],
  ["diametro_mm", "Ø"],
  ["diametro_externo_mm", "Øext"],
  ["diametro_interno_mm", "Øint"],
  ["diametro_maior_mm", "Ømaior"],
  ["diametro_menor_mm", "Ømenor"],
  ["base_mm", "Base"],
  ["altura_mm", "Alt."],
  ["base_menor_mm", "Base menor"],
  ["base_maior_mm", "Base maior"],
  ["diagonal_maior_mm", "Diag. maior"],
  ["diagonal_menor_mm", "Diag. menor"],
  ["aba_mm", "Aba"],
  ["angulo_graus", "Ângulo"],
  ["espessura_parede_mm", "Parede"],
];

function formatarDimensoes(item: ItemEstruturadoIA): string {
  return CAMPOS_DIMENSAO.map(([chave, rotulo]) => {
    const valor = item[chave];
    return typeof valor === "number" ? `${rotulo} ${valor}mm` : null;
  })
    .filter((v): v is string => Boolean(v))
    .join(" × ");
}

// Converte a BOM extraída pela IA em cartões "Peso direto" pro Cálculo
// manual — pedido explícito do usuário: inserção rápida usando o peso
// impresso no desenho/estimado pela IA diretamente, sem recalcular pela
// geometria (isso continua disponível à parte via Excel, pra quem quiser
// conferir com mais precisão depois — ver /relatorio-tecnico/importar-excel).
// Descrição empacota material/qtd/dimensões junto, porque a lista de itens
// do Cálculo manual só mostra a descrição e o peso total (ver
// CalculoManual.tsx::linhasExibicao) — sem isso essa informação ficaria
// invisível até abrir o item pra editar.
//
// Busca o preço/kg de referência por norma+espessura (mesma fonte que o
// cartão "Peso direto" manual usa) ANTES de montar o item — sem isso o
// backend não consegue calcular o custo desse item (CATEGORIA_PRECO_POR_TIPO
// não conhece "peso_direto", então ele não sabe em qual tabela de preço
// procurar) e o item inteiro cai em "itens para revisão" em vez de entrar
// no orçamento (bug real encontrado testando em produção: 7/7 itens
// inseridos, mas orçamento saía zerado). Item sem norma reconhecida ou sem
// referência de preço continua sem preço — vai pra revisão mesmo, que é o
// comportamento certo (não inventar preço).
export async function converterParaPesoDireto(
  itens: ItemEstruturadoIA[],
): Promise<{ itens: ItemCalculado[]; ignorados: { posicao: string; descricao: string; motivo: string }[] }> {
  const calculados: ItemCalculado[] = [];
  const ignorados: { posicao: string; descricao: string; motivo: string }[] = [];

  for (const item of itens) {
    const pesoUnitario = item.peso_unitario_estimado_kg;
    if (pesoUnitario == null || pesoUnitario <= 0) {
      ignorados.push({
        posicao: item.posicao,
        descricao: item.descricao,
        motivo: "IA não informou peso estimado — adicione essa peça manualmente.",
      });
      continue;
    }
    const quantidade = item.quantidade || 1;
    const materialTexto = item.norma || "material não especificado";
    const dimensoesTexto = formatarDimensoes(item);
    const descricao = [item.descricao, materialTexto, `Qtd: ${quantidade}`, dimensoesTexto || null]
      .filter(Boolean)
      .join(" · ");
    const espessura = typeof item.espessura_mm === "number" ? item.espessura_mm : null;

    let precoKg: number | undefined;
    if (item.norma && espessura !== null) {
      try {
        const preco = await buscarPrecoMercado(item.norma, espessura);
        if (preco.encontrado) precoKg = preco.preco_kg;
      } catch {
        // Sem referência de preço pra essa norma/espessura — item ainda
        // entra no Cálculo manual, só não terá custo calculado até o
        // orçamentista informar o preço/kg manualmente.
      }
    }

    calculados.push({
      posicao: item.posicao,
      tipo: "peso_direto",
      tipoRotulo: "Peso direto",
      descricao,
      norma: item.norma ?? "",
      quantidade,
      peso_kg: pesoUnitario * quantidade,
      memoria_calculo: `${pesoUnitario} kg/un (extraído/estimado pela IA) × qtd ${quantidade} = ${(pesoUnitario * quantidade).toFixed(2)} kg`,
      preco_kg: precoKg,
      formSnapshot: espessura !== null ? { espessura_mm: String(espessura) } : undefined,
    });
  }

  return { itens: calculados, ignorados };
}
