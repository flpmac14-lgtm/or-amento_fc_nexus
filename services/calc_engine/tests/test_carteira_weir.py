from app.carteira_weir import A_CONFIRMAR, _chave, _texto


def test_chave_pedido_item():
    assert _chave("4501690746-010") == "4501690746-010"
    assert _chave("4501690746-10") == "4501690746-010"
    assert _chave("PO X") is None


def test_texto_status():
    assert _texto("E", "7995", "16/10/2026") == ("Entregue em 16/10/2026 - NF 7995", False)
    assert _texto("A", "8039", "20/10/2026") == ("Faturado - NF 8039 - Coleta 20/10/2026", False)
    assert _texto("A", None, "22/10/2026") == ("Previsão de coleta 22/10/2026", False)
    assert _texto("A", None, None) == (A_CONFIRMAR, True)
    assert _texto("C", None, None) == ("Cancelado", False)
