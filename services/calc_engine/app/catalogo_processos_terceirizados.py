"""Catálogo pequeno e estático dos processos terceirizados listados na
planilha de referência Macfab (usinagem, serviços de outsourcing,
tratamento térmico) que ainda não tinham cartão no cálculo manual — pedido
explícito do usuário a partir de um print da planilha real.

Dataset: `data/catalogo_processos_terceirizados.json`. Cada entrada traz a
taxa de referência conhecida (R$/h ou R$/kg) quando a planilha original
tinha uma cadastrada; `null` quando não tinha (a planilha real também tem
linhas de serviço sem tarifa cravada, ex. "Rebordeamento de tampos") — o
cartão mostra sem sugestão e pede o valor manual, mesmo padrão de
`materiais_catalogo.py`. Assim como densidade, essas taxas de referência
não são o preço final: continuam editáveis por orçamento."""

from __future__ import annotations

import json
from pathlib import Path

_CAMINHO_DATASET_PADRAO = Path(__file__).resolve().parent.parent / "data" / "catalogo_processos_terceirizados.json"

_VAZIO: dict = {
    "usinagem": [], "servicos_terceiros": [], "tratamento_termico": [], "ensaios_nao_destrutivos": [],
}


def carregar(caminho: Path = _CAMINHO_DATASET_PADRAO) -> dict:
    if not caminho.exists():
        return dict(_VAZIO)
    with caminho.open(encoding="utf-8") as f:
        bruto = json.load(f)
    return {**_VAZIO, **bruto}
