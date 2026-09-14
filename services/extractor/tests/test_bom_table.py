import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import fitz  # PyMuPDF

from app.extraction import bom_table


def test_mapeia_cabecalho_em_portugues():
    cabecalho = ["ITEM", "DESCRIÇÃO", "MATERIAL", "QTD.", "ESP. (mm)"]
    mapa = bom_table._mapear_cabecalho(cabecalho)
    assert mapa == {0: "item_numero", 1: "descricao", 2: "material", 3: "quantidade", 4: "espessura_mm"}


def test_mapeia_cabecalho_em_ingles():
    cabecalho = ["ITEM NO", "DESCRIPTION", "MATERIAL", "QTY", "THICKNESS"]
    mapa = bom_table._mapear_cabecalho(cabecalho)
    assert mapa == {0: "item_numero", 1: "descricao", 2: "material", 3: "quantidade", 4: "espessura_mm"}


def test_linha_sem_cabecalho_reconhecivel_nao_e_tratada_como_cabecalho():
    linha_de_dados = ["1", "CH 1\" ASTM A36", "ASTM A36", "2", "25,4"]
    assert not bom_table._parece_cabecalho(linha_de_dados)


def test_linha_para_item_bom_chapa_retangular():
    mapa = {0: "item_numero", 1: "descricao", 2: "material", 3: "quantidade",
             4: "comprimento_mm", 5: "largura_mm", 6: "espessura_mm"}
    linha = ["1", 'CH 1" ASTM A36', "ASTM A36", "2", "1000", "500", "25,4"]

    item = bom_table._linha_para_item_bom(linha, mapa)

    assert item["item_numero"]["valor"] == "1"
    assert item["quantidade"]["valor"] == 2.0
    assert item["comprimento_mm"]["valor"] == 1000.0
    assert item["largura_mm"]["valor"] == 500.0
    assert item["espessura_mm"]["valor"] == 25.4
    assert item["norma"]["valor"] == "ASTM A36"
    assert item["tipo_geometria"]["valor"] == "chapa_retangular"
    assert item["usinado"]["valor"] is False


def test_linha_para_item_bom_perfil():
    mapa = {0: "item_numero", 1: "perfil", 2: "material", 3: "comprimento_mm", 4: "quantidade"}
    linha = ["2", "W310x52", "ASTM A36", "4750", "1"]

    item = bom_table._linha_para_item_bom(linha, mapa)

    assert item["tipo_geometria"]["valor"] == "perfil"
    assert item["perfil"]["valor"] == "W310x52"
    assert item["comprimento_mm"]["valor"] == 4750.0


def test_linha_para_item_bom_barra_redonda():
    mapa = {0: "item_numero", 1: "descricao", 2: "diametro_mm", 3: "comprimento_mm"}
    linha = ["3", "BARRA REDONDA SAE 1020", "100", "1000"]

    item = bom_table._linha_para_item_bom(linha, mapa)

    assert item["tipo_geometria"]["valor"] == "barra_redonda"
    assert item["diametro_mm"]["valor"] == 100.0


def test_linha_para_item_bom_detecta_machined():
    mapa = {0: "item_numero", 1: "descricao"}
    linha = ["4", "FLANGE MACHINED ALL OVER"]

    item = bom_table._linha_para_item_bom(linha, mapa)

    assert item["usinado"]["valor"] is True
    assert item["usinado"]["confianca"] > 0.5


def test_geometria_da_descricao_chapa_real():
    # Linha real da BOM do desenho 837859-F-CF00-10-DM-0018 (Andritz, MAC_0785.26)
    mapa = {0: "item_numero", 1: "quantidade", 2: "descricao", 3: "comprimento_mm", 4: "material"}
    linha = ["2", "2", "CHAPA 6 x 80", "2560", "ASTM A36"]

    item = bom_table._linha_para_item_bom(linha, mapa)

    assert item["tipo_geometria"]["valor"] == "chapa_retangular"
    assert item["espessura_mm"]["valor"] == 6.0
    assert item["largura_mm"]["valor"] == 80.0
    assert item["comprimento_mm"]["valor"] == 2560.0


def test_geometria_da_descricao_barra_redonda_real():
    # "4 5 BARRA Ø25 457 SAE 1020 1,76 8,79"
    mapa = {0: "item_numero", 1: "quantidade", 2: "descricao", 3: "comprimento_mm", 4: "material"}
    linha = ["4", "5", "BARRA Ø25", "457", "SAE 1020"]

    item = bom_table._linha_para_item_bom(linha, mapa)

    assert item["tipo_geometria"]["valor"] == "barra_redonda"
    assert item["diametro_mm"]["valor"] == 25.0
    assert item["comprimento_mm"]["valor"] == 457.0


def test_geometria_da_descricao_chapa_entre_parenteses():
    # "2 1 P2_F4 CHAPA (150 x 150 x 3mm) - ASTM A36"
    mapa = {0: "item_numero", 1: "quantidade", 2: "descricao"}
    linha = ["2", "1", "CHAPA (150 x 150 x 3mm) - ASTM A36"]

    item = bom_table._linha_para_item_bom(linha, mapa)

    assert item["tipo_geometria"]["valor"] == "chapa_retangular"
    assert item["comprimento_mm"]["valor"] == 150.0
    assert item["largura_mm"]["valor"] == 150.0
    assert item["espessura_mm"]["valor"] == 3.0


def test_geometria_da_descricao_cantoneira_fica_sinalizada_nao_suportada():
    # "1 2 CANTONEIRA 76,2 x 4,8 2738 ASTM A36 15,16 30,32" — perfil L ainda
    # sem fórmula de peso no motor; deve ficar marcado, não virar chapa/barra.
    mapa = {0: "item_numero", 1: "quantidade", 2: "descricao"}
    linha = ["1", "2", "CANTONEIRA 76,2 x 4,8"]

    item = bom_table._linha_para_item_bom(linha, mapa)

    assert item["tipo_geometria"]["valor"] == "cantoneira"


def _pdf_com_tabela_bom(caminho: Path) -> None:
    """Gera um PDF sintético com uma tabela desenhada por linhas de grade +
    texto real (não curvas), pra validar o caminho ponta a ponta do
    pdfplumber sem depender do desenho real (que precisa de OCR)."""
    doc = fitz.open()
    pagina = doc.new_page()

    colunas = [50, 90, 260, 340, 400, 460]
    linhas_y = [50, 75, 100, 125]

    for x in colunas:
        pagina.draw_line((x, linhas_y[0]), (x, linhas_y[-1]))
    for y in linhas_y:
        pagina.draw_line((colunas[0], y), (colunas[-1], y))

    conteudo = [
        ["ITEM", "DESCRIÇÃO", "MATERIAL", "QTD", "ESP."],
        ["1", "CHAPA BASE", "ASTM A36", "2", "25,4"],
        ["2", "PERFIL LATERAL", "ASTM A36", "4", "12,7"],
    ]
    for linha_idx, linha in enumerate(conteudo):
        y_texto = linhas_y[linha_idx] + 17
        for col_idx, texto in enumerate(linha):
            pagina.insert_text((colunas[col_idx] + 3, y_texto), texto, fontsize=9)

    doc.save(str(caminho))
    doc.close()


def test_extracao_ponta_a_ponta_com_pdf_sintetico():
    with tempfile.TemporaryDirectory() as tmp:
        caminho = Path(tmp) / "bom_sintetica.pdf"
        _pdf_com_tabela_bom(caminho)

        itens = bom_table.extrair_bom_de_tabelas(str(caminho))

        assert len(itens) == 2
        assert itens[0]["item_numero"]["valor"] == "1"
        assert itens[0]["descricao"]["valor"] == "CHAPA BASE"
        assert itens[0]["norma"]["valor"] == "ASTM A36"
        assert itens[0]["quantidade"]["valor"] == 2.0
        assert itens[1]["descricao"]["valor"] == "PERFIL LATERAL"
