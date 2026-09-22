import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.perfis_catalogo import buscar_perfis, buscar_peso_kg_m, listar_tipos


def test_busca_peso_por_designacao_exata():
    assert buscar_peso_kg_m("W 310 x 32,7") == 32.7


def test_busca_peso_tolera_maiusculas_espacos_e_ponto_decimal():
    assert buscar_peso_kg_m("w310x32.7") == 32.7
    assert buscar_peso_kg_m("  W310X32,7  ") == 32.7


def test_perfil_nao_cadastrado_devolve_none():
    assert buscar_peso_kg_m("W 999 x 999,0") is None
    assert buscar_peso_kg_m(None) is None


def test_listar_tipos_inclui_i_h_w_u():
    tipos = listar_tipos()
    assert set(tipos) == {"I", "H", "W", "U"}


def test_buscar_perfis_filtra_por_tipo_e_termo():
    resultado = buscar_perfis(tipo="W", termo="310 x 32")
    assert len(resultado) == 1
    assert resultado[0].designacao == "W 310 x 32,7"
    assert resultado[0].peso_kg_m == 32.7


def test_buscar_perfis_sem_filtro_devolve_so_ate_o_limite():
    resultado = buscar_perfis(limite=5)
    assert len(resultado) == 5


def test_buscar_perfis_i_h_u_tem_catalogo_povoado():
    # Base inicial cadastrada (pedido explícito do usuário) — designação
    # inclui o peso por extenso porque, ao contrário do W, mais de uma
    # bitola pode ter a mesma altura com pesos diferentes.
    perfis_i = buscar_perfis(tipo="I")
    perfis_h = buscar_perfis(tipo="H")
    perfis_u = buscar_perfis(tipo="U")
    assert len(perfis_i) == 15
    assert len(perfis_h) == 12
    assert len(perfis_u) == 14
    assert buscar_peso_kg_m('I 6" x 18,60') == 18.60
    assert buscar_peso_kg_m('I 6" x 22,00') == 22.00
    assert buscar_peso_kg_m('U 8" x 17,10') == 17.10
