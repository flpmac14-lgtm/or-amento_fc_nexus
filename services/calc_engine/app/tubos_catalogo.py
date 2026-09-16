"""Catálogo de tubos redondos pro modo "Catálogo" do cartão — mesma
filosofia do perfil laminado e da cantoneira.

Dataset: `data/tubos_redondos.json`. Ao contrário do perfil/cantoneira, o
peso por metro de um tubo redondo é geometria pura e exata — π/4 ×
(De² − Di²) × densidade — sem correção de raio/tolerância relevante, então
estes valores são calculados diretamente pela mesma fórmula do motor
(`geometria.peso_tubo_redondo`), assumindo aço carbono (7.850 kg/m³), e
servem como referência confiável de catálogo (marcado `fonte: "calculado"`
mesmo assim, por transparência — não é uma tabela copiada de fabricante).

Se o tubo for de outro material (inox, alumínio), o kg/m do catálogo NÃO
vale — nesse caso use o modo manual do cartão, que calcula a partir da
densidade do material selecionado."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

_CAMINHO_DATASET_PADRAO = Path(__file__).resolve().parent.parent / "data" / "tubos_redondos.json"


@dataclass
class TuboCatalogo:
    designacao: str
    diametro_externo_mm: float
    espessura_mm: float
    diametro_interno_mm: float
    kg_m: float
    fonte: str


def _normalizar(texto: str) -> str:
    texto = texto.strip().upper().replace(",", ".")
    return re.sub(r"\s+", "", texto)


def _carregar(caminho: Path = _CAMINHO_DATASET_PADRAO) -> list[TuboCatalogo]:
    if not caminho.exists():
        return []
    with caminho.open(encoding="utf-8") as f:
        bruto = json.load(f)
    return [
        TuboCatalogo(
            designacao=r["designacao"], diametro_externo_mm=float(r["diametro_externo_mm"]),
            espessura_mm=float(r["espessura_mm"]), diametro_interno_mm=float(r["diametro_interno_mm"]),
            kg_m=float(r["kg_m"]), fonte=r.get("fonte", "calculado"),
        )
        for r in bruto
    ]


_TUBOS = _carregar()
_INDICE_POR_DESIGNACAO = {_normalizar(t.designacao): t for t in _TUBOS}


def buscar_tubos(termo: str | None = None, limite: int = 50) -> list[TuboCatalogo]:
    resultado = _TUBOS
    if termo:
        chave = _normalizar(termo)
        resultado = [t for t in resultado if chave in _normalizar(t.designacao)]
    return resultado[:limite]


def buscar_por_designacao(designacao: str | None) -> TuboCatalogo | None:
    if not designacao:
        return None
    return _INDICE_POR_DESIGNACAO.get(_normalizar(designacao))
