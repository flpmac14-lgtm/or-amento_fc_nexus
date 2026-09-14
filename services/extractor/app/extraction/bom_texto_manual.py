"""Camada 3d do pipeline: BOM digitada manualmente, sem PDF nenhum — pra
quando o orçamentista já sabe os itens de cabeça (ou tem uma lista solta,
tipo e-mail do cliente) e não quer esperar/depender da extração de desenho.

Uma linha = um item. Formato aceito por tipo (norma é opcional; quantidade
default 1 se não informada):

  CHAPA <compr> x <larg> x <esp> <norma> [qtd <n>]
  BARRA REDONDA Ø<diam> x <compr> <norma> [qtd <n>]
  PERFIL <designacao> comprimento <compr> <norma> [qtd <n>]
  CANTONEIRA <a> x <b> <norma> [qtd <n>]   (sem fórmula de peso ainda —
                                             mesmo limite de bom_table.py)

Exemplo:
  CHAPA 1000 x 500 x 25 ASTM A36 qtd 2
  BARRA REDONDA Ø100 x 500 SAE 1020
  PERFIL W310x52 comprimento 4750 ASTM A36

Linhas que não batem com nenhum padrão reconhecido viram um item com
descrição = a linha inteira e tipo_geometria vazio — vai pra revisão em
vez de ser descartada silenciosamente (o usuário digitou aquilo de
propósito, merece aparecer na tela mesmo que o sistema não tenha
entendido).
"""

from __future__ import annotations

import re

from app.extraction.bom_table import _campo

_RE_NORMA = re.compile(r"\b(ASTM\s?A\d{2,4}|AISI\s?\d{3,4}|SAE\s?\d{3,4})\b", re.IGNORECASE)
_RE_QTD = re.compile(r"\b(?:QTD\.?|QUANTIDADE)\s*[:=]?\s*(\d+)\b", re.IGNORECASE)

_RE_CHAPA = re.compile(
    r"^CHAPA\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE
)
_RE_BARRA = re.compile(
    # Ø é o símbolo "certo", mas o usuário raramente tem como digitar —
    # aceita D/DIAM/DIAMETRO como alternativa digitável de teclado comum.
    r"^BARRA\s+REDONDA\s*(?:[ØÓO]|DI[ÂA]METRO|DIAM\.?|D)?\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)",
    re.IGNORECASE,
)
_RE_PERFIL = re.compile(
    r"^PERFIL\s+(\S+)\s+(?:COMPRIMENTO|COMPR\.?)\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE
)
_RE_CANTONEIRA = re.compile(r"^CANTONEIRA\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE)


def _extrair_norma(linha: str) -> str | None:
    m = _RE_NORMA.search(linha)
    return m.group(1).upper().replace("  ", " ") if m else None


def _extrair_quantidade(linha: str) -> float:
    m = _RE_QTD.search(linha)
    return float(m.group(1)) if m else 1.0


def _linha_para_item(numero: int, linha: str) -> dict:
    norma = _extrair_norma(linha)
    quantidade = _extrair_quantidade(linha)
    base = {
        "item_numero": _campo(str(numero), 1.0, origem="manual"),
        "descricao": _campo(linha, 1.0, origem="manual"),
        "norma": _campo(norma, 0.9 if norma else 0.0, origem="manual"),
        "quantidade": _campo(quantidade, 1.0, origem="manual"),
        "usinado": _campo(False, 0.3, origem="manual"),
    }

    m = _RE_CHAPA.match(linha)
    if m:
        comprimento, largura, espessura = (float(v.replace(",", ".")) for v in m.groups())
        return {
            **base,
            "tipo_geometria": _campo("chapa_retangular", 0.95, origem="manual"),
            "comprimento_mm": _campo(comprimento, 0.95, origem="manual"),
            "largura_mm": _campo(largura, 0.95, origem="manual"),
            "espessura_mm": _campo(espessura, 0.95, origem="manual"),
            "perfil": _campo(None, 0.0, origem="manual"),
            "diametro_mm": _campo(None, 0.0, origem="manual"),
            "material": _campo(norma, 0.9 if norma else 0.0, origem="manual"),
        }

    m = _RE_BARRA.match(linha)
    if m:
        diametro, comprimento = (float(v.replace(",", ".")) for v in m.groups())
        return {
            **base,
            "tipo_geometria": _campo("barra_redonda", 0.95, origem="manual"),
            "diametro_mm": _campo(diametro, 0.95, origem="manual"),
            "comprimento_mm": _campo(comprimento, 0.95, origem="manual"),
            "largura_mm": _campo(None, 0.0, origem="manual"),
            "espessura_mm": _campo(None, 0.0, origem="manual"),
            "perfil": _campo(None, 0.0, origem="manual"),
            "material": _campo(norma, 0.9 if norma else 0.0, origem="manual"),
        }

    m = _RE_PERFIL.match(linha)
    if m:
        designacao, comprimento = m.group(1), float(m.group(2).replace(",", "."))
        return {
            **base,
            "tipo_geometria": _campo("perfil", 0.95, origem="manual"),
            "perfil": _campo(designacao, 0.9, origem="manual"),
            "comprimento_mm": _campo(comprimento, 0.95, origem="manual"),
            "largura_mm": _campo(None, 0.0, origem="manual"),
            "espessura_mm": _campo(None, 0.0, origem="manual"),
            "diametro_mm": _campo(None, 0.0, origem="manual"),
            "material": _campo(norma, 0.9 if norma else 0.0, origem="manual"),
        }

    m = _RE_CANTONEIRA.match(linha)
    if m:
        # Sem fórmula de peso no motor geométrico ainda (mesmo limite de
        # bom_table.py) — sinaliza o tipo em vez de forçar num suportado.
        return {
            **base,
            "tipo_geometria": _campo("cantoneira", 0.6, origem="manual"),
            "perfil": _campo(None, 0.0, origem="manual"),
            "comprimento_mm": _campo(None, 0.0, origem="manual"),
            "largura_mm": _campo(None, 0.0, origem="manual"),
            "espessura_mm": _campo(None, 0.0, origem="manual"),
            "diametro_mm": _campo(None, 0.0, origem="manual"),
            "material": _campo(norma, 0.9 if norma else 0.0, origem="manual"),
        }

    # Não reconhecido: mantém a linha visível (vira item de revisão no
    # adapter) em vez de descartar o que o usuário digitou.
    return {
        **base,
        "tipo_geometria": _campo(None, 0.0, origem="manual"),
        "perfil": _campo(None, 0.0, origem="manual"),
        "comprimento_mm": _campo(None, 0.0, origem="manual"),
        "largura_mm": _campo(None, 0.0, origem="manual"),
        "espessura_mm": _campo(None, 0.0, origem="manual"),
        "diametro_mm": _campo(None, 0.0, origem="manual"),
        "material": _campo(norma, 0.9 if norma else 0.0, origem="manual"),
    }


def extrair_bom_de_texto_manual(texto: str) -> list[dict]:
    linhas = [l.strip() for l in (texto or "").splitlines() if l.strip()]
    return [_linha_para_item(i, linha) for i, linha in enumerate(linhas, start=1)]
