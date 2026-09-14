import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extraction import bom_sap_export

# Trechos reais de dois anexos de BOM (formato SAP "WBS - Bill of
# Material") da pasta de referência Macfab/Andritz — MAC_0799.26 e
# MAC_0820.26. Copiados literalmente (só encurtando o cabeçalho
# repetitivo) pra calibrar o parser contra dado real, não inventado.

TEXTO_SIMPLES = """
Level    00                                 WBS - Bill of Material (Max.)                         Page          1  / 1
Andritz Hydro Ltda ARA (I)                       LIST OF PARTS                                              Plant  C451
Head-Material             GPS-24A-GH-0306 . ANEL BASE-GPS-24A-GH-0306-RETRABALHO P2, P3 E P4       BOM U/ST:   / 30
REV/AMC                                                                             Quantity Total                1  PC
Engineering                                                                         Weight KG/unit              407,800
########################################################################################################################
POS      Quantity Total Un  Material  ST P S B Description                                               Weight KG/unit
Sort   Quantity Single BOM RV  PDT  PCM PV SW                       AMC
0001                  1  PC 302005594 30 X 1   . ANEL BASE-VIROLA E CHAVETAS - REMESSA DE INDUSTR.
1          0                                                                              407,800
REMESSA
Total:         407,800
"""

# Caso real mais difícil: várias linhas de especificação técnica entre a
# linha do item e a linha do peso (peça comprada, com ficha de
# características do fornecedor embutida no relatório).
TEXTO_COM_ITEM_COMPRADO = """
WBS - Bill of Material (Max.)
POS      Quantity Total Un  Material  ST P S B Description                                               Weight KG/unit
Sort   Quantity Single BOM RV  PDT  PCM PV SW                       AMC
0010                  1  PC 301973907 30 F 1   . GUARDA-CORPO LATERAL DIREITA
1          0  JACUI-25A-PG-0119G1                                                          74,300
0110_P02
0130                 24  PC 133823914 30 F 1   ANCHOR BOLT
WALSYWA CBPL 58500
CB/CBPL
5/8" - X 5"
STEEL ZINC-PLATED
GRADE 2
Characteristics:
MANUFACTURER..................... WALSYWA
LENGTH (in, n/n)................. 5"
24         60                                                                                0,000
0110_P14                          Q
Total:         199,476
"""

TEXTO_SEM_MARCADOR = "LISTA DE MATERIAL comum, nada de SAP aqui\nITEM DESCRIÇÃO QTD\n1 CHAPA A36 2"


def test_reconhece_formato_sap():
    assert bom_sap_export.parece_export_sap(TEXTO_SIMPLES)
    assert not bom_sap_export.parece_export_sap(TEXTO_SEM_MARCADOR)


def test_texto_sem_marcador_nao_extrai_nada():
    assert bom_sap_export.extrair_bom_sap_export(TEXTO_SEM_MARCADOR) == []


def test_extrai_item_simples_com_peso():
    itens = bom_sap_export.extrair_bom_sap_export(TEXTO_SIMPLES)

    assert len(itens) == 1
    item = itens[0]
    assert item["item_numero"]["valor"] == "0001"
    assert item["quantidade"]["valor"] == 1.0
    assert "ANEL BASE" in item["descricao"]["valor"]
    assert item["peso_kg"]["valor"] == 407.8
    assert item["peso_kg"]["confianca"] > 0.5
    # Não inventa geometria/norma — isso aqui é peça acabada, não matéria-prima.
    assert item["tipo_geometria"]["valor"] is None
    assert item["norma"]["valor"] is None


def test_extrai_item_comprado_com_muitas_linhas_de_especificacao_antes_do_peso():
    itens = bom_sap_export.extrair_bom_sap_export(TEXTO_COM_ITEM_COMPRADO)

    assert len(itens) == 2

    guarda_corpo = itens[0]
    assert guarda_corpo["item_numero"]["valor"] == "0010"
    assert guarda_corpo["peso_kg"]["valor"] == 74.3

    parafuso = itens[1]
    assert parafuso["item_numero"]["valor"] == "0130"
    assert parafuso["quantidade"]["valor"] == 24.0
    assert parafuso["descricao"]["valor"] == "ANCHOR BOLT"
    # O peso (0,000) vem só depois de ~10 linhas de ficha técnica do
    # fornecedor — o parser tem que atravessar isso sem confundir com outro item.
    assert parafuso["peso_kg"]["valor"] == 0.0
