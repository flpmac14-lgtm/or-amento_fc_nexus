"""Camada 3b do pipeline: extração da lista de materiais (BOM) como tabela.

Usa pdfplumber para achar tabelas por linhas de grade (`extract_tables`) e
mapeia os cabeçalhos — em português ou inglês, já que desenhos de clientes
internacionais (Weir, Andritz...) costumam vir em inglês — para os campos
canônicos do `ItemBom`.

Limite conhecido, confirmado com o desenho real A752193: quando o PDF tem o
texto desenhado como curvas (ver `text_extract.py`), `pdfplumber` acha a
grade da tabela pelas linhas vetoriais, mas todas as células voltam vazias —
não tem texto ali para ler. Nesse caso esta camada não tem como funcionar
sem OCR primeiro (a extração de tabela a partir de uma imagem OCR'ada é um
problema mais difícil — detecção de layout — e fica para uma iteração
futura). Por isso: quando a tabela não tem um cabeçalho reconhecível, ela é
descartada em vez de gerar itens adivinhados.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

import pdfplumber

from app.extraction.bom_parser import _RE_NORMA_AISI, _RE_NORMA_ASTM

# Palavras-chave por campo canônico — PT e EN, cobrindo variações comuns de
# desenhos de fabricação (BOM / parts list / lista de materiais).
COLUNAS_CANDIDATAS: dict[str, list[str]] = {
    "item_numero": ["ITEM", "POS", "MARK", "PC", "PEÇA", "PART NO"],
    "quantidade": ["QTD", "QTY", "QUANT"],
    "descricao": ["DESCRI", "DISCRIMINA"],
    "material": ["MATERIAL", "MAT."],
    "norma": ["ASTM", "AISI", "SPEC", "GRADE", "NORMA"],
    "perfil": ["PERFIL", "PROFILE", "SHAPE"],
    "espessura_mm": ["ESP", "THK", "THICKNESS", "ESPESSURA"],
    "comprimento_mm": ["COMPR", "LENGTH", "LG", "COMP"],
    "largura_mm": ["LARGURA", "WIDTH"],
    "diametro_mm": ["DIAM", "DIA", " OD", "Ø"],
    "usinado": ["MACHINED", "USINADO", "MACH"],
}

_RE_NUMERO = re.compile(r"-?\d+(?:[.,]\d+)?")

# Uma célula de cabeçalho de verdade é um rótulo curto ("DESCRIÇÃO",
# "PR. MATERIAL"). Achado real testando um desenho da Andritz com 11 folhas:
# quando a grade da tabela se mistura com o desenho técnico (ver módulo
# bom_table.py, "Limite conhecido"), pdfplumber às vezes devolve uma célula
# gigante com o texto da folha inteira misturado — e essa célula, por pura
# coincidência de substring, contém palavras como "DESCRIÇÃO" em algum
# lugar no meio do texto solto. Sem esse limite de tamanho, isso era
# reconhecido como cabeçalho válido e gerava centenas de itens de lixo (só
# em vez de descartar a tabela, como deveria).
_TAMANHO_MAXIMO_CELULA_CABECALHO = 40

# Padrões pra achar a geometria dentro do texto da própria DESCRIÇÃO —
# necessário porque, em desenhos reais (ex: torre de acesso Andritz,
# projeto MAC_0785.26), a BOM não tem colunas separadas de espessura/
# largura/diâmetro: a forma vem embutida na descrição, e só o comprimento
# fica numa coluna própria (COMPR.). Calibrado com dados reais dessa BOM:
# "CHAPA 6 x 80", "CHAPA DE PISO 4,8 x 673", "BARRA REDONDA Ø25",
# "BARRA Ø25", "CANTONEIRA 76,2 x 4,8", "CHAPA (150 x 150 x 3mm)".
_RE_DESCR_CHAPA_PARENTESE = re.compile(
    r"CHAPA\s*\(\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*mm\s*\)", re.IGNORECASE
)
_RE_DESCR_CHAPA = re.compile(
    r"CHAPA(?:\s+DE\s+PISO)?\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)(?!\s*x)", re.IGNORECASE
)
_RE_DESCR_BARRA = re.compile(r"BARRA(?:\s+REDONDA)?\s*[ØÓO]\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE)
_RE_DESCR_CANTONEIRA = re.compile(r"CANTONEIRA\s+(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)", re.IGNORECASE)


def _extrair_geometria_da_descricao(descricao: str | None) -> dict | None:
    """Tenta reconhecer a forma a partir do texto livre da descrição.
    Confiança mais baixa que uma coluna dedicada — é heurística sobre texto,
    não um campo estruturado."""
    if not descricao:
        return None

    m = _RE_DESCR_CHAPA_PARENTESE.search(descricao)
    if m:
        c, l, e = (float(v.replace(",", ".")) for v in m.groups())
        return {"tipo_geometria": "chapa_retangular", "comprimento_mm": c, "largura_mm": l, "espessura_mm": e, "confianca": 0.7}

    m = _RE_DESCR_CHAPA.search(descricao)
    if m:
        espessura, largura = (float(v.replace(",", ".")) for v in m.groups())
        return {"tipo_geometria": "chapa_retangular", "espessura_mm": espessura, "largura_mm": largura, "confianca": 0.65}

    m = _RE_DESCR_BARRA.search(descricao)
    if m:
        diametro = float(m.group(1).replace(",", "."))
        return {"tipo_geometria": "barra_redonda", "diametro_mm": diametro, "confianca": 0.65}

    m = _RE_DESCR_CANTONEIRA.search(descricao)
    if m:
        # Cantoneira (perfil L) ainda não tem fórmula de peso no motor
        # geométrico — sinaliza o tipo em vez de forçar num tipo suportado,
        # pra virar um item de revisão específico lá no adaptador.
        return {"tipo_geometria": "cantoneira", "confianca": 0.6}

    return None


@dataclass
class TabelaBom:
    linhas: list[dict]  # cada linha já como ItemBom-dict (valor/confianca/origem por campo)


def _normaliza(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii")
    return texto.upper().strip()


def _mapear_cabecalho(cabecalho: list[str | None]) -> dict[int, str]:
    """Devolve {indice_coluna: campo_canonico} para as colunas reconhecidas."""
    mapa: dict[int, str] = {}
    usados: set[str] = set()
    for i, celula in enumerate(cabecalho):
        celula_norm = _normaliza(celula or "")
        if not celula_norm or len(celula_norm) > _TAMANHO_MAXIMO_CELULA_CABECALHO:
            continue
        for campo, palavras in COLUNAS_CANDIDATAS.items():
            if campo in usados:
                continue
            if any(p in celula_norm for p in palavras):
                mapa[i] = campo
                usados.add(campo)
                break
    return mapa


def _parece_cabecalho(linha: list[str | None]) -> bool:
    mapa = _mapear_cabecalho(linha)
    # Exige pelo menos "descrição" ou "item" + mais um campo, pra não
    # confundir uma linha de dados qualquer com o cabeçalho.
    return len(mapa) >= 2 and ("descricao" in mapa.values() or "item_numero" in mapa.values())


def _parse_numero(texto: str | None) -> float | None:
    if not texto:
        return None
    m = _RE_NUMERO.search(texto.replace(".", "").replace(",", "."))
    if not m:
        return None
    try:
        return float(m.group())
    except ValueError:
        return None


def _campo(valor, confianca: float, origem: str = "regra_local") -> dict:
    return {"valor": valor, "confianca": confianca, "origem": origem}


def _inferir_tipo_geometria(perfil: str | None, comprimento, largura, espessura, diametro) -> tuple[str | None, float]:
    if perfil:
        return "perfil", 0.75
    if diametro and comprimento and not espessura:
        return "barra_redonda", 0.6
    if diametro and espessura and not comprimento:
        return "chapa_circular", 0.6
    if comprimento and largura and espessura:
        return "chapa_retangular", 0.7
    return None, 0.0


def _linha_para_item_bom(celulas: list[str | None], mapa: dict[int, str]) -> dict:
    valores: dict[str, str | None] = {}
    for indice, campo_canonico in mapa.items():
        if indice < len(celulas):
            valores[campo_canonico] = (celulas[indice] or "").strip() or None

    texto_material = " ".join(filter(None, [valores.get("material"), valores.get("norma")]))
    norma_achada = _RE_NORMA_ASTM.search(texto_material) or _RE_NORMA_AISI.search(texto_material)

    espessura = _parse_numero(valores.get("espessura_mm"))
    comprimento = _parse_numero(valores.get("comprimento_mm"))
    largura = _parse_numero(valores.get("largura_mm"))
    diametro = _parse_numero(valores.get("diametro_mm"))
    quantidade = _parse_numero(valores.get("quantidade"))
    perfil = valores.get("perfil")

    tipo_geometria, confianca_tipo = _inferir_tipo_geometria(perfil, comprimento, largura, espessura, diametro)

    if tipo_geometria is None:
        geometria_descricao = _extrair_geometria_da_descricao(valores.get("descricao"))
        if geometria_descricao:
            tipo_geometria = geometria_descricao["tipo_geometria"]
            confianca_tipo = geometria_descricao["confianca"]
            espessura = espessura if espessura is not None else geometria_descricao.get("espessura_mm")
            largura = largura if largura is not None else geometria_descricao.get("largura_mm")
            diametro = diametro if diametro is not None else geometria_descricao.get("diametro_mm")
            # comprimento embutido só existe no formato "CHAPA (C x L x E mm)";
            # nos outros formatos o comprimento já vem da coluna COMPR.
            comprimento = comprimento if comprimento is not None else geometria_descricao.get("comprimento_mm")

    usinado_texto = _normaliza(valores.get("usinado") or valores.get("descricao") or "")
    usinado = "MACHINED" in usinado_texto or "USINADO" in usinado_texto

    conf_campo = 0.8  # veio de uma coluna com cabeçalho reconhecido

    return {
        "item_numero": _campo(valores.get("item_numero"), conf_campo if valores.get("item_numero") else 0.0),
        "descricao": _campo(valores.get("descricao"), conf_campo if valores.get("descricao") else 0.0),
        "tipo_geometria": _campo(tipo_geometria, confianca_tipo),
        "perfil": _campo(perfil, conf_campo if perfil else 0.0),
        "espessura_mm": _campo(espessura, conf_campo if espessura is not None else 0.0),
        "comprimento_mm": _campo(comprimento, conf_campo if comprimento is not None else 0.0),
        "largura_mm": _campo(largura, conf_campo if largura is not None else 0.0),
        "diametro_mm": _campo(diametro, conf_campo if diametro is not None else 0.0),
        "material": _campo(valores.get("material"), conf_campo if valores.get("material") else 0.0),
        "norma": _campo(norma_achada.group(0).upper() if norma_achada else valores.get("norma"), 0.85 if norma_achada else (conf_campo if valores.get("norma") else 0.0)),
        "usinado": _campo(usinado, 0.85 if usinado else 0.5),
        "quantidade": _campo(quantidade, conf_campo if quantidade is not None else 0.0),
    }


def extrair_bom_de_tabelas(pdf_path: str) -> list[dict]:
    """Devolve uma lista de ItemBom-dicts extraídos das tabelas do PDF.

    Tabelas sem cabeçalho reconhecível são ignoradas (ver limite descrito no
    topo do arquivo) em vez de gerar itens adivinhados sem base nenhuma.
    """
    itens: list[dict] = []
    with pdfplumber.open(pdf_path) as pdf:
        for pagina in pdf.pages:
            for tabela in pagina.extract_tables():
                if not tabela:
                    continue
                cabecalho, *linhas = tabela
                if not _parece_cabecalho(cabecalho):
                    continue
                mapa = _mapear_cabecalho(cabecalho)
                for linha in linhas:
                    if not any(c and c.strip() for c in linha):
                        continue
                    itens.append(_linha_para_item_bom(linha, mapa))
    return itens
