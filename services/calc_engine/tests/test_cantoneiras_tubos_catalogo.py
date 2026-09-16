import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.cantoneiras_catalogo import buscar_cantoneiras, buscar_kg_m as buscar_kg_m_cantoneira
from app.tubos_catalogo import buscar_por_designacao, buscar_tubos


def test_cantoneira_busca_por_termo_livre():
    resultado = buscar_cantoneiras(termo='2" x 2" x 1/4"')
    assert len(resultado) == 1
    assert resultado[0].aba_mm == 50.8
    assert resultado[0].espessura_mm == 6.4


def test_cantoneira_kg_m_bate_com_formula_teorica_do_motor():
    kgm = buscar_kg_m_cantoneira('L 2" x 2" x 1/4" (50.8x50.8x6.4mm)')
    aba, espessura, densidade = 50.8, 6.4, 7850.0
    esperado = (espessura * (2 * aba - espessura)) / 1_000_000 * densidade
    assert kgm == round(esperado, 4)


def test_cantoneira_nao_cadastrada_devolve_none():
    assert buscar_kg_m_cantoneira("L 99 x 99 x 99mm") is None


def test_tubo_busca_por_designacao_exata():
    tubo = buscar_por_designacao("Tubo 60.3 x 3.35 mm")
    assert tubo is not None
    assert tubo.diametro_interno_mm == round(60.3 - 2 * 3.35, 2)


def test_tubo_kg_m_bate_com_formula_do_motor():
    tubo = buscar_por_designacao("Tubo 60.3 x 3.35 mm")
    de, e, densidade = 60.3, 3.35, 7850.0
    di = de - 2 * e
    esperado = (math.pi / 4 * (de**2 - di**2)) / 1_000_000 * densidade
    assert tubo.kg_m == round(esperado, 4)


def test_tubo_busca_por_termo_filtra_diametro():
    resultado = buscar_tubos(termo="60.3")
    assert len(resultado) > 0
    assert all(t.diametro_externo_mm == 60.3 for t in resultado)
