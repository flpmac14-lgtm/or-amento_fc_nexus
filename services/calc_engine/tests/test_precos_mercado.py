import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import precos_mercado


class _CursorFalso:
    def execute(self, *_args, **_kwargs) -> None:
        pass

    def fetchall(self):
        return []

    def __enter__(self) -> "_CursorFalso":
        return self

    def __exit__(self, *_exc) -> None:
        pass


class _ConexaoFalsa:
    def cursor(self) -> _CursorFalso:
        return _CursorFalso()

    def __enter__(self) -> "_ConexaoFalsa":
        return self

    def __exit__(self, *_exc) -> None:
        pass


@pytest.fixture(autouse=True)
def _cache_isolado(monkeypatch):
    """Cada teste usa cache zerado e SUPABASE_DB_URL configurada — evita um
    teste vazar estado (cache lido) pro próximo. `psycopg.connect` sempre
    devolve uma conexão falsa: quem decide o que as consultas devolvem é
    `_consultar_precos_chapa`/`_consultar_historico_geral`, mockadas por
    teste."""
    import psycopg

    monkeypatch.setattr(precos_mercado, "_cache", precos_mercado._Cache())
    monkeypatch.setenv("SUPABASE_DB_URL", "postgresql://fake")
    monkeypatch.setattr(psycopg, "connect", lambda *_a, **_kw: _ConexaoFalsa())
    yield


def _mockar_precos_chapa(monkeypatch, precos: list[precos_mercado.PrecoChapa]) -> None:
    monkeypatch.setattr(precos_mercado, "_consultar_precos_chapa", lambda _cur: precos)


def _mockar_historico_geral(monkeypatch, linhas: list[precos_mercado.LinhaCompra]) -> None:
    monkeypatch.setattr(precos_mercado, "_consultar_historico_geral", lambda _cur: linhas)


def _mockar_precos_perfil_barra(monkeypatch, precos: list[precos_mercado.PrecoPerfilBarra]) -> None:
    monkeypatch.setattr(precos_mercado, "_consultar_precos_perfil_barra", lambda _cur: precos)


def _preco(norma, espessura_mm, preco_kg, data_compra, fornecedor="GERDAU"):
    return precos_mercado.PrecoChapa(
        norma=norma, norma_original=norma, espessura_mm=espessura_mm,
        preco_kg=preco_kg, fornecedor=fornecedor, data_compra=data_compra,
    )


def test_le_precos_de_chapa(monkeypatch):
    _mockar_precos_chapa(monkeypatch, [_preco("ASTM A36", 6.35, 5.98, "2026-09-09")])
    _mockar_historico_geral(monkeypatch, [])

    precos = precos_mercado.listar_precos_chapa()

    assert len(precos) == 1
    assert precos[0].norma == "ASTM A36"
    assert precos[0].espessura_mm == 6.35
    assert precos[0].preco_kg == 5.98
    assert precos[0].fornecedor == "GERDAU"
    assert precos[0].data_compra == "2026-09-09"


def test_busca_por_norma_e_espessura_exata(monkeypatch):
    _mockar_precos_chapa(monkeypatch, [_preco("ASTM A36", 6.35, 5.98, "2026-09-09")])
    _mockar_historico_geral(monkeypatch, [])

    resultado = precos_mercado.buscar_preco_chapa("ASTM A36", 6.35)

    assert resultado is not None
    preco, exato = resultado
    assert exato is True
    assert preco.preco_kg == 5.98


def test_busca_com_espessura_proxima_marca_como_nao_exato(monkeypatch):
    _mockar_precos_chapa(monkeypatch, [_preco("ASTM A36", 6.35, 5.98, "2026-09-09")])
    _mockar_historico_geral(monkeypatch, [])

    resultado = precos_mercado.buscar_preco_chapa("ASTM A36", 6.5)

    assert resultado is not None
    preco, exato = resultado
    assert exato is False
    assert preco.espessura_mm == 6.35


def test_busca_fora_da_tolerancia_nao_encontra(monkeypatch):
    _mockar_precos_chapa(monkeypatch, [_preco("ASTM A36", 6.35, 5.98, "2026-09-09")])
    _mockar_historico_geral(monkeypatch, [])

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
    _mockar_precos_chapa(monkeypatch, [_preco("ASTM A36", 6.35, 5.98, "2026-09-09")])
    _mockar_historico_geral(monkeypatch, [])
    assert precos_mercado.buscar_preco_chapa("ASTM A36", 6.35)[0].preco_kg == 5.98

    import psycopg

    def _falha(*_a, **_kw):
        raise RuntimeError("banco indisponível")

    monkeypatch.setattr(psycopg, "connect", _falha)
    # Força nova tentativa de leitura (ignora o TTL) sem apagar o cache atual.
    precos_mercado._cache.lido_em_monotonic = None

    # Não levanta exceção — mantém o último resultado bom conhecido.
    assert precos_mercado.buscar_preco_chapa("ASTM A36", 6.35)[0].preco_kg == 5.98


def test_busca_perfil_por_norma_sem_espessura(monkeypatch):
    _mockar_precos_chapa(monkeypatch, [])
    _mockar_historico_geral(monkeypatch, [])
    _mockar_precos_perfil_barra(monkeypatch, [
        precos_mercado.PrecoPerfilBarra(
            norma="ASTM A36", tipo="perfil", preco_kg=8.43,
            fornecedor="GERDAU", data_compra="2026-09-16",
        ),
    ])

    resultado = precos_mercado.buscar_preco_perfil_barra("ASTM A36", "perfil")

    assert resultado is not None
    assert resultado.preco_kg == 8.43
    assert resultado.tipo == "perfil"


def test_busca_barra_por_norma(monkeypatch):
    _mockar_precos_chapa(monkeypatch, [])
    _mockar_historico_geral(monkeypatch, [])
    _mockar_precos_perfil_barra(monkeypatch, [
        precos_mercado.PrecoPerfilBarra(
            norma="ASTM A36", tipo="barra", preco_kg=6.96,
            fornecedor="GERDAU", data_compra="2026-09-15",
        ),
    ])

    resultado = precos_mercado.buscar_preco_perfil_barra("ASTM A36", "barra")

    assert resultado is not None
    assert resultado.preco_kg == 6.96


def test_busca_perfil_barra_nao_confunde_tipo_ou_norma(monkeypatch):
    _mockar_precos_chapa(monkeypatch, [])
    _mockar_historico_geral(monkeypatch, [])
    _mockar_precos_perfil_barra(monkeypatch, [
        precos_mercado.PrecoPerfilBarra(
            norma="ASTM A36", tipo="perfil", preco_kg=8.43,
            fornecedor="GERDAU", data_compra="2026-09-16",
        ),
    ])

    # tipo diferente do cadastrado pra essa norma
    assert precos_mercado.buscar_preco_perfil_barra("ASTM A36", "barra") is None
    # norma não cadastrada
    assert precos_mercado.buscar_preco_perfil_barra("SAE 1020", "perfil") is None
    # tipo inválido (só "perfil"/"barra" são aceitos — chapa usa buscar_preco_chapa)
    assert precos_mercado.buscar_preco_perfil_barra("ASTM A36", "chapa") is None
    assert precos_mercado.buscar_preco_perfil_barra(None, "perfil") is None


def test_listar_todas_compras_inclui_qualquer_item(monkeypatch):
    _mockar_precos_chapa(monkeypatch, [])
    _mockar_historico_geral(monkeypatch, [
        precos_mercado.LinhaCompra(
            codigo="10020029", material="", descricao="TINTA EPOXI",
            preco_unitario=120.5, unidade="LT", fornecedor="INTERGARD",
            obra="MAC.464.25", data_compra="2026-09-09",
        ),
        precos_mercado.LinhaCompra(
            codigo="10020030", material="", descricao="PARAFUSO SEXTAVADO M12",
            preco_unitario=0.85, unidade="PC", fornecedor="CISER",
            obra="MAC.464.25", data_compra="2026-06-30",
        ),
    ])

    todas = precos_mercado.listar_todas_compras()

    assert len(todas) == 2
    assert todas[0].data_compra == "2026-09-09"  # ordenado por data desc
    assert todas[0].descricao == "TINTA EPOXI"
    assert todas[1].descricao == "PARAFUSO SEXTAVADO M12"
