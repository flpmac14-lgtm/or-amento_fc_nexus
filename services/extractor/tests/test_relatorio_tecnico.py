import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai_fallback import relatorio_tecnico as rt


@pytest.fixture(autouse=True)
def _sem_env(monkeypatch):
    monkeypatch.delenv("EXTRACTOR_AI_FALLBACK_ENABLED", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    yield


def test_desabilitado_por_padrao():
    assert rt.fallback_habilitado() is False


def test_gerar_relatorio_desligado_devolve_none():
    assert rt.gerar_relatorio([b"fake-png"]) is None


def test_gerar_relatorio_sem_paginas_devolve_none(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")
    assert rt.gerar_relatorio([]) is None


def test_erro_da_api_nao_propaga_excecao(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")

    import anthropic

    class _ClienteQuebrado:
        def __init__(self, *_a, **_kw):
            pass

        def with_options(self, **_kw):
            return self

        @property
        def messages(self):
            raise RuntimeError("falha de rede simulada")

    monkeypatch.setattr(anthropic, "Anthropic", _ClienteQuebrado)

    assert rt.gerar_relatorio([b"fake-png"]) is None


def test_resposta_valida_devolve_texto(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")

    import anthropic

    class _BlocoTexto:
        type = "text"
        text = "# Relatório\n\nConteúdo de teste."

    class _RespostaFalsa:
        content = [_BlocoTexto()]

    class _StreamFalso:
        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

        def get_final_message(self):
            return _RespostaFalsa()

    class _MessagesFalso:
        def stream(self, **_kw):
            return _StreamFalso()

    class _ClienteFalso:
        def __init__(self, *_a, **_kw):
            pass

        def with_options(self, **_kw):
            return self

        messages = _MessagesFalso()

    monkeypatch.setattr(anthropic, "Anthropic", _ClienteFalso)

    resultado = rt.gerar_relatorio([b"fake-png"])

    assert resultado == "# Relatório\n\nConteúdo de teste."
