"""Formação de preço — item 13 da especificação.

custo_industrial já é a soma de todas as linhas LÍQUIDAS (matéria-prima e
processos, impostos de compra já descontados). A partir daqui:

  preco_venda_com_impostos = custo_industrial × (1 + fator_margem)
  imposto_a_pagar          = preco_venda_com_impostos × aliquota_venda(cenario)
  margem_lucro             = preco_venda_com_impostos − imposto_a_pagar − custo_industrial
  preco_venda_sem_impostos = preco_venda_com_impostos × (1 − aliquota_venda(cenario))
  preco_venda_por_kg       = preco_venda_com_impostos / peso_liquido_kg
"""

from __future__ import annotations

from app.schemas import ResumoComercial


def formar_preco(
    custo_industrial: float, peso_liquido_kg: float, cenario_comercial: str, params: dict
) -> ResumoComercial:
    fator_margem = params["fator_margem_venda"]
    aliquota_venda = params["aliquota_venda_por_cenario"][cenario_comercial]

    preco_venda_com_impostos = custo_industrial * (1 + fator_margem)
    imposto_a_pagar = preco_venda_com_impostos * aliquota_venda
    margem_lucro = preco_venda_com_impostos - imposto_a_pagar - custo_industrial
    preco_venda_sem_impostos = preco_venda_com_impostos * (1 - aliquota_venda)
    preco_venda_por_kg = preco_venda_com_impostos / peso_liquido_kg if peso_liquido_kg else 0.0

    return ResumoComercial(
        cenario_comercial=cenario_comercial,
        custo_industrial=round(custo_industrial, 2),
        fator_margem=fator_margem,
        aliquota_venda=aliquota_venda,
        preco_venda_com_impostos=round(preco_venda_com_impostos, 2),
        preco_venda_sem_impostos=round(preco_venda_sem_impostos, 2),
        imposto_a_pagar=round(imposto_a_pagar, 2),
        margem_lucro=round(margem_lucro, 2),
        margem_percentual=round(margem_lucro / preco_venda_com_impostos, 4) if preco_venda_com_impostos else 0.0,
        peso_liquido_kg=peso_liquido_kg,
        preco_venda_por_kg=round(preco_venda_por_kg, 2),
    )
