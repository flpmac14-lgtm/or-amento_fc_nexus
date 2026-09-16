"""Biblioteca centralizada de materiais — pedido explícito do usuário pra
eliminar o campo "Densidade" digitado à mão em cada calculadora manual: o
orçamentista escolhe o material (norma) e a densidade vem junto, com opção
de editar pra materiais especiais fora da lista.

Dataset: `data/materiais.json` — {material, norma, categoria,
densidade_kg_m3}. Densidade é uma constante física bem estabelecida (não
um preço comercial que varia), por isso é seguro manter cadastrada aqui;
preço/kg continua sendo digitado por item em cada cartão (nunca fixo no
código — ver app/adapter.py sobre `preco_kg_manual`).

Este catálogo é só de DENSIDADE. Preço/kg padrão por norma continua em
`materiais_fixture.py` (usado como fallback quando o cartão não informa
preço manual — cada vez mais raro, já que todo cartão novo tem campo de
preço próprio)."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

_CAMINHO_DATASET_PADRAO = Path(__file__).resolve().parent.parent / "data" / "materiais.json"

DENSIDADE_ACO_CARBONO_PADRAO = 7850.0


@dataclass
class MaterialCatalogo:
    material: str
    norma: str
    categoria: str
    densidade_kg_m3: float


def _carregar(caminho: Path = _CAMINHO_DATASET_PADRAO) -> list[MaterialCatalogo]:
    if not caminho.exists():
        return []
    with caminho.open(encoding="utf-8") as f:
        bruto = json.load(f)
    return [
        MaterialCatalogo(
            material=r["material"], norma=r["norma"], categoria=r["categoria"],
            densidade_kg_m3=float(r["densidade_kg_m3"]),
        )
        for r in bruto
    ]


_MATERIAIS = _carregar()
_INDICE_POR_NORMA = {m.norma.strip().upper(): m for m in _MATERIAIS}


def listar_materiais() -> list[MaterialCatalogo]:
    return list(_MATERIAIS)


def buscar_densidade(norma: str | None) -> float | None:
    if not norma:
        return None
    material = _INDICE_POR_NORMA.get(norma.strip().upper())
    return material.densidade_kg_m3 if material else None
