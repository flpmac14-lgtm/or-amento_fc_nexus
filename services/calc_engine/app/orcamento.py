"""Orquestra o motor de cálculo: recebe os dados já extraídos/estimados de um
orçamento e devolve o resultado completo com memória de cálculo por linha.

Este módulo assume que peso, área, horas de usinagem e quantidade de
posições de engenharia já chegaram prontos (vindos do motor geométrico, da
extração do desenho, de histórico ou de input manual do orçamentista) — ver
o aviso em app/processos.py sobre o que este motor NÃO decide sozinho.
"""

from __future__ import annotations

from app import processos
from app.comercial import formar_preco
from app.parametros_padrao import ALIQUOTAS_COMPRA_POR_TIPO, PARAMETROS_PADRAO
from app.schemas import LinhaCusto, ResultadoOrcamento


def _agregar_materia_prima(itens: list[dict]) -> LinhaCusto:
    icms, pis_cofins = ALIQUOTAS_COMPRA_POR_TIPO["materia_prima"]
    bruto_total = 0.0
    memoria = []
    for item in itens:
        bruto, _ = processos.materia_prima_linha(item["descricao"], item["peso_kg"], item["preco_kg"])
        bruto_total += bruto
        memoria.append(
            f"{item['descricao']}: {item['peso_kg']} kg × R$ {item['preco_kg']}/kg = R$ {bruto:.2f}"
        )
    liquido = bruto_total * (1 - icms - pis_cofins)
    return LinhaCusto(
        codigo="materia_prima",
        descricao="Matéria-prima",
        valor_bruto=bruto_total,
        aliquota_icms=icms,
        aliquota_pis_cofins=pis_cofins,
        valor_liquido=liquido,
        memoria_calculo=memoria,
    )


def _agregar_itens_padrao(itens: list[dict]) -> LinhaCusto:
    icms, pis_cofins = ALIQUOTAS_COMPRA_POR_TIPO["item_padrao"]
    bruto_total = sum(item["quantidade"] * item["preco_unitario"] for item in itens)
    liquido = bruto_total * (1 - icms - pis_cofins)
    memoria = [
        f"{item['descricao']}: {item['quantidade']} × R$ {item['preco_unitario']} = "
        f"R$ {item['quantidade'] * item['preco_unitario']:.2f}"
        for item in itens
    ]
    return LinhaCusto(
        codigo="itens_padrao",
        descricao="Itens standard comerciais",
        valor_bruto=bruto_total,
        aliquota_icms=icms,
        aliquota_pis_cofins=pis_cofins,
        valor_liquido=liquido,
        memoria_calculo=memoria,
    )


def montar_orcamento(entrada: dict, params: dict | None = None) -> ResultadoOrcamento:
    params = params or PARAMETROS_PADRAO
    peso_liquido_kg = entrada["peso_liquido_kg"]

    linhas: list[LinhaCusto] = []

    if entrada.get("materia_prima"):
        linhas.append(_agregar_materia_prima(entrada["materia_prima"]))
    if entrada.get("itens_padrao"):
        linhas.append(_agregar_itens_padrao(entrada["itens_padrao"]))

    linhas.append(processos.corte(peso_liquido_kg, params))

    linha_caldeiraria = processos.caldeiraria(peso_liquido_kg, params)
    linhas.append(linha_caldeiraria)
    linhas.append(processos.jateamento_pintura_mo(linha_caldeiraria.horas, params))

    if entrada.get("usinagem_operacoes"):
        linhas.append(processos.usinagem(entrada["usinagem_operacoes"], params))

    linhas.append(processos.solda(peso_liquido_kg, params))

    if entrada.get("area_pintura_m2"):
        linhas.append(processos.pintura_material(entrada["area_pintura_m2"], params))

    linhas.append(processos.ndt(peso_liquido_kg, params))

    if entrada.get("quantidade_posicoes_engenharia"):
        linhas.append(processos.engenharia(entrada["quantidade_posicoes_engenharia"], params))

    linhas.append(processos.embalagem(peso_liquido_kg, params))
    linhas.append(processos.transporte(peso_liquido_kg, params))
    linhas.append(processos.energia(peso_liquido_kg, params))

    custo_industrial = sum(l.valor_liquido for l in linhas)

    comercial = formar_preco(
        custo_industrial=custo_industrial,
        peso_liquido_kg=peso_liquido_kg,
        cenario_comercial=entrada.get("cenario_comercial", "venda_fabricacao"),
        params=params,
    )

    return ResultadoOrcamento(linhas=linhas, comercial=comercial)
