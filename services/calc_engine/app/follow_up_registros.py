"""Registro diário e relatório de um item do Follow up — pedido explícito
do usuário: no card do item, anotar o que aconteceu no dia (histórico do
pedido) e um botão de relatório com todos os dados do item, a data em que
ele entrou e os registros. Ver supabase/migrations/0017_follow_up_registros.sql.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.follow_up import carregar_itens
from app.orcamentos_salvos import _conectar

# Brasília sem horário de verão (desde 2019) — só pra "hoje" quando o app não
# manda a data; não depende do banco de fusos do container.
_BRASILIA = timezone(timedelta(hours=-3))
TEXTO_MAX = 5000


def _registro(row) -> dict:
    return {"id": str(row[0]), "data": row[1].isoformat(), "texto": row[2], "autor": row[3],
            "created_at": row[4].isoformat()}


def listar(item_id: str) -> list[dict]:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select id, data, texto, autor, created_at from follow_up_registros
               where item_id = %s order by data desc, created_at desc""",
            (item_id,),
        )
        return [_registro(r) for r in cur.fetchall()]


def adicionar(item_id: str, texto: str, data: str | None = None, autor: str | None = None) -> dict | None:
    texto = (texto or "").strip()
    if not texto:
        raise ValueError("Escreva o registro antes de salvar.")
    if len(texto) > TEXTO_MAX:
        raise ValueError(f"Registro muito longo (máximo {TEXTO_MAX} caracteres).")
    try:
        dia = date.fromisoformat(data) if data else datetime.now(_BRASILIA).date()
    except ValueError as e:
        raise ValueError("Data inválida (use AAAA-MM-DD).") from e
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select 1 from follow_up_itens where id = %s", (item_id,))
        if not cur.fetchone():
            return None
        cur.execute(
            """insert into follow_up_registros (item_id, data, texto, autor) values (%s, %s, %s, %s)
               returning id, data, texto, autor, created_at""",
            (item_id, dia, texto, autor),
        )
        row = cur.fetchone()
        conn.commit()
    return _registro(row)


def remover(registro_id: str) -> bool:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("delete from follow_up_registros where id = %s", (registro_id,))
        apagou = cur.rowcount > 0
        conn.commit()
    return apagou


def completo(item_id: str) -> dict | None:
    """Tudo do item pro relatório: campos, imagens, registros, data de entrada."""
    with _conectar() as conn, conn.cursor() as cur:
        itens = carregar_itens(cur, item_id)
        if not itens:
            return None
        cur.execute(
            """select i.created_at, i.origem, i.mae_linha, imp.importado_em, imp.arquivo_nome
               from follow_up_itens i left join follow_up_importacoes imp on imp.id = i.importacao_id
               where i.id = %s""",
            (item_id,),
        )
        criado_em, origem, mae_linha, importado_em, arquivo = cur.fetchone()
    return {
        "item": itens[0],
        "registros": listar(item_id),
        "entrada": {
            "origem": origem,
            # controle_obras: momento em que o app achou o pedido na planilha mãe
            # (sincronização de 15 min) = data de entrada de verdade.
            # importacao_gerencia: já estava na aba Gerencia quando o Follow up
            # foi criado — a data real de entrada não existe em nenhuma planilha.
            "em": criado_em.isoformat(),
            "importado_de": arquivo,
            "importado_em": importado_em.isoformat() if importado_em else None,
            "linha_controle_obras": mae_linha,
        },
    }
