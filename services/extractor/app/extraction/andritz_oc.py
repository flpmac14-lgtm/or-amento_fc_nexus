"""Camada 3f do pipeline: parser específico do documento "Ordem de Compra"
da ANDRITZ — diferente do desenho técnico (BOM de peças a fabricar), essa
é a OC/pedido de compra em si, com linhas de item (código do material do
cliente, quantidade, valor, data de entrega). Pedido explícito do
usuário: hoje ele digita item a item numa planilha de controle à mão toda
vez que chega uma OC; esta extração já devolve os itens prontos nesse
formato — texto + regex, SEM IA (confiabilidade e custo).

Calibrado com a OC real 4505093989 (GPS-COPEL-REFORMA-MODERNIZAÇÃO-4-TUR,
Anexo 5 "Proposta comercial n° MAC_0792.26 – R1").

Cada item do pedido tem uma assinatura de 3 linhas bem específica que não
se repete em mais nenhum lugar do documento (nº do item, código do
material SAP do cliente, quantidade+unidade seguidos do valor unitário e
total) — é o que ancora `_RE_ITEM_BLOCO`. As demais informações do item
(data de entrega, descrição, código antigo do material) são buscadas na
fatia de texto entre esse item e o próximo, porque a ordem/quantidade de
linhas entre eles varia (ex.: página com "Documentos anexos" no meio).

Nota sobre acentos: esse PDF real veio do gerador da ANDRITZ com os
caracteres acentuados corrompidos pelo PyMuPDF (ex.: "Número" virou
"N�mero", "Descrição" virou "Descri��o") — aparenta ser um problema de
CMap/fonte do PDF de origem, não um bug da extração daqui. Por isso as
regras abaixo evitam depender de palavra acentuada como âncora; onde não
dá pra evitar (ex.: "Número"), usam "." como curinga no lugar do acento.
"""

from __future__ import annotations

import re
from datetime import datetime

from app.extraction.bom_parser import (
    extrair_codigo_equipamento,
    extrair_codigos_equipamento_candidatos,
    mac_valor_curto,
)

MARCADOR_ORDEM_COMPRA = "Ordem de Compra"

_RE_NUMERO_OC = re.compile(r"N.mero\s*\n(\d{6,10})\b")

_RE_ITEM_BLOCO = re.compile(
    r"^[ \t]*(?P<item>\d{2,3})\s*\n"
    r"(?P<material>\d{6,12})\s*\n"
    r"(?P<qtd>\d+)\s*(?P<unidade>[A-Z]{1,3})\s*\n"
    r"(?P<valor_unit>[\d.,]+)\s*\n"
    r"/1(?P=unidade)\s*\n"
    r"(?P<valor_total>[\d.,]+)\s*\n",
    re.MULTILINE,
)

_RE_DATA_ENTREGA = re.compile(r"Data de entrega:\s*(\d{2}\.\d{2}\.\d{4})")
_RE_DESCRICAO = re.compile(r"Data de entrega:\s*\d{2}\.\d{2}\.\d{4}\s*\n\.\s*([^\n]+)")
_RE_MATERIAL_ANTIGO = re.compile(r"Id do sistema antigo\s*\n[^\n]*antigo do material\s*\n\S+\s*\n(\S+)")


def parece_ordem_compra_andritz(texto: str) -> bool:
    texto = texto or ""
    return MARCADOR_ORDEM_COMPRA in texto and "andritz" in texto.lower()


def _formatar_data_br_2_digitos(data_ddmmaaaa: str) -> str | None:
    """"24.08.2026" -> "24/08/26" — formato que o usuário já usa na
    planilha de controle de pedidos."""
    try:
        return datetime.strptime(data_ddmmaaaa, "%d.%m.%Y").strftime("%d/%m/%y")
    except ValueError:
        return None


def _valor_br_para_float(valor: str) -> float:
    """"2.866,68" -> 2866.68 — número de verdade, não texto, pra planilha
    poder formatar como moeda (pedido explícito do usuário) e somar."""
    return float(valor.strip().replace(".", "").replace(",", "."))


def extrair_pedido_andritz(texto: str) -> dict:
    """Devolve {} se o texto não parecer uma OC da ANDRITZ (ver
    `parece_ordem_compra_andritz`) — nunca tenta adivinhar formato de
    pedido de outro cliente."""
    if not parece_ordem_compra_andritz(texto):
        return {}

    numero_oc_match = _RE_NUMERO_OC.search(texto)
    numero_oc = numero_oc_match.group(1) if numero_oc_match else None

    campo_mac = extrair_codigo_equipamento(texto)
    candidatos_mac = extrair_codigos_equipamento_candidatos(texto)
    mac_ambigua = campo_mac.confianca == 0.0 and bool(candidatos_mac.valor)
    mac = mac_valor_curto(campo_mac.valor) if campo_mac.valor else None

    matches = list(_RE_ITEM_BLOCO.finditer(texto))
    itens: list[dict] = []

    for i, m in enumerate(matches):
        inicio_bloco = m.end()
        fim_bloco = matches[i + 1].start() if i + 1 < len(matches) else len(texto)
        bloco = texto[inicio_bloco:fim_bloco]

        data_match = _RE_DATA_ENTREGA.search(bloco)
        descricao_match = _RE_DESCRICAO.search(bloco)
        material_antigo_match = _RE_MATERIAL_ANTIGO.search(bloco)

        item_numero = m.group("item").zfill(3)
        itens.append(
            {
                "item": f"{numero_oc}-{item_numero}" if numero_oc else item_numero,
                "valor_total": _valor_br_para_float(m.group("valor_total")),
                "quantidade": int(m.group("qtd")),
                "material": m.group("material"),
                "material_antigo": material_antigo_match.group(1) if material_antigo_match else None,
                "descricao": descricao_match.group(1).strip() if descricao_match else None,
                "mac": mac,
                "data_entrega": _formatar_data_br_2_digitos(data_match.group(1)) if data_match else None,
            }
        )

    return {
        "numero_oc": numero_oc,
        "mac": mac,
        "mac_ambigua": mac_ambigua,
        "mac_candidatos": [mac_valor_curto(v) for v in candidatos_mac.valor],
        "itens": itens,
    }
