"""Catálogo de cantoneiras L (abas iguais) pro modo "Catálogo" do cartão —
mesma filosofia do perfil laminado (app/perfis_catalogo.py): buscar a
bitola e trazer o kg/m pronto, priorizando isso sobre a fórmula teórica
(que ignora raio de concordância/tolerância de laminação).

Dataset: `data/cantoneiras.json`. Diferente do perfil W (onde o peso está
embutido na própria designação por definição da norma), a designação de
uma cantoneira comercial não carrega o peso — então este catálogo é
CALCULADO pela fórmula teórica do próprio motor
(`geometria.peso_cantoneira_abas_iguais`: t×(2×aba−t)×densidade), assumindo
aço carbono (7.850 kg/m³), e marcado `fonte: "calculado"` em vez de
"catálogo do fabricante". Serve como ponto de partida útil, mas pra um
orçamento crítico vale conferir contra a tabela real do fornecedor —
cantoneiras comerciais têm raio de concordância que a fórmula teórica
ignora (diferença tipicamente pequena, < 3%).

Pra usar o kg/m real do fabricante, edite `data/cantoneiras.json` (mesmo
formato) com os valores da tabela do fornecedor."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

_CAMINHO_DATASET_PADRAO = Path(__file__).resolve().parent.parent / "data" / "cantoneiras.json"


@dataclass
class Cantoneira:
    designacao: str
    aba_mm: float
    espessura_mm: float
    kg_m: float
    fonte: str


def _normalizar(texto: str) -> str:
    texto = texto.strip().upper().replace(",", ".")
    return re.sub(r"\s+", "", texto)


def _carregar(caminho: Path = _CAMINHO_DATASET_PADRAO) -> list[Cantoneira]:
    if not caminho.exists():
        return []
    with caminho.open(encoding="utf-8") as f:
        bruto = json.load(f)
    return [
        Cantoneira(
            designacao=r["designacao"], aba_mm=float(r["aba_mm"]), espessura_mm=float(r["espessura_mm"]),
            kg_m=float(r["kg_m"]), fonte=r.get("fonte", "calculado"),
        )
        for r in bruto
    ]


_CANTONEIRAS = _carregar()
_INDICE_POR_DESIGNACAO = {_normalizar(c.designacao): c for c in _CANTONEIRAS}


def buscar_cantoneiras(termo: str | None = None, limite: int = 50) -> list[Cantoneira]:
    resultado = _CANTONEIRAS
    if termo:
        chave = _normalizar(termo)
        resultado = [c for c in resultado if chave in _normalizar(c.designacao)]
    return resultado[:limite]


def buscar_kg_m(designacao: str | None) -> float | None:
    if not designacao:
        return None
    c = _INDICE_POR_DESIGNACAO.get(_normalizar(designacao))
    return c.kg_m if c else None
