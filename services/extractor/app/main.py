from __future__ import annotations

import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Body, FastAPI, HTTPException, UploadFile

from app.ai_fallback.relatorio_tecnico import fallback_habilitado as relatorio_habilitado
from app.ai_fallback.relatorio_tecnico import gerar_relatorio
from app.extraction.page_render import renderizar_paginas_png
from app.pipeline import processar_pdf, processar_pdfs, processar_texto, status_dependencias

load_dotenv()  # antes de ler EXTRACTOR_AI_FALLBACK_ENABLED/ANTHROPIC_API_KEY do ambiente

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
    return {"status": "ok", **status_dependencias(), "relatorio_tecnico_habilitado": relatorio_habilitado()}


@app.post("/extract")
async def extract(file: UploadFile) -> dict:
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    conteudo = await file.read()
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / file.filename
        pdf_path.write_bytes(conteudo)
        return processar_pdf(str(pdf_path))


@app.post("/extract-varios")
async def extract_varios(files: list[UploadFile]) -> dict:
    """Igual a /extract, mas aceita o desenho principal + anexos (ex: BOM
    separada em formato SAP — ver app/extraction/bom_sap_export.py) num
    orçamento só. Identificação sai do primeiro arquivo com confiança;
    BOM é a soma da BOM de todos."""
    for file in files:
        if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"Envie apenas PDFs (recebido: {file.filename})")

    with tempfile.TemporaryDirectory() as tmp:
        caminhos = []
        for file in files:
            conteudo = await file.read()
            pdf_path = Path(tmp) / file.filename
            pdf_path.write_bytes(conteudo)
            caminhos.append(str(pdf_path))
        return processar_pdfs(caminhos)


@app.post("/extract-de-texto")
def extract_de_texto(texto: str = Body(..., embed=True)) -> dict:
    """BOM digitada manualmente, sem PDF — ver app/extraction/bom_texto_manual.py
    pro formato de linha aceito (um item por linha)."""
    if not texto or not texto.strip():
        raise HTTPException(status_code=400, detail="Texto vazio")
    return processar_texto(texto)


@app.post("/relatorio-tecnico")
async def relatorio_tecnico(file: UploadFile) -> dict:
    """Estudo técnico completo (geometria, BOM, peso estimado, fabricação,
    solda, usinagem, pintura, análise crítica) gerado por IA — ver
    app/ai_fallback/relatorio_tecnico.py. É só um relatório de APOIO em
    Markdown: o peso/custo que aparece aqui é estimativa da IA, nunca o
    valor oficial do orçamento (esse continua vindo do motor de cálculo
    determinístico, a partir dos itens que o orçamentista confirma)."""
    if not relatorio_habilitado():
        raise HTTPException(status_code=503, detail="Relatório técnico por IA não está configurado neste ambiente.")
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    conteudo = await file.read()
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / file.filename
        pdf_path.write_bytes(conteudo)
        paginas_png = renderizar_paginas_png(str(pdf_path))

    relatorio = gerar_relatorio(paginas_png)
    if relatorio is None:
        raise HTTPException(status_code=502, detail="Não foi possível gerar o relatório técnico agora. Tente de novo.")
    return {"relatorio_markdown": relatorio}
