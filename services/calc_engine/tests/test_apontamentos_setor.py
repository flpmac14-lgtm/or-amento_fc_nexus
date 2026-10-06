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
        "em_andamento": "Usinando", "pausado": "Pausado", "finalizado": "Fim de usinagem",
        "falta_material": "Falta material"}


def test_operador_obrigatorio():
    with pytest.raises(ValueError, match="Escolha o operador"):
        a.apontar("usinagem", "x", "em_andamento", None, None, "saymon")
    with pytest.raises(ValueError, match="Escolha o operador"):
        a.apontar("usinagem", "x", "em_andamento", "Fulano", None, "saymon")


def test_operadores_usinagem():
    assert a.SETORES["usinagem"]["operadores"] == ["Cesar", "Alisson", "Robson", "Val", "Vanderson", "Deivid"]


def test_pausado_valido_na_validacao():
    assert a._validar(a.SETORES["usinagem"], "pausado", "Val", "  parou  ") == "parou"


def test_servico_interno_exige_descricao():
    with pytest.raises(ValueError, match="Escreva o que"):
        a.criar_servico("usinagem", "  ", None, "em_andamento", "Cesar", None, "saymon")
    with pytest.raises(ValueError, match="Descrição muito longa"):
        a.criar_servico("usinagem", "x" * (a.DESCRICAO_MAX + 1), None, "em_andamento", "Cesar", None, "saymon")


def test_servico_interno_quantidade():
    assert a._quantidade(None) is None
    assert a._quantidade("") is None
    assert a._quantidade("12") == 12
    for ruim in ("abc", 0, -3):
        with pytest.raises(ValueError, match="Quantidade inválida"):
            a._quantidade(ruim)


def test_servico_interno_valida_operador():
    with pytest.raises(ValueError, match="Escolha o operador"):
        a.criar_servico("usinagem", "Eixo da calandra", 2, "em_andamento", None, None, "saymon")


def test_muitos_pedidos_de_uma_vez():
    with pytest.raises(ValueError, match="Pedidos demais"):
        a.apontar("usinagem", "x", "finalizado", "Cesar", None, "saymon",
                  outros_itens=[str(n) for n in range(a.OUTROS_MAX + 1)])
