"""API HTTP do motor de cálculo — pra poder abrir no navegador e testar,
sem esperar o frontend Next.js (que depende de Node.js, ainda não instalado
nesta máquina).

Endpoints:
  GET  /health
  POST /orcamento          -> recebe a entrada já pronta e calcula (uso direto do motor)
  POST /orcamento-de-pdf   -> recebe um PDF, chama o serviço de extração via
                               HTTP (mantendo os serviços desacoplados, do
                               jeito documentado no README raiz), monta a
                               entrada com o adapter e calcula o orçamento

Este endpoint combinado é uma conveniência de demonstração local — em
produção a orquestração PDF -> extração -> orçamento provavelmente mora no
backend do app principal (Next.js/Supabase), não aqui.
"""

from __future__ import annotations

import os

import httpx
from fastapi import FastAPI, HTTPException, UploadFile

from app.adapter import montar_entrada_orcamento
from app.orcamento import montar_orcamento

EXTRACTOR_URL = os.environ.get("EXTRACTOR_URL", "http://localhost:8001")

app = FastAPI(
    title="FC Nexus - Motor de Orçamento",
    description="Motor de cálculo determinístico (peso, custo por processo, preço de venda).",
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "extractor_url": EXTRACTOR_URL}


@app.post("/orcamento")
def orcamento(entrada: dict) -> dict:
    resultado = montar_orcamento(entrada)
    return resultado.model_dump()


@app.post("/orcamento-de-pdf")
async def orcamento_de_pdf(
    file: UploadFile,
    peso_liquido_kg: float | None = None,
    area_pintura_m2: float | None = None,
    quantidade_posicoes_engenharia: float | None = None,
    cenario_comercial: str = "venda_fabricacao",
    usar_historico_horas: bool = False,
) -> dict:
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    conteudo = await file.read()

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{EXTRACTOR_URL}/extract",
                files={"file": (file.filename, conteudo, "application/pdf")},
            )
            resp.raise_for_status()
            resultado_extracao = resp.json()
    except httpx.ConnectError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Não consegui falar com o serviço de extração em {EXTRACTOR_URL}. Ele está rodando?",
        ) from e

    estimativas = {
        "peso_liquido_kg": peso_liquido_kg,
        "area_pintura_m2": area_pintura_m2,
        "quantidade_posicoes_engenharia": quantidade_posicoes_engenharia,
        "cenario_comercial": cenario_comercial,
        "usar_historico_horas": usar_historico_horas,
    }
    adaptacao = montar_entrada_orcamento(resultado_extracao, estimativas)
    resultado_orcamento = montar_orcamento(adaptacao.entrada)

    return {
        "extracao": {
            "confianca_geral": resultado_extracao.get("confianca_geral"),
            "paginas_total": resultado_extracao.get("paginas_total"),
            "paginas_com_texto_nativo": resultado_extracao.get("paginas_com_texto_nativo"),
            "paginas_via_ocr": resultado_extracao.get("paginas_via_ocr"),
            "identificacao": resultado_extracao.get("identificacao"),
            "bom_itens_extraidos": len(resultado_extracao.get("bom", [])),
        },
        "itens_para_revisao": [
            {"item_numero": i.item_numero, "motivo": i.motivo, "confianca": i.confianca}
            for i in adaptacao.itens_para_revisao
        ],
        "orcamento": resultado_orcamento.model_dump(),
    }
