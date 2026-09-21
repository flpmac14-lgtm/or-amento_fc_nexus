"""Orquestra o fluxo híbrido descrito na especificação:

  PDF -> texto nativo -> (se necessário) OCR -> heurísticas/regras
      -> confiança suficiente? -> [sim: segue] [não: fallback de IA externa]

A IA (interna ou externa) nunca calcula peso/custo/preço — só ajuda a
estruturar o que o desenho contém. Ver app/ai_fallback/client.py.

Um orçamento pode envolver mais de um PDF: o desenho principal e, às
vezes, um anexo separado com a lista de materiais (achado real na pasta
de referência — ver app/extraction/bom_sap_export.py). `processar_pdfs`
roda o mesmo pipeline em cada arquivo e junta os resultados: identificação
vem do primeiro campo com confiança > 0 entre os arquivos (normalmente só
o desenho principal tem isso), BOM é a concatenação da BOM de todos.
`processar_pdf` (um arquivo só) é o caso comum, mantido por compatibilidade.
"""

from __future__ import annotations

from app.ai_fallback.client import analisar_paginas, fallback_habilitado
from app.extraction import bom_parser
from app.extraction.andritz_oc import extrair_pedido_andritz
from app.extraction.weir_oc import extrair_pedido_weir
from app.extraction.bom_sap_export import extrair_bom_sap_export
from app.extraction.bom_table import _campo, extrair_bom_de_tabelas
from app.extraction.bom_texto_manual import extrair_bom_de_texto_manual
from app.extraction.ocr import ocr_pagina, tesseract_disponivel
from app.extraction.page_render import renderizar_paginas_png
from app.extraction.text_extract import extrair_texto_nativo

LIMIAR_CONFIANCA_CAMPO_ESSENCIAL = 0.6

CAMPOS_IDENTIFICACAO = (
    "numero_desenho",
    "revisao",
    "pedido_po",
    "codigo_equipamento",
)


def _extrair_texto_completo(pdf_path: str) -> tuple[str, int, int]:
    """Devolve (texto_completo, paginas_total, paginas_via_ocr) de um PDF."""
    paginas = extrair_texto_nativo(pdf_path)
    paginas_ocr = 0
    partes: list[str] = []

    for pagina in paginas:
        texto = pagina.texto
        if pagina.precisa_ocr:
            resultado_ocr = ocr_pagina(pdf_path, pagina.numero)
            if resultado_ocr.ocr_disponivel:
                texto = resultado_ocr.texto
                paginas_ocr += 1
        partes.append(texto)

    return "\n".join(partes), len(paginas), paginas_ocr


def processar_pdf(pdf_path: str) -> dict:
    return processar_pdfs([pdf_path])


def processar_pdfs(pdf_paths: list[str]) -> dict:
    from app.schemas import (
        CaracteristicasGerais,
        Identificacao,
        ResultadoExtracao,
    )

    textos_por_arquivo: list[str] = []
    paginas_total = 0
    paginas_ocr_total = 0
    paginas_nativas_total = 0
    bom: list[dict] = []

    for pdf_path in pdf_paths:
        texto_completo, n_paginas, n_ocr = _extrair_texto_completo(pdf_path)
        textos_por_arquivo.append(texto_completo)
        paginas_total += n_paginas
        paginas_ocr_total += n_ocr
        paginas_nativas_total += n_paginas - n_ocr

        # Tabela via pdfplumber (grade vetorial no próprio PDF) e, se não
        # achar nada, tenta o formato de export SAP (texto de largura fixa,
        # sem grade — ver bom_sap_export.py). Os dois descartam em vez de
        # adivinhar quando o formato não bate.
        itens_arquivo = extrair_bom_de_tabelas(pdf_path)
        if not itens_arquivo:
            itens_arquivo = extrair_bom_sap_export(texto_completo)
        bom.extend(itens_arquivo)

    texto_completo = "\n\n".join(textos_por_arquivo)

    identificacao = _mesclar_identificacao(textos_por_arquivo)

    caracteristicas = CaracteristicasGerais(
        normas=bom_parser.extrair_normas(texto_completo).model_dump(),
        numero_folhas=_campo_len(paginas_total),
    )

    campos_essenciais = {
        nome: getattr(identificacao, nome).confianca for nome in CAMPOS_IDENTIFICACAO
    }
    algum_campo_incerto = any(c < LIMIAR_CONFIANCA_CAMPO_ESSENCIAL for c in campos_essenciais.values())

    usou_ia_externa = False
    if (algum_campo_incerto or not bom) and fallback_habilitado():
        identificacao, bom, usou_ia_externa = _complementar_com_ia(pdf_paths[0], identificacao, bom)
        campos_essenciais = {
            nome: getattr(identificacao, nome).confianca for nome in CAMPOS_IDENTIFICACAO
        }

    confiancas = [c for c in campos_essenciais.values() if c > 0] or [0.0]
    confianca_geral = sum(confiancas) / len(confiancas)

    resultado = ResultadoExtracao(
        identificacao=identificacao,
        caracteristicas=caracteristicas,
        bom=bom,
        confianca_geral=round(confianca_geral, 2),
        paginas_total=paginas_total,
        paginas_com_texto_nativo=paginas_nativas_total,
        paginas_via_ocr=paginas_ocr_total,
        usou_ia_externa=usou_ia_externa,
        texto_bruto=texto_completo,
    )
    return resultado.model_dump()


def processar_texto(texto: str) -> dict:
    """Mesma saída de `processar_pdf`, mas a partir de uma BOM digitada
    manualmente (sem PDF) — ver app/extraction/bom_texto_manual.py pro
    formato de linha aceito. Não tem desenho pra tirar identificação/
    normas gerais, só a BOM; identificação e características ficam vazias
    (confiança 0), o que é honesto — não tem de onde vir esse dado aqui."""
    from app.schemas import CaracteristicasGerais, Identificacao, ResultadoExtracao

    bom = extrair_bom_de_texto_manual(texto)
    confiancas_bom = [item["tipo_geometria"]["confianca"] for item in bom if item["tipo_geometria"]["confianca"] > 0]
    confianca_geral = sum(confiancas_bom) / len(confiancas_bom) if confiancas_bom else 0.0

    resultado = ResultadoExtracao(
        identificacao=Identificacao(),
        caracteristicas=CaracteristicasGerais(),
        bom=bom,
        confianca_geral=round(confianca_geral, 2),
        paginas_total=0,
        paginas_com_texto_nativo=0,
        paginas_via_ocr=0,
        usou_ia_externa=False,
        texto_bruto=texto,
    )
    return resultado.model_dump()


def _complementar_com_ia(pdf_principal: str, identificacao, bom: list[dict]) -> tuple:
    """Renderiza as páginas do desenho principal como imagem e manda pra
    IA externa — só substitui um campo de identificação se a IA veio mais
    confiante que o pipeline local, e só preenche a BOM com a "pré-lista"
    da IA quando a extração local não achou nenhum item (nunca sobrepõe
    uma BOM local já extraída). Devolve (identificacao, bom, usou_ia)."""
    from app.schemas import Identificacao

    try:
        paginas_png = renderizar_paginas_png(pdf_principal)
    except Exception:
        return identificacao, bom, False

    resposta = analisar_paginas(paginas_png)
    if resposta is None:
        return identificacao, bom, False

    usou = False

    campos_ia = {
        "numero_desenho": resposta.identificacao.numero_desenho,
        "revisao": resposta.identificacao.revisao,
        "pedido_po": resposta.identificacao.pedido_po,
        "codigo_equipamento": resposta.identificacao.codigo_equipamento,
    }
    identificacao_dict = identificacao.model_dump()
    for nome, campo_ia in campos_ia.items():
        if campo_ia.valor and campo_ia.confianca > identificacao_dict[nome]["confianca"]:
            identificacao_dict[nome] = {
                "valor": campo_ia.valor, "confianca": campo_ia.confianca, "origem": "ia_externa",
            }
            usou = True
    identificacao = Identificacao(**identificacao_dict)

    if not bom and resposta.itens_bom:
        # Pré-lista só: posição/descrição/norma/quantidade. Tipo de
        # geometria e medidas ficam de fora de propósito — o orçamentista
        # escolhe isso no cartão de cálculo manual (pedido explícito do
        # usuário: a IA nunca calcula peso, só estrutura o que leu).
        bom = [
            {
                "item_numero": _campo(item.posicao, item.confianca, origem="ia_externa"),
                "descricao": _campo(item.descricao, item.confianca, origem="ia_externa"),
                "norma": _campo(item.norma, item.confianca if item.norma else 0.0, origem="ia_externa"),
                "material": _campo(item.norma, item.confianca if item.norma else 0.0, origem="ia_externa"),
                "quantidade": _campo(
                    item.quantidade if item.quantidade is not None else 1.0,
                    item.confianca if item.quantidade is not None else 0.0,
                    origem="ia_externa",
                ),
                "tipo_geometria": _campo(None, 0.0, origem="ia_externa"),
                "perfil": _campo(None, 0.0, origem="ia_externa"),
                "espessura_mm": _campo(None, 0.0, origem="ia_externa"),
                "comprimento_mm": _campo(None, 0.0, origem="ia_externa"),
                "largura_mm": _campo(None, 0.0, origem="ia_externa"),
                "diametro_mm": _campo(None, 0.0, origem="ia_externa"),
                "usinado": _campo(False, 0.0, origem="ia_externa"),
                "peso_kg": _campo(None, 0.0, origem="ia_externa"),
            }
            for item in resposta.itens_bom
        ]
        usou = True

    return identificacao, bom, usou


def _mesclar_identificacao(textos_por_arquivo: list[str]):
    """Roda o parser de identificação em cada arquivo e fica com o primeiro
    valor de confiança > 0 encontrado por campo — na prática, o desenho
    principal (processado primeiro) resolve quase tudo; um anexo de BOM
    raramente tem número de desenho/PO próprio."""
    from app.schemas import CampoExtraido, Identificacao

    melhores: dict[str, CampoExtraido] = {nome: CampoExtraido() for nome in CAMPOS_IDENTIFICACAO}
    melhor_candidatos_mac = CampoExtraido(valor=[])

    for texto in textos_por_arquivo:
        candidatos = {
            "numero_desenho": bom_parser.extrair_numero_desenho(texto),
            "revisao": bom_parser.extrair_revisao(texto),
            "pedido_po": bom_parser.extrair_pedido_po(texto),
            "codigo_equipamento": bom_parser.extrair_codigo_equipamento(texto),
        }
        for nome, campo in candidatos.items():
            if melhores[nome].confianca == 0 and campo.confianca > 0:
                melhores[nome] = campo

        candidatos_mac = bom_parser.extrair_codigos_equipamento_candidatos(texto)
        if melhor_candidatos_mac.confianca == 0 and candidatos_mac.confianca > 0:
            melhor_candidatos_mac = candidatos_mac

    # .model_dump() em vez de passar as instâncias direto: Identificacao
    # espera CampoExtraido[str] (genérico parametrizado) e `melhores` tem
    # CampoExtraido "cru" (sem parâmetro) — algumas versões do Pydantic
    # rejeitam a instância não-parametrizada num field parametrizado
    # (ValidationError "Input should be a valid dictionary or instance of
    # CampoExtraido[str]"), mesmo sendo, na prática, os mesmos dados. Dict
    # sempre revalida limpo, independente da versão do Pydantic instalada.
    return Identificacao(
        **{nome: campo.model_dump() for nome, campo in melhores.items()},
        codigo_equipamento_candidatos=melhor_candidatos_mac.model_dump(),
    )


def _campo_len(numero_folhas: int) -> dict:
    return {"valor": numero_folhas, "confianca": 1.0, "origem": "regra_local"}


def processar_ordem_compra_andritz(pdf_path: str) -> dict:
    """Extração determinística (texto + regex, sem IA) da Ordem de Compra
    ANDRITZ — ver app/extraction/andritz_oc.py. Documento diferente do
    desenho técnico: devolve `{}` se o PDF não bater com o formato
    reconhecido (nunca tenta adivinhar formato de pedido de outro
    cliente)."""
    texto_completo, _, _ = _extrair_texto_completo(pdf_path)
    return extrair_pedido_andritz(texto_completo)


def processar_pedidos_weir(pdf_paths: list[str]) -> dict:
    """Extração determinística (texto + regex, sem IA) de um ou mais
    Pedidos WEIR — pedido explícito do usuário: aceita vários PDFs de uma
    vez (cada um pode ser um pedido diferente) e junta os itens de todos
    num resultado só. PDFs que não baterem com o formato WEIR reconhecido
    (ver weir_oc.parece_pedido_weir) simplesmente não contribuem itens."""
    itens: list[dict] = []
    for pdf_path in pdf_paths:
        texto_completo, _, _ = _extrair_texto_completo(pdf_path)
        itens.extend(extrair_pedido_weir(texto_completo))
    return {"itens": itens}


def status_dependencias() -> dict:
    return {
        "ocr_disponivel": tesseract_disponivel(),
        "ia_externa_habilitada": fallback_habilitado(),
    }
