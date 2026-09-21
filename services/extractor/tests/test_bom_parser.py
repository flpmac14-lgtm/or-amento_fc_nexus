import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.extraction import bom_parser

TEXTO_REAL_A752193 = """
OV 1001072641 - ESP. TOTAL: 225um
- INTERGARD 251 - 75um
- INTERSEAL 670HS - 150um (CINZA N5,5)
TIPAR: 700297001E02
            10023360
4501690746-10 - 1PC - MAC_573.26 - 15/07/2026
4501690746-20 - 1PC - MAC_573.26.01 - 15/07/2026
"""


def test_extrai_pedido_po():
    campo = bom_parser.extrair_pedido_po(TEXTO_REAL_A752193)
    assert campo.valor == "4501690746-10, 4501690746-20"
    assert campo.confianca > 0.5


def test_extrai_codigo_equipamento():
    campo = bom_parser.extrair_codigo_equipamento(TEXTO_REAL_A752193)
    assert campo.valor == "MAC_573.26"


def test_extrai_codigo_equipamento_variacoes_de_separador():
    # Pedido explícito do usuário: aceitar "_", " " e "-" entre "MAC" e o
    # número, e ignorar sufixo de revisão (com hífen ou travessão).
    for texto in [
        "Proposta comercial n° MAC_0792.26 – R1",
        "Proposta comercial n° MAC 0792.26",
        "Proposta comercial n° MAC-0792.26",
        "Proposta comercial n° MAC_0792.26-R1",
    ]:
        campo = bom_parser.extrair_codigo_equipamento(texto)
        assert campo.valor == "MAC_0792.26", texto
        assert campo.confianca > 0.5


def test_extrai_codigo_equipamento_ambiguo_nao_escolhe_sozinho():
    texto = "Anexo: MAC_0792.26 – R1 ... outro documento: MAC_0450.10 – R2"
    campo = bom_parser.extrair_codigo_equipamento(texto)
    assert campo.valor is None
    assert campo.confianca == 0.0

    candidatos = bom_parser.extrair_codigos_equipamento_candidatos(texto)
    assert candidatos.valor == ["MAC_0792.26", "MAC_0450.10"]
    assert candidatos.confianca > 0


def test_extrai_codigo_equipamento_mesma_mac_com_subvariante_nao_e_ambiguo():
    # MAC_573.26 e MAC_573.26.01 (ver TEXTO_REAL_A752193, itens -10/-20 do
    # mesmo pedido) são a mesma MAC, não duas diferentes.
    candidatos = bom_parser.extrair_codigos_equipamento_candidatos(TEXTO_REAL_A752193)
    assert candidatos.valor == []


def test_mac_valor_curto_remove_prefixo_e_zero_a_esquerda():
    assert bom_parser.mac_valor_curto("MAC_0792.26") == "792.26"
    assert bom_parser.mac_valor_curto("MAC-0792.26") == "792.26"
    assert bom_parser.mac_valor_curto("MAC 0792.26") == "792.26"
    assert bom_parser.mac_valor_curto("MAC_573.26") == "573.26"


def test_extrai_especificacao_pintura():
    campo = bom_parser.extrair_especificacao_pintura(TEXTO_REAL_A752193)
    assert campo.valor["espessura_total_um"] == 225
    produtos = {d["produto"] for d in campo.valor["demaos"]}
    assert "INTERGARD 251" in produtos
    assert "INTERSEAL 670HS" in produtos


def test_texto_sem_dados_retorna_confianca_zero():
    campo = bom_parser.extrair_numero_desenho("nada relevante aqui")
    assert campo.valor is None
    assert campo.confianca == 0.0


def test_extrai_normas_e_perfis():
    texto = "PERFIL W310 x 52,0 kg/m ASTM A572 e ASTM A36 usados na base"
    normas = bom_parser.extrair_normas(texto)
    assert normas.valor == ["ASTM A36", "ASTM A572"]
    perfis = bom_parser.extrair_perfis(texto)
    assert perfis.valor == ["W310 x 52,0"]
