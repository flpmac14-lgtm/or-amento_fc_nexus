import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai_fallback import lista_materiais as lm


@pytest.fixture(autouse=True)
def _sem_env(monkeypatch):
    monkeypatch.delenv("EXTRACTOR_AI_FALLBACK_ENABLED", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    yield


def test_desabilitado_por_padrao():
    assert lm.fallback_habilitado() is False


def test_extrair_desligado_devolve_none():
    assert lm.extrair_lista_materiais([b"fake-png"]) is None


def test_extrair_sem_paginas_devolve_none(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    assert lm.extrair_lista_materiais([]) is None


def test_erro_da_api_nao_propaga_excecao(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")

    from google import genai

    class _ClienteQuebrado:
        def __init__(self, *_a, **_kw):
            pass

        @property
        def models(self):
            raise RuntimeError("falha de rede simulada")

    monkeypatch.setattr(genai, "Client", _ClienteQuebrado)

    assert lm.extrair_lista_materiais([b"fake-png"]) is None


def _resposta_falsa_com(itens_brutos, monkeypatch):
    from google import genai

    class _Resposta:
        parsed = lm._ListaMateriais(itens=[lm._ItemBOM(**item) for item in itens_brutos]) if itens_brutos is not None else None

    class _ModelsFalso:
        def generate_content(self, **_kw):
            return _Resposta()

    class _ClienteFalso:
        def __init__(self, *_a, **_kw):
            pass

        models = _ModelsFalso()

    monkeypatch.setattr(genai, "Client", _ClienteFalso)


def test_itens_estruturados_sao_extraidos_e_validados(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")

    itens_brutos = [
        {
            "posicao": "10", "descricao": "CHAPA BASE", "quantidade": 2,
            "norma": "ASTM A36", "tipo_geometria": "chapa_retangular",
            "comprimento_mm": 1000, "largura_mm": 500, "espessura_mm": 25,
            "peso_unitario_estimado_kg": 98.1, "observacao": "Usinagem: furo Ø20",
            "confianca": 0.8,
        },
        {
            "posicao": "20", "descricao": "PEÇA COMERCIAL", "quantidade": 1,
            "confianca": 0.4,
        },
    ]
    _resposta_falsa_com(itens_brutos, monkeypatch)

    itens = lm.extrair_lista_materiais([b"fake-png"])

    assert itens is not None
    assert len(itens) == 2
    item1, item2 = itens
    assert item1["tipo_geometria"] == "chapa_retangular"
    assert item1["comprimento_mm"] == 1000.0
    assert item1["largura_mm"] == 500.0
    assert item1["diametro_mm"] is None
    assert item1["peso_unitario_estimado_kg"] == 98.1
    assert item1["observacao"] == "Usinagem: furo Ø20"
    assert item2["tipo_geometria"] is None
    assert item2["posicao"] == "20"
    assert item2["observacao"] is None


def test_resposta_sem_parsed_devolve_lista_vazia(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")

    _resposta_falsa_com(None, monkeypatch)

    itens = lm.extrair_lista_materiais([b"fake-png"])
    assert itens == []
