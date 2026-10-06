"""Sobe pro app os PDFs dos programas de corte (pasta da rede) — pedido
explícito do usuário: o nº do programa na Croqui de corte / Corte abre o PDF,
como no Excel. Ver app/corte_pdfs.py (padrão dos nomes) e a migration 0028.

Compara a pasta com o índice (corte_pdfs) pelo nome + tamanho + data: só
sobe o que é novo ou mudou, e tira do índice (e do Storage) o que saiu da
pasta. Arquivo sem "NC" no nome (sem nº de programa) fica de fora.
O objeto no bucket se chama <sha256>.pdf (o nome original tem vírgula, "@",
acento... que o Storage não aceita).

Uso: python scripts/sincronizar_pdfs_corte.py [pasta] [--simular]
Também roda a cada 15 min dentro de sincronizar_controle_obras.py.
Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env (só nesta máquina).
"""

import hashlib
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")

import httpx  # noqa: E402

from app.corte_pdfs import programas_do_nome  # noqa: E402
from app.orcamentos_salvos import _conectar  # noqa: E402

ESTADO = RAIZ / "sincronizar_pdfs_corte.estado"  # assinatura da última pasta sincronizada (fora do git)
PASTA_PADRAO = os.environ.get("CORTE_PDFS_PATH", r"J:\3 - Projetos\GR_PROJETO\Corte\PCP-Corte-2026")
BUCKET = "programas-corte"


def _storage() -> httpx.Client:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    chave = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not chave:
        raise RuntimeError("Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env do calc_engine.")
    return httpx.Client(base_url=f"{url}/storage/v1", timeout=120,
                        headers={"Authorization": f"Bearer {chave}", "apikey": chave})


def _listar(pasta: Path) -> dict:
    arquivos = {}
    for e in os.scandir(pasta):
        if not e.is_file() or not e.name.lower().endswith(".pdf"):
            continue
        programas = programas_do_nome(e.name)
        if programas:
            st = e.stat()
            arquivos[e.name] = (programas, st.st_size, datetime.fromtimestamp(st.st_mtime, tz=timezone.utc))
    return arquivos


def _assinatura(arquivos: dict) -> str:
    texto = "\n".join(f"{n}|{t}|{m.timestamp():.0f}|{','.join(p)}" for n, (p, t, m) in sorted(arquivos.items()))
    return hashlib.sha256(texto.encode()).hexdigest()


def sincronizar_se_mudou(pasta: Path = Path(PASTA_PADRAO)) -> str | None:
    """Pro agendamento de 15 min: só consulta o banco (egress do Supabase —
    ver supabase_egress) se algum PDF da pasta entrou, saiu ou mudou."""
    arquivos = _listar(pasta)
    assinatura = _assinatura(arquivos)
    if ESTADO.exists() and ESTADO.read_text(encoding="utf-8").strip() == assinatura:
        return None
    resumo = sincronizar(pasta, arquivos=arquivos)
    ESTADO.write_text(assinatura, encoding="utf-8")
    return resumo


def sincronizar(pasta: Path = Path(PASTA_PADRAO), simular: bool = False, arquivos: dict | None = None) -> str:
    arquivos = arquivos if arquivos is not None else _listar(pasta)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select nome, tamanho, modificado_em, caminho, programas from corte_pdfs")
        atuais = {n: (t, m, c, p) for n, t, m, c, p in cur.fetchall()}

    novos = [n for n, (p, t, m) in arquivos.items()
             if n not in atuais or atuais[n][0] != t or abs((atuais[n][1] - m).total_seconds()) > 2]
    # Só o nome dos programas mudou (regra nova de leitura): atualiza sem subir de novo.
    renomear = [n for n in arquivos if n in atuais and n not in novos and list(atuais[n][3]) != arquivos[n][0]]
    sairam = [n for n in atuais if n not in arquivos]
    resumo = f"{len(arquivos)} PDFs com programa · {len(novos)} novo(s)/alterado(s) · {len(sairam)} removido(s)"
    if simular or not (novos or sairam or renomear):
        return resumo

    with _storage() as st, _conectar() as conn, conn.cursor() as cur:
        for i, nome in enumerate(novos, 1):
            programas, tamanho, modificado = arquivos[nome]
            conteudo = (pasta / nome).read_bytes()
            caminho = f"{hashlib.sha256(conteudo).hexdigest()}.pdf"
            r = st.post(f"/object/{BUCKET}/{caminho}", content=conteudo,
                        headers={"Content-Type": "application/pdf", "x-upsert": "true",
                                 "Cache-Control": "max-age=31536000"})
            if r.status_code >= 300:
                raise RuntimeError(f"Falha ao subir {nome}: {r.status_code} {r.text[:200]}")
            cur.execute(
                """insert into corte_pdfs (nome, programas, caminho, tamanho, modificado_em, sincronizado_em)
                   values (%s, %s, %s, %s, %s, now())
                   on conflict (nome) do update set programas = excluded.programas, caminho = excluded.caminho,
                     tamanho = excluded.tamanho, modificado_em = excluded.modificado_em, sincronizado_em = now()""",
                (nome, programas, caminho, tamanho, modificado),
            )
            if i % 50 == 0:
                conn.commit()
                print(f"  {i}/{len(novos)} enviados…", flush=True)
        for nome in renomear:
            cur.execute("update corte_pdfs set programas = %s where nome = %s", (arquivos[nome][0], nome))
        if sairam:
            cur.execute("delete from corte_pdfs where nome = any(%s)", (sairam,))
        conn.commit()
        # Objetos que nenhum arquivo usa mais (removidos ou substituídos).
        cur.execute("select distinct caminho from corte_pdfs")
        em_uso = {r[0] for r in cur.fetchall()}
        orfaos = sorted({c for _, _, c, _ in atuais.values()} - em_uso)
        if orfaos:
            st.request("DELETE", f"/object/{BUCKET}", json={"prefixes": orfaos})
    return resumo


if __name__ == "__main__":
    pasta = next((Path(a) for a in sys.argv[1:] if not a.startswith("--")), Path(PASTA_PADRAO))
    print(sincronizar(pasta, simular="--simular" in sys.argv))
