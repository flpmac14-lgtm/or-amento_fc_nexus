"""Repositório de materiais/perfis: consulta o Supabase real (tabelas
`materiais`, `perfis`, `historico_compras`) quando `SUPABASE_DB_URL` está
configurada no ambiente. Sem essa variável, cai para `materiais_fixture`
(usado hoje pelos testes e para rodar o motor offline).

Mesma assinatura dos dois lados — `adapter.py` importa daqui e não precisa
saber qual fonte está em uso.

Preço: hoje usa a estratégia mais simples, "último comprado" (linha mais
recente de `historico_compras` por `data_compra`). A especificação pede
outras (média das últimas 3 compras, média 30/60/90 dias, fornecedor
preferencial, cotação atual) — fica para uma próxima iteração. Se não há
nenhuma compra registrada para o material, `preco_kg_padrao` volta `None`
e o item é sinalizado para revisão (mesmo comportamento de material sem
cadastro) em vez de inventar um preço.
"""

from __future__ import annotations

import os

from app.materiais_fixture import InfoMaterial, _normaliza_tipo
from app.materiais_fixture import buscar_info_material as _buscar_info_material_fixture
from app.materiais_fixture import buscar_peso_kg_m_perfil as _buscar_peso_kg_m_perfil_fixture

_DB_URL_ENV = "SUPABASE_DB_URL"


def _db_url() -> str | None:
    return os.environ.get(_DB_URL_ENV)


def _conectar():
    import psycopg  # import tardio: só exige o driver instalado quando o DB está configurado

    return psycopg.connect(_db_url(), connect_timeout=10)


def buscar_info_material(norma: str | None, tipo_geometria: str | None) -> InfoMaterial | None:
    if not _db_url():
        return _buscar_info_material_fixture(norma, tipo_geometria)
    if not norma:
        return None

    tipo = _normaliza_tipo(tipo_geometria)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """
            select m.densidade_kg_m3,
                   m.fator_barra_redonda_kg_m,
                   (select hc.preco_kg from historico_compras hc
                     where hc.material_id = m.id
                     order by hc.data_compra desc
                     limit 1) as preco_kg
            from materiais m
            where upper(m.norma) = upper(%s) and m.tipo = %s
            limit 1
            """,
            (norma.strip(), tipo),
        )
        row = cur.fetchone()

    if not row:
        return None

    densidade, fator_barra, preco_kg = row
    return InfoMaterial(
        densidade_kg_m3=float(densidade),
        fator_barra_redonda_kg_m=float(fator_barra) if fator_barra is not None else None,
        preco_kg_padrao=float(preco_kg) if preco_kg is not None else None,
    )


def buscar_peso_kg_m_perfil(designacao: str | None) -> float | None:
    if not _db_url():
        return _buscar_peso_kg_m_perfil_fixture(designacao)
    if not designacao:
        return None

    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            "select peso_kg_m from perfis where lower(designacao) = lower(%s) limit 1",
            (designacao.strip(),),
        )
        row = cur.fetchone()

    return float(row[0]) if row else None
