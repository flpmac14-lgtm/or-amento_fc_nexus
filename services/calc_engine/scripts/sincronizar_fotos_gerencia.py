"""Traz para o Follow up as fotos da aba Gerencia que ainda faltam no app.

Pedido explícito do usuário: conferir as últimas imagens anexadas aos
pedidos em "Gerenciamento de obras ativas.xlsb" e subir, pelo PO, as que
estão faltando. Só ADICIONA (nunca apaga nem troca foto existente) e só em
pedidos que já existem no Follow up. Usa o mesmo leitor da importação
(app/xlsb_leitor.py → imagens dentro da célula, coluna A).

Uso: python scripts/sincronizar_fotos_gerencia.py [caminho.xlsb] [--simular]

Também roda sozinho a cada 15 min dentro de sincronizar_controle_obras.py
(pedido do usuário: "pode sincronizar"), só quando o arquivo muda — o hash
do último arquivo processado fica em ESTADO (arquivo local, fora do git).
"""

import collections
import hashlib
import os
import sys
import warnings
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")
warnings.filterwarnings("ignore")

from app.follow_up import interpretar  # noqa: E402
from app.orcamentos_salvos import _conectar  # noqa: E402

CAMINHO_PADRAO = os.environ.get("GERENCIA_XLSB_PATH", r"J:\6 - PCP\Gerenciamento de obras ativas.xlsb")

ESTADO = RAIZ / "sincronizar_fotos_gerencia.estado"


def sincronizar_se_mudou(caminho: Path = Path(CAMINHO_PADRAO)) -> str | None:
    """Pro agendamento de 15 min: só lê a planilha (17 MB) se ela mudou desde a
    última vez. Devolve o resumo, ou None se nada mudou."""
    conteudo = caminho.read_bytes()
    sha = hashlib.sha256(conteudo).hexdigest()
    if ESTADO.exists() and ESTADO.read_text().strip() == sha:
        return None
    resumo = sincronizar(conteudo, caminho.name)
    ESTADO.write_text(sha)  # só depois de gravar: se falhar, tenta de novo na próxima rodada
    return resumo


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    caminho = Path(args[0] if args else CAMINHO_PADRAO)
    print(sincronizar(caminho.read_bytes(), caminho.name, simular="--simular" in sys.argv))
    return 0


def sincronizar(conteudo: bytes, nome_arquivo: str, simular: bool = False) -> str:
    planilha = interpretar(conteudo)
    linhas_saida: list[str] = []

    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select upper(po), id from follow_up_itens")
        itens = dict(cur.fetchall())
        cur.execute(
            "select upper(it.po), i.midia_sha256 from follow_up_imagens i join follow_up_itens it on it.id = i.item_id"
        )
        ja_tem: dict[str, set] = collections.defaultdict(set)
        for po, sha in cur.fetchall():
            ja_tem[po].add(sha)

        adicionar = []
        fora_do_app = set()
        for item in planilha.itens:
            po = str(item.campos["po"]).upper()
            for img in item.imagens:
                if po not in itens:
                    fora_do_app.add(item.campos["po"])
                elif img.sha256 not in ja_tem[po]:
                    adicionar.append((itens[po], item.campos["po"], img))
                    ja_tem[po].add(img.sha256)

        linhas_saida.append(
            f"{nome_arquivo}: {len(planilha.itens)} linhas, {sum(len(i.imagens) for i in planilha.itens)} imagens; "
            f"faltando no app: {len(adicionar)} imagem(ns) em {len({a[0] for a in adicionar})} pedido(s)"
        )
        if fora_do_app:
            linhas_saida.append(f"Pedidos com foto que não existem no Follow up (ignorados): {', '.join(sorted(fora_do_app))}")
        if simular or not adicionar:
            return "\n".join(linhas_saida)

        from psycopg.types.json import Jsonb

        cur.executemany(
            """insert into follow_up_midias (sha256, content_type, conteudo, largura, altura, tamanho)
               values (%s, %s, %s, %s, %s, %s) on conflict (sha256) do nothing""",
            list({img.sha256: (img.sha256, img.content_type, img.conteudo, img.largura, img.altura, len(img.conteudo))
                  for _, _, img in adicionar}.values()),
        )
        cur.executemany(
            """insert into follow_up_imagens (item_id, midia_sha256, ordem, origem, celula, media_original, ancora,
                                              enviada_por)
               values (%s, %s, (select coalesce(max(ordem), -1) + 1 from follow_up_imagens where item_id = %s),
                       %s, %s, %s, %s, %s)""",
            [(item_id, img.sha256, item_id, img.origem, img.celula, img.media_original,
              Jsonb(img.ancora) if img.ancora else None, f"planilha {nome_arquivo}")
             for item_id, _, img in adicionar],
        )
        conn.commit()
    linhas_saida.append(f"OK - {len(adicionar)} imagem(ns) adicionada(s).")
    return "\n".join(linhas_saida)


if __name__ == "__main__":
    sys.exit(main())
