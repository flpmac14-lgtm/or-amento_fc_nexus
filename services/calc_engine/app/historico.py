"""Camada 2 da estimativa de horas: histórico Macfab.

O desenho não informa horas de caldeiraria — ninguém desenha isso. A regra
simples (peso × fator h/kg, ver app/processos.py) é um ponto de partida
genérico; este módulo melhora a estimativa procurando orçamentos passados
com peso parecido e sugerindo a mediana de horas/tonelada observada neles,
do jeito descrito na especificação:

    Peso: 3–4 t
    Média histórica: 158 h / Mediana: 164 h
    Este orçamento: 166 h sugeridas

Trabalha com horas por TONELADA (não horas absolutas) porque isso normaliza
peças de peso diferente mas processo parecido — é a mesma métrica que a
própria planilha Macfab já calcula (aba "RESUMO DO ORÇAMENTO", célula R32).

Dataset: `data/historico_referencia.json`, extraído dos totais consolidados
de 35 orçamentos reais da pasta "Parametros de orçamento macfab" (peso,
horas previstas, custo industrial, preço de venda — sem BOM/itens
detalhados). Em produção isso vem da tabela `historico_realizado` do
Supabase, alimentada a cada fabricação encerrada (orçado × realizado).
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path

_CAMINHO_DATASET_PADRAO = Path(__file__).resolve().parent.parent / "data" / "historico_referencia.json"

FAIXAS_TONELADAS = (0.5, 1.0, 2.0, 5.0)  # expande a busca até achar amostra suficiente
AMOSTRA_MINIMA = 3


def carregar_historico(caminho: str | Path | None = None) -> list[dict]:
    caminho = Path(caminho) if caminho else _CAMINHO_DATASET_PADRAO
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def _similares_por_peso(peso_ton: float, historico: list[dict], faixa_toneladas: float) -> list[dict]:
    return [
        r for r in historico
        if r.get("horas_por_tonelada") is not None
        and abs(r["peso_liquido_kg"] / 1000 - peso_ton) <= faixa_toneladas
    ]


def sugerir_horas_caldeiraria(peso_liquido_kg: float, historico: list[dict] | None = None) -> dict:
    """Devolve média/mediana de horas-por-tonelada de orçamentos com peso
    parecido, a sugestão de horas para o peso informado, e o nível de
    confiança (maior quanto mais amostras próximas e mais estreita a faixa
    de peso usada)."""
    historico = historico if historico is not None else carregar_historico()
    peso_ton = peso_liquido_kg / 1000

    faixa_usada = None
    similares = []
    for faixa in FAIXAS_TONELADAS:
        similares = _similares_por_peso(peso_ton, historico, faixa)
        if len(similares) >= AMOSTRA_MINIMA:
            faixa_usada = faixa
            break

    if not similares:
        return {
            "n_amostras": 0,
            "faixa_toneladas_usada": None,
            "media_horas_por_tonelada": None,
            "mediana_horas_por_tonelada": None,
            "horas_sugeridas": None,
            "confianca": 0.0,
            "amostra": [],
        }

    if faixa_usada is None:
        # nem a maior faixa teve amostra mínima — usa o que achou, confiança baixa
        faixa_usada = FAIXAS_TONELADAS[-1]

    valores = [r["horas_por_tonelada"] for r in similares]
    media = statistics.mean(valores)
    mediana = statistics.median(valores)
    horas_sugeridas = mediana * peso_ton

    confianca_amostra = min(1.0, len(similares) / 8)
    confianca_faixa = 1.0 - (FAIXAS_TONELADAS.index(faixa_usada) / len(FAIXAS_TONELADAS))
    confianca = round(confianca_amostra * 0.6 + confianca_faixa * 0.4, 2)

    return {
        "n_amostras": len(similares),
        "faixa_toneladas_usada": faixa_usada,
        "media_horas_por_tonelada": round(media, 2),
        "mediana_horas_por_tonelada": round(mediana, 2),
        "horas_sugeridas": round(horas_sugeridas, 2),
        "confianca": confianca,
        "amostra": [
            {"projeto": r.get("projeto"), "cliente": r.get("cliente"),
             "peso_liquido_kg": r["peso_liquido_kg"], "horas_por_tonelada": r["horas_por_tonelada"]}
            for r in similares
        ],
    }
