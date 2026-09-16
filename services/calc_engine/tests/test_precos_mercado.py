import datetime
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import precos_mercado

COLUNAS = ["CODIGO", "MATERIAL", "DESCRICAO", "VLRUNITARIO", "UNIDADE", "FORNECEDOR", "OBRA", "DTLANCAMENTO"]


def _gravar_planilha(caminho: Path, linhas: list[tuple]) -> None:
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Consulta1"
    ws.append(COLUNAS)
    for linha in linhas:
        ws.append(linha)
    wb.save(caminho)


@pytest.fixture(autouse=True)
def _cache_isolado(monkeypatch, tmp_path):
    """Cada teste usa seu próprio arquivo + cache zerado — evita um teste
    vazar estado (mtime lido, preços) pro próximo."""
    monkeypatch.setattr(precos_mercado, "_cache", precos_mercado._Cache())
    yield


def test_le_chapa_kg_e_ignora_outras_unidades_e_formatos(tmp_path, monkeypatch):
    caminho = tmp_path / "compras.xlsx"
    _gravar_planilha(caminho, [
        (1, "50010057", "CHAPA #6,35 A36", 5.98, "KG", "GERDAU", "MAC.464.25", datetime.datetime(2026, 9, 9)),
        (2, "10020029", "OLHAL DE ICAMENTO", 324.34, "PC", "RUD", "0722.26", datetime.datetime(2026, 8, 3)),
        (3, "10020280", "CHAPA POLICARBONATO", 301.81, "M2", "ELETRICA", "EMPRESA", datetime.datetime(2026, 5, 18)),
        (4, "50010052", "CHAPA #44,45 A36", 4900, "PC", "REGENFER", "0618.26", datetime.datetime(2026, 6, 30)),
    ])
    monkeypatch.setenv("PRECOS_MERCADO_XLSX_PATH", str(caminho))

    precos = precos_mercado.listar_precos_chapa()

    assert len(precos) == 1
    assert precos[0].norma == "ASTM A36"
    assert precos[0].espessura_mm == 6.35
    assert precos[0].preco_kg == 5.98
    assert precos[0].fornecedor == "GERDAU"
    assert precos[0].data_compra == "2026-09-09"


def test_mesma_norma_espessura_usa_a_compra_mais_recente(tmp_path, monkeypatch):
    caminho = tmp_path / "compras.xlsx"
    _gravar_planilha(caminho, [
        (1, "X", "CHAPA #12,7 A36", 5.0, "KG", "FORNECEDOR ANTIGO", "OBRA1", datetime.datetime(2026, 1, 10)),
        (2, "X", "CHAPA #12,7 A36", 6.5, "KG", "FORNECEDOR NOVO", "OBRA2", datetime.datetime(2026, 8, 20)),
    ])
    monkeypatch.setenv("PRECOS_MERCADO_XLSX_PATH", str(caminho))

    precos = precos_mercado.listar_precos_chapa()

    assert len(precos) == 1
    assert precos[0].preco_kg == 6.5
    assert precos[0].fornecedor == "FORNECEDOR NOVO"
    assert precos[0].data_compra == "2026-08-20"


def test_busca_por_norma_e_espessura_exata(tmp_path, monkeypatch):
    caminho = tmp_path / "compras.xlsx"
    _gravar_planilha(caminho, [
        (1, "X", "CHAPA #6,35 A36", 5.98, "KG", "GERDAU", "O1", datetime.datetime(2026, 9, 9)),
    ])
    monkeypatch.setenv("PRECOS_MERCADO_XLSX_PATH", str(caminho))

    resultado = precos_mercado.buscar_preco_chapa("ASTM A36", 6.35)

    assert resultado is not None
    preco, exato = resultado
    assert exato is True
    assert preco.preco_kg == 5.98


def test_busca_com_espessura_proxima_marca_como_nao_exato(tmp_path, monkeypatch):
    caminho = tmp_path / "compras.xlsx"
    _gravar_planilha(caminho, [
        (1, "X", "CHAPA #6,35 A36", 5.98, "KG", "GERDAU", "O1", datetime.datetime(2026, 9, 9)),
    ])
    monkeypatch.setenv("PRECOS_MERCADO_XLSX_PATH", str(caminho))

    resultado = precos_mercado.buscar_preco_chapa("ASTM A36", 6.5)

    assert resultado is not None
    preco, exato = resultado
    assert exato is False
    assert preco.espessura_mm == 6.35


def test_busca_fora_da_tolerancia_nao_encontra(tmp_path, monkeypatch):
    caminho = tmp_path / "compras.xlsx"
    _gravar_planilha(caminho, [
        (1, "X", "CHAPA #6,35 A36", 5.98, "KG", "GERDAU", "O1", datetime.datetime(2026, 9, 9)),
    ])
    monkeypatch.setenv("PRECOS_MERCADO_XLSX_PATH", str(caminho))

    assert precos_mercado.buscar_preco_chapa("ASTM A36", 10.0) is None
    assert precos_mercado.buscar_preco_chapa("ASTM A572 Gr.50", 6.35) is None
    assert precos_mercado.buscar_preco_chapa(None, 6.35) is None
    assert precos_mercado.buscar_preco_chapa("ASTM A36", None) is None


def test_norma_erp_mapeia_para_norma_da_biblioteca(tmp_path, monkeypatch):
    caminho = tmp_path / "compras.xlsx"
    _gravar_planilha(caminho, [
        (1, "X", "CHAPA #15,88 A572-50", 8.25, "KG", "AÇOS FATIMA", "O1", datetime.datetime(2026, 1, 12)),
        (2, "X", "CHAPA #19,05 AISI 316L", 30.0, "KG", "FORN", "O2", datetime.datetime(2026, 2, 1)),
    ])
    monkeypatch.setenv("PRECOS_MERCADO_XLSX_PATH", str(caminho))

    precos = {p.espessura_mm: p for p in precos_mercado.listar_precos_chapa()}
    assert precos[15.88].norma == "ASTM A572 Gr.50"
    assert precos[15.88].norma_original == "A572-50"
    assert precos[19.05].norma == "AISI 316"


def test_arquivo_inexistente_nao_quebra(tmp_path, monkeypatch):
    monkeypatch.setenv("PRECOS_MERCADO_XLSX_PATH", str(tmp_path / "nao_existe.xlsx"))

    assert precos_mercado.listar_precos_chapa() == []
    assert precos_mercado.buscar_preco_chapa("ASTM A36", 6.35) is None
    status = precos_mercado.status_sincronizacao()
    assert status["arquivo_encontrado"] is False


def test_releitura_pega_mudanca_de_mtime(tmp_path, monkeypatch):
    caminho = tmp_path / "compras.xlsx"
    _gravar_planilha(caminho, [
        (1, "X", "CHAPA #6,35 A36", 5.0, "KG", "F1", "O1", datetime.datetime(2026, 1, 1)),
    ])
    monkeypatch.setenv("PRECOS_MERCADO_XLSX_PATH", str(caminho))
    assert precos_mercado.buscar_preco_chapa("ASTM A36", 6.35)[0].preco_kg == 5.0

    # Reescreve com preço novo — mtime muda, próxima consulta tem que
    # refletir sem precisar esperar o teto de 15 min.
    _gravar_planilha(caminho, [
        (1, "X", "CHAPA #6,35 A36", 9.0, "KG", "F2", "O1", datetime.datetime(2026, 2, 1)),
    ])
    assert precos_mercado.buscar_preco_chapa("ASTM A36", 6.35)[0].preco_kg == 9.0
