"""Validações do apontamento por setor (app/apontamentos_setor.py) — sem banco."""

import pytest

from app import apontamentos_setor as a


def test_setor_desconhecido():
    with pytest.raises(ValueError, match="Setor desconhecido"):
        a.apontar("montagem", "x", "em_andamento", "Cesar", None, "saymon")


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


def test_pintura_operador_obrigatorio():
    # Pintura: só Iniciado / Pausado / Pintura finalizada; sem operador da Pintura recusa.
    with pytest.raises(ValueError, match="Escolha o operador"):
        a.apontar("pintura", "x", "em_andamento", "Cesar", None, "felipe")
    with pytest.raises(ValueError, match="Escolha uma das opções"):
        a.apontar("pintura", "x", "fundo", "Felipe", None, "felipe")


def test_lote_so_na_pintura():
    with pytest.raises(ValueError, match="não tem lote"):
        a.salvar_lote("usinagem", "x", "123", "saymon")


@pytest.mark.parametrize("lote", ["@@", "-12", "A" * (a.LOTE_MAX + 1)])
def test_lote_invalido(lote):
    with pytest.raises(ValueError, match="Lote inválido"):
        a.salvar_lote("pintura", "x", lote, "felipe")


def test_pintura_nao_pausa_automaticamente():
    # Sem banco: a Pintura sai antes de consultar (cur=None não é tocado).
    assert a._pausar_outros(None, "pintura", a.SETORES["pintura"], "Felipe", set(), "X", "felipe") == []
    assert a.SETORES["usinagem"].get("pausa_automatica", True) is True


def test_corrigir_valida_status():
    with pytest.raises(ValueError, match="Escolha uma das opções"):
        a.corrigir("pintura", 1, "falta_material", "flpmac14")
    with pytest.raises(ValueError, match="Setor desconhecido"):
        a.corrigir("montagem", 1, "pausado", "flpmac14")


def test_fotos_so_na_pintura():
    with pytest.raises(ValueError, match="não tem fotos"):
        a.adicionar_foto("usinagem", "x", b"", "Aderência", None, "saymon")
    assert "Espessura de camada (micragem)" in a.SETORES["pintura"]["fotos"]


def test_foto_exige_tipo_e_observacao_curta():
    with pytest.raises(ValueError, match="Escolha o tipo"):
        a.adicionar_foto("pintura", "x", b"", "Qualquer", None, "felipe")
    with pytest.raises(ValueError, match="muito longa"):
        a.adicionar_foto("pintura", "x", b"", "Aderência", "a" * (a.DESCRICAO_MAX + 1), "felipe")


def test_foto_invalida():
    from app.follow_up_mae import ImagemInvalida

    with pytest.raises(ImagemInvalida):
        a.adicionar_foto("pintura", "x", b"nao e imagem", "Aderência", "120 um", "felipe")
