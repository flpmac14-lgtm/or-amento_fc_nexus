"""Sincroniza a aba MACLM de "MACLM.xlsx" (Material de compra) com o banco do app.

Pedido explícito do usuário: atualização automática a cada 15 min, igual à
Controle de obras. Registrado no Agendador de Tarefas do Windows como
"FCNexus - Sincronizar Material de compra" (via sincronizar_material_compra.bat).
Precisa rodar numa máquina da empresa que enxergue o J:.

Só regrava as linhas quando o arquivo mudou (hash). Uso manual:
python scripts/sincronizar_material_compra.py [--forcar]
"""

import os
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")
warnings.filterwarnings("ignore", module="openpyxl")

from app.croqui_corte import propagar as propagar_croqui  # noqa: E402
from app.material_compra import registrar_erro, sincronizar  # noqa: E402

CAMINHO = os.environ.get("MATERIAL_COMPRA_PATH", r"J:\6 - PCP\PCP-CP\MACLM.xlsx")


def main() -> int:
    agora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    try:
        caminho = Path(CAMINHO)
        # Cópia em memória: não depende de alguém estar com a planilha aberta no meio da leitura.
        conteudo = caminho.read_bytes()
        modificado = datetime.fromtimestamp(caminho.stat().st_mtime, tz=timezone.utc)
        r = sincronizar(conteudo, str(caminho), modificado, forcar="--forcar" in sys.argv)
        print(f"{agora} OK - " + (f"planilha alterada, {r['linhas']} linhas gravadas" if r["alterado"] else "sem alteração"))
        # Croqui de corte é "filha" (PROCV pelo Pedido = PO+IT+POS): leva as
        # fixas da mãe e os pedidos ST = A novos. Roda sempre (se corrige sozinho).
        p = propagar_croqui(forcar="--forcar" in sys.argv)
        if p.get("atualizados") or p.get("novos"):
            print(f"{agora} Croqui de corte - {p['novos']} pedido(s) novo(s), {p['atualizados']} atualizado(s) pela mãe")
        return 0
    except Exception as e:  # noqa: BLE001 — registra qualquer falha pra aparecer no app
        print(f"{agora} ERRO - {type(e).__name__}: {e}")
        try:
            registrar_erro(f"{type(e).__name__}: {e}")
        except Exception as e2:  # noqa: BLE001
            print(f"{agora} ERRO ao registrar o erro no banco - {e2}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
