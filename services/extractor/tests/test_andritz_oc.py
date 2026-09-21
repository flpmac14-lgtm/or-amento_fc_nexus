import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extraction import andritz_oc

# Texto real (via app.extraction.text_extract.extrair_texto_nativo) da OC
# ANDRITZ 4505093989 — os caracteres acentuados vieram corrompidos pelo
# PyMuPDF nesse PDF específico (ver docstring de andritz_oc.py), então o
# texto abaixo é literalmente o que o pipeline recebe, "�" incluído.
PAGINA_1 = """Ordem de Compra
Fornecedor
292219
MACFAB FABRICACOES E SERVICOS
INDUSTRIAIS LTDA
R BOA ESPERANCA DO SUL 27
AMERICO BRASILIENSE - SP
14820-000
Contato do
alisson@mascarini.com.br
Fone:
+5515161633922267
Fax:
CNPJ:
13014242000186
Insc Est.
166015451110
Informa��es gerais
N�mero
4505093989
Vers�o no./data
0 /  14.08.2026
Data de emiss�o: Araraquara / 14.08.2026
Comprador:
Tel. No.:
Fax No.:
E-mail:
Renato Passos
+551135738432
Renato.Passos@andritz.com
Moeda:
BRL
P�gina 1 of 8
Area de refer�ncia
GPS-COPEL-REFORMA-MODERNIZA��O-4-TUR
RFQ 6001102762
Area da linha do item
Item
Material
Utiliza��o
Quantidade
Valor
Total
ICMS base
% IPI        % ICMS
   10
301947766
4 PC
716,67
/1PC
2.866,68
100,00 %
P1 Indust/Resale (ICMS/PIS/COFINS)D
0,00 %
18,00 %
Data de entrega: 24.08.2026
. SUPORTE DO SENSOR S355 J2
Cl. Fiscal
8410.90.00
Utiliza��o
Industrializa��o
Id do sistema antigo
N�mero antigo do material
SIDE_AHI
GPS-24A-TU-0613P319
Garantia da Qualidade
CaractMstrCtrl.: FI704 , Vers�o: 000002
Andritz Hydro Ltda
.
.
www.andritz.com
"""

PAGINA_2 = """N�mero
4505093989/0
P�gina 2 of 8
Item
Material
Utiliza��o
Quantidade
Valor
Total
ICMS base
% IPI        % ICMS
Documentos anexos
M Tipo
Documento
Rv
Lg
Descri��o
DRW GPS-24A-TU-0072
D
PT
GPS-24A-TU-0072_PIT TURBINA GPS
   20
301947766
2 PC
716,67
/1PC
1.433,34
100,00 %
P1 Indust/Resale (ICMS/PIS/COFINS)D
0,00 %
18,00 %
Data de entrega: 24.08.2026
. SUPORTE DO SENSOR S355 J2
Cl. Fiscal
8410.90.00
Utiliza��o
Industrializa��o
Id do sistema antigo
N�mero antigo do material
SIDE_AHI
GPS-24A-TU-0613P319
Andritz Hydro Ltda
.
.
www.andritz.com
"""

PAGINA_7 = """N�mero
4505093989/0
P�gina 7 of 8
como dos termos e condi��es previstas nas Condi��es Gerais de Compras da Andritz (vide anexo 1).
ANEXOS DA ORDEM DE COMPRA:
Anexo 1: Condi��es Gerais de Compras n� 09/2019/ BARUERI E ARARAQUARA -  Rev. 10 - 16.10.2025;
Anexo 5: Proposta comercial n� MAC_0792.26 � R1
Ordem de Compra aprovada eletronicamente sem necessidade da assinatura f�sica por parte da Andritz.
www.andritz.com
"""

TEXTO_OC_REAL = "\n".join([PAGINA_1, PAGINA_2, PAGINA_7])


def test_reconhece_ordem_compra_andritz():
    assert andritz_oc.parece_ordem_compra_andritz(TEXTO_OC_REAL)
    assert not andritz_oc.parece_ordem_compra_andritz("um desenho técnico qualquer, sem nada disso")


def test_extrai_numero_oc_e_mac():
    resultado = andritz_oc.extrair_pedido_andritz(TEXTO_OC_REAL)
    assert resultado["numero_oc"] == "4505093989"
    assert resultado["mac"] == "792.26"
    assert resultado["mac_ambigua"] is False
    assert resultado["mac_candidatos"] == []


def test_extrai_itens_do_pedido():
    resultado = andritz_oc.extrair_pedido_andritz(TEXTO_OC_REAL)
    itens = resultado["itens"]
    assert len(itens) == 2

    item10 = itens[0]
    assert item10["item"] == "4505093989-010"
    assert item10["valor_total"] == "2.866,68"
    assert item10["quantidade"] == 4
    assert item10["material"] == "301947766"
    assert item10["material_antigo"] == "GPS-24A-TU-0613P319"
    assert item10["descricao"] == "SUPORTE DO SENSOR S355 J2"
    assert item10["mac"] == "792.26"
    assert item10["data_entrega"] == "24/08/26"

    item20 = itens[1]
    assert item20["item"] == "4505093989-020"
    assert item20["valor_total"] == "1.433,34"
    assert item20["quantidade"] == 2


def test_pdf_sem_marcador_andritz_devolve_vazio():
    assert andritz_oc.extrair_pedido_andritz("nada relevante aqui") == {}


def test_macs_diferentes_no_mesmo_pdf_fica_ambiguo_e_nao_inventa():
    texto = TEXTO_OC_REAL.replace(
        "Anexo 5: Proposta comercial n� MAC_0792.26 � R1",
        "Anexo 5: Proposta comercial n� MAC_0792.26 � R1\n"
        "Anexo 6: Proposta comercial n� MAC_0450.10 � R1",
    )
    resultado = andritz_oc.extrair_pedido_andritz(texto)
    assert resultado["mac"] is None
    assert resultado["mac_ambigua"] is True
    assert sorted(resultado["mac_candidatos"]) == ["450.10", "792.26"]
    assert all(item["mac"] is None for item in resultado["itens"])
