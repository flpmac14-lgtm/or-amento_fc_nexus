import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extraction import bom_texto_manual


def test_chapa_retangular_com_norma_e_quantidade():
    itens = bom_texto_manual.extrair_bom_de_texto_manual("CHAPA 1000 x 500 x 25 ASTM A36 qtd 2")

    assert len(itens) == 1
    item = itens[0]
    assert item["tipo_geometria"]["valor"] == "chapa_retangular"
    assert item["comprimento_mm"]["valor"] == 1000.0
    assert item["largura_mm"]["valor"] == 500.0
    assert item["espessura_mm"]["valor"] == 25.0
    assert item["norma"]["valor"] == "ASTM A36"
    assert item["quantidade"]["valor"] == 2.0


def test_barra_redonda_com_diametro_unicode():
    itens = bom_texto_manual.extrair_bom_de_texto_manual("BARRA REDONDA Ø100 x 500 SAE 1020")

    item = itens[0]
    assert item["tipo_geometria"]["valor"] == "barra_redonda"
    assert item["diametro_mm"]["valor"] == 100.0
    assert item["comprimento_mm"]["valor"] == 500.0
    assert item["norma"]["valor"] == "SAE 1020"
    assert item["quantidade"]["valor"] == 1.0  # default, não informada


def test_barra_redonda_com_d_no_lugar_de_simbolo_diametro():
    # Ø é o correto, mas o usuário raramente tem como digitar — "D" tem
    # que funcionar como alternativa de teclado comum.
    itens = bom_texto_manual.extrair_bom_de_texto_manual("BARRA REDONDA D80 x 400 SAE 1020")

    item = itens[0]
    assert item["tipo_geometria"]["valor"] == "barra_redonda"
    assert item["diametro_mm"]["valor"] == 80.0
    assert item["comprimento_mm"]["valor"] == 400.0


def test_perfil_com_designacao_e_comprimento():
    itens = bom_texto_manual.extrair_bom_de_texto_manual(
        "PERFIL W310x52 comprimento 4750 ASTM A36"
    )

    item = itens[0]
    assert item["tipo_geometria"]["valor"] == "perfil"
    assert item["perfil"]["valor"] == "W310x52"
    assert item["comprimento_mm"]["valor"] == 4750.0
    assert item["norma"]["valor"] == "ASTM A36"


def test_cantoneira_fica_sinalizada_sem_forcar_tipo_suportado():
    itens = bom_texto_manual.extrair_bom_de_texto_manual("CANTONEIRA 76,2 x 4,8 ASTM A36")

    item = itens[0]
    assert item["tipo_geometria"]["valor"] == "cantoneira"


def test_multiplas_linhas_geram_multiplos_itens_numerados_em_ordem():
    texto = "CHAPA 1000 x 500 x 25 ASTM A36\nBARRA REDONDA Ø50 x 300 SAE 1020 qtd 3"
    itens = bom_texto_manual.extrair_bom_de_texto_manual(texto)

    assert len(itens) == 2
    assert itens[0]["item_numero"]["valor"] == "1"
    assert itens[1]["item_numero"]["valor"] == "2"
    assert itens[1]["quantidade"]["valor"] == 3.0


def test_linha_nao_reconhecida_vira_item_para_revisao_em_vez_de_sumir():
    itens = bom_texto_manual.extrair_bom_de_texto_manual("um parafuso qualquer aí")

    assert len(itens) == 1
    item = itens[0]
    assert item["descricao"]["valor"] == "um parafuso qualquer aí"
    assert item["tipo_geometria"]["valor"] is None


def test_linhas_vazias_sao_ignoradas():
    itens = bom_texto_manual.extrair_bom_de_texto_manual("\n\nCHAPA 100 x 100 x 5 ASTM A36\n\n")
    assert len(itens) == 1
