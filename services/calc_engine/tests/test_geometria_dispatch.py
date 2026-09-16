import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.geometria_dispatch import TIPOS_GEOMETRIA, calcular_peso


@pytest.mark.parametrize("tipo", list(TIPOS_GEOMETRIA.keys()))
def test_todo_tipo_do_catalogo_calcula_sem_erro_com_medidas_de_exemplo(tipo):
    """Cada tipo listado em TIPOS_GEOMETRIA (o que alimenta os cartões do
    frontend) tem que ter cálculo funcionando — usa 100 pra toda medida
    numérica (menos densidade/ângulo, que teriam valor absurdo) só pra
    garantir que nenhum cartão quebra por falta de implementação."""
    _, campos = TIPOS_GEOMETRIA[tipo]
    medidas = {}
    for chave, _rotulo, _unidade in campos:
        if "densidade" in chave:
            medidas[chave] = 7850.0
        elif "angulo" in chave:
            medidas[chave] = 45.0
        elif chave == "peso_kg_m":
            medidas[chave] = 52.0
        elif "externo" in chave or "maior" in chave:
            medidas[chave] = 200.0
        elif "interno" in chave or "menor" in chave or "parede" in chave:
            medidas[chave] = 50.0
        else:
            medidas[chave] = 100.0

    resultado = calcular_peso(tipo, medidas, quantidade=1)
    assert resultado.peso_kg > 0
    assert resultado.memoria


def test_tipo_desconhecido_da_erro_claro():
    with pytest.raises(ValueError, match="desconhecido"):
        calcular_peso("bolha_de_sabao", {}, 1)


def test_anel_com_diametro_interno_maior_ou_igual_ao_externo_da_erro():
    medidas = {"diametro_externo_mm": 100.0, "diametro_interno_mm": 100.0, "espessura_mm": 10.0, "densidade_kg_m3": 7850.0}
    with pytest.raises(ValueError, match="diâmetro interno"):
        calcular_peso("chapa_anel", medidas, 1)

    medidas["diametro_interno_mm"] = 150.0
    with pytest.raises(ValueError, match="diâmetro interno"):
        calcular_peso("chapa_anel", medidas, 1)


def test_tubo_com_parede_maior_ou_igual_ao_diametro_externo_da_erro():
    medidas = {"diametro_externo_mm": 50.0, "espessura_parede_mm": 25.0, "comprimento_mm": 1000.0, "densidade_kg_m3": 7850.0}
    with pytest.raises(ValueError, match="parede"):
        calcular_peso("tubo_redondo", medidas, 1)


def test_medida_faltando_da_erro_claro_em_vez_de_keyerror():
    with pytest.raises(ValueError, match="espessura_mm"):
        calcular_peso("chapa_circular", {"diametro_mm": 100, "densidade_kg_m3": 7850}, 1)


def test_cone_com_diametro_menor_zero_e_cone_fechado():
    r = calcular_peso(
        "cone_altura",
        {"diametro_maior_mm": 1000, "diametro_menor_mm": 0, "altura_mm": 800, "espessura_mm": 6, "densidade_kg_m3": 7850},
        1,
    )
    assert r.peso_kg > 0


def test_quantidade_multiplica_o_peso_em_todos_os_tipos_base():
    r1 = calcular_peso("chapa_retangular", {"comprimento_mm": 1000, "largura_mm": 500, "espessura_mm": 10, "densidade_kg_m3": 7850}, 1)
    r3 = calcular_peso("chapa_retangular", {"comprimento_mm": 1000, "largura_mm": 500, "espessura_mm": 10, "densidade_kg_m3": 7850}, 3)
    assert round(r3.peso_kg, 4) == round(r1.peso_kg * 3, 4)
