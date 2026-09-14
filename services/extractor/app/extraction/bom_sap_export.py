"""Camada 3c do pipeline: BOM vinda de um anexo separado, não do desenho.

Descoberta real (pasta de referência Macfab, orçamentos Andritz
MAC_0799.26/MAC_0820.26): em alguns pedidos a lista de materiais não está
no PDF do desenho — vem num arquivo à parte, exportado direto do
SAP/PLM do cliente (relatório "WBS - Bill of Material"). É texto nativo
puro, layout de largura fixa (sem linha de grade nenhuma — por isso
`bom_table.py`/pdfplumber nunca encontra nada aqui: `extract_tables()`
depende de linhas vetoriais).

Diferença importante desse formato pros outros: ele já traz o **peso por
peça pronto** ("Weight KG/unit"), não geometria (chapa/perfil/barra) — os
itens costumam ser peças acabadas ou compradas (ex: "GUARDA-CORPO LATERAL
DIREITA", "ANCHOR BOLT"), não matéria-prima bruta. Por isso `ItemBom` tem
`peso_kg` (peso já informado pela fonte, sem precisar calcular por
geometria) separado de `tipo_geometria`/`norma` (que aqui costumam ficar
vazios de propósito — não tem como inferir matéria-prima/norma a partir
de "ANCHOR BOLT", e forçar um valor seria inventar dado; o item cai em
revisão pra precificação manual, o que é o comportamento correto pra peça
comprada/subcontratada).

Calibrado com 2 exemplos reais completos (`BOM_C-C4-857717-...PDF`,
`BOM_C-C4-859804-...PDF`), incluindo o caso mais complicado observado:
item com várias linhas de especificação técnica entre a linha do item e
a linha do peso (ANCHOR BOLT, ~15 linhas de "Characteristics:").
"""

from __future__ import annotations

import re

from app.extraction.bom_table import _campo

MARCADOR_FORMATO = "WBS - Bill of Material"

_RE_ITEM = re.compile(
    r"^(?P<pos>\d{3,5})\s+(?P<qtd>\d+)\s+(?P<un>[A-Z]{1,3})\s+(?P<material>\S+)"
    r"\s+\d+\s+\S\s+\d+\s+\.?\s*(?P<descricao>\S.*)$",
    re.MULTILINE,
)

# Peso por unidade: número decimal (vírgula, formato pt-BR/europeu) sozinho
# no fim de uma linha, dentro do bloco do item — é a coluna "Weight
# KG/unit", que fica bem à direita e mais nenhum outro campo do relatório
# usa vírgula decimal no fim de linha dessa forma.
_RE_PESO = re.compile(r"(\d+,\d+)\s*$", re.MULTILINE)


def parece_export_sap(texto: str) -> bool:
    return MARCADOR_FORMATO in (texto or "")


def extrair_bom_sap_export(texto: str) -> list[dict]:
    """Devolve uma lista de ItemBom-dicts a partir do texto de um relatório
    SAP "WBS - Bill of Material". Lista vazia se o texto não parecer ser
    desse formato (ver `parece_export_sap`) — nunca tenta adivinhar."""
    if not parece_export_sap(texto):
        return []

    matches = list(_RE_ITEM.finditer(texto))
    itens: list[dict] = []

    for i, m in enumerate(matches):
        inicio_bloco = m.end()
        fim_bloco = matches[i + 1].start() if i + 1 < len(matches) else len(texto)
        bloco = texto[inicio_bloco:fim_bloco]

        peso_match = _RE_PESO.search(bloco)
        peso_kg = float(peso_match.group(1).replace(",", ".")) if peso_match else None

        descricao = m.group("descricao").strip()
        quantidade = float(m.group("qtd"))

        itens.append(
            {
                "item_numero": _campo(m.group("pos"), 0.9),
                "descricao": _campo(descricao, 0.9),
                "tipo_geometria": _campo(None, 0.0),
                "perfil": _campo(None, 0.0),
                "espessura_mm": _campo(None, 0.0),
                "comprimento_mm": _campo(None, 0.0),
                "largura_mm": _campo(None, 0.0),
                "diametro_mm": _campo(None, 0.0),
                "material": _campo(m.group("material"), 0.5),  # código interno do cliente, não norma
                "norma": _campo(None, 0.0),
                "usinado": _campo(False, 0.3),
                "quantidade": _campo(quantidade, 0.9),
                "peso_kg": _campo(peso_kg, 0.9 if peso_kg is not None else 0.0),
            }
        )

    return itens
