import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import pipeline
from app.ai_fallback import client as ai_client
from app.schemas import CampoExtraido, Identificacao


def _resposta_ia(numero_desenho=None, itens_bom=None):
    return ai_client.RespostaIA(
        identificacao=ai_client._IdentificacaoIA(
            numero_desenho=numero_desenho or ai_client._CampoTexto(valor=None, confianca=0.0),
            revisao=ai_client._CampoTexto(valor=None, confianca=0.0),
            pedido_po=ai_client._CampoTexto(valor=None, confianca=0.0),
            codigo_equipamento=ai_client._CampoTexto(valor=None, confianca=0.0),
        ),
        itens_bom=itens_bom or [],
    )


@pytest.fixture(autouse=True)
def _sem_render_real(monkeypatch):
    # Evita abrir um PDF de verdade — o teste só quer a lógica de mesclagem.
    monkeypatch.setattr(pipeline, "renderizar_paginas_png", lambda _caminho: [b"fake-png"])
    yield


def test_ia_indisponivel_mantem_tudo_igual(monkeypatch):
    monkeypatch.setattr(pipeline, "analisar_paginas", lambda _paginas: None)

    identificacao = Identificacao()
    bom = []

    resultado_id, resultado_bom, usou = pipeline._complementar_com_ia("fake.pdf", identificacao, bom)

    assert usou is False
    assert resultado_id == identificacao
    assert resultado_bom == []


def test_preenche_bom_vazia_sem_geometria_nem_medidas(monkeypatch):
    item = ai_client._ItemPreLista(posicao="1", descricao="CHAPA BASE", norma="ASTM A36", quantidade=2, confianca=0.8)
    monkeypatch.setattr(pipeline, "analisar_paginas", lambda _paginas: _resposta_ia(itens_bom=[item]))

    identificacao = Identificacao()
    _, bom, usou = pipeline._complementar_com_ia("fake.pdf", identificacao, [])

    assert usou is True
    assert len(bom) == 1
    assert bom[0]["item_numero"]["valor"] == "1"
    assert bom[0]["descricao"]["valor"] == "CHAPA BASE"
    assert bom[0]["norma"]["valor"] == "ASTM A36"
    assert bom[0]["quantidade"]["valor"] == 2
    # A IA nunca preenche geometria/medidas — fica pro orçamentista revisar.
    assert bom[0]["tipo_geometria"]["valor"] is None
    assert bom[0]["tipo_geometria"]["confianca"] == 0.0
    assert bom[0]["espessura_mm"]["confianca"] == 0.0
    assert bom[0]["comprimento_mm"]["confianca"] == 0.0


def test_nao_sobrescreve_bom_ja_extraida_localmente(monkeypatch):
    item = ai_client._ItemPreLista(posicao="1", descricao="ITEM DA IA", norma=None, quantidade=1, confianca=0.9)
    monkeypatch.setattr(pipeline, "analisar_paginas", lambda _paginas: _resposta_ia(itens_bom=[item]))

    bom_local = [{"item_numero": {"valor": "1", "confianca": 0.8, "origem": "regra_local"}}]
    _, bom, usou = pipeline._complementar_com_ia("fake.pdf", Identificacao(), bom_local)

    assert bom == bom_local  # não mexeu na BOM local
    assert usou is False  # só a BOM mudaria; identificação também não mudou


def test_so_substitui_identificacao_quando_ia_mais_confiante(monkeypatch):
    campo_ia_confiante = ai_client._CampoTexto(valor="A752193", confianca=0.9)
    monkeypatch.setattr(pipeline, "analisar_paginas", lambda _paginas: _resposta_ia(numero_desenho=campo_ia_confiante))

    identificacao_local = Identificacao(numero_desenho=CampoExtraido(valor="borrado?", confianca=0.2, origem="ocr"))
    resultado_id, _, usou = pipeline._complementar_com_ia("fake.pdf", identificacao_local, [])

    assert usou is True
    assert resultado_id.numero_desenho.valor == "A752193"
    assert resultado_id.numero_desenho.origem == "ia_externa"


def test_nao_substitui_identificacao_quando_local_mais_confiante(monkeypatch):
    campo_ia_menos_confiante = ai_client._CampoTexto(valor="X999999", confianca=0.3)
    monkeypatch.setattr(pipeline, "analisar_paginas", lambda _paginas: _resposta_ia(numero_desenho=campo_ia_menos_confiante))

    identificacao_local = Identificacao(numero_desenho=CampoExtraido(valor="A752193", confianca=0.95, origem="regra_local"))
    resultado_id, _, usou = pipeline._complementar_com_ia("fake.pdf", identificacao_local, [])

    assert usou is False
    assert resultado_id.numero_desenho.valor == "A752193"
    assert resultado_id.numero_desenho.origem == "regra_local"
