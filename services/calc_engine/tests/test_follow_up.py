"""Testes do Follow Up (leitor .xlsb + interpretação da aba Gerencia).

O arquivo real ("Gerenciamento de obras ativas.xlsb", ~17 MB, dados da
empresa) não vai pro repositório: o teste de ponta a ponta só roda se
FOLLOW_UP_XLSB apontar pra ele. Os demais testam as peças isoladas."""

import os
import struct
from datetime import date

import pytest

from app.follow_up import _converter, _numero_como_texto, interpretar
from app.xlsb_leitor import Celula, Estilo, _eh_formato_data, _rk, coluna_letra, registros, serial_para_data


def _registro(tipo: int, payload: bytes) -> bytes:
    cab = bytes([tipo]) if tipo < 0x80 else bytes([(tipo & 0x7F) | 0x80, tipo >> 7])
    tam = len(payload)
    t = b""
    while True:
        b = tam & 0x7F
        tam >>= 7
        t += bytes([b | (0x80 if tam else 0)])
        if not tam:
            break
    return cab + t + payload


def test_registros_le_tipo_e_tamanho_varint():
    grande = b"x" * 300  # tamanho em 2 bytes
    dados = _registro(0, b"\x01\x02") + _registro(463, grande) + _registro(5003, b"")
    assert [(t, len(p)) for t, p in registros(dados)] == [(0, 2), (463, 300), (5003, 0)]


def test_rk_inteiro_decimal_e_x100():
    assert _rk((100 << 2) | 2) == 100
    assert _rk(((-5) << 2 & 0xFFFFFFFF) | 2) == -5
    bits = struct.unpack("<Q", struct.pack("<d", 90.5))[0] >> 32
    assert _rk(bits & 0xFFFFFFFC) == 90.5
    assert _rk((1234 << 2) | 3) == 12.34


def test_serial_do_excel_vira_data():
    assert serial_para_data(45658) == date(2025, 1, 1)
    assert serial_para_data(46276) == date(2026, 9, 11)
    assert serial_para_data(1, data1904=True) == date(1904, 1, 2)


def test_formato_de_data():
    assert _eh_formato_data("mm-dd-yy")
    assert _eh_formato_data("[$-416]dd/mm/yyyy")
    assert not _eh_formato_data('_-"R$"\\ * #,##0.00_-')
    assert not _eh_formato_data("0")
    assert not _eh_formato_data("General")


def test_codigo_nao_perde_zero_nem_vira_decimal():
    assert _numero_como_texto(7749.0, "0") == "7749"
    assert _numero_como_texto(123.0, "000000") == "000123"
    assert coluna_letra(0) == "A" and coluna_letra(27) == "AB" and coluna_letra(33) == "AH"


class _LeitorFalso:
    data1904 = False

    def __init__(self, estilos):
        self._estilos = estilos

    def estilo(self, i):
        return self._estilos[i]


def _cel(valor, estilo=0, erro=False):
    return Celula(0, 0, valor, erro, estilo, None)


def test_conversoes_por_tipo():
    geral = Estilo("General", False, False, None, None, False)
    data = Estilo("mm-dd-yy", True, False, None, None, False)
    pct = Estilo("0%", False, True, None, None, False)
    leitor = _LeitorFalso([geral, data, pct])
    avisos: list[str] = []

    assert _converter(leitor, _cel(90.0), "etapa", avisos, "x") == 90
    assert _converter(leitor, _cel(0.5, 2), "etapa", avisos, "x") == 50  # célula formatada como %
    assert _converter(leitor, _cel("50%"), "etapa", avisos, "x") == 50
    assert _converter(leitor, _cel(None), "etapa", avisos, "x") is None
    assert _converter(leitor, _cel(46276.0, 1), "data", avisos, "x") == date(2026, 9, 11)
    assert _converter(leitor, _cel(46276.0, 0), "data", avisos, "x") == date(2026, 9, 11)  # serial sem formato
    assert _converter(leitor, _cel(46276.0, 1), "data_ou_texto", avisos, "x") == date(2026, 9, 11)
    assert _converter(leitor, _cel("Falta o sensor"), "data_ou_texto", avisos, "x") == "Falta o sensor"
    assert _converter(leitor, _cel(7749.0), "codigo", avisos, "x") == "7749"
    assert _converter(leitor, _cel("Falta Jato, Pintura"), "texto", avisos, "x") == "Falta Jato, Pintura"
    assert avisos == []
    assert _converter(leitor, _cel("#N/A", erro=True), "texto", avisos, "x") is None
    assert len(avisos) == 1


@pytest.mark.skipif(not os.environ.get("FOLLOW_UP_XLSB"), reason="defina FOLLOW_UP_XLSB com o caminho do .xlsb real")
def test_planilha_real_gerencia():
    with open(os.environ["FOLLOW_UP_XLSB"], "rb") as f:
        p = interpretar(f.read())
    assert len(p.itens) > 0
    assert len({i.chave for i in p.itens}) == len(p.itens)
    # "Peso Total" do app (itens visíveis na planilha) = SUBTOTAL(109, AE:AE) em G1
    peso_planilha = next(i["valor"] for i in p.indicadores if i["celula"] == "G1")
    peso_visiveis = sum(i.campos["peso_total"] or 0 for i in p.itens if not i.oculta_na_planilha)
    assert abs(peso_planilha - peso_visiveis) < 1e-6
    assert all(i.campos["status"] for i in p.itens)
    assert any(im.origem == "imagem_na_celula" for i in p.itens for im in i.imagens)
