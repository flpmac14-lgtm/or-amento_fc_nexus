import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import geometria


def test_chapa_retangular_exemplo_planilha():
    # "DE AÇO A36 ESP. 15,8 X 100 X 200 mm" -> "RESP: 0,1 X 0,2 X 124,03 = 2,48 Kg / PEÇA"
    r = geometria.peso_chapa_retangular(
        comprimento_mm=200, largura_mm=100, espessura_mm=15.8, densidade_kg_m3=7850
    )
    assert round(r.peso_kg, 2) == 2.48


def test_barra_redonda_exemplo_planilha():
    # "DIÂM Ø100 X 1 METRO" -> "RESP: 0,1 X 0,1 X 6200 = 62 Kg / METRO"
    r = geometria.peso_barra_redonda(diametro_mm=100, comprimento_mm=1000, fator_b_kg_m=6200)
    assert round(r.peso_kg, 2) == 62.0


def test_tubo_redondo_exemplo_planilha():
    # "D= Ø350 X PAREDE E= 9,5 X 1 METRO" -> "RESP: ... = 79,76 Kg / METRO"
    # A planilha usa a constante arredondada 0,02466 (~= pi x densidade / 1e6);
    # aqui usamos pi exato, então o resultado fica ~0,01 kg mais preciso.
    r = geometria.peso_tubo_redondo(
        diametro_externo_mm=350, espessura_parede_mm=9.5, comprimento_mm=1000, densidade_kg_m3=7850
    )
    assert abs(r.peso_kg - 79.76) < 0.02


def test_perfil_estrutural():
    # PERFIL W310 x 52,0 kg/m, comprimento 4750 mm
    r = geometria.peso_perfil(peso_kg_m=52.0, comprimento_mm=4750, quantidade=2)
    assert round(r.peso_kg, 2) == 494.0
