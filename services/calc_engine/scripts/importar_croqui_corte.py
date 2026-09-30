"""Importa a aba "Croqui 2" de "Croqui de corte rev 01.1.xlsb" pro app (uma vez).

Pedido explícito do usuário: subir os dados já registrados (status,
projetista, nº do programa, observação, datas). Depois disso quem edita é o
app, e a mãe (Material de compra) atualiza as fixas e traz os pedidos novos
a cada 15 min (ver app/croqui_corte.py).

Uso: python scripts/importar_croqui_corte.py [caminho.xlsb] [--forcar]
(--forcar apaga o que já está no app e importa de novo — perde edições feitas no app.)
"""

import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")

from app.croqui_corte import importar, propagar  # noqa: E402

CAMINHO = r"J:\3 - Projetos\GR_PROJETO\Corte\Croqui de corte rev 01.1.xlsb"

if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    caminho = Path(args[0] if args else CAMINHO)
    r = importar(caminho.read_bytes(), forcar="--forcar" in sys.argv)
    print(f"{r['importados']} linhas importadas de {caminho}")
    p = propagar()
    print(f"Mãe (Material de compra): {p}")
