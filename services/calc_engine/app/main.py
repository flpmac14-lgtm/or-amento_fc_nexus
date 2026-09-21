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
  GET  /materiais/catalogo -> biblioteca de materiais (norma + densidade)
                               pro seletor de material de todas as
                               calculadoras manuais — ver
                               app/materiais_catalogo.py
  GET  /materiais/preco-mercado   -> preço/kg de referência por norma+espessura,
                                      sincronizado da planilha de compras 2026 —
                                      ver app/precos_mercado.py
  GET  /materiais/precos-mercado  -> lista completa da referência (aba
                                      "Referência de preços" do frontend)
  GET  /perfis/tipos       -> tipos de perfil laminado (I/H/W/U) + normas
                               sugeridas pro cartão de perfil — ver
                               app/perfis_catalogo.py
  GET  /perfis/buscar      -> busca no catálogo de perfis por tipo + termo
                               (designação/bitola) pro campo pesquisável
  GET  /cantoneiras/buscar -> busca no catálogo de cantoneiras L — ver
                               app/cantoneiras_catalogo.py
  GET  /tubos/buscar       -> busca no catálogo de tubos redondos — ver
                               app/tubos_catalogo.py
  POST /orcamento-de-bom   -> igual a /orcamento-de-pdf, mas a BOM já vem
                               pronta (item_numero/descricao/peso_kg/norma)
                               montada no frontend pelos cartões de cálculo
                               manual — pula o extractor por completo,
                               porque o peso já foi calculado
  POST   /orcamentos-salvos       -> salva (ou atualiza, se "id" vier no
                                      corpo) um orçamento pra reabrir depois
                                      — ver app/orcamentos_salvos.py
  GET    /orcamentos-salvos       -> lista os orçamentos salvos (resumo)
  GET    /orcamentos-salvos/{id}  -> um orçamento salvo completo (resultado
                                      + estado de edição, quando existir)
  DELETE /orcamentos-salvos/{id}  -> exclui um orçamento salvo
  GET  /processos-terceirizados/catalogo -> catálogo pequeno (usinagem,
                                      serviços de outsourcing, tratamento
                                      térmico) com taxa de referência
                                      conhecida — ver
                                      app/catalogo_processos_terceirizados.py
  GET  /cnpj/{cnpj}        -> nome + endereço de um CNPJ (Receita Federal,
                               via BrasilAPI) pra pré-preencher a
                               "Identificação do cliente" — ver app/cnpj.py
  POST /ordem-compra-andritz       -> extração determinística (sem IA) de
                                       uma Ordem de Compra ANDRITZ — ver
                                       app/extraction/andritz_oc.py no
                                       extractor
  POST /ordem-compra-andritz/excel -> planilha da OC extraída, no formato
                                       da planilha de controle de pedidos
                                       do usuário — ver
                                       app/relatorio_pedido_andritz.py

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
from app.cantoneiras_catalogo import buscar_cantoneiras
from app.catalogo_processos_terceirizados import carregar as carregar_catalogo_processos_terceirizados
from app.cnpj import CnpjInvalido, CnpjNaoEncontrado, buscar_cnpj
from app.excel_export import gerar_excel_orcamento
from app.geometria_dispatch import CATEGORIA_PRECO_POR_TIPO, TIPOS_GEOMETRIA, calcular_peso
from app.materiais_catalogo import listar_materiais
from app.materiais_fixture import NORMAS_PERFIL_SUGERIDAS
from app.orcamento import montar_orcamento, resolver_params
from app.orcamentos_salvos import BancoNaoConfigurado
from app.orcamentos_salvos import buscar as buscar_orcamento_salvo
from app.orcamentos_salvos import excluir as excluir_orcamento_salvo
from app.orcamentos_salvos import listar as listar_orcamentos_salvos
from app.orcamentos_salvos import salvar as salvar_orcamento_salvo
from app.perfis_catalogo import buscar_perfis, listar_tipos as listar_tipos_perfil
from app.precos_mercado import (
    buscar_preco_chapa,
    buscar_preco_perfil_barra,
    listar_todas_compras,
    status_sincronizacao,
)
from app.relatorio_excel import calcular_itens_da_planilha, gerar_excel as gerar_excel_bom, ler_excel
from app.relatorio_pedido_andritz import gerar_excel_pedido_andritz
from app.tubos_catalogo import buscar_tubos

load_dotenv()  # antes de ler EXTRACTOR_URL/SUPABASE_DB_URL do ambiente

EXTRACTOR_URL = os.environ.get("EXTRACTOR_URL", "http://localhost:8001")

app = FastAPI(
    title="FC Nexus - Motor de Orçamento",
    description="Motor de cálculo determinístico (peso, custo por processo, preço de venda).",
)

# Origens que podem chamar esta API direto do navegador — "http://localhost:3000"
# sempre liberado pro dev local; ALLOWED_ORIGINS (separadas por vírgula) adiciona
# o domínio real do frontend hospedado (ex.: https://fc-nexus.vercel.app).
_ORIGENS_EXTRA = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", *_ORIGENS_EXTRA],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "extractor_url": EXTRACTOR_URL}


@app.post("/orcamento")
def orcamento(entrada: dict) -> dict:
    resultado = montar_orcamento(entrada)
    return {**resultado.model_dump(), "parametros": resolver_params(entrada)}


@app.post("/orcamentos-salvos")
def orcamentos_salvos_criar(pedido: dict) -> dict:
    """Salva um orçamento novo, ou atualiza um existente se `id` vier no
    corpo — ver app/orcamentos_salvos.py. `origem` ("manual"/"pdf"/"texto")
    diz se dá pra reabrir em modo de edição (a lista de itens do cálculo
    manual, em `estado_manual`) ou só pra ver o resultado de novo."""
    try:
        return salvar_orcamento_salvo(
            nome=pedido["nome"],
            origem=pedido["origem"],
            resultado=pedido["resultado"],
            estado_manual=pedido.get("estado_manual"),
            estado_texto=pedido.get("estado_texto"),
            orcamento_id=pedido.get("id"),
            relatorio_tecnico=pedido.get("relatorio_tecnico"),
            proposta=pedido.get("proposta"),
            desenho_storage_path=pedido.get("desenho_storage_path"),
            desenho_nome_arquivo=pedido.get("desenho_nome_arquivo"),
        )
    except BancoNaoConfigurado as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/orcamentos-salvos")
def orcamentos_salvos_listar() -> dict:
    try:
        return {"orcamentos": listar_orcamentos_salvos()}
    except BancoNaoConfigurado as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/orcamentos-salvos/{orcamento_id}")
def orcamentos_salvos_obter(orcamento_id: str) -> dict:
    try:
        encontrado = buscar_orcamento_salvo(orcamento_id)
    except BancoNaoConfigurado as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not encontrado:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    return encontrado


@app.delete("/orcamentos-salvos/{orcamento_id}")
def orcamentos_salvos_excluir(orcamento_id: str) -> dict:
    try:
        excluido = excluir_orcamento_salvo(orcamento_id)
    except BancoNaoConfigurado as e:
        raise HTTPException(status_code=503, detail=str(e))
    if not excluido:
        raise HTTPException(status_code=404, detail="Orçamento não encontrado")
    return {"excluido": True}


@app.get("/processos-terceirizados/catalogo")
def processos_terceirizados_catalogo() -> dict:
    """Catálogo pequeno (usinagem, serviços de outsourcing, tratamento
    térmico) com taxa de referência conhecida quando existe — ver
    app/catalogo_processos_terceirizados.py. Alimenta os cartões de
    usinagem/serviços de terceiros/tratamento térmico do cálculo manual."""
    return carregar_catalogo_processos_terceirizados()


@app.post("/orcamento/excel")
def orcamento_excel(entrada: dict) -> Response:
    """Mesma entrada de POST /orcamento, mas devolve uma planilha .xlsx
    editável em vez de JSON — ver app/excel_export.py. Os valores que
    importam (peso, taxas por processo, alíquotas) ficam em células na
    aba "Parâmetros"; as outras abas usam fórmula, não valor fixo, então
    mudar um parâmetro recalcula tudo dentro do próprio Excel."""
    resultado = montar_orcamento(entrada)
    conteudo = gerar_excel_orcamento(entrada, resultado, resolver_params(entrada))
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


@app.get("/materiais/catalogo")
def materiais_catalogo() -> dict:
    """Biblioteca centralizada de materiais (material/norma/categoria +
    densidade) — alimenta o seletor de material de todas as calculadoras
    manuais, eliminando o campo de densidade digitado à mão (ver
    app/materiais_catalogo.py)."""
    return {
        "materiais": [
            {"material": m.material, "norma": m.norma, "categoria": m.categoria, "densidade_kg_m3": m.densidade_kg_m3}
            for m in listar_materiais()
        ]
    }


@app.get("/materiais/precos-mercado")
def materiais_precos_mercado() -> dict:
    """Histórico de compras completo (Supabase), sem filtro de material/tipo
    (ver app/precos_mercado.py) — alimenta a aba "Referência de preços" do
    frontend, que pediu pra ver tudo que já foi importado do ERP, não só o
    subconjunto chapa/KG usado no auto-preenchimento (`/materiais/preco-mercado`)."""
    status = status_sincronizacao()
    compras = listar_todas_compras()
    return {
        **status,
        "total_referencias": len(compras),
        "compras": [
            {
                "codigo": c.codigo, "material": c.material, "descricao": c.descricao,
                "preco_unitario": c.preco_unitario, "unidade": c.unidade,
                "fornecedor": c.fornecedor, "obra": c.obra, "data_compra": c.data_compra,
            }
            for c in compras
        ],
    }


@app.get("/materiais/preco-mercado")
def materiais_preco_mercado(norma: str, espessura_mm: float | None = None, tipo: str | None = None) -> dict:
    """Preço/kg de referência — pra chapa, por norma+espessura (igual já
    faz com densidade; `exato=False` quando casou pela espessura mais
    próxima cadastrada, dentro de app.precos_mercado.TOLERANCIA_ESPESSURA_MM,
    não pela espessura exata pedida). Pra perfil/barra (`tipo="perfil"` ou
    `"barra"`), por norma só — sem espessura, dimensão que não existe pra
    esses materiais (bug real corrigido em 2026-09-19: 24 itens "VIGA U" de
    um desenho ficavam sem preço porque essa rota só olhava pra chapa,
    mesmo já existindo compras reais de perfil no histórico)."""
    if tipo in ("perfil", "barra"):
        preco = buscar_preco_perfil_barra(norma, tipo)
        if not preco:
            return {"encontrado": False}
        return {
            "encontrado": True,
            "preco_kg": preco.preco_kg,
            "fornecedor": preco.fornecedor,
            "data_compra": preco.data_compra,
            "exato": True,
        }

    resultado = buscar_preco_chapa(norma, espessura_mm)
    if not resultado:
        return {"encontrado": False}
    preco, exato = resultado
    return {
        "encontrado": True,
        "preco_kg": preco.preco_kg,
        "fornecedor": preco.fornecedor,
        "data_compra": preco.data_compra,
        "espessura_referencia_mm": preco.espessura_mm,
        "exato": exato,
    }


@app.get("/cnpj/{cnpj}")
def cnpj_buscar(cnpj: str) -> dict:
    """Busca nome (razão social) e endereço de um CNPJ na Receita Federal
    (via BrasilAPI, gratuita e sem chave) pra pré-preencher a
    "Identificação do cliente" — pedido explícito do usuário, primeira
    etapa de automação (hoje isso é digitado à mão numa planilha Excel).
    Ver app/cnpj.py."""
    try:
        return buscar_cnpj(cnpj)
    except CnpjInvalido as e:
        raise HTTPException(status_code=400, detail=str(e))
    except CnpjNaoEncontrado as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.get("/cantoneiras/buscar")
def cantoneiras_buscar(q: str | None = None) -> dict:
    """Busca no catálogo de cantoneiras L pro modo "Catálogo" do cartão —
    ver app/cantoneiras_catalogo.py."""
    cantoneiras = buscar_cantoneiras(termo=q)
    return {
        "cantoneiras": [
            {"designacao": c.designacao, "aba_mm": c.aba_mm, "espessura_mm": c.espessura_mm, "kg_m": c.kg_m, "fonte": c.fonte}
            for c in cantoneiras
        ]
    }


@app.get("/tubos/buscar")
def tubos_buscar(q: str | None = None) -> dict:
    """Busca no catálogo de tubos redondos pro modo "Catálogo" do cartão —
    ver app/tubos_catalogo.py."""
    tubos = buscar_tubos(termo=q)
    return {
        "tubos": [
            {
                "designacao": t.designacao, "diametro_externo_mm": t.diametro_externo_mm,
                "espessura_mm": t.espessura_mm, "diametro_interno_mm": t.diametro_interno_mm,
                "kg_m": t.kg_m, "fonte": t.fonte,
            }
            for t in tubos
        ]
    }


@app.get("/perfis/tipos")
def perfis_tipos() -> dict:
    """Tipos de perfil laminado selecionáveis no cartão (I/H/W/U) — ver
    app/perfis_catalogo.py sobre por que só a série W tem catálogo
    povoado hoje."""
    return {"tipos": listar_tipos_perfil(), "normas_sugeridas": NORMAS_PERFIL_SUGERIDAS}


@app.get("/perfis/buscar")
def perfis_buscar(tipo: str | None = None, q: str | None = None) -> dict:
    """Busca no catálogo de perfis pro campo "Perfil / Bitola" pesquisável
    — filtra por tipo (I/H/W/U) e por um termo livre na designação."""
    perfis = buscar_perfis(tipo=tipo, termo=q)
    return {"perfis": [{"designacao": p.designacao, "peso_kg_m": p.peso_kg_m, "tipo": p.tipo} for p in perfis]}


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
            # Preço/kg e perda de material digitados direto no cartão (hoje
            # só o de perfil laminado usa) — têm prioridade sobre o preço
            # padrão por norma cadastrado em materiais_fixture/Supabase, ver
            # app/adapter.py.
            "preco_kg_manual": _campo_pronto(item.get("preco_kg"), 0.95 if item.get("preco_kg") else 0.0),
            "perda_pct": _campo_pronto(item.get("perda_pct")),
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


@app.post("/ordem-compra-andritz")
async def ordem_compra_andritz(file: UploadFile) -> dict:
    """Repassa pro extractor (POST /ordem-compra-andritz) — extração
    determinística (texto + regex, sem IA) da Ordem de Compra ANDRITZ: nº
    do pedido, MAC e itens (material/quantidade/valor/data de entrega),
    prontos no formato da planilha de controle de pedidos do usuário."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    conteudo = await file.read()
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{EXTRACTOR_URL}/ordem-compra-andritz",
                files=[("file", (file.filename, conteudo, "application/pdf"))],
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Não consegui falar com o serviço de extração em {EXTRACTOR_URL}. Ele está rodando?",
        ) from e
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text) from e


@app.post("/ordem-compra-andritz/excel")
def ordem_compra_andritz_excel(pedido: dict) -> Response:
    """Planilha da OC ANDRITZ extraída (ver app/relatorio_pedido_andritz.py)
    — mesmas colunas que o usuário já preenche à mão na planilha de
    controle de pedidos."""
    itens = pedido.get("itens") or []
    conteudo = gerar_excel_pedido_andritz(pedido.get("numero_oc"), itens)
    nome_arquivo = f"pedido-{pedido.get('numero_oc') or 'andritz'}.xlsx"
    return Response(
        content=conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={nome_arquivo}"},
    )


@app.post("/relatorio-tecnico")
async def relatorio_tecnico(file: UploadFile) -> dict:
    """Repassa pro extractor (POST /relatorio-tecnico) — extração da lista
    de materiais (BOM) por IA, só isso (sem relatório narrativo, removido a
    pedido do usuário por custo — ver app/ai_fallback/lista_materiais.py no
    extractor). O peso que vem aqui é só o valor inicial do cartão "Peso
    direto" no cálculo manual — o orçamentista confirma antes de fechar o
    orçamento, que continua vindo 100% do motor de cálculo determinístico."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo PDF")

    conteudo = await file.read()
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{EXTRACTOR_URL}/relatorio-tecnico",
                files=[("file", (file.filename, conteudo, "application/pdf"))],
            )
            resp.raise_for_status()
            return resp.json()
    except httpx.ConnectError as e:
        raise HTTPException(
            status_code=503,
            detail=f"Não consegui falar com o serviço de extração em {EXTRACTOR_URL}. Ele está rodando?",
        ) from e
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=e.response.text) from e


@app.post("/relatorio-tecnico/excel")
def relatorio_tecnico_excel(pedido: dict) -> Response:
    """Excel parametrizado dos itens estruturados que o relatório técnico
    devolveu (ver app/relatorio_excel.py) — uma coluna por medida que o
    motor de geometria usa, com lista suspensa de tipos válidos. Editável
    e reimportável em /relatorio-tecnico/importar-excel."""
    itens = pedido.get("itens") or []
    conteudo = gerar_excel_bom(itens)
    return Response(
        content=conteudo,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=lista-materiais-ia.xlsx"},
    )


@app.post("/relatorio-tecnico/importar-excel")
async def relatorio_tecnico_importar_excel(file: UploadFile) -> dict:
    """Lê a planilha (gerada por /relatorio-tecnico/excel, editada ou não)
    e RECALCULA o peso de cada item pelo motor determinístico — nunca usa
    um peso vindo de fora. Item sem tipo de geometria reconhecido ou com
    medida faltando vira "ignorado" em vez de forçar um cálculo errado
    (ver app/relatorio_excel.py::calcular_itens_da_planilha)."""
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Envie um arquivo .xlsx")

    conteudo = await file.read()
    try:
        itens_planilha = ler_excel(conteudo)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Não consegui ler a planilha: {e}") from e

    calculados, ignorados = calcular_itens_da_planilha(itens_planilha)
    return {"itens": calculados, "itens_ignorados": ignorados}


@app.post("/relatorio-tecnico/calcular")
def relatorio_tecnico_calcular(pedido: dict) -> dict:
    """Mesmo cálculo de /relatorio-tecnico/importar-excel, mas direto a
    partir dos itens_estruturados que o relatório técnico devolveu — sem
    passar pelo Excel. Usado pra popular o Cálculo manual automaticamente
    assim que o relatório termina (pedido explícito do usuário), mantendo o
    Excel como caminho alternativo pra revisar/editar em lote antes de trazer
    pro sistema."""
    itens = pedido.get("itens") or []
    calculados, ignorados = calcular_itens_da_planilha(itens)
    return {"itens": calculados, "itens_ignorados": ignorados}


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
        # Valores efetivos (padrão + overrides já aplicados) dos parâmetros
        # editáveis do "Custo por processo" — ver
        # app/orcamento.py::PARAMS_ESCALARES_SOBRESCREVIVEIS. O frontend usa
        # isso pra pré-preencher o formulário de edição de cada linha.
        "parametros": resolver_params(adaptacao.entrada),
    }
