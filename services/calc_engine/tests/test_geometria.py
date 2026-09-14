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


# ---- Fórmulas novas, calibradas contra "Estudo de material.xls" (planilha
# real, pasta MAC_0573.26/A752193) — valores conferidos à mão reproduzindo
# o cálculo da planilha (ela usa densidade em g/cm³, aqui em kg/m³; os
# números batem depois da conversão de unidade). ----


def test_chapa_triangular():
    r = geometria.peso_chapa_triangular(base_mm=1000, altura_mm=600, espessura_mm=10, densidade_kg_m3=7850, quantidade=2)
    assert round(r.peso_kg, 2) == 47.10


def test_chapa_losango():
    r = geometria.peso_chapa_losango(diagonal_maior_mm=800, diagonal_menor_mm=500, espessura_mm=8, densidade_kg_m3=7850)
    assert round(r.peso_kg, 2) == 12.56


def test_chapa_trapezoidal():
    r = geometria.peso_chapa_trapezoidal(
        base_menor_mm=200, base_maior_mm=400, altura_mm=300, espessura_mm=10, densidade_kg_m3=7850
    )
    assert round(r.peso_kg, 3) == 7.065


def test_chapa_anel_coroa_circular():
    r = geometria.peso_chapa_anel(diametro_externo_mm=500, diametro_interno_mm=300, espessura_mm=10, densidade_kg_m3=7850)
    assert round(r.peso_kg, 2) == 9.86


def test_cilindro_casca_calandrada():
    # Reproduz a fórmula da planilha real ("CILÍNDRO - CHAPA") direto em
    # Python com as mesmas unidades dela (mm + densidade g/cm³, expoente
    # 1e-6) pra achar o número de referência, independente da nossa
    # implementação (kg/m³, mm->m) — as duas batem exato.
    r = geometria.peso_cilindro_casca(diametro_mm=1000, espessura_mm=10, comprimento_mm=2000, densidade_kg_m3=7850)
    assert round(r.peso_kg, 2) == 498.16


def test_cone_tronco_por_altura_bate_com_planilha_real():
    # "CONE CONC. (ALTURA) - CHAPA" da planilha: D maior 2000, D menor
    # 1000, altura 500, espessura 6, densidade 7,86 g/cm³ (=7860 kg/m³).
    # Referência calculada reproduzindo a fórmula original da planilha
    # direto (mesma lógica da nota acima): 157,77 kg.
    r = geometria.peso_cone_tronco(
        diametro_maior_mm=2000, diametro_menor_mm=1000, altura_mm=500, espessura_mm=6, densidade_kg_m3=7860
    )
    assert abs(r.peso_kg - 157.77) < 0.01


def test_cone_tronco_por_angulo_bate_com_a_versao_por_altura():
    # Mesmo cone do teste acima, mas informando o ângulo (45°, que é o
    # ângulo real desse triângulo: (2000-1000)/2 / 500 = 1 = tan(45°)) em
    # vez da altura direto — tem que dar o mesmo peso.
    r = geometria.peso_cone_tronco_por_angulo(
        diametro_maior_mm=2000, diametro_menor_mm=1000, angulo_graus=45, espessura_mm=6, densidade_kg_m3=7860
    )
    assert abs(r.peso_kg - 157.77) < 0.01


def test_cantoneira_abas_iguais_proxima_de_catalogo_real():
    # L 50x50x5mm pesa ~3,77 kg/m em catálogo real (Gerdau/ArcelorMittal);
    # a fórmula aproximada de engenharia (2×aba − esp) × esp ignora o raio
    # de concordância do laminado, erro típico < 2%.
    r = geometria.peso_cantoneira_abas_iguais(aba_mm=50, espessura_mm=5, comprimento_mm=6000, densidade_kg_m3=7850)
    assert abs(r.peso_kg - 22.6) < 0.5
