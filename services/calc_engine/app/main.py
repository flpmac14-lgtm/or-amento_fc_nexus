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
  POST /orcamento-de-texto -> igual, mas a BOM vem digitada manualmente
                               (sem PDF nenhum) — ver bom_texto_manual.py
  POST /orcamento/excel    -> mesma entrada de /orcamento, devolve uma
                               planilha .xlsx com fórmulas editáveis em
                               vez de JSON — ver app/excel_export.py
  GET  /geometria/tipos    -> catálogo de tipos de geometria pros cartões
                               de cálculo manual (rótulo + campos por tipo)
  POST /geometria/calcular -> calcula peso de uma peça a partir do tipo +
                               medidas escolhidas no cartão — ver
                               app/geometria_dispatch.py
  POST /orcamento-de-bom   -> igual a /orcamento-de-pdf, mas a BOM já vem
                               pronta (item_numero/descricao/peso_kg/norma)
                               montada no frontend pelos cartões de cálculo
                               manual — pula o extractor por completo,
                               porque o peso já foi calculado

Este endpoint combinado é uma conveniência de demonstração local — em
produção a orquestração PDF -> extração -> orçamento provavelmente mora no
backend do app principal (Next.js/Supabase), não aqui.
"""

from __future__ import annotations

import os
from typing import Annotated

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.adapter import montar_entrada_orcamento
from app.excel_export import gerar_excel_orcamento
from app.geometria_dispatch import CATEGORIA_PRECO_POR_TIPO, TIPOS_GEOMETRIA, calcular_peso
from app.orcamento import montar_orcamento

load_dotenv()  # antes de ler EXTRACTOR_URL/SUPABASE_DB_URL do ambiente

EXTRACTOR_URL = os.environ.get("EXTRACTOR_URL", "http://localhost:8001")

app = FastAPI(
    title="FC Nexus - Motor de Orçamento",
    description="Motor de cálculo determinístico (peso, custo por processo, preço de venda).",
)

# Libera o frontend local (Next.js em dev, porta 3000) a chamar esta API
# direto do navegador. Em produção isso deve restringir pro domínio real.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "extractor_url": EXTRACTOR_URL}


@app.post("/orcamento")
def orcamento(entrada: dict) -> dict:
    resultado = montar_orcamento(entrada)
    return resultado.model_dump()


@app.post("/orcamento/excel")
def orcamento_excel(entrada: dict) -> Response:
    """Mesma entrada de POST /orcamento, mas devolve uma planilha .xlsx
    editável em vez de JSON — ver app/excel_export.py. Os valores que
    importam (peso, taxas por processo, alíquotas) ficam em células na
    aba "Parâmetros"; as outras abas usam fórmula, não valor fixo, então
    mudar um parâmetro recalcula tudo dentro do próprio Excel."""
    resultado = montar_orcamento(entrada)
    conteudo = gerar_excel_orcamento(entrada, resultado)
    return Response(
        content=conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="orcamento.xlsx"'},
    )


@app.get("/geometria/tipos")
def geometria_tipos() -> dict:
    """Catálogo de tipos de geometria pros cartões de cálculo manual —
    rótulo do cartão + lista de campos (chave, rótulo, unidade) por tipo,
    na ordem que devem aparecer no formulário."""
    return {
        tipo: {"rotulo": rotulo, "campos": [{"chave": c, "rotulo": r, "unidade": u} for c, r, u in campos]}
        for tipo, (rotulo, campos) in TIPOS_GEOMETRIA.items()
    }


@app.post("/geometria/calcular")
def geometria_calcular(pedido: dict) -> dict:
    """pedido: {"tipo": str, "medidas": {chave: valor}, "quantidade": float}.
    Calcula peso de UMA peça a partir do cartão escolhido — não monta
    orçamento nenhum, só devolve peso_kg + memória de cálculo pro
    frontend guardar como um item de matéria-prima."""
    tipo = pedido.get("tipo")
    medidas = pedido.get("medidas") or {}
    quantidade = pedido.get("quantidade", 1)
    try:
        resultado = calcular_peso(tipo, medidas, quantidade)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"peso_kg": round(resultado.peso_kg, 3), "memoria_calculo": resultado.memoria}


def _campo_pronto(valor, confianca: float = 1.0) -> dict:
    return {"valor": valor, "confianca": confianca, "origem": "manual"}


_IDENTIFICACAO_VAZIA = {
    campo: {"valor": None, "confianca": 0.0, "origem": "regra_local"}
    for campo in ("cliente", "numero_desenho", "revisao", "codigo_equipamento", "pedido_po", "descricao", "quantidade")
}


@app.post("/orcamento-de-bom")
def orcamento_de_bom(pedido: dict) -> dict:
    """Igual a /orcamento-de-pdf, mas a BOM já vem pronta do frontend (os
    cartões de cálculo manual já calcularam peso_kg de cada peça — ver
    app/geometria_dispatch.py) em vez de vir de um PDF ou texto solto.
    Pula o extractor por completo.

    pedido: {"bom": [{"item_numero", "descricao", "peso_kg", "norma",
    "quantidade", "tipo"}], "estimativas": {...}}. `tipo` é o tipo de
    geometria do cartão (ex: "chapa_anel") — usado só pra resolver a
    categoria de preço certa (chapa/barra/perfil), não pra recalcular
    peso (que já veio pronto)."""
    itens_bom = []
    for item in pedido.get("bom") or []:
        tipo_geometria = CATEGORIA_PRECO_POR_TIPO.get(item.get("tipo"))
        itens_bom.append({
            "item_numero": _campo_pronto(item.get("item_numero")),
            "descricao": _campo_pronto(item.get("descricao")),
            "tipo_geometria": _campo_pronto(tipo_geometria, 0.95 if tipo_geometria else 0.0),
            "perfil": _campo_pronto(None, 0.0),
            "espessura_mm": _campo_pronto(None, 0.0),
            "comprimento_mm": _campo_pronto(None, 0.0),
            "largura_mm": _campo_pronto(None, 0.0),
            "diametro_mm": _campo_pronto(None, 0.0),
            "material": _campo_pronto(item.get("norma"), 0.9 if item.get("norma") else 0.0),
            "norma": _campo_pronto(item.get("norma"), 0.9 if item.get("norma") else 0.0),
            "usinado": _campo_pronto(False, 0.3),
            "quantidade": _campo_pronto(item.get("quantidade", 1)),
            "peso_kg": _campo_pronto(item.get("peso_kg")),
        })

    resultado_extracao = {
        "identificacao": _IDENTIFICACAO_VAZIA,
        "caracteristicas": {},
        "bom": itens_bom,
        "confianca_geral": 1.0,
        "paginas_total": 0,
        "paginas_com_texto_nativo": 0,
        "paginas_via_ocr": 0,
    }
    return _montar_resposta(resultado_extracao, pedido.get("estimativas") or {})


@app.post("/orcamento-de-pdf")
async def orcamento_de_pdf(
    file: UploadFile,
    anexos: list[UploadFile] | None = None,
    peso_liquido_kg: float | None = None,
    area_pintura_m2: float | None = None,
    quantidade_posicoes_engenharia: float | None = None,
    cenario_comercial: str = "venda_fabricacao",
    usar_historico_horas: bool = False,
) -> dict:
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    todos_arquivos = [file] + [a for a in (anexos or []) if a.filename]
    for arquivo in todos_arquivos:
        if not arquivo.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail=f"Envie apenas PDFs (recebido: {arquivo.filename})")

    arquivos_upload = [(a.filename, await a.read(), "application/pdf") for a in todos_arquivos]

    # Um arquivo só usa /extract (endpoint estável, já existia); mais de um
    # (desenho + anexo de BOM separada — ver README do extractor) usa
    # /extract-varios, que junta identificação + BOM dos vários arquivos.
    endpoint = "/extract" if len(arquivos_upload) == 1 else "/extract-varios"
    campo_arquivo = "file" if len(arquivos_upload) == 1 else "files"
    files_payload = [(campo_arquivo, a) for a in arquivos_upload]

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{EXTRACTOR_URL}{endpoint}", files=files_payload)
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
    return _montar_resposta(resultado_extracao, estimativas)


@app.post("/orcamento-de-texto")
async def orcamento_de_texto(
    texto: Annotated[str, Form()],
    peso_liquido_kg: float | None = None,
    area_pintura_m2: float | None = None,
    quantidade_posicoes_engenharia: float | None = None,
    cenario_comercial: str = "venda_fabricacao",
    usar_historico_horas: bool = False,
) -> dict:
    """Igual a /orcamento-de-pdf, mas a BOM vem digitada manualmente (sem
    PDF nenhum) — ver formato de linha aceito no README do extractor
    (app/extraction/bom_texto_manual.py). Útil quando o orçamentista já
    sabe os itens de cabeça ou tem uma lista solta (e-mail do cliente,
    por exemplo) e não quer esperar a extração de um desenho."""
    if not texto or not texto.strip():
        raise HTTPException(status_code=400, detail="Envie o texto com os itens")

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{EXTRACTOR_URL}/extract-de-texto", json={"texto": texto})
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
    return _montar_resposta(resultado_extracao, estimativas)


def _montar_resposta(resultado_extracao: dict, estimativas: dict) -> dict:
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
        # Devolvido pra o frontend poder pedir o Excel editável depois
        # (POST /orcamento/excel) sem precisar re-extrair nada — ver
        # app/excel_export.py.
        "entrada": adaptacao.entrada,
    }
