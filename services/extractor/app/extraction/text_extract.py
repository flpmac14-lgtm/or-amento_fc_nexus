"""Camada 1 do pipeline: extração gratuita/local do texto já embutido no PDF.

Usa PyMuPDF por ser o mais rápido para texto puro; pdfplumber fica reservado
para extração de tabelas quando o layout permitir (BOM em grade).

Descoberta importante ao calibrar com um desenho real da Macfab (A752193):
muitos desenhos exportados de CAD trazem o texto como curvas/vetores (fonte
"outlined"), então `pagina.get_text()` pode voltar quase vazio mesmo a folha
estando cheia de anotações visíveis. Por isso a densidade de texto por página
é sempre verificada e a página é marcada para OCR quando fica abaixo do
limiar — o pipeline não deve confiar apenas na existência de *alguma* folha
com texto nativo.
"""

from __future__ import annotations

from dataclasses import dataclass

import fitz  # PyMuPDF

DENSIDADE_MINIMA_CHARS = 40


@dataclass
class TextoPagina:
    numero: int
    texto: str
    precisa_ocr: bool


def extrair_texto_nativo(pdf_path: str) -> list[TextoPagina]:
    paginas: list[TextoPagina] = []
    with fitz.open(pdf_path) as doc:
        for i, pagina in enumerate(doc):
            texto = pagina.get_text() or ""
            paginas.append(
                TextoPagina(
                    numero=i + 1,
                    texto=texto,
                    precisa_ocr=len(texto.strip()) < DENSIDADE_MINIMA_CHARS,
                )
            )
    return paginas


def contar_paginas(pdf_path: str) -> int:
    with fitz.open(pdf_path) as doc:
        return len(doc)
