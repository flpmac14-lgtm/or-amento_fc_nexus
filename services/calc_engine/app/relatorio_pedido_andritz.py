"""Planilha da Ordem de Compra ANDRITZ extraída (ver
services/extractor/app/extraction/andritz_oc.py) — pedido explícito do
usuário: mesmo formato de colunas que ele já preenche à mão numa planilha
de controle toda vez que chega um pedido (item, valor, quantidade,
material, descrição, MAC, data de entrega). Só apresentação — nenhum
cálculo de preço/custo acontece aqui.
"""

from __future__ import annotations

import io

MOEDA = '"R$" #,##0.00'

COLUNAS: list[tuple[str, str]] = [
    ("item", "Item"),
    ("material", "Material"),
    ("valor_total", "Valor"),
    ("quantidade", "Quantidade"),
    ("material_antigo", "Material antigo"),
    ("descricao", "Descrição"),
    ("mac", "MAC"),
    ("data_entrega", "Data de entrega"),
]

_CHAVES = [chave for chave, _ in COLUNAS]


def gerar_excel_pedido_andritz(numero_oc: str | None, itens: list[dict]) -> bytes:
    import openpyxl
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = numero_oc or "Pedido ANDRITZ"

    ws.append([rotulo for _, rotulo in COLUNAS])
    for celula in ws[1]:
        celula.font = celula.font.copy(bold=True)

    col_valor = _CHAVES.index("valor_total") + 1
    for linha, item in enumerate(itens, start=2):
        ws.append([item.get(chave) for chave in _CHAVES])
        ws.cell(row=linha, column=col_valor).number_format = MOEDA

    for idx, (_, rotulo) in enumerate(COLUNAS, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = max(14, len(rotulo) + 4)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
