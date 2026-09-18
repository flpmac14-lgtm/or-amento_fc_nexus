"""Renderiza páginas de um PDF como PNG — usado só pelo fallback de IA
externa (app/ai_fallback/client.py), que precisa "ver" a folha (imagem),
diferente do resto do pipeline que só lê texto (nativo ou OCR)."""

from __future__ import annotations

import fitz  # PyMuPDF

# 150 DPI é suficiente pra ler texto de carimbo/tabela sem gerar imagem
# gigante (custo/latência da chamada de IA) — mesma faixa usada por
# app/extraction/ocr.py pro OCR local.
DPI_RENDER = 150


def renderizar_paginas_png(pdf_path: str, max_paginas: int | None = None) -> list[bytes]:
    imagens: list[bytes] = []
    with fitz.open(pdf_path) as doc:
        paginas = doc if max_paginas is None else doc[:max_paginas]
        for pagina in paginas:
            pixmap = pagina.get_pixmap(dpi=DPI_RENDER)
            imagens.append(pixmap.tobytes("png"))
    return imagens
