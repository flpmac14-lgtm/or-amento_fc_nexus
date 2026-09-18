import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai_fallback import client as ai_client


@pytest.fixture(autouse=True)
def _sem_env(monkeypatch):
    monkeypatch.delenv("EXTRACTOR_AI_FALLBACK_ENABLED", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    yield


def test_desabilitado_por_padrao():
    assert ai_client.fallback_habilitado() is False


def test_precisa_das_duas_variaveis(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    assert ai_client.fallback_habilitado() is False  # sem chave

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")
    assert ai_client.fallback_habilitado() is True

    monkeypatch.delenv("EXTRACTOR_AI_FALLBACK_ENABLED")
    assert ai_client.fallback_habilitado() is False  # flag desligada de novo


def test_analisar_paginas_desligado_devolve_none():
    assert ai_client.analisar_paginas([b"fake-png-bytes"]) is None


def test_analisar_paginas_sem_paginas_devolve_none(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")
    assert ai_client.analisar_paginas([]) is None


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

    assert ai_client.analisar_paginas([b"fake-png-bytes"]) is None


def test_resposta_valida_e_parseada(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")

    import anthropic

    resposta_esperada = ai_client.RespostaIA(
        identificacao=ai_client._IdentificacaoIA(
            numero_desenho=ai_client._CampoTexto(valor="A752193", confianca=0.9),
            revisao=ai_client._CampoTexto(valor=None, confianca=0.0),
            pedido_po=ai_client._CampoTexto(valor=None, confianca=0.0),
            codigo_equipamento=ai_client._CampoTexto(valor=None, confianca=0.0),
        ),
        itens_bom=[
            ai_client._ItemPreLista(posicao="1", descricao="CHAPA BASE", norma="ASTM A36", quantidade=2, confianca=0.8),
        ],
    )

    class _RespostaFalsa:
        parsed_output = resposta_esperada

    class _MessagesFalso:
        def parse(self, **_kw):
            return _RespostaFalsa()

    class _ClienteFalso:
        def __init__(self, *_a, **_kw):
            pass

        def with_options(self, **_kw):
            return self

        messages = _MessagesFalso()

    monkeypatch.setattr(anthropic, "Anthropic", _ClienteFalso)

    resultado = ai_client.analisar_paginas([b"fake-png-bytes"])

    assert resultado is not None
    assert resultado.identificacao.numero_desenho.valor == "A752193"
    assert resultado.itens_bom[0].descricao == "CHAPA BASE"
