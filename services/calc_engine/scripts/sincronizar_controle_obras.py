"""Sincroniza a aba OBRAS (H:AB) de "Controle de obras.xlsm" com o banco do app.

Pedido explícito do usuário: atualização automática a cada 15 min. Registrado
no Agendador de Tarefas do Windows como "FCNexus - Sincronizar Controle de obras"
(via sincronizar_controle_obras.bat). Precisa rodar numa máquina da empresa
que enxergue o J: — o Render (nuvem) não tem acesso a ele.

Só regrava as linhas quando o arquivo mudou (hash); senão, apenas registra a
verificação. Uso manual: python scripts/sincronizar_controle_obras.py [--forcar]
"""

import os
import warnings
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")
# openpyxl avisa de extensões do Excel que ele não entende (slicers etc.) — irrelevante aqui.
warnings.filterwarnings("ignore", module="openpyxl")

from app.controle_obras import registrar_erro, sincronizar  # noqa: E402
from app.follow_up_mae import propagar  # noqa: E402

CAMINHO = os.environ.get("CONTROLE_OBRAS_PATH", r"J:\6 - PCP\Controle de obras.xlsm")


def main() -> int:
    agora = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    try:
        caminho = Path(CAMINHO)
        # Lê o arquivo inteiro de uma vez (cópia em memória): não depende de
        # o Excel de alguém estar com a planilha aberta no meio da leitura.
        conteudo = caminho.read_bytes()
        modificado = datetime.fromtimestamp(caminho.stat().st_mtime, tz=timezone.utc)
        r = sincronizar(conteudo, str(caminho), modificado, forcar="--forcar" in sys.argv)
        if r["alterado"]:
            print(f"{agora} OK - planilha alterada, {r['linhas']} linhas gravadas")
        else:
            print(f"{agora} OK - sem alteração")
        # Follow up é "filha" (PROCV pelo PO): leva os campos da mãe e os
        # pedidos ST = A novos. Roda sempre (é barato e se corrige sozinho
        # se uma rodada anterior falhou no meio).
        # Falha aqui não invalida a leitura da Controle de obras (já gravada).
        try:
            p = propagar()
            if p.get("atualizados") or p.get("novos"):
                print(f"{agora} Follow up - {p['novos']} pedido(s) novo(s), {p['atualizados']} atualizado(s) pela mãe")
        except Exception as e:  # noqa: BLE001
            print(f"{agora} ERRO no Follow up (mãe -> filha) - {type(e).__name__}: {e}")
            return 1
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
