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

from app.ai_fallback.client import fallback_habilitado
from app.extraction import bom_parser
from app.extraction.bom_sap_export import extrair_bom_sap_export
from app.extraction.bom_table import extrair_bom_de_tabelas
from app.extraction.ocr import ocr_pagina, tesseract_disponivel
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
        normas=bom_parser.extrair_normas(texto_completo),
        numero_folhas=_campo_len(paginas_total),
    )

    campos_essenciais = {
        nome: getattr(identificacao, nome).confianca for nome in CAMPOS_IDENTIFICACAO
    }
    algum_campo_incerto = any(c < LIMIAR_CONFIANCA_CAMPO_ESSENCIAL for c in campos_essenciais.values())

    usou_ia_externa = False
    if algum_campo_incerto and fallback_habilitado():
        # Aqui entraria a chamada real ao ai_fallback.client.complementar_com_ia
        # por página, mesclando de volta só os campos que ainda faltam.
        usou_ia_externa = False  # ainda não implementado (ver ai_fallback/client.py)

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


def _mesclar_identificacao(textos_por_arquivo: list[str]):
    """Roda o parser de identificação em cada arquivo e fica com o primeiro
    valor de confiança > 0 encontrado por campo — na prática, o desenho
    principal (processado primeiro) resolve quase tudo; um anexo de BOM
    raramente tem número de desenho/PO próprio."""
    from app.schemas import CampoExtraido, Identificacao

    melhores: dict[str, CampoExtraido] = {nome: CampoExtraido() for nome in CAMPOS_IDENTIFICACAO}

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

    return Identificacao(**melhores)


def _campo_len(numero_folhas: int):
    from app.schemas import CampoExtraido

    return CampoExtraido(valor=numero_folhas, confianca=1.0, origem="regra_local")


def status_dependencias() -> dict:
    return {
        "ocr_disponivel": tesseract_disponivel(),
        "ia_externa_habilitada": fallback_habilitado(),
    }
