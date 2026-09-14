"""Adaptador: transforma o JSON que `services/extractor` devolve (identificação,
características gerais, BOM — cada campo como {valor, confianca, origem}) na
entrada que `app.orcamento.montar_orcamento` espera.

Propositalmente NÃO importa os modelos Pydantic do extractor — os dois
serviços são independentes (cada um roda no seu próprio ambiente/deploy) e
conversam por JSON simples, do jeito que viajaria numa chamada HTTP real
entre eles. Esse é o contrato: um dict no formato de `ResultadoExtracao.
model_dump()`.

O que este adaptador NÃO resolve sozinho (fica para uma camada futura, fora
do motor determinístico): horas de usinagem/caldeiraria quando não vêm de
uma regra simples, área de pintura quando não está no desenho, quantidade de
posições de engenharia. Esses campos entram como `estimativas` — hoje
fornecidos manualmente pelo orçamentista, amanhã por histórico/IA.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app import geometria
from app.repositorio_materiais import buscar_info_material, buscar_peso_kg_m_perfil

LIMIAR_CONFIANCA_ITEM = 0.6


@dataclass
class ItemParaRevisao:
    item_numero: str | None
    motivo: str
    confianca: float


@dataclass
class ResultadoAdaptacao:
    entrada: dict
    itens_para_revisao: list[ItemParaRevisao] = field(default_factory=list)


def _valor(campo: dict | None, default=None):
    if not campo:
        return default
    return campo.get("valor", default)


def _confianca(campo: dict | None) -> float:
    if not campo:
        return 0.0
    return campo.get("confianca") or 0.0


def _calcular_peso_item(item: dict) -> tuple[float | None, str | None, float, str | None]:
    """Devolve (peso_kg, memoria, confianca_geometria, motivo_falha).

    motivo_falha vem preenchido (e peso_kg None) quando não foi possível
    calcular o peso — distinguindo "faltam cotas no desenho" de "material
    não cadastrado", que pedem ações de revisão diferentes do orçamentista.
    """
    tipo = _valor(item.get("tipo_geometria"))
    norma = _valor(item.get("norma"))
    espessura = _valor(item.get("espessura_mm"))
    comprimento = _valor(item.get("comprimento_mm"))
    largura = _valor(item.get("largura_mm"))
    diametro = _valor(item.get("diametro_mm"))
    quantidade = _valor(item.get("quantidade")) or 1
    perfil_designacao = _valor(item.get("perfil"))

    confiancas = [
        _confianca(item.get("tipo_geometria")),
        _confianca(item.get("material")) or _confianca(item.get("norma")),
        _confianca(item.get("quantidade")),
    ]

    if tipo is None:
        return None, None, 0.0, "Tipo de geometria não identificado no desenho"

    if tipo == "perfil":
        peso_kg_m = buscar_peso_kg_m_perfil(perfil_designacao)
        if not peso_kg_m:
            return None, None, 0.0, f"Perfil '{perfil_designacao}' não cadastrado (sem kg/m)"
        if not comprimento:
            return None, None, 0.0, "Comprimento do perfil não identificado no desenho"
        r = geometria.peso_perfil(peso_kg_m, comprimento, quantidade)
        confiancas.append(_confianca(item.get("perfil")))
        confiancas.append(_confianca(item.get("comprimento_mm")))
        return r.peso_kg, r.memoria, _media(confiancas), None

    if tipo not in ("chapa_retangular", "chapa_circular", "barra_redonda"):
        return None, None, 0.0, f"Tipo de geometria '{tipo}' ainda não suportado pelo motor de cálculo"

    info_material = buscar_info_material(norma, tipo)
    if not info_material:
        return None, None, 0.0, f"Material '{norma}' não cadastrado (sem densidade/preço)"

    if tipo == "chapa_retangular":
        if not (comprimento and largura and espessura):
            return None, None, 0.0, "Cotas da chapa retangular incompletas no desenho"
        r = geometria.peso_chapa_retangular(comprimento, largura, espessura, info_material.densidade_kg_m3)
        peso_total = r.peso_kg * quantidade
        confiancas += [_confianca(item.get("comprimento_mm")), _confianca(item.get("largura_mm")), _confianca(item.get("espessura_mm"))]
        return peso_total, f"{r.memoria} × qtd {quantidade} = {peso_total:.2f} kg", _media(confiancas), None

    if tipo == "chapa_circular":
        if not (diametro and espessura):
            return None, None, 0.0, "Cotas da chapa circular incompletas no desenho"
        r = geometria.peso_chapa_circular(diametro, espessura, info_material.densidade_kg_m3)
        peso_total = r.peso_kg * quantidade
        confiancas += [_confianca(item.get("diametro_mm")), _confianca(item.get("espessura_mm"))]
        return peso_total, f"{r.memoria} × qtd {quantidade} = {peso_total:.2f} kg", _media(confiancas), None

    # barra_redonda
    if not (diametro and comprimento):
        return None, None, 0.0, "Cotas da barra redonda incompletas no desenho"
    r = geometria.peso_barra_redonda(diametro, comprimento, info_material.fator_barra_redonda_kg_m)
    peso_total = r.peso_kg * quantidade
    confiancas += [_confianca(item.get("diametro_mm")), _confianca(item.get("comprimento_mm"))]
    return peso_total, f"{r.memoria} × qtd {quantidade} = {peso_total:.2f} kg", _media(confiancas), None


def _media(valores: list[float]) -> float:
    valores = [v for v in valores if v]
    return sum(valores) / len(valores) if valores else 0.0


def montar_entrada_orcamento(resultado_extracao: dict, estimativas: dict) -> ResultadoAdaptacao:
    """
    resultado_extracao: dict no formato ResultadoExtracao.model_dump() do extractor.
    estimativas: campos que o motor de cálculo precisa mas o desenho não dá
      diretamente — hoje manuais, amanhã vindos de histórico/IA:
        - usinagem_operacoes: [{"maquina": ..., "horas": ..., "valor_hora": ...}]
        - area_pintura_m2
        - quantidade_posicoes_engenharia
        - cenario_comercial
        - preco_kg_override: {(norma, tipo_geometria): preco} opcional, para não
          depender só do preço padrão da fixture
        - usar_historico_horas: bool (default False) — quando True, horas de
          caldeiraria combinam a regra simples com o histórico Macfab (ver
          app.estimativa_horas) em vez de usar só a regra
        - historico_horas: dataset alternativo pro histórico (default: o
          dataset real em data/historico_referencia.json)
    """
    itens_para_revisao: list[ItemParaRevisao] = []
    materia_prima: list[dict] = []
    peso_total_kg = 0.0

    for item in resultado_extracao.get("bom", []):
        peso_kg, memoria, confianca_geometria, motivo_falha = _calcular_peso_item(item)
        item_numero = _valor(item.get("item_numero"))
        descricao = _valor(item.get("descricao")) or _valor(item.get("perfil")) or "Item sem descrição"

        if peso_kg is None:
            itens_para_revisao.append(ItemParaRevisao(item_numero, motivo_falha, 0.0))
            continue

        norma = _valor(item.get("norma"))
        tipo = _valor(item.get("tipo_geometria"))
        preco_overrides = estimativas.get("preco_kg_override", {})
        info_material = buscar_info_material(norma, tipo)
        preco_kg = preco_overrides.get((norma, tipo)) or (
            info_material.preco_kg_padrao if info_material else None
        )

        if preco_kg is None:
            itens_para_revisao.append(
                ItemParaRevisao(item_numero, f"Sem preço/kg cadastrado para {norma} ({tipo})", confianca_geometria)
            )
            continue

        materia_prima.append(
            {"descricao": descricao, "peso_kg": peso_kg, "preco_kg": preco_kg, "memoria_peso": memoria}
        )
        peso_total_kg += peso_kg

        if confianca_geometria < LIMIAR_CONFIANCA_ITEM:
            itens_para_revisao.append(
                ItemParaRevisao(item_numero, "Confiança baixa na geometria/material extraídos", confianca_geometria)
            )

    peso_informado = _valor(resultado_extracao.get("caracteristicas", {}).get("peso_informado_kg"))
    peso_liquido_kg = estimativas.get("peso_liquido_kg") or peso_informado or peso_total_kg

    entrada = {
        "peso_liquido_kg": peso_liquido_kg,
        "materia_prima": materia_prima,
        "itens_padrao": estimativas.get("itens_padrao", []),
        "usinagem_operacoes": estimativas.get("usinagem_operacoes", []),
        "area_pintura_m2": estimativas.get("area_pintura_m2"),
        "quantidade_posicoes_engenharia": estimativas.get("quantidade_posicoes_engenharia"),
        "cenario_comercial": estimativas.get("cenario_comercial", "venda_fabricacao"),
        "usar_historico_horas": estimativas.get("usar_historico_horas", False),
        "historico_horas": estimativas.get("historico_horas"),
    }

    return ResultadoAdaptacao(entrada=entrada, itens_para_revisao=itens_para_revisao)
