"""Biblioteca de perfis laminados (I, H, W, U) para o cartão "Perfil
laminado" do cálculo manual — busca por designação/bitola devolve o peso
por metro direto do catálogo, sem o orçamentista precisar digitar.

Dataset: `data/perfis_laminados.json`. A série W tem o peso por metro
definido pela própria norma de designação (ex: "W 310 x 32,7" pesa
exatamente 32,7 kg/m) — correto por construção. As séries I/H/U não
carregam o peso na designação (ex: "I 200 x 100" seria só altura × largura
da aba), então cada bitola aparece como "designação × peso" por extenso
(ex: "I 6\" x 18,60") — pedido explícito do usuário, também resolve o caso
de mais de uma bitola com a mesma altura pesando diferente (ex: "I 6\" x
18,60" e "I 6\" x 22,00" coexistem no catálogo).

Todo peso_kg_m aqui é peso-BASE em aço carbono (densidade 7850 kg/m³) —
pra outro material, quem aplica o fator de densidade é o frontend
(CartaoPerfilLaminado.tsx), não este módulo (ver DENSIDADE_ACO_CARBONO_REFERENCIA
lá). Isso evita duplicar uma tabela de perfis por material: a mesma linha
de catálogo serve pra aço carbono, inox ou alumínio, só o fator muda.

Base inicial de I/H/U cadastrada em 2026-09 (pedido explícito do usuário,
valores de catálogo de fabricante). Pra adicionar/corrigir bitola, edite
`data/perfis_laminados.json` (mesmo formato) — nenhuma mudança de lógica
é necessária aqui nem no cálculo.
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
