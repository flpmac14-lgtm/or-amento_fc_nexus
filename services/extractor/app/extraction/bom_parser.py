"""Camada 3 do pipeline: heurísticas de regex sobre o texto (nativo ou OCR)
para achar identificação, características gerais e sinais de fabricação.

Estas regras foram calibradas com um desenho real (A752193 / MAC_573.26,
Weir) e com o vocabulário típico de desenhos de caldeiraria/usinagem em
português e inglês. É um ponto de partida deliberadamente simples — a
extração de BOM em tabela (linhas item/qtd/material/dimensão) tende a
precisar de detecção de tabela (pdfplumber) ou de layout via OCR+geometria,
e deve evoluir nesta função sem mudar o contrato de saída (ResultadoExtracao).
"""

from __future__ import annotations

import re

from app.schemas import CampoExtraido

_RE_NUMERO_DESENHO = re.compile(r"\b([A-Z]-?\d{5,7})\b")
_RE_PEDIDO_PO = re.compile(r"\b(\d{10}-\d{2,3})\b")
_RE_CODIGO_EQUIPAMENTO = re.compile(r"\bMAC[_\s]?(\d{3,4}\.\d{1,2}(?:\.\d{1,2})?)\b", re.IGNORECASE)
_RE_REVISAO_SUFIXO = re.compile(r"\b([A-Z]\d{5,7})_(\d+)\b")
_RE_REVISAO_EXPLICITA = re.compile(r"\bREV(?:IS[AÃ]O)?\.?\s*[:\-]?\s*(\d+)\b", re.IGNORECASE)
_RE_NORMA_ASTM = re.compile(r"\bASTM\s?A\d{2,4}\b", re.IGNORECASE)
_RE_NORMA_AISI = re.compile(r"\bAISI\s?\d{3,4}\b", re.IGNORECASE)
_RE_PERFIL_W = re.compile(r"\bW\d{2,3}\s?[xX]\s?\d{1,3}(?:[.,]\d+)?\b")
_RE_MACHINED = re.compile(r"\bMACHINED\b", re.IGNORECASE)
_RE_ESPESSURA_MM = re.compile(r"\b(\d{1,3}(?:[.,]\d{1,2})?)\s?mm\b", re.IGNORECASE)
_RE_ESP_TOTAL_PINTURA = re.compile(r"ESP\.?\s*TOTAL:?\s*(\d{2,4})\s?u?m", re.IGNORECASE)
_RE_DEMAO_PINTURA = re.compile(r"-\s*([A-Z][A-Z0-9]*(?:\s[A-Z0-9]+){0,3})\s*-\s*(\d{2,4})\s?u?m")


def _campo(valor, confianca: float, origem: str = "regra_local") -> CampoExtraido:
    return CampoExtraido(valor=valor, confianca=confianca, origem=origem)


def extrair_numero_desenho(texto: str) -> CampoExtraido:
    m = _RE_NUMERO_DESENHO.search(texto)
    if not m:
        return _campo(None, 0.0)
    return _campo(m.group(1), 0.9)


def extrair_revisao(texto: str) -> CampoExtraido:
    m = _RE_REVISAO_SUFIXO.search(texto)
    if m:
        return _campo(m.group(2), 0.85)
    m = _RE_REVISAO_EXPLICITA.search(texto)
    if m:
        return _campo(m.group(1), 0.8)
    return _campo(None, 0.0)


def extrair_pedido_po(texto: str) -> CampoExtraido:
    achados = list(dict.fromkeys(_RE_PEDIDO_PO.findall(texto)))
    if not achados:
        return _campo(None, 0.0)
    # PO pode ter múltiplas linhas de item (ex: -10, -20); mantém como texto único.
    return _campo(", ".join(achados), 0.9)


def extrair_codigo_equipamento(texto: str) -> CampoExtraido:
    m = _RE_CODIGO_EQUIPAMENTO.search(texto)
    if not m:
        return _campo(None, 0.0)
    return _campo(f"MAC_{m.group(1)}", 0.9)


def extrair_normas(texto: str) -> CampoExtraido:
    achados = {m.upper().replace("  ", " ") for m in _RE_NORMA_ASTM.findall(texto)}
    achados |= {m.upper().replace("  ", " ") for m in _RE_NORMA_AISI.findall(texto)}
    if not achados:
        return _campo([], 0.0)
    return _campo(sorted(achados), 0.85)


def extrair_perfis(texto: str) -> CampoExtraido:
    achados = sorted(set(_RE_PERFIL_W.findall(texto)))
    if not achados:
        return _campo([], 0.0)
    return _campo(achados, 0.8)


def contem_indicacao_usinagem(texto: str) -> CampoExtraido:
    achou = bool(_RE_MACHINED.search(texto))
    return _campo(achou, 0.85 if achou else 0.3)


def extrair_espessuras_mm(texto: str) -> CampoExtraido:
    achados = sorted({float(v.replace(",", ".")) for v in _RE_ESPESSURA_MM.findall(texto)})
    if not achados:
        return _campo([], 0.0)
    return _campo(achados, 0.6)


def extrair_especificacao_pintura(texto: str) -> CampoExtraido:
    """Extrai sistema de pintura: espessura total (µm) e demãos (produto + µm).

    Calibrado com o desenho A752193: "ESP. TOTAL: 225um" + linhas
    "INTERGARD 251 - 75um" / "INTERSEAL 670HS - 150um (CINZA N5,5)".
    """
    esp_total = _RE_ESP_TOTAL_PINTURA.search(texto)
    demaos = [
        {"produto": nome.strip(" -"), "espessura_um": int(um)}
        for nome, um in _RE_DEMAO_PINTURA.findall(texto)
    ]
    if esp_total is None and not demaos:
        return _campo(None, 0.0)
    valor = {
        "espessura_total_um": int(esp_total.group(1)) if esp_total else None,
        "demaos": demaos,
    }
    confianca = 0.85 if esp_total and demaos else 0.5
    return _campo(valor, confianca)
