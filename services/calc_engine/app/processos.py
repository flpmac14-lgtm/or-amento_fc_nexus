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
    """peso_liquido_kg é o peso padrão (líquido) do orçamento inteiro. A
    linha de corte pode sobrescrever só o peso dela (`corte_peso_kg` — ex:
    peso de compra/bruto, quando o corte fizer mais sentido cobrado assim) e
    somar um % adicional (`corte_fator_percentual_adicional`) sem mexer no
    R$/kg base — ambos opcionais, ver parametros_padrao.py."""
    peso = params.get("corte_peso_kg")
    if peso is None:
        peso = peso_liquido_kg
    valor_kg = params["corte_valor_kg"]
    fator_adicional_pct = params.get("corte_fator_percentual_adicional") or 0.0

    bruto_base = peso * valor_kg
    bruto = bruto_base * (1 + fator_adicional_pct / 100)

    memoria = [f"{peso} kg × R$ {valor_kg}/kg = R$ {bruto_base:.2f}"]
    if fator_adicional_pct:
        memoria.append(f"+ {fator_adicional_pct:.2f}% = R$ {bruto:.2f}")

    return _linha(
        "corte", "Corte (oxicorte/plasma/laser)", bruto, "corte", params,
        memoria=memoria,
    )


def caldeiraria(peso_liquido_kg: float, params: dict, horas_override: float | None = None, memoria_override: list[str] | None = None) -> LinhaCusto:
    """Por padrão usa a regra simples (peso × fator h/kg — camada 1). Passe
    `horas_override` para usar um valor já decidido por outra camada (ex:
    app.estimativa_horas, que combina isso com o histórico Macfab) sem
    duplicar a lógica de custo/memória daqui.

    `caldeiraria_peso_kg` é um override opcional só do peso usado nessa
    conta (regra simples) — igual `corte_peso_kg`/`solda_peso_kg` já
    fazem — None = usa o peso líquido do orçamento. Não se aplica quando
    `horas_override` já veio pronto de outra camada (o peso já foi
    considerado lá)."""
    valor_hora = params["caldeiraria_valor_hora"]

    if horas_override is not None:
        horas = horas_override
        memoria = memoria_override or [f"{horas:.2f} h (estimativa combinada, ver app.estimativa_horas)"]
    else:
        peso = params.get("caldeiraria_peso_kg")
        if peso is None:
            peso = peso_liquido_kg
        fator = params["caldeiraria_fator_h_kg"]
        horas = peso * fator
        memoria = [f"{peso} kg × {fator} h/kg = {horas:.2f} h"]

    bruto = horas * valor_hora
    memoria = memoria + [f"{horas:.2f} h × R$ {valor_hora}/h = R$ {bruto:.2f}"]
    return _linha(
        "caldeiraria", "Caldeiraria (corte, dobra, montagem, solda, desempeno, inspeção)",
        bruto, "caldeiraria", params, horas=round(horas, 2),
        memoria=memoria,
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
    """Insumos de solda — calibrado contra a planilha de referência "INSUMOS
    DE SOLDA" do usuário (consumível + gás de proteção, por tipo de metal de
    adição): carbono (FCAW E71T-1, GMAW ER70S-6, GTAW ER70S-3) sempre entra,
    proporcional ao peso da peça; inox (GMAW ER308/316L, GTAW ER308/309/
    316L/904L) é opt-in — não dá pra derivar do peso total quanto da peça é
    solda inox, então fica um campo manual (`solda_inox_qtd_kg`), 0 por
    padrão (não soma nada), disponível pra digitar quando a peça realmente
    levar solda inox. Cada gás de proteção acompanha o consumível
    correspondente (mesma % da planilha de referência: gás = consumível ×
    fator).

    O peso-base do consumível carbono (`solda_peso_kg`) e o peso-base do gás
    (`solda_gas_peso_kg`) são overrides opcionais — pedido explícito do
    usuário pra poder editar o peso usado em cada um, além da % e do R$/kg
    (que já eram editáveis) — igual `corte_peso_kg` já fazia pro corte.
    None = comportamento padrão (peso líquido do orçamento pro consumível;
    kg de consumível calculado pro gás)."""
    peso_consumivel = params.get("solda_peso_kg")
    if peso_consumivel is None:
        peso_consumivel = peso_liquido_kg
    fator_consumo = params["solda_fator_consumo_percentual"]
    preco_kg_consumivel = params["solda_preco_kg_consumivel"]
    kg_consumivel = peso_consumivel * fator_consumo
    valor_consumivel = kg_consumivel * preco_kg_consumivel

    peso_gas = params.get("solda_gas_peso_kg")
    if peso_gas is None:
        peso_gas = kg_consumivel
    fator_gas = params["solda_fator_gas_sobre_consumivel"]
    preco_unidade_gas = params["solda_preco_unidade_gas"]
    unidade_gas = peso_gas * fator_gas
    valor_gas = unidade_gas * preco_unidade_gas

    bruto = valor_consumivel + valor_gas
    memoria = [
        f"Consumível carbono: {peso_consumivel} kg × {fator_consumo*100:.0f}% = {kg_consumivel:.2f} kg "
        f"× R$ {preco_kg_consumivel}/kg = R$ {valor_consumivel:.2f}",
        f"Gás (100% CO2): {peso_gas:.2f} kg × {fator_gas*100:.0f}% = {unidade_gas:.2f} × "
        f"R$ {preco_unidade_gas} = R$ {valor_gas:.2f}",
    ]

    kg_inox = params.get("solda_inox_qtd_kg") or 0.0
    if kg_inox:
        preco_kg_inox = params["solda_inox_preco_kg_consumivel"]
        valor_inox = kg_inox * preco_kg_inox

        fator_gas_inox = params["solda_inox_fator_gas_sobre_consumivel"]
        preco_unidade_gas_inox = params["solda_inox_preco_unidade_gas"]
        unidade_gas_inox = kg_inox * fator_gas_inox
        valor_gas_inox = unidade_gas_inox * preco_unidade_gas_inox

        bruto += valor_inox + valor_gas_inox
        memoria.append(
            f"Consumível inox: {kg_inox} kg × R$ {preco_kg_inox}/kg = R$ {valor_inox:.2f}"
        )
        memoria.append(
            f"Gás (25% Ar-75% CO2): {kg_inox} kg × {fator_gas_inox*100:.0f}% = {unidade_gas_inox:.2f} × "
            f"R$ {preco_unidade_gas_inox} = R$ {valor_gas_inox:.2f}"
        )

    return _linha(
        "solda", "Soldagem (consumíveis carbono/inox + gases de proteção)", bruto, "solda_consumivel", params,
        memoria=memoria,
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
    """`{codigo}_peso_kg` é um override opcional só do peso usado nessa
    linha (igual corte_peso_kg/solda_peso_kg/caldeiraria_peso_kg já fazem)
    — None (o padrão pra quem não tem esse override cadastrado em
    parametros_padrao.py, ex: transporte/energia hoje) usa o peso líquido
    do orçamento."""
    peso = params.get(f"{codigo}_peso_kg")
    if peso is None:
        peso = peso_liquido_kg
    valor_kg = params[f"{codigo}_valor_kg"]
    bruto = peso * valor_kg
    return _linha(
        codigo, descricao, bruto, codigo, params,
        memoria=[f"{peso} kg × R$ {valor_kg}/kg = R$ {bruto:.2f}"],
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
