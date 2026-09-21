"""Persistência de orçamentos salvos — tabela `orcamentos_salvos` no
Supabase (ver supabase/migrations/0005_orcamentos_salvos.sql). Guarda o
resultado completo (o que a tela mostra) e, quando vem do cálculo manual,
o estado de edição (itens/itens comerciais/config) pra reabrir e continuar
editando sem recalcular do zero.

Diferente de app/repositorio_materiais.py, aqui NÃO tem fixture local: é
uma feature de persistência de verdade (não um cálculo determinístico),
então sem `SUPABASE_DB_URL` configurada ela simplesmente não funciona —
levanta `BancoNaoConfigurado` em vez de fingir sucesso."""

from __future__ import annotations

import os

_DB_URL_ENV = "SUPABASE_DB_URL"


class BancoNaoConfigurado(RuntimeError):
    pass


def _db_url() -> str:
    url = os.environ.get(_DB_URL_ENV)
    if not url:
        raise BancoNaoConfigurado(
            f"{_DB_URL_ENV} não configurada — não é possível salvar/listar orçamentos."
        )
    return url


def _conectar():
    import psycopg  # import tardio: só exige o driver instalado quando o DB está configurado

    return psycopg.connect(_db_url(), connect_timeout=10, prepare_threshold=None)


def salvar(
    nome: str,
    origem: str,
    resultado: dict,
    estado_manual: dict | None = None,
    estado_texto: dict | None = None,
    orcamento_id: str | None = None,
    relatorio_tecnico: str | None = None,
    proposta: dict | None = None,
) -> dict:
    from psycopg.types.json import Jsonb

    with _conectar() as conn, conn.cursor() as cur:
        if orcamento_id:
            cur.execute(
                """
                update orcamentos_salvos
                set nome = %s, origem = %s, resultado = %s, estado_manual = %s, estado_texto = %s,
                    relatorio_tecnico = coalesce(%s, relatorio_tecnico),
                    proposta = coalesce(%s, proposta),
                    updated_at = now()
                where id = %s
                returning id, created_at, updated_at
                """,
                (nome, origem, Jsonb(resultado), Jsonb(estado_manual) if estado_manual else None,
                 Jsonb(estado_texto) if estado_texto else None, relatorio_tecnico,
                 Jsonb(proposta) if proposta else None, orcamento_id),
            )
        else:
            cur.execute(
                """
                insert into orcamentos_salvos
                    (nome, origem, resultado, estado_manual, estado_texto, relatorio_tecnico, proposta)
                values (%s, %s, %s, %s, %s, %s, %s)
                returning id, created_at, updated_at
                """,
                (nome, origem, Jsonb(resultado), Jsonb(estado_manual) if estado_manual else None,
                 Jsonb(estado_texto) if estado_texto else None, relatorio_tecnico,
                 Jsonb(proposta) if proposta else None),
            )
        row = cur.fetchone()
        conn.commit()

    if not row:
        raise ValueError(f"Orçamento '{orcamento_id}' não encontrado")
    return {"id": str(row[0]), "created_at": row[1].isoformat(), "updated_at": row[2].isoformat()}


def anexar_desenho(orcamento_id: str, storage_path: str, nome_arquivo: str) -> dict:
    """Anexa MAIS UM desenho ao orçamento (pedido explícito do usuário:
    "até mais que 1") — nunca substitui os anteriores, cada anexo é uma
    linha independente em `orcamento_desenhos`. Não exige o orçamento
    estar "aberto" (resultado/estado_manual carregados): só o id já
    salvo, por isso dá pra anexar direto na lista de orçamentos salvos."""
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into orcamento_desenhos (orcamento_id, storage_path, nome_arquivo)
            values (%s, %s, %s)
            returning id, created_at
            """,
            (orcamento_id, storage_path, nome_arquivo),
        )
        row = cur.fetchone()
        conn.commit()

    return {"id": str(row[0]), "storage_path": storage_path, "nome_arquivo": nome_arquivo, "created_at": row[1].isoformat()}


def listar_desenhos(orcamento_id: str) -> list[dict]:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            "select id, storage_path, nome_arquivo, created_at from orcamento_desenhos "
            "where orcamento_id = %s order by created_at",
            (orcamento_id,),
        )
        rows = cur.fetchall()
    return [
        {"id": str(r[0]), "storage_path": r[1], "nome_arquivo": r[2], "created_at": r[3].isoformat()}
        for r in rows
    ]


def _resumo(resultado: dict) -> dict:
    resultado = resultado or {}
    comercial = ((resultado.get("orcamento") or {}).get("comercial")) or {}
    identificacao = ((resultado.get("extracao") or {}).get("identificacao")) or {}

    def _valor(campo):
        return (campo or {}).get("valor")

    return {
        "cliente": _valor(identificacao.get("cliente")),
        "numero_desenho": _valor(identificacao.get("numero_desenho")),
        "peso_liquido_kg": comercial.get("peso_liquido_kg"),
        "preco_venda_com_impostos": comercial.get("preco_venda_com_impostos"),
    }


def listar() -> list[dict]:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select o.id, o.nome, o.origem, o.resultado,
                   exists(select 1 from orcamento_desenhos d where d.orcamento_id = o.id) as tem_desenho,
                   o.created_at, o.updated_at
            from orcamentos_salvos o
            order by o.updated_at desc
            """
        )
        rows = cur.fetchall()

    return [
        {
            "id": str(r[0]), "nome": r[1], "origem": r[2],
            "resumo": {**_resumo(r[3]), "tem_desenho_anexado": r[4]},
            "created_at": r[5].isoformat(), "updated_at": r[6].isoformat(),
        }
        for r in rows
    ]


def buscar(orcamento_id: str) -> dict | None:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            "select id, nome, origem, resultado, estado_manual, estado_texto, relatorio_tecnico, "
            "proposta, created_at, updated_at "
            "from orcamentos_salvos where id = %s",
            (orcamento_id,),
        )
        row = cur.fetchone()

    if not row:
        return None
    return {
        "id": str(row[0]), "nome": row[1], "origem": row[2],
        "resultado": row[3], "estado_manual": row[4], "estado_texto": row[5],
        "relatorio_tecnico": row[6], "proposta": row[7],
        "desenhos": listar_desenhos(orcamento_id),
        "created_at": row[8].isoformat(), "updated_at": row[9].isoformat(),
    }


def excluir(orcamento_id: str) -> bool:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("delete from orcamentos_salvos where id = %s", (orcamento_id,))
        afetado = cur.rowcount > 0
        conn.commit()
    return afetado
