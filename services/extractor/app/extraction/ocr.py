"""Camada 2 do pipeline: OCR gratuito/local (Tesseract) para páginas sem texto nativo.

Requer o binário do Tesseract instalado no sistema (não é suficiente instalar
só o pacote Python `pytesseract`). Se o binário não estiver disponível, a
função devolve texto vazio e sinaliza `ocr_disponivel=False` em vez de
quebrar o pipeline — a página fica marcada para revisão humana ou fallback
de IA externa.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass

import fitz  # PyMuPDF

try:
    import pytesseract
    from PIL import Image
    _PYTESSERACT_IMPORTADO = True
except ImportError:  # pragma: no cover - dependência opcional
    _PYTESSERACT_IMPORTADO = False

ZOOM_RENDER = 3.0  # ~300 DPI equivalente para melhorar a leitura do OCR


@dataclass
class ResultadoOcr:
    texto: str
    ocr_disponivel: bool


def tesseract_disponivel() -> bool:
    if not _PYTESSERACT_IMPORTADO:
        return False
    return shutil.which("tesseract") is not None


def ocr_pagina(pdf_path: str, numero_pagina: int) -> ResultadoOcr:
    if not tesseract_disponivel():
        return ResultadoOcr(texto="", ocr_disponivel=False)

    with fitz.open(pdf_path) as doc:
        pagina = doc[numero_pagina - 1]
        matriz = fitz.Matrix(ZOOM_RENDER, ZOOM_RENDER)
        pixmap = pagina.get_pixmap(matrix=matriz)
        imagem = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)

    texto = pytesseract.image_to_string(imagem, lang="por+eng")
    return ResultadoOcr(texto=texto, ocr_disponivel=True)
