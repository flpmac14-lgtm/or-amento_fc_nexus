import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import historico

HISTORICO_SINTETICO = [
    {"projeto": "A", "cliente": "X", "peso_liquido_kg": 3000, "horas_por_tonelada": 50},
    {"projeto": "B", "cliente": "X", "peso_liquido_kg": 3200, "horas_por_tonelada": 60},
    {"projeto": "C", "cliente": "X", "peso_liquido_kg": 3400, "horas_por_tonelada": 55},
    {"projeto": "D", "cliente": "X", "peso_liquido_kg": 500, "horas_por_tonelada": 200},  # fora da faixa
]


def test_carrega_dataset_real_com_registros_validos():
    dados = historico.carregar_historico()
    assert len(dados) >= 30
    campos_esperados = {"peso_liquido_kg", "horas_por_tonelada", "custo_industrial", "cliente", "projeto"}
    assert campos_esperados.issubset(dados[0].keys())


def test_sugestao_usa_apenas_amostras_dentro_da_faixa_de_peso():
    resultado = historico.sugerir_horas_caldeiraria(3319, HISTORICO_SINTETICO)

    projetos_usados = {a["projeto"] for a in resultado["amostra"]}
    assert projetos_usados == {"A", "B", "C"}
    assert "D" not in projetos_usados
    assert resultado["n_amostras"] == 3


def test_sugestao_calcula_mediana_e_horas_sugeridas_corretamente():
    resultado = historico.sugerir_horas_caldeiraria(3319, HISTORICO_SINTETICO)

    # horas/ton: 50, 60, 55 -> mediana 55
    assert resultado["mediana_horas_por_tonelada"] == 55.0
    assert resultado["media_horas_por_tonelada"] == 55.0
    assert resultado["horas_sugeridas"] == round(55.0 * 3.319, 2)
    assert resultado["confianca"] > 0


def test_sem_amostra_nenhuma_devolve_resultado_vazio_e_confianca_zero():
    resultado = historico.sugerir_horas_caldeiraria(3319, historico=[])

    assert resultado["n_amostras"] == 0
    assert resultado["horas_sugeridas"] is None
    assert resultado["confianca"] == 0.0


def test_expande_faixa_quando_amostra_estreita_e_insuficiente():
    historico_esparso = [
        {"projeto": "A", "cliente": "X", "peso_liquido_kg": 3319, "horas_por_tonelada": 52},
        {"projeto": "B", "cliente": "X", "peso_liquido_kg": 8000, "horas_por_tonelada": 90},
        {"projeto": "C", "cliente": "X", "peso_liquido_kg": 8300, "horas_por_tonelada": 100},
    ]
    # faixa de 0.5/1/2t só pega o projeto A (1 amostra); só a faixa de 5t
    # alcança B (diff 4,68t) e C (diff 4,98t) -> precisa expandir até 5t
    resultado = historico.sugerir_horas_caldeiraria(3319, historico_esparso)

    assert resultado["n_amostras"] == 3
    assert resultado["faixa_toneladas_usada"] == historico.FAIXAS_TONELADAS[-1]


def test_sugestao_real_para_peso_do_a752193_inclui_o_proprio_orcamento():
    # A752193 (MAC_0573.26, 3319 kg) deve aparecer na amostra ao consultar
    # o próprio peso, servindo de checagem de sanidade do dataset real.
    resultado = historico.sugerir_horas_caldeiraria(3319)

    projetos = {a["projeto"] for a in resultado["amostra"]}
    assert "MAC_0573.26" in projetos
    assert resultado["horas_sugeridas"] is not None
    assert resultado["confianca"] > 0
