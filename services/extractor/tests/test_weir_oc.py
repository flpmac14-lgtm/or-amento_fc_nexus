import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extraction import weir_oc

# Texto real (via app.extraction.text_extract.extrair_texto_nativo) dos
# Pedidos WEIR 4501751360, 4501751348 e 4501751343 — acentos corrompidos
# pelo PyMuPDF nesses PDFs, igual observado no andritz_oc.py.
TEXTO_PEDIDO_UM_ITEM = """Weir do Brasil Ltda.
Av. Jos� Benassi, 2151
 - Cond. FAZGRAN, 13213-085
Jundia�, SP, Brasil
Numero Pedido Compras
Data
4501751360
08.09.2026
Pedido
Item
Num. Item
Num.Desenho/C�digo
Prod. Fabricante
Descri��o
Quantidade
Unidade
NCM
Pre�o Unit.
Pre�o Total
   10
SV278-10E02
PROT.EC. DE CORRE
8413.91.90
2,00
CDA
390,68 / CDA
781,36
Drawing No:A15792 rev. 02
Desc.Comp.: ITEM DA BOMBA WARMAN VERTICAL
Delivery date: 23.10.2026
(DD.MM.AAAA)
_____________________________________________________________________________________________________________
Vlr. Liquido sem Impostos BRL
             781,36
"""

TEXTO_PEDIDO_DOIS_ITENS = """Weir do Brasil Ltda.
Numero Pedido Compras
Data
4501751343
08.09.2026
Pedido
Item
Num. Item
Num.Desenho/C�digo
Prod. Fabricante
Descri��o
Quantidade
Unidade
NCM
Pre�o Unit.
Pre�o Total
   10
C3485T1C73
PROT.DE RESPINGOS CX.GAXETA 4/3AH
8413.91.90
1,00
CDA
145,10 / CDA
145,10
Drawing No:A402762 rev. 03
Delivery date: 28.10.2026
(DD.MM.AAAA)
_____________________________________________________________________________________________________________
   20
C3485T1C73
PROT.DE RESPINGOS CX.GAXETA 4/3AH
8413.91.90
1,00
CDA
145,10 / CDA
145,10
Drawing No:A402762 rev. 03
Delivery date: 28.10.2026
(DD.MM.AAAA)
_____________________________________________________________________________________________________________
Vlr. Liquido sem Impostos BRL
             290,20
"""


def test_reconhece_pedido_weir():
    assert weir_oc.parece_pedido_weir(TEXTO_PEDIDO_UM_ITEM)
    assert not weir_oc.parece_pedido_weir("um desenho técnico qualquer, sem nada disso")


def test_pdf_sem_marcador_weir_devolve_lista_vazia():
    assert weir_oc.extrair_pedido_weir("nada relevante aqui") == []


def test_extrai_item_unico():
    itens = weir_oc.extrair_pedido_weir(TEXTO_PEDIDO_UM_ITEM)
    assert len(itens) == 1

    item = itens[0]
    assert item["item"] == "4501751360-010"
    assert item["codigo"] == "A15792"
    assert item["descricao"] == "PROT.EC. DE CORRE"
    assert item["quantidade"] == 2
    assert item["referencia"] is None
    assert item["data_entrega"] == "23/10/26"
    # 781.36 / 0.74415 = 1050.00336... -> sempre arredonda pra cima
    assert item["valor_total"] == 1050.01


def test_extrai_dois_itens_do_mesmo_pedido():
    itens = weir_oc.extrair_pedido_weir(TEXTO_PEDIDO_DOIS_ITENS)
    assert len(itens) == 2
    assert itens[0]["item"] == "4501751343-010"
    assert itens[1]["item"] == "4501751343-020"
    for item in itens:
        assert item["codigo"] == "A402762"
        assert item["quantidade"] == 1
        # 145.10 / 0.74415 = 194.98858... -> arredonda pra cima
        assert item["valor_total"] == 194.99


def test_ajustar_valor_sempre_arredonda_para_cima():
    # 100 / 0.74415 = 134.375... -> nunca pode sair um valor menor que a
    # divisão exata (a instrução do usuário é nunca arredondar pra baixo).
    valor = weir_oc._ajustar_valor(100.0)
    assert valor >= 100.0 / weir_oc.FATOR_AJUSTE_VALOR_WEIR
    assert valor - (100.0 / weir_oc.FATOR_AJUSTE_VALOR_WEIR) < 0.01
