import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.materiais_catalogo import DENSIDADE_ACO_CARBONO_PADRAO, buscar_densidade, listar_materiais


def test_lista_inclui_os_materiais_pedidos():
    normas = {m.norma for m in listar_materiais()}
    for norma in ["ASTM A36", "ASTM A572 Gr.50", "SAE 1020", "SAE 1045", "Aço carbono genérico", "AISI 304", "AISI 316", "Alumínio"]:
        assert norma in normas


def test_densidade_aco_carbono_usa_referencia_padrao():
    for norma in ["ASTM A36", "SAE 1020", "SAE 1045", "Aço carbono genérico"]:
        assert buscar_densidade(norma) == DENSIDADE_ACO_CARBONO_PADRAO


def test_densidade_inox_e_aluminio_diferem_do_aco_carbono():
    assert buscar_densidade("AISI 304") == 8000
    assert buscar_densidade("AISI 316") == 8000
    assert buscar_densidade("Alumínio") == 2700


def test_norma_nao_cadastrada_devolve_none():
    assert buscar_densidade("Titânio grau 5") is None
    assert buscar_densidade(None) is None
