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
