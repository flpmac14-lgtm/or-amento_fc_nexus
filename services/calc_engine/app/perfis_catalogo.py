"""Biblioteca de perfis laminados (I, H, W, U) para o cartão "Perfil
laminado" do cálculo manual — busca por designação/bitola devolve o peso
por metro direto do catálogo, sem o orçamentista precisar digitar.

Dataset: `data/perfis_laminados.json`. Hoje só a série W está povoada — o
peso por metro de um perfil W é, por definição da própria norma de
designação (ex: "W 310 x 32,7" pesa exatamente 32,7 kg/m), então esses
valores são corretos por construção, não por consulta a uma tabela externa.

As séries I, H e U ainda não têm catálogo aqui de propósito: ao contrário
do W, a designação delas não carrega o peso (ex: "I 200 x 100" é só
altura × largura da aba), então listar valores aqui exigiria copiar de uma
tabela de fabricante — o mesmo princípio já aplicado a preço em
`repositorio_materiais.py` ("não inventar preço") vale aqui: é melhor não
ter o dado do que ter um errado usado num orçamento real. Pra usar I/H/U
hoje, o cartão do frontend cai no modo de edição manual do kg/m (já
previsto na interface). Pra povoar de verdade, adicione linhas em
`data/perfis_laminados.json` (mesmo formato) com os valores do catálogo
real do fornecedor.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

_CAMINHO_DATASET_PADRAO = Path(__file__).resolve().parent.parent / "data" / "perfis_laminados.json"

# Tipos selecionáveis no cartão — aparecem nesta ordem mesmo sem nenhum
# perfil cadastrado ainda (ver docstring do módulo sobre I/H/U).
TIPOS_PERFIL: dict[str, str] = {
    "W": "W (perfil laminado de abas paralelas)",
    "I": "I (perfil laminado padrão)",
    "H": "H (perfil laminado, abas largas)",
    "U": "U (perfil laminado, abas paralelas)",
}


@dataclass
class Perfil:
    tipo: str
    designacao: str
    peso_kg_m: float


def _normalizar(texto: str) -> str:
    """Chave de comparação tolerante a maiúsculas/espaços/vírgula-vs-ponto,
    pra "w310x32.7", "W310X32,7" e "W 310 x 32,7" baterem com o mesmo
    registro do catálogo."""
    texto = texto.strip().upper().replace(",", ".")
    return re.sub(r"\s+", "", texto)


def _carregar(caminho: Path = _CAMINHO_DATASET_PADRAO) -> list[Perfil]:
    if not caminho.exists():
        return []
    with caminho.open(encoding="utf-8") as f:
        bruto = json.load(f)
    return [Perfil(tipo=r["tipo"], designacao=r["designacao"], peso_kg_m=float(r["peso_kg_m"])) for r in bruto]


_PERFIS = _carregar()
_INDICE_POR_DESIGNACAO = {_normalizar(p.designacao): p for p in _PERFIS}


def listar_tipos() -> dict[str, str]:
    return dict(TIPOS_PERFIL)


def buscar_perfis(tipo: str | None = None, termo: str | None = None, limite: int = 50) -> list[Perfil]:
    """Lista perfis do catálogo pro campo pesquisável do frontend — filtra
    por tipo (I/H/W/U) e por um termo livre (substring na designação,
    tolerante a formatação: "310x32" acha "W 310 x 32,7")."""
    resultado = _PERFIS
    if tipo:
        resultado = [p for p in resultado if p.tipo == tipo]
    if termo:
        chave = _normalizar(termo)
        resultado = [p for p in resultado if chave in _normalizar(p.designacao)]
    return resultado[:limite]


def buscar_peso_kg_m(designacao: str | None) -> float | None:
    if not designacao:
        return None
    perfil = _INDICE_POR_DESIGNACAO.get(_normalizar(designacao))
    return perfil.peso_kg_m if perfil else None
