import sys
from contextlib import contextmanager
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import precos_mercado


class _CursorFalso:
    def __init__(self, linhas: list[tuple]) -> None:
        self._linhas = linhas

    def execute(self, *_args, **_kwargs) -> None:
        pass

    def fetchall(self) -> list[tuple]:
        return self._linhas

    def __enter__(self) -> "_CursorFalso":
        return self

    def __exit__(self, *_exc) -> None:
        pass


class _ConexaoFalsa:
    def __init__(self, linhas: list[tuple]) -> None:
        self._linhas = linhas

    def cursor(self) -> _CursorFalso:
        return _CursorFalso(self._linhas)

    def __enter__(self) -> "_ConexaoFalsa":
        return self

    def __exit__(self, *_exc) -> None:
        pass


def _linha(norma, tipo, espessura_mm, preco_kg, data_compra, fornecedor="GERDAU", descricao_original=None):
    """Uma linha no mesmo formato/ordem do SELECT de _consultar_historico."""
    return (norma, tipo, espessura_mm, preco_kg, data_compra, fornecedor, descricao_original)


@pytest.fixture(autouse=True)
def _cache_isolado(monkeypatch):
    """Cada teste usa cache zerado e SUPABASE_DB_URL configurada — evita um
    teste vazar estado (cache lido) pro próximo."""
    monkeypatch.setattr(precos_mercado, "_cache", precos_mercado._Cache())
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://fake")
    yield


def _mockar_linhas(monkeypatch, linhas: list[tuple]) -> None:
    import psycopg

    monkeypatch.setattr(psycopg, "connect", lambda *_a, **_kw: _ConexaoFalsa(linhas))


def test_le_chapa_kg_e_ignora_outros_tipos(monkeypatch):
    _mockar_linhas(monkeypatch, [
        _linha("ASTM A36", "chapa", 6.35, 5.98, __import__("datetime").date(2026, 9, 9), "GERDAU"),
        _linha("ASTM A36", "perfil", None, 4900, __import__("datetime").date(2026, 6, 30), "REGENFER"),
    ])

    precos = precos_mercado.listar_precos_chapa()

    assert len(precos) == 1
    assert precos[0].norma == "ASTM A36"
    assert precos[0].espessura_mm == 6.35
    assert precos[0].preco_kg == 5.98
    assert precos[0].fornecedor == "GERDAU"
    assert precos[0].data_compra == "2026-09-09"


def test_mesma_norma_espessura_usa_a_compra_mais_recente(monkeypatch):
    import datetime

    _mockar_linhas(monkeypatch, [
        _linha("ASTM A36", "chapa", 12.7, 5.0, datetime.date(2026, 1, 10), "FORNECEDOR ANTIGO"),
        _linha("ASTM A36", "chapa", 12.7, 6.5, datetime.date(2026, 8, 20), "FORNECEDOR NOVO"),
    ])

    precos = precos_mercado.listar_precos_chapa()

    assert len(precos) == 1
    assert precos[0].preco_kg == 6.5
    assert precos[0].fornecedor == "FORNECEDOR NOVO"
    assert precos[0].data_compra == "2026-08-20"


def test_busca_por_norma_e_espessura_exata(monkeypatch):
    import datetime

    _mockar_linhas(monkeypatch, [_linha("ASTM A36", "chapa", 6.35, 5.98, datetime.date(2026, 9, 9))])

    resultado = precos_mercado.buscar_preco_chapa("ASTM A36", 6.35)

    assert resultado is not None
    preco, exato = resultado
    assert exato is True
    assert preco.preco_kg == 5.98


def test_busca_com_espessura_proxima_marca_como_nao_exato(monkeypatch):
    import datetime

    _mockar_linhas(monkeypatch, [_linha("ASTM A36", "chapa", 6.35, 5.98, datetime.date(2026, 9, 9))])

    resultado = precos_mercado.buscar_preco_chapa("ASTM A36", 6.5)

    assert resultado is not None
    preco, exato = resultado
    assert exato is False
    assert preco.espessura_mm == 6.35


def test_busca_fora_da_tolerancia_nao_encontra(monkeypatch):
    import datetime

    _mockar_linhas(monkeypatch, [_linha("ASTM A36", "chapa", 6.35, 5.98, datetime.date(2026, 9, 9))])

    assert precos_mercado.buscar_preco_chapa("ASTM A36", 10.0) is None
    assert precos_mercado.buscar_preco_chapa("ASTM A572 Gr.50", 6.35) is None
    assert precos_mercado.buscar_preco_chapa(None, 6.35) is None
    assert precos_mercado.buscar_preco_chapa("ASTM A36", None) is None


def test_sem_supabase_db_url_nao_quebra(monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)

    assert precos_mercado.listar_precos_chapa() == []
    assert precos_mercado.buscar_preco_chapa("ASTM A36", 6.35) is None
    status = precos_mercado.status_sincronizacao()
    assert status["fonte_disponivel"] is False


def test_erro_de_conexao_nao_quebra_e_mantem_cache_anterior(monkeypatch):
    import datetime

    import psycopg

    _mockar_linhas(monkeypatch, [_linha("ASTM A36", "chapa", 6.35, 5.98, datetime.date(2026, 9, 9))])
    assert precos_mercado.buscar_preco_chapa("ASTM A36", 6.35)[0].preco_kg == 5.98

    def _falha(*_a, **_kw):
        raise RuntimeError("banco indisponível")

    monkeypatch.setattr(psycopg, "connect", _falha)
    # Força nova tentativa de leitura (ignora o TTL) sem apagar o cache atual.
    precos_mercado._cache.lido_em_monotonic = None

    # Não levanta exceção — mantém o último resultado bom conhecido.
    assert precos_mercado.buscar_preco_chapa("ASTM A36", 6.35)[0].preco_kg == 5.98


def test_listar_todas_compras_inclui_qualquer_tipo(monkeypatch):
    import datetime

    _mockar_linhas(monkeypatch, [
        _linha("ASTM A36", "chapa", 6.35, 5.98, datetime.date(2026, 9, 9), descricao_original="CHAPA #6,35 A36"),
        _linha("ASTM A572 Gr.50", "perfil", None, 4900, datetime.date(2026, 6, 30), fornecedor="REGENFER"),
    ])

    todas = precos_mercado.listar_todas_compras()

    assert len(todas) == 2
    assert todas[0].data_compra == "2026-09-09"  # ordenado por data desc
    assert todas[1].fornecedor == "REGENFER"
