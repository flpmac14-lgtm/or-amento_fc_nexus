from datetime import date

import pytest

from app.follow_up_mae import CampoNaoEditavel, _converter_edicao, _valor_mae, calcular_status, editar


def test_status_igual_a_formula_da_planilha():
    todas = {e: 100 for e in ("eng", "cor", "mon", "sol", "usi", "dob", "jat", "pin")}
    assert calcular_status(todas) == "Pronto"
    assert calcular_status({**todas, "jat": None, "pin": 50}) == "Falta Jato, Pintura"
    assert calcular_status({**todas, "mon": 90, "sol": 90, "jat": None, "pin": None}) == (
        "Falta Montagem, Solda, Jato, Pintura"
    )
    assert calcular_status({}) == "Falta Engenharia, Corte, Montagem, Solda, Usinagem, Dobra, Jato, Pintura"


def test_valores_da_mae_mantem_codigo_como_texto():
    assert _valor_mae("2026-12-16", "data") == date(2026, 12, 16)
    assert _valor_mae("sem data", "data") is None
    assert _valor_mae(7972, "texto") == "7972"
    assert _valor_mae(7972.0, "texto") == "7972"
    assert _valor_mae("2026-09-23", "texto") == "23/09/2026"  # data digitada em coluna de texto (OBS/NF)
    assert _valor_mae(2, "numero") == 2.0
    assert _valor_mae("1.234,5", "numero") == 1234.5
    assert _valor_mae(None, "texto") is None


def test_edicao_valida_etapas_e_numeros():
    assert _converter_edicao("pin", "50") == 50
    assert _converter_edicao("pin", "50%") == 50
    assert _converter_edicao("pin", "") is None
    with pytest.raises(ValueError):
        _converter_edicao("pin", 150)
    assert _converter_edicao("preco_previsto", "1.500,75") == 1500.75
    assert _converter_edicao("obs_felipe_marcelo", "  chegou  ") == "chegou"


def test_campos_da_mae_nao_sao_editaveis():
    with pytest.raises(CampoNaoEditavel):
        editar("qualquer", {"prazo_contratual": "2026-01-01"})
