"""Camada 3g do pipeline: parser específico do "Pedido" (Ordem de Compra)
da WEIR do Brasil — mesma ideia do parser da ANDRITZ (andritz_oc.py), mas
layout e regra de preço diferentes:

- Cada item vem com quantidade+unidade, preço unitário e preço total, e o
  código relevante pro usuário não é o "Num. Item" do cabeçalho da tabela
  e sim o "Drawing No" citado no corpo do item (confirmado pelo usuário:
  o código que ele quer na planilha é o do desenho, não o código interno
  do item WEIR).
- Pedido explícito do usuário: o valor de cada item vai dividido por
  FATOR_AJUSTE_VALOR_WEIR e sempre arredondado PARA CIMA (nunca pra
  baixo) — WEIR emite o pedido com um valor já líquido de um fator que a
  Macfab precisa reverter pra saber o valor "cheio" a faturar.
- A WEIR não tem um campo tipo "MAC" pra detectar automaticamente — o
  usuário confirmou que vai preencher essa referência à mão, item a item,
  depois da extração. Por isso `referencia` sempre sai `None` daqui; a
  tela deixa esse campo editável por linha.
- Um pedido da WEIR pode ter mais de um item (ver PO 4501751343, itens
  010/020) — cada item tem sua própria assinatura de bloco, igual ao
  parser da ANDRITZ.

Calibrado com 3 pedidos reais (4501751360, 4501751348, 4501751343).

Mesma observação de acentos do andritz_oc.py: esses PDFs também vêm com
caracteres acentuados corrompidos pelo PyMuPDF — as regras evitam
depender de palavra acentuada como âncora.
"""

from __future__ import annotations

import math
import re

from app.extraction.formatos_br import data_br_2_digitos, valor_br_para_float

MARCADOR_WEIR = "Weir do Brasil"

# Pedido explícito do usuário: reverte o fator que a WEIR aplica ao valor
# do item, sempre arredondando pra cima (nunca subestimar o que é devido).
FATOR_AJUSTE_VALOR_WEIR = 0.74415

_RE_NUMERO_PEDIDO = re.compile(r"Numero Pedido Compras\s*\nData\s*\n(\d{6,12})\b")

_RE_ITEM_BLOCO = re.compile(
    r"^[ \t]*(?P<item>\d{2,3})\s*\n"
    r"(?P<codigo_interno>\S+)\s*\n"
    r"(?P<descricao>[^\n]+?)\s*\n"
    r"\d{4}\.\d{2}\.\d{2}\s*\n"  # NCM — só âncora, não usado no resultado
    r"(?P<qtd>[\d.,]+)\s*\n"
    r"(?P<unidade>[A-Z]{2,4})\s*\n"
    r"[\d.,]+\s*/\s*(?P=unidade)\s*\n"  # preço unitário — só âncora
    r"(?P<valor_total>[\d.,]+)\s*\n",
    re.MULTILINE,
)

_RE_CODIGO_DESENHO = re.compile(r"Drawing No:?\s*(\S+)")
_RE_DATA_ENTREGA = re.compile(r"Delivery date:\s*(\d{2}\.\d{2}\.\d{4})")


def parece_pedido_weir(texto: str) -> bool:
    return MARCADOR_WEIR in (texto or "")


def _quantidade_numero(qtd_str: str) -> float | int:
    qtd = float(qtd_str.strip().replace(",", "."))
    return int(qtd) if qtd.is_integer() else qtd


def _ajustar_valor(valor: float) -> float:
    return math.ceil(valor / FATOR_AJUSTE_VALOR_WEIR * 100) / 100


def extrair_pedido_weir(texto: str) -> list[dict]:
    """Devolve [] se o texto não parecer um Pedido da WEIR (ver
    `parece_pedido_weir`) — nunca tenta adivinhar formato de outro
    cliente. Sempre uma lista de itens (sem MAC/nº de pedido agregado no
    topo, ao contrário do parser da ANDRITZ) porque um envio da WEIR pode
    juntar vários PDFs/pedidos numa única planilha de saída."""
    if not parece_pedido_weir(texto):
        return []

    numero_pedido_match = _RE_NUMERO_PEDIDO.search(texto)
    numero_pedido = numero_pedido_match.group(1) if numero_pedido_match else None

    matches = list(_RE_ITEM_BLOCO.finditer(texto))
    itens: list[dict] = []

    for i, m in enumerate(matches):
        inicio_bloco = m.end()
        fim_bloco = matches[i + 1].start() if i + 1 < len(matches) else len(texto)
        bloco = texto[inicio_bloco:fim_bloco]

        codigo_match = _RE_CODIGO_DESENHO.search(bloco)
        data_match = _RE_DATA_ENTREGA.search(bloco)

        item_numero = m.group("item").zfill(3)
        valor_total = valor_br_para_float(m.group("valor_total"))

        itens.append(
            {
                "item": f"{numero_pedido}-{item_numero}" if numero_pedido else item_numero,
                "codigo": codigo_match.group(1) if codigo_match else None,
                "descricao": m.group("descricao").strip(),
                "quantidade": _quantidade_numero(m.group("qtd")),
                "valor_total": _ajustar_valor(valor_total),
                "referencia": None,
                "data_entrega": data_br_2_digitos(data_match.group(1)) if data_match else None,
            }
        )

    return itens
