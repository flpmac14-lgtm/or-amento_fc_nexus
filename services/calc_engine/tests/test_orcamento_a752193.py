"""Reconstrói o orçamento real MAC_0573.26 / A752193 (cliente Weir) linha a
linha, a partir da BOM e dos parâmetros extraídos da planilha de referência,
e confere que o motor de cálculo bate exatamente com os totais da aba
"RESUMO DO ORÇAMENTO" daquela planilha. Esta é a validação de que o motor
reproduz fielmente o raciocínio comercial que a Macfab já usa hoje.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.orcamento import montar_orcamento

ENTRADA_A752193 = {
    "peso_liquido_kg": 3319,
    "cenario_comercial": "venda_fabricacao",
    "materia_prima": [
        {"descricao": "PERFIL W310 x 52,0 kg/m", "peso_kg": 1191, "preco_kg": 10},
        {"descricao": "PERFIL W250 x 32,7 kg/m", "peso_kg": 438.49, "preco_kg": 10},
        {"descricao": "PERFIL W200 x 22,5 kg/m", "peso_kg": 156.01, "preco_kg": 10},
        {"descricao": 'CH 1.1/2" (38,1) ASTM A36', "peso_kg": 545, "preco_kg": 10},
        {"descricao": 'CH 3/16" (4,76) ASTM A37', "peso_kg": 26, "preco_kg": 8},
        {"descricao": 'CH 1.1/4" (31,75) ASTM A36', "peso_kg": 224, "preco_kg": 10},
        {"descricao": 'CH 3/4" (19,05) ASTM A36', "peso_kg": 215, "preco_kg": 8},
        {"descricao": 'CH 1/4" (6,35) ASTM A36', "peso_kg": 20, "preco_kg": 8},
        {"descricao": 'CH 5/8" (15,87) ASTM A36', "peso_kg": 161, "preco_kg": 8},
        {"descricao": 'CH 1" (25,4) ASTM A36', "peso_kg": 514, "preco_kg": 8},
        {"descricao": 'CH 1/4" (6,35) AISI 304', "peso_kg": 1, "preco_kg": 25},
    ],
    "itens_padrao": [
        {"descricao": "Porca Sext. M12 zincada", "quantidade": 4, "preco_unitario": 1},
    ],
    "usinagem_operacoes": [
        {"maquina": "Usinagem convencional (torno/furadeira/plaina)", "horas": 8, "valor_hora": 75},
        {"maquina": "Mandriladora CNC (2 eixos)", "horas": 40, "valor_hora": 175},
    ],
    "area_pintura_m2": 83,
    "quantidade_posicoes_engenharia": 38,
}


def _linha(resultado, codigo):
    return next(l for l in resultado.linhas if l.codigo == codigo)


def _liquido(resultado, codigo):
    return round(_linha(resultado, codigo).valor_liquido, 2)


def test_linhas_batem_com_planilha_real():
    resultado = montar_orcamento(ENTRADA_A752193)

    # valor exato = 24049.695; round() de ponto flutuante arredonda para baixo
    # aqui por representação binária (24049.695 não é exato em binário).
    assert _liquido(resultado, "materia_prima") == 24049.69
    assert _liquido(resultado, "itens_padrao") == 2.91
    assert _liquido(resultado, "corte") == 4978.5
    assert _linha(resultado, "caldeiraria").horas == 165.95
    assert _liquido(resultado, "usinagem") == 6897.0
    assert _liquido(resultado, "solda") == 3528.51
    assert _liquido(resultado, "pintura_material") == 2483.78
    assert _liquido(resultado, "ndt") == 1506.0
    assert _liquido(resultado, "engenharia") == 2280.0
    assert _liquido(resultado, "embalagem") == 522.74
    assert _liquido(resultado, "transporte") == 753.0
    assert _liquido(resultado, "energia") == 653.43

    caldeiraria_mais_jato = _linha(resultado, "caldeiraria").valor_liquido + _linha(
        resultado, "jateamento_pintura_mo"
    ).valor_liquido
    assert round(caldeiraria_mais_jato, 2) == 10371.88


def test_custo_industrial_e_preco_de_venda_batem_com_planilha_real():
    resultado = montar_orcamento(ENTRADA_A752193)
    comercial = resultado.comercial

    assert comercial.custo_industrial == 58027.43
    assert comercial.preco_venda_com_impostos == 116054.86
    assert comercial.preco_venda_sem_impostos == 86362.23
    assert comercial.imposto_a_pagar == 29692.64
    assert comercial.margem_lucro == 28334.79
    assert comercial.preco_venda_por_kg == 34.97
