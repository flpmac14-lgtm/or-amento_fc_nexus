import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.catalogo_processos_terceirizados import carregar


def test_carrega_as_tres_categorias_do_dataset_real():
    catalogo = carregar()
    assert {"usinagem", "servicos_terceiros", "tratamento_termico"} <= catalogo.keys()

    usinagem = {i["nome"]: i["valor_hora"] for i in catalogo["usinagem"]}
    assert usinagem["Usinagem convencional (torno/furadeira/plaina)"] == 75.0
    assert usinagem["Usinagem mandriladora CNC (2 eixos)"] == 175.0
    assert usinagem["Usinagem pesada especial (3-5 eixos)"] == 450.0

    servicos = {i["nome"]: i["valor_kg"] for i in catalogo["servicos_terceiros"]}
    assert servicos["Conformação pesada (dobra/calandra)"] == 8.0
    assert servicos["Rebordeamento de tampos"] is None

    tratamento = {i["nome"]: i["valor_kg"] for i in catalogo["tratamento_termico"]}
    assert tratamento["Alívio de tensões / normalização"] == 1.5


def test_arquivo_inexistente_devolve_categorias_vazias(tmp_path):
    catalogo = carregar(tmp_path / "nao_existe.json")
    assert catalogo == {"usinagem": [], "servicos_terceiros": [], "tratamento_termico": []}
