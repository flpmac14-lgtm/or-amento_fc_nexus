"""Validações do apontamento por setor (app/apontamentos_setor.py) — sem banco."""

import pytest

from app import apontamentos_setor as a


def test_setor_desconhecido():
    with pytest.raises(ValueError, match="Setor desconhecido"):
        a.apontar("pintura", "x", "em_andamento", "Cesar", None, "saymon")


def test_status_obrigatorio():
    with pytest.raises(ValueError, match="Escolha uma das opções"):
        a.apontar("usinagem", "x", "", "Cesar", None, "saymon")


def test_observacao_longa():
    with pytest.raises(ValueError, match="muito longa"):
        a.apontar("usinagem", "x", "finalizado", "Cesar", "a" * (a.OBS_MAX + 1), "saymon")


def test_rotulos_usinagem():
    assert a.SETORES["usinagem"]["status"] == {
        "em_andamento": "Usinando", "finalizado": "Fim de usinagem", "falta_material": "Falta material"}


def test_operador_obrigatorio():
    with pytest.raises(ValueError, match="Escolha o operador"):
        a.apontar("usinagem", "x", "em_andamento", None, None, "saymon")
    with pytest.raises(ValueError, match="Escolha o operador"):
        a.apontar("usinagem", "x", "em_andamento", "Fulano", None, "saymon")


def test_operadores_usinagem():
    assert a.SETORES["usinagem"]["operadores"] == ["Cesar", "Alisson", "Robson", "Val", "Vanderson", "Deivid"]
