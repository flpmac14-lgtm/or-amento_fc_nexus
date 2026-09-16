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
from app.estimativa_horas import estimar_horas_caldeiraria
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


def _agregar_insumos_pintura(itens: list[dict]) -> LinhaCusto:
    """Insumos de pintura escolhidos item a item (tinta de fundo,
    intermediária, acabamento, diluente etc.) — mesma mecânica de
    `_agregar_itens_padrao`, mas com a alíquota de "pintura_material"
    (a mesma da linha de pintura por fórmula/área, ver processos.py), já
    que ambas são compra de material de terceiros com o mesmo tratamento
    fiscal. Pensado pro cálculo manual, onde o plano de pintura pedido
    (quais produtos, quantos litros de cada) varia por orçamento e não dá
    pra cravar numa fórmula única de R$/m²."""
    icms, pis_cofins = ALIQUOTAS_COMPRA_POR_TIPO["pintura_material"]
    bruto_total = sum(item["quantidade"] * item["preco_unitario"] for item in itens)
    liquido = bruto_total * (1 - icms - pis_cofins)
    memoria = [
        f"{item['descricao']}: {item['quantidade']} L × R$ {item['preco_unitario']}/L = "
        f"R$ {item['quantidade'] * item['preco_unitario']:.2f}"
        for item in itens
    ]
    return LinhaCusto(
        codigo="insumos_pintura",
        descricao="Insumos de pintura",
        valor_bruto=bruto_total,
        aliquota_icms=icms,
        aliquota_pis_cofins=pis_cofins,
        valor_liquido=liquido,
        memoria_calculo=memoria,
    )


def _agregar_servicos_terceiros(itens: list[dict]) -> LinhaCusto:
    """Serviços de outsourcing cobrados por peso (conformação pesada/dobra
    em calandra, rebordeamento de tampos, balanceamento etc.) — pedido a
    partir do print da planilha de referência Macfab, seção "SERVIÇOS
    (OUTSOURCING)". Mesma alíquota de "usinagem" (0% ICMS + 9,25%
    PIS/COFINS) por analogia — é serviço de terceiro subcontratado, igual
    usinagem/NDT; ajustar se a empresa usar outra alíquota real pra isso."""
    icms, pis_cofins = ALIQUOTAS_COMPRA_POR_TIPO["usinagem"]
    bruto_total = sum(item["peso_kg"] * item["valor_kg"] for item in itens)
    liquido = bruto_total * (1 - icms - pis_cofins)
    memoria = [
        f"{item['descricao']}: {item['peso_kg']} kg × R$ {item['valor_kg']}/kg = "
        f"R$ {item['peso_kg'] * item['valor_kg']:.2f}"
        for item in itens
    ]
    return LinhaCusto(
        codigo="servicos_terceiros",
        descricao="Serviços de terceiros (outsourcing)",
        valor_bruto=bruto_total,
        aliquota_icms=icms,
        aliquota_pis_cofins=pis_cofins,
        valor_liquido=liquido,
        memoria_calculo=memoria,
    )


def _agregar_tratamento_termico(itens: list[dict]) -> LinhaCusto:
    """Alívio de tensões/normalização, têmpera/revenimento/cementação/
    nitretação etc. — seção "TRATAMENTO TÉRMICO (OUTSOURCING)" da planilha
    de referência. Mesma alíquota/justificativa de `_agregar_servicos_terceiros`."""
    icms, pis_cofins = ALIQUOTAS_COMPRA_POR_TIPO["usinagem"]
    bruto_total = sum(item["peso_kg"] * item["valor_kg"] for item in itens)
    liquido = bruto_total * (1 - icms - pis_cofins)
    memoria = [
        f"{item['descricao']}: {item['peso_kg']} kg × R$ {item['valor_kg']}/kg = "
        f"R$ {item['peso_kg'] * item['valor_kg']:.2f}"
        for item in itens
    ]
    return LinhaCusto(
        codigo="tratamento_termico",
        descricao="Tratamento térmico (outsourcing)",
        valor_bruto=bruto_total,
        aliquota_icms=icms,
        aliquota_pis_cofins=pis_cofins,
        valor_liquido=liquido,
        memoria_calculo=memoria,
    )


def _agregar_contingenciamento(itens: list[dict]) -> LinhaCusto:
    """Provisão de qualificação/contingência — seção "QUALIFICAÇÕES/
    CONTINGÊNCIA ETC." da planilha de referência. Não é compra de
    terceiro (é uma provisão interna de risco), por isso sem ICMS/PIS-
    COFINS — mesmo tratamento fiscal de "engenharia"."""
    icms, pis_cofins = ALIQUOTAS_COMPRA_POR_TIPO["engenharia"]
    bruto_total = sum(item["quantidade"] * item["valor_unitario"] for item in itens)
    liquido = bruto_total * (1 - icms - pis_cofins)
    memoria = [
        f"{item['descricao']}: {item['quantidade']} × R$ {item['valor_unitario']} = "
        f"R$ {item['quantidade'] * item['valor_unitario']:.2f}"
        for item in itens
    ]
    return LinhaCusto(
        codigo="contingenciamento",
        descricao="Qualificações / contingência",
        valor_bruto=bruto_total,
        aliquota_icms=icms,
        aliquota_pis_cofins=pis_cofins,
        valor_liquido=liquido,
        memoria_calculo=memoria,
    )


# Parâmetros escalares (R$/kg, R$/h, fator, %) que o botão "editar" do
# "Custo por processo" pode sobrescrever, um a um — a fórmula de cada
# processo (ver app/processos.py) continua fixa, só a taxa/unidade muda.
# Pedido explícito do usuário: editar o resultado final (valor bruto) direto
# quebrava a auditabilidade da memória de cálculo; editando o parâmetro, o
# "Ver cálculo" continua batendo com o número mostrado.
PARAMS_ESCALARES_SOBRESCREVIVEIS: list[str] = [
    "corte_valor_kg",
    "caldeiraria_fator_h_kg", "caldeiraria_valor_hora",
    "jateamento_pintura_divisor", "jateamento_pintura_valor_hora",
    "solda_fator_consumo_percentual", "solda_preco_kg_consumivel",
    "solda_fator_gas_sobre_consumivel", "solda_preco_unidade_gas",
    "pintura_fator_l_m2",
    "ndt_valor_kg",
    "engenharia_valor_unitario",
    "embalagem_valor_kg", "transporte_valor_kg", "energia_valor_kg",
]


def resolver_params(entrada: dict, params: dict | None = None) -> dict:
    """Aplica sobre PARAMETROS_PADRAO os overrides vindos de `entrada` —
    cada chave em PARAMS_ESCALARES_SOBRESCREVIVEIS, mais os dois preços de
    pintura (fundo/acabamento, que na fixture vêm como lista `pintura_demaos`
    em vez de escalar — reconstruída aqui pra caber no mesmo padrão de
    edição). Usado tanto por `montar_orcamento` quanto por
    `app.excel_export.gerar_excel_orcamento`, pra o Excel editável (POST
    /orcamento/excel, que reusa a mesma `entrada`) bater com o que apareceu
    na tela em vez de voltar ao padrão."""
    params = dict(params or PARAMETROS_PADRAO)
    for chave in PARAMS_ESCALARES_SOBRESCREVIVEIS:
        if entrada.get(chave) is not None:
            params[chave] = entrada[chave]

    precos_atuais = {d["tipo"]: d["preco_litro"] for d in params["pintura_demaos"]}
    if entrada.get("pintura_preco_fundo") is not None or entrada.get("pintura_preco_acabamento") is not None:
        preco_fundo = entrada.get("pintura_preco_fundo", precos_atuais.get("fundo"))
        preco_acabamento = entrada.get("pintura_preco_acabamento", precos_atuais.get("acabamento"))
        params["pintura_demaos"] = [
            {"tipo": "fundo", "preco_litro": preco_fundo},
            {"tipo": "acabamento", "preco_litro": preco_acabamento},
        ]

    # Espelha os preços de pintura como chaves escalares também — só pra dar
    # pro frontend pré-preencher o "editar" da linha de pintura com o mesmo
    # padrão dos outros parâmetros (a lista `pintura_demaos` acima é o que
    # de fato alimenta app/processos.py::pintura_material).
    demaos = {d["tipo"]: d["preco_litro"] for d in params["pintura_demaos"]}
    params["pintura_preco_fundo"] = demaos.get("fundo")
    params["pintura_preco_acabamento"] = demaos.get("acabamento")

    return params


def montar_orcamento(entrada: dict, params: dict | None = None) -> ResultadoOrcamento:
    params = resolver_params(entrada, params)
    peso_liquido_kg = entrada["peso_liquido_kg"]

    linhas: list[LinhaCusto] = []

    if entrada.get("materia_prima"):
        linhas.append(_agregar_materia_prima(entrada["materia_prima"]))
    if entrada.get("itens_padrao"):
        linhas.append(_agregar_itens_padrao(entrada["itens_padrao"]))

    linhas.append(processos.corte(peso_liquido_kg, params))

    if entrada.get("usar_historico_horas"):
        estimativa = estimar_horas_caldeiraria(peso_liquido_kg, params, entrada.get("historico_horas"))
        linha_caldeiraria = processos.caldeiraria(
            peso_liquido_kg, params,
            horas_override=estimativa["horas_caldeiraria"],
            memoria_override=estimativa["memoria"],
        )
    else:
        linha_caldeiraria = processos.caldeiraria(peso_liquido_kg, params)
    linhas.append(linha_caldeiraria)
    linhas.append(processos.jateamento_pintura_mo(linha_caldeiraria.horas, params))

    if entrada.get("usinagem_operacoes"):
        linhas.append(processos.usinagem(entrada["usinagem_operacoes"], params))
    if entrada.get("servicos_terceiros"):
        linhas.append(_agregar_servicos_terceiros(entrada["servicos_terceiros"]))
    if entrada.get("tratamento_termico"):
        linhas.append(_agregar_tratamento_termico(entrada["tratamento_termico"]))

    linhas.append(processos.solda(peso_liquido_kg, params))

    if entrada.get("area_pintura_m2"):
        linhas.append(processos.pintura_material(entrada["area_pintura_m2"], params))
    if entrada.get("insumos_pintura"):
        linhas.append(_agregar_insumos_pintura(entrada["insumos_pintura"]))

    linhas.append(processos.ndt(peso_liquido_kg, params))

    if entrada.get("quantidade_posicoes_engenharia"):
        linhas.append(processos.engenharia(entrada["quantidade_posicoes_engenharia"], params))
    if entrada.get("contingenciamento"):
        linhas.append(_agregar_contingenciamento(entrada["contingenciamento"]))

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
