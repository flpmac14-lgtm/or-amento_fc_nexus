"""Conversões de números/datas no formato pt-BR usadas por mais de um
parser de pedido (ANDRITZ, WEIR, ...) — extraído pra não duplicar a
mesma regex/lógica em cada `*_oc.py`."""

from __future__ import annotations

from datetime import datetime


def valor_br_para_float(valor: str) -> float:
    """"2.866,68" -> 2866.68 — número de verdade, não texto, pra planilha
    poder formatar como moeda e somar."""
    return float(valor.strip().replace(".", "").replace(",", "."))


def data_br_2_digitos(data_ddmmaaaa: str) -> str | None:
    """"24.08.2026" -> "24/08/26" — formato que o usuário já usa na
    planilha de controle de pedidos."""
    try:
        return datetime.strptime(data_ddmmaaaa, "%d.%m.%Y").strftime("%d/%m/%y")
    except ValueError:
        return None
