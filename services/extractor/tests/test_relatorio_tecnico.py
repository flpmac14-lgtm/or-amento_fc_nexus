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


class _BlocoTexto:
    type = "text"

    def __init__(self, text):
        self.text = text


class _BlocoToolUse:
    type = "tool_use"

    def __init__(self, name, input_):
        self.name = name
        self.input = input_


def _resposta_falsa_com(blocos_relatorio, blocos_bom, monkeypatch, create_falha=None):
    """`blocos_relatorio` alimenta a 1a chamada (stream, texto do relatório).
    `blocos_bom` alimenta a 2a chamada (create, extração estruturada da BOM
    — ver gerar_relatorio, são duas requisições separadas). `create_falha`,
    se passado, faz a 2a chamada levantar essa exceção em vez de responder."""
    import anthropic

    class _RespostaStream:
        content = blocos_relatorio

    class _StreamFalso:
        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

        def get_final_message(self):
            return _RespostaStream()

    class _RespostaCreate:
        content = blocos_bom

    class _MessagesFalso:
        def stream(self, **_kw):
            return _StreamFalso()

        def create(self, **_kw):
            if create_falha is not None:
                raise create_falha
            return _RespostaCreate()

    class _ClienteFalso:
        def __init__(self, *_a, **_kw):
            pass

        def with_options(self, **_kw):
            return self

        messages = _MessagesFalso()

    monkeypatch.setattr(anthropic, "Anthropic", _ClienteFalso)


def test_resposta_valida_devolve_texto(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")

    _resposta_falsa_com([_BlocoTexto("# Relatório\n\nConteúdo de teste.")], [], monkeypatch)

    resultado = rt.gerar_relatorio([b"fake-png"])

    assert resultado is not None
    assert resultado.texto == "# Relatório\n\nConteúdo de teste."
    assert resultado.itens_estruturados == []


def test_sem_texto_devolve_none(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")

    # Só tool_use na 1a chamada (sem bloco de texto) — nem chega a tentar a
    # extração estruturada, devolve None direto.
    _resposta_falsa_com([_BlocoToolUse("reportar_bom_estruturada", {"itens": []})], [], monkeypatch)

    assert rt.gerar_relatorio([b"fake-png"]) is None


def test_itens_estruturados_sao_extraidos_e_validados(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")

    itens_brutos = {
        "itens": [
            {
                "posicao": "10", "descricao": "CHAPA BASE", "quantidade": 2,
                "norma": "ASTM A36", "tipo_geometria": "chapa_retangular",
                "comprimento_mm": 1000, "largura_mm": 500, "espessura_mm": 25,
                "confianca": 0.8,
            },
            {
                # tipo_geometria fora do enum conhecido — deve virar None, não quebrar.
                "posicao": "20", "descricao": "PEÇA ESTRANHA", "quantidade": 1,
                "tipo_geometria": "formato_inventado_pela_ia", "confianca": 0.4,
            },
        ]
    }
    _resposta_falsa_com(
        [_BlocoTexto("# Relatório")],
        [_BlocoToolUse("reportar_bom_estruturada", itens_brutos)],
        monkeypatch,
    )

    resultado = rt.gerar_relatorio([b"fake-png"])

    assert resultado is not None
    assert resultado.texto == "# Relatório"
    assert len(resultado.itens_estruturados) == 2
    item1, item2 = resultado.itens_estruturados
    assert item1["tipo_geometria"] == "chapa_retangular"
    assert item1["comprimento_mm"] == 1000.0
    assert item1["largura_mm"] == 500.0
    assert item1["diametro_mm"] is None
    assert item2["tipo_geometria"] is None  # descartado por não estar no enum
    assert item2["posicao"] == "20"


def test_falha_na_extracao_estruturada_nao_derruba_o_relatorio(monkeypatch):
    monkeypatch.setenv("EXTRACTOR_AI_FALLBACK_ENABLED", "1")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")

    _resposta_falsa_com(
        [_BlocoTexto("# Relatório")],
        [],
        monkeypatch,
        create_falha=RuntimeError("falha simulada na 2a chamada"),
    )

    resultado = rt.gerar_relatorio([b"fake-png"])

    assert resultado is not None
    assert resultado.texto == "# Relatório"
    assert resultado.itens_estruturados == []
