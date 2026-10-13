"""Importa a aba "Geral Data book" de "Controle de databook.xlsm" pro app (uma vez).

Pedido explícito do usuário (13/10/2026): trazer a planilha com os dados
(ST.BOOK, observação, D.FINALIZAÇÃO, AUTOR(A)); depois disso quem preenche
é o app, e a mãe (Controle de obras) atualiza as fixas e traz os pedidos
ativos novos a cada 15 min (ver app/databook.py).

Uso: python scripts/importar_databook.py [caminho.xlsm] [--forcar]
(--forcar apaga o que já está no app e importa de novo — perde o que foi preenchido no app.)
"""

import sys
import warnings
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")
warnings.filterwarnings("ignore", module="openpyxl")

from app.databook import importar, propagar  # noqa: E402

CAMINHO = r"J:\6 - PCP\Controle de databook.xlsm"

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    caminho = Path(args[0] if args else CAMINHO)
    r = importar(caminho.read_bytes(), forcar="--forcar" in sys.argv)
    print(f"{r['importados']} linhas importadas de {caminho}")
    p = propagar(forcar=True)
    print(f"Mãe (Controle de obras): {p}")
