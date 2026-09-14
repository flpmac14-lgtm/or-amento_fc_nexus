"""Cada processo vira uma linha de custo auditável (LinhaCusto), com a
memória de cálculo exibível no "Ver cálculo" do orçamento.

O que este módulo NÃO faz: decidir quantas horas de caldeiraria/usinagem uma
peça vai levar a partir só do desenho. Isso é o problema de três camadas
descrito na especificação (regra industrial simples aqui; histórico
Macfab e ajuste por IA ficam para uma camada futura de estimativa,
fora deste motor determinístico). As funções aqui recebem horas/área/
quantidades já decididas (por regra simples, por histórico, ou por
input manual do orçamentista) e só fazem a conta de custo.
"""

from __future__ import annotations

from app.schemas import LinhaCusto


def _linha(codigo: str, descricao: str, valor_bruto: float, tipo_aliquota: str, params: dict, horas: float | None = None, memoria: list[str] | None = None) -> LinhaCusto:
    icms, pis_cofins = params["aliquotas_compra_por_tipo"][tipo_aliquota]
    valor_liquido = valor_bruto * (1 - icms - pis_cofins)
    return LinhaCusto(
        codigo=codigo,
        descricao=descricao,
        valor_bruto=valor_bruto,
        aliquota_icms=icms,
        aliquota_pis_cofins=pis_cofins,
        valor_liquido=valor_liquido,
        horas=horas,
        memoria_calculo=memoria or [],
    )


def corte(peso_liquido_kg: float, params: dict) -> LinhaCusto:
    valor_kg = params["corte_valor_kg"]
    bruto = peso_liquido_kg * valor_kg
    return _linha(
        "corte", "Corte (oxicorte/plasma/laser)", bruto, "corte", params,
        memoria=[f"{peso_liquido_kg} kg × R$ {valor_kg}/kg = R$ {bruto:.2f}"],
    )


def caldeiraria(peso_liquido_kg: float, params: dict) -> LinhaCusto:
    fator = params["caldeiraria_fator_h_kg"]
    valor_hora = params["caldeiraria_valor_hora"]
    horas = peso_liquido_kg * fator
    bruto = horas * valor_hora
    return _linha(
        "caldeiraria", "Caldeiraria (corte, dobra, montagem, solda, desempeno, inspeção)",
        bruto, "caldeiraria", params, horas=round(horas, 2),
        memoria=[
            f"{peso_liquido_kg} kg × {fator} h/kg = {horas:.2f} h",
            f"{horas:.2f} h × R$ {valor_hora}/h = R$ {bruto:.2f}",
        ],
    )


def jateamento_pintura_mo(horas_caldeiraria: float, params: dict) -> LinhaCusto:
    divisor = params["jateamento_pintura_divisor"]
    valor_hora = params["jateamento_pintura_valor_hora"]
    horas = horas_caldeiraria / divisor
    bruto = horas * valor_hora
    return _linha(
        "jateamento_pintura_mo", "Jateamento e pintura (mão de obra) — ISO 8501-1",
        bruto, "jateamento_pintura_mo", params, horas=round(horas, 2),
        memoria=[
            f"{horas_caldeiraria:.2f} h caldeiraria ÷ {divisor} = {horas:.2f} h",
            f"{horas:.2f} h × R$ {valor_hora}/h = R$ {bruto:.2f}",
        ],
    )


def usinagem(operacoes: list[dict], params: dict) -> LinhaCusto:
    """operacoes: [{"maquina": "convencional", "horas": 8, "valor_hora": 75}, ...]"""
    bruto = sum(op["horas"] * op["valor_hora"] for op in operacoes)
    horas_total = sum(op["horas"] for op in operacoes)
    memoria = [f"{op['maquina']}: {op['horas']} h × R$ {op['valor_hora']}/h" for op in operacoes]
    memoria.append(f"Total = R$ {bruto:.2f}")
    return _linha("usinagem", "Usinagem", bruto, "usinagem", params, horas=horas_total, memoria=memoria)


def solda(peso_liquido_kg: float, params: dict) -> LinhaCusto:
    fator_consumo = params["solda_fator_consumo_percentual"]
    preco_kg_consumivel = params["solda_preco_kg_consumivel"]
    kg_consumivel = peso_liquido_kg * fator_consumo
    valor_consumivel = kg_consumivel * preco_kg_consumivel

    fator_gas = params["solda_fator_gas_sobre_consumivel"]
    preco_unidade_gas = params["solda_preco_unidade_gas"]
    unidade_gas = kg_consumivel * fator_gas
    valor_gas = unidade_gas * preco_unidade_gas

    bruto = valor_consumivel + valor_gas
    return _linha(
        "solda", "Soldagem (consumível + gás de proteção)", bruto, "solda_consumivel", params,
        memoria=[
            f"Consumível: {peso_liquido_kg} kg × {fator_consumo*100:.0f}% = {kg_consumivel:.2f} kg "
            f"× R$ {preco_kg_consumivel}/kg = R$ {valor_consumivel:.2f}",
            f"Gás: {kg_consumivel:.2f} kg × {fator_gas*100:.0f}% = {unidade_gas:.2f} × "
            f"R$ {preco_unidade_gas} = R$ {valor_gas:.2f}",
        ],
    )


def pintura_material(area_m2: float, params: dict) -> LinhaCusto:
    fator = params["pintura_fator_l_m2"]
    bruto = 0.0
    memoria = []
    for demao in params["pintura_demaos"]:
        litros = area_m2 * fator
        valor = litros * demao["preco_litro"]
        bruto += valor
        memoria.append(
            f"{demao['tipo']}: {area_m2} m² × {fator} L/m² = {litros:.2f} L × "
            f"R$ {demao['preco_litro']}/L = R$ {valor:.2f}"
        )
    return _linha("pintura_material", "Pintura (material)", bruto, "pintura_material", params, memoria=memoria)


def ndt(peso_liquido_kg: float, params: dict) -> LinhaCusto:
    valor_kg = params["ndt_valor_kg"]
    bruto = peso_liquido_kg * valor_kg
    return _linha(
        "ndt", "Ensaios não destrutivos (LP/PM/US/dimensional)", bruto, "ndt", params,
        memoria=[f"{peso_liquido_kg} kg × R$ {valor_kg}/kg = R$ {bruto:.2f}"],
    )


def engenharia(quantidade_posicoes: float, params: dict) -> LinhaCusto:
    valor_unitario = params["engenharia_valor_unitario"]
    bruto = quantidade_posicoes * valor_unitario
    return _linha(
        "engenharia", "Engenharia industrial (desenho/croqui p/ delineamento)", bruto, "engenharia", params,
        memoria=[f"{quantidade_posicoes} posições × R$ {valor_unitario} = R$ {bruto:.2f}"],
    )


def custo_indireto_por_kg(codigo: str, descricao: str, peso_liquido_kg: float, params: dict) -> LinhaCusto:
    valor_kg = params[f"{codigo}_valor_kg"]
    bruto = peso_liquido_kg * valor_kg
    return _linha(
        codigo, descricao, bruto, codigo, params,
        memoria=[f"{peso_liquido_kg} kg × R$ {valor_kg}/kg = R$ {bruto:.2f}"],
    )


def embalagem(peso_liquido_kg: float, params: dict) -> LinhaCusto:
    return custo_indireto_por_kg("embalagem", "Embalagem", peso_liquido_kg, params)


def transporte(peso_liquido_kg: float, params: dict) -> LinhaCusto:
    return custo_indireto_por_kg("transporte", "Transporte", peso_liquido_kg, params)


def energia(peso_liquido_kg: float, params: dict) -> LinhaCusto:
    return custo_indireto_por_kg("energia", "Energia elétrica", peso_liquido_kg, params)


def materia_prima_linha(descricao: str, peso_kg: float, preco_kg: float) -> tuple[float, float]:
    """Retorna (valor_bruto, valor_liquido) de uma linha de matéria-prima,
    aplicando a alíquota padrão de compra (ICMS 18% + PIS/COFINS 9,25%)."""
    from app.parametros_padrao import ALIQUOTAS_COMPRA_POR_TIPO

    icms, pis_cofins = ALIQUOTAS_COMPRA_POR_TIPO["materia_prima"]
    bruto = peso_kg * preco_kg
    liquido = bruto * (1 - icms - pis_cofins)
    return bruto, liquido
