"""Vigia dos PDFs de certificado (aba QUALIDADE) — pedido explícito do
usuário: baixar o certificado pelo site pra montar data book.

Os PDFs (4,4 GB) só existem no J: e não cabem no Storage, então é sob
demanda: o site grava o pedido em qualidade_pdf_pedidos (migration 0035), e
este vigia (nesta máquina) sobe só aquele PDF pro bucket privado
"certificados" e marca "pronto". Também apaga do bucket o que tem mais de
DIAS_NO_BUCKET dias.

Roda pela tarefa agendada "FCNexus - Certificados sob demanda" a cada 15 min:
cada execução vigia por ~14 min e sai (se cair, a próxima volta sozinha;
servir_certificados.bat). Confere o banco a cada 3 s se houve pedido nos
últimos 10 min, senão a cada 10 s (consulta mínima — egress do Supabase).
Só serve arquivo que está na lista atual da pasta pedida (principal ou
backup — sincronizar_certificados.py).

Uso: python scripts/servir_certificados.py [--uma-vez]
"""

import hashlib
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")

import httpx  # noqa: E402

from app.orcamentos_salvos import _conectar  # noqa: E402
from sincronizar_certificados import FONTES, caminho_do_pdf  # noqa: E402

BUCKET = "certificados"
DURACAO_S = 14 * 60
RAPIDO_S, LENTO_S = 3, 10
ATIVO_POR = timedelta(minutes=10)
DIAS_NO_BUCKET = 3


def _storage() -> httpx.Client:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not chave:
        raise RuntimeError("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env do calc_engine.")
    return httpx.Client(base_url=f"{url}/storage/v1", timeout=180,
                        headers={"Authorization": f"Bearer {chave}", "apikey": chave})


def _permitidos() -> set[tuple[str, str]]:
    """(fonte, caminho) que podem ser servidos: só os das listas atuais (nada fora das pastas)."""
    saida = set()
    for fonte, cfg in FONTES.items():
        try:
            saida |= {(fonte, i["arquivo"]) for i in json.loads(cfg["estado"].read_text(encoding="utf-8"))["itens"]}
        except (OSError, ValueError, KeyError):
            pass
    return saida


def _servir(cur, st: httpx.Client, pedido_id: int, fonte: str, arquivo: str, permitidos: set) -> None:
    if (fonte, arquivo) not in permitidos:
        permitidos |= _permitidos()  # pode ter entrado agora na pasta
    if (fonte, arquivo) not in permitidos:
        cur.execute("update qualidade_pdf_pedidos set status = 'erro', erro = %s where id = %s",
                    ("Arquivo não está na pasta de certificados.", pedido_id))
        return
    caminho = caminho_do_pdf(fonte, arquivo)
    try:
        conteudo = caminho.read_bytes()
    except OSError as e:
        cur.execute("update qualidade_pdf_pedidos set status = 'erro', erro = %s where id = %s",
                    (f"Não consegui ler o PDF no J: ({e.strerror or e}).", pedido_id))
        return
    objeto = hashlib.sha256(conteudo).hexdigest() + ".pdf"
    r = st.post(f"/object/{BUCKET}/{objeto}", content=conteudo,
                headers={"Content-Type": "application/pdf", "x-upsert": "true"})
    if r.status_code >= 300:
        cur.execute("update qualidade_pdf_pedidos set status = 'erro', erro = %s where id = %s",
                    (f"Storage respondeu {r.status_code}.", pedido_id))
        return
    cur.execute("update qualidade_pdf_pedidos set status = 'pronto', objeto = %s, pronto_em = now(), erro = null "
                "where id = %s", (objeto, pedido_id))


def _limpar(cur, st: httpx.Client) -> None:
    """Apaga do bucket o que foi servido há mais de DIAS_NO_BUCKET dias."""
    cur.execute(
        """select id, objeto from qualidade_pdf_pedidos
           where status = 'pronto' and pronto_em < now() - make_interval(days => %s)""",
        (DIAS_NO_BUCKET,),
    )
    velhos = cur.fetchall()
    if not velhos:
        return
    ids = [i for i, _ in velhos]
    # Objeto que um pedido mais novo ainda usa fica no bucket.
    cur.execute(
        "select distinct objeto from qualidade_pdf_pedidos where status = 'pronto' and objeto = any(%s) and not (id = any(%s))",
        ([o for _, o in velhos], ids),
    )
    em_uso = {r[0] for r in cur.fetchall()}
    apagar = sorted({o for _, o in velhos if o and o not in em_uso})
    if apagar:
        st.request("DELETE", f"/object/{BUCKET}", json={"prefixes": apagar})
    cur.execute("update qualidade_pdf_pedidos set status = 'apagado' where id = any(%s)", (ids,))


def vigiar(uma_vez: bool = False) -> None:
    fim = time.monotonic() + DURACAO_S
    ultimo_pedido = datetime.min.replace(tzinfo=timezone.utc)
    permitidos = _permitidos()
    with _storage() as st, _conectar() as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            _limpar(cur, st)
            while True:
                # Pedidos parados há mais de 1 h (PC estava desligado): o site já desistiu.
                cur.execute(
                    """select id, fonte, arquivo from qualidade_pdf_pedidos
                       where status = 'pendente' and pedido_em > now() - interval '1 hour' order by id limit 50"""
                )
                pendentes = cur.fetchall()
                for pedido_id, fonte, arquivo in pendentes:
                    _servir(cur, st, pedido_id, fonte, arquivo, permitidos)
                agora = datetime.now(timezone.utc)
                if pendentes:
                    ultimo_pedido = agora
                    print(f"{agora:%d/%m %H:%M:%S} {len(pendentes)} PDF(s) servido(s)", flush=True)
                if uma_vez or time.monotonic() > fim:
                    return
                time.sleep(RAPIDO_S if agora - ultimo_pedido < ATIVO_POR else LENTO_S)


if __name__ == "__main__":
    vigiar(uma_vez="--uma-vez" in sys.argv)
