from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile

from app.pipeline import processar_pdf, status_dependencias

app = FastAPI(
    title="FC Nexus - Extrator de Desenhos",
    description=(
        "Serviço de extração local/gratuita de desenhos técnicos em PDF. "
        "Não calcula peso, custo, hora ou preço — só estrutura o que o "
        "desenho contém, com nível de confiança por campo."
    ),
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", **status_dependencias()}


@app.post("/extract")
async def extract(file: UploadFile) -> dict:
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    conteudo = await file.read()
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / file.filename
        pdf_path.write_bytes(conteudo)
        return processar_pdf(str(pdf_path))
