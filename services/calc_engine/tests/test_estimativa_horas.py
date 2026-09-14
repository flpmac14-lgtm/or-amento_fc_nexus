import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.estimativa_horas import FATOR_CALDEIRARIA_SOBRE_MO_PROPRIA, estimar_horas_caldeiraria
from app.orcamento import montar_orcamento
from app.parametros_padrao import PARAMETROS_PADRAO


def test_sem_historico_usa_so_a_regra_simples():
    resultado = estimar_horas_caldeiraria(1000, PARAMETROS_PADRAO, historico=[])

    assert resultado["horas_caldeiraria"] == resultado["horas_regra_simples"]
    assert resultado["horas_regra_simples"] == 1000 * PARAMETROS_PADRAO["caldeiraria_fator_h_kg"]
    assert resultado["horas_historico"] is None
    assert resultado["confianca_historico"] == 0.0


def test_combinacao_reproduz_a_formula_de_media_ponderada():
    resultado = estimar_horas_caldeiraria(3319, PARAMETROS_PADRAO)  # usa o dataset real

    assert resultado["n_amostras_historico"] >= 3
    assert resultado["horas_historico"] is not None

    esperado = (
        resultado["confianca_historico"] * resultado["horas_historico"]
        + (1 - resultado["confianca_historico"]) * resultado["horas_regra_simples"]
    )
    assert round(esperado, 2) == resultado["horas_caldeiraria"]


def test_reverte_proporcao_de_jateamento_pintura_para_isolar_caldeiraria():
    historico_sintetico = [
        {"projeto": f"P{i}", "cliente": "X", "peso_liquido_kg": 3300 + i, "horas_por_tonelada": 52.08}
        for i in range(10)
    ]
    resultado = estimar_horas_caldeiraria(3319, PARAMETROS_PADRAO, historico_sintetico)

    horas_mo_propria_esperadas = 52.08 * 3.319
    horas_caldeiraria_esperadas = horas_mo_propria_esperadas * FATOR_CALDEIRARIA_SOBRE_MO_PROPRIA
    assert abs(resultado["horas_historico"] - horas_caldeiraria_esperadas) < 0.05


def test_orcamento_com_historico_ligado_muda_as_horas_mas_nao_quebra():
    entrada = {
        "peso_liquido_kg": 3319,
        "usar_historico_horas": True,
        "cenario_comercial": "venda_fabricacao",
    }

    resultado = montar_orcamento(entrada)
    linha_caldeiraria = next(l for l in resultado.linhas if l.codigo == "caldeiraria")

    horas_regra_simples = 3319 * PARAMETROS_PADRAO["caldeiraria_fator_h_kg"]
    assert linha_caldeiraria.horas != horas_regra_simples  # histórico influenciou o resultado
    assert any("Histórico" in linha for linha in linha_caldeiraria.memoria_calculo)
    assert resultado.comercial.custo_industrial > 0


def test_orcamento_sem_flag_continua_usando_so_a_regra_simples_por_padrao():
    entrada = {"peso_liquido_kg": 3319, "cenario_comercial": "venda_fabricacao"}

    resultado = montar_orcamento(entrada)
    linha_caldeiraria = next(l for l in resultado.linhas if l.codigo == "caldeiraria")

    assert linha_caldeiraria.horas == round(3319 * PARAMETROS_PADRAO["caldeiraria_fator_h_kg"], 2)
