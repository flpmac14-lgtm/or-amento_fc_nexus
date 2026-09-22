from __future__ import annotations

import tempfile
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Body, FastAPI, HTTPException, UploadFile
from starlette.concurrency import run_in_threadpool

from app.ai_fallback.lista_materiais import extrair_lista_materiais
from app.ai_fallback.lista_materiais import fallback_habilitado as lista_materiais_habilitada
from app.extraction.page_render import renderizar_paginas_png
from app.pipeline import (
    processar_ordem_compra_andritz,
    processar_pdf,
    processar_pdfs,
    processar_pedidos_weir,
    processar_texto,
    status_dependencias,
)

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
    return {"status": "ok", **status_dependencias(), "lista_materiais_ia_habilitada": lista_materiais_habilitada()}


@app.post("/extract")
async def extract(file: UploadFile) -> dict:
    """`processar_pdf` roda numa thread à parte (run_in_threadpool) porque,
    quando o fallback de IA entra, ela faz uma chamada síncrona e bloqueante
    à Anthropic — sem isso, travava o event loop inteiro (e com ele TODO
    endpoint do serviço, inclusive /health) pelos ~1-3min da chamada."""
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    conteudo = await file.read()
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / file.filename
        pdf_path.write_bytes(conteudo)
        return await run_in_threadpool(processar_pdf, str(pdf_path))


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
        return await run_in_threadpool(processar_pdfs, caminhos)


@app.post("/extract-de-texto")
def extract_de_texto(texto: str = Body(..., embed=True)) -> dict:
    """BOM digitada manualmente, sem PDF — ver app/extraction/bom_texto_manual.py
    pro formato de linha aceito (um item por linha)."""
    if not texto or not texto.strip():
        raise HTTPException(status_code=400, detail="Texto vazio")
    return processar_texto(texto)


@app.post("/ordem-compra-andritz")
async def ordem_compra_andritz(file: UploadFile) -> dict:
    """Extração determinística (texto + regex, sem IA) de uma Ordem de
    Compra ANDRITZ — pedido explícito do usuário: item/material/
    quantidade/valor/data de entrega + MAC, prontos no formato da planilha
    de controle de pedidos que ele já usa. Ver app/extraction/andritz_oc.py."""
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    conteudo = await file.read()
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / file.filename
        pdf_path.write_bytes(conteudo)
        resultado = await run_in_threadpool(processar_ordem_compra_andritz, str(pdf_path))

    if not resultado:
        raise HTTPException(
            status_code=422,
            detail="Esse PDF não parece ser uma Ordem de Compra da ANDRITZ no formato reconhecido.",
        )
    return resultado


@app.post("/pedidos-weir")
async def pedidos_weir(files: list[UploadFile]) -> dict:
    """Extração determinística (texto + regex, sem IA) de um ou mais
    Pedidos WEIR — pedido explícito do usuário: aceita vários PDFs de uma
    vez (cada um pode ser um pedido diferente). A referência (equivalente
    à MAC da ANDRITZ) sai sempre vazia — o usuário preenche à mão, item a
    item. Ver app/extraction/weir_oc.py."""
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
        resultado = await run_in_threadpool(processar_pedidos_weir, caminhos)

    if not resultado["itens"]:
        raise HTTPException(
            status_code=422,
            detail="Nenhum desses PDFs parece ser um Pedido da WEIR no formato reconhecido.",
        )
    return resultado


@app.post("/relatorio-tecnico")
async def relatorio_tecnico(file: UploadFile) -> dict:
    """Extração da lista de materiais (BOM) por IA — ver
    app/ai_fallback/lista_materiais.py. Só isso: posição, descrição,
    material, quantidade e peso (extraído do desenho ou estimado pela IA).
    Nenhum relatório narrativo — o peso aqui é só o valor inicial do
    cartão "Peso direto" no cálculo manual, o orçamentista confirma antes
    de fechar o orçamento (o resto do orçamento continua 100% do motor
    determinístico)."""
    if not lista_materiais_habilitada():
        raise HTTPException(status_code=503, detail="Extração de lista de materiais por IA não está configurada neste ambiente.")
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    conteudo = await file.read()
    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / file.filename
        pdf_path.write_bytes(conteudo)
        paginas_png = renderizar_paginas_png(str(pdf_path))

    # run_in_threadpool: extrair_lista_materiais faz uma chamada síncrona e
    # bloqueante à Anthropic — sem isso, travava o event loop inteiro do
    # serviço durante a chamada (ver /extract acima).
    itens, erro = await run_in_threadpool(extrair_lista_materiais, paginas_png)
    if itens is None:
        detalhe = "Não foi possível extrair a lista de materiais agora. Tente de novo."
        if erro:
            detalhe += f" ({erro})"
        raise HTTPException(status_code=502, detail=detalhe)
    return {"itens_estruturados": itens}
