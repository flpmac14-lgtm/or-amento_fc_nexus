"""Orquestra o fluxo híbrido descrito na especificação:

  PDF -> texto nativo -> (se necessário) OCR -> heurísticas/regras
      -> confiança suficiente? -> [sim: segue] [não: fallback de IA externa]

A IA (interna ou externa) nunca calcula peso/custo/preço — só ajuda a
estruturar o que o desenho contém. Ver app/ai_fallback/client.py.
"""

from __future__ import annotations

from app.ai_fallback.client import fallback_habilitado
from app.extraction import bom_parser
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


def processar_pdf(pdf_path: str) -> dict:
    from app.schemas import (
        CaracteristicasGerais,
        Identificacao,
        ResultadoExtracao,
    )

    paginas = extrair_texto_nativo(pdf_path)
    paginas_ocr = 0
    texto_completo_partes: list[str] = []

    for pagina in paginas:
        texto = pagina.texto
        if pagina.precisa_ocr:
            resultado_ocr = ocr_pagina(pdf_path, pagina.numero)
            if resultado_ocr.ocr_disponivel:
                texto = resultado_ocr.texto
                paginas_ocr += 1
        texto_completo_partes.append(texto)

    texto_completo = "\n".join(texto_completo_partes)

    identificacao = Identificacao(
        numero_desenho=bom_parser.extrair_numero_desenho(texto_completo),
        revisao=bom_parser.extrair_revisao(texto_completo),
        pedido_po=bom_parser.extrair_pedido_po(texto_completo),
        codigo_equipamento=bom_parser.extrair_codigo_equipamento(texto_completo),
    )

    caracteristicas = CaracteristicasGerais(
        normas=bom_parser.extrair_normas(texto_completo),
        numero_folhas=_campo_len(paginas),
    )

    # Extração de tabela (BOM) trabalha direto no PDF via pdfplumber, à
    # parte do texto nativo/OCR já concatenado acima. Tabelas sem cabeçalho
    # reconhecível são descartadas dentro de extrair_bom_de_tabelas (ver
    # limite documentado em app/extraction/bom_table.py — quando a página
    # não tem texto nativo, a grade da tabela aparece mas as células vêm
    # vazias, e não há nada de útil pra extrair sem OCR de layout).
    bom = extrair_bom_de_tabelas(pdf_path)

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
        paginas_total=len(paginas),
        paginas_com_texto_nativo=sum(1 for p in paginas if not p.precisa_ocr),
        paginas_via_ocr=paginas_ocr,
        usou_ia_externa=usou_ia_externa,
        texto_bruto=texto_completo,
    )
    return resultado.model_dump()


def _campo_len(paginas):
    from app.schemas import CampoExtraido

    return CampoExtraido(valor=len(paginas), confianca=1.0, origem="regra_local")


def status_dependencias() -> dict:
    return {
        "ocr_disponivel": tesseract_disponivel(),
        "ia_externa_habilitada": fallback_habilitado(),
    }
