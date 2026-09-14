"""Importa preços reais de compra de matéria-prima do ERP (SQL Server) pra
`historico_compras` no Supabase.

Lê SOMENTE do ERP (nunca escreve lá — a conta usada é read-only por
contrato com o usuário). Escreve no Supabase: pode criar linhas em
`fornecedores` (upsert por nome) e `historico_compras`; NUNCA cria linhas
novas em `materiais` — se a consulta do ERP trouxer uma combinação
norma+tipo que ainda não existe em `materiais`, o item é listado em
"ignorados" no relatório final em vez de ser inventado (densidade/fator de
barra são dados de engenharia, não dá pra adivinhar).

Reconhece a descrição das notas fiscais (padrão real observado nesta
base): "CHAPA #<espessura_mm> <norma>", "BARRA REDONDA ... <norma>",
"CANTONEIRA/VIGA/PERFIL ... <norma>" — só considera UNIDADE = 'KG' (é o
que dá pra comparar direto com `preco_kg`; itens vendidos por peça/barra
inteira ficam de fora).

Idempotente: antes de inserir, verifica se já existe uma linha de
`historico_compras` com o mesmo (material_id, fornecedor_id, preco_kg,
data_compra) e pula — rodar de novo não duplica.

Filtro de sanidade: descobri rodando contra a base real que algumas linhas
têm `PESOLIQ` zerado e `QTDE` baixa (1, 2, 4...) com `UNIDADE = 'KG'` —
nesses casos o valor unitário é na real preço POR PEÇA (chapa/barra
inteira), não por kg, e aparece como R$ 2.000+/kg (aço não custa isso; é
erro de lançamento na origem, não vou inserir). `PRECO_KG_MAX_RAZOAVEL`
descarta qualquer linha acima desse teto em vez de confiar cegamente no
que vem do ERP.

Uso:
    ../extractor/.venv/Scripts/python scripts/importar_precos_erp.py [--desde 20260101] [--dry-run]

Variáveis de ambiente esperadas (ver .env):
    ERP_SQL_SERVER    ex: <ip-do-servidor>,1433
    ERP_SQL_DATABASE  ex: INDUSTRIAL
    ERP_SQL_USER      login read-only
    ERP_SQL_PASSWORD
    SUPABASE_DB_URL   connection string do Postgres do Supabase (destino)
"""

from __future__ import annotations

import argparse
import os
import re
from dataclasses import dataclass

import psycopg
import pyodbc
from dotenv import load_dotenv

load_dotenv()

CFOP_COMPRA = ("1101", "1101A", "1101B")

# Preço de matéria-prima bruta (chapa/barra/perfil de aço) acima disso é
# quase certamente erro de unidade na origem (ver docstring do módulo),
# não um preço real de R$/kg.
PRECO_KG_MAX_RAZOAVEL = 50.0

# norma_regex -> nome canônico igual ao cadastrado em `materiais.norma`
NORMAS_RECONHECIDAS = [
    (re.compile(r"\bA ?572\b"), "ASTM A572"),
    (re.compile(r"\bA ?36\b"), "ASTM A36"),
    (re.compile(r"\bAISI ?304L?\b"), "AISI 304"),
    (re.compile(r"\bSAE ?1020\b"), "SAE 1020"),
]


@dataclass
class LinhaErp:
    descricao: str
    unidade: str
    preco_kg: float
    data_compra: str
    fornecedor: str | None


def classifica(descricao: str) -> tuple[str | None, str | None]:
    d = descricao.upper()
    if d.startswith("CHAPA"):
        tipo = "chapa"
    elif d.startswith("BARRA"):
        tipo = "barra"
    elif d.startswith(("CANTONEIRA", "VIGA", "PERFIL")):
        tipo = "perfil"
    else:
        tipo = None

    for padrao, norma in NORMAS_RECONHECIDAS:
        if padrao.search(d):
            return tipo, norma
    return tipo, None


def buscar_compras_erp(desde: str) -> list[LinhaErp]:
    conn_str = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={os.environ['ERP_SQL_SERVER']};"
        f"DATABASE={os.environ['ERP_SQL_DATABASE']};"
        f"UID={os.environ['ERP_SQL_USER']};PWD={os.environ['ERP_SQL_PASSWORD']};"
        "TrustServerCertificate=yes;"
    )
    conn = pyodbc.connect(conn_str, timeout=15)
    conn.setdecoding(pyodbc.SQL_CHAR, encoding="latin1")
    conn.setdecoding(pyodbc.SQL_WCHAR, encoding="latin1")
    conn.setencoding(encoding="latin1")
    cur = conn.cursor()
    cur.execute(
        f"""
        SELECT NI.DESCRICAO, NI.UNIDADE, NI.VLRUNITARIO, N.DTLANCAMENTO, F.FANTASIA AS FORNECEDOR
        FROM FN_NFEITENS AS NI
        INNER JOIN FN_NFE AS N ON N.CODIGO = NI.NFE
        LEFT JOIN FN_FORNECEDORES AS F ON F.CODIGO = N.FORNECEDOR
        WHERE N.DTLANCAMENTO >= ?
          AND NI.CFOP IN ({",".join("?" for _ in CFOP_COMPRA)})
          AND NI.UNIDADE = 'KG'
          AND (NI.DESCRICAO LIKE 'CHAPA%' OR NI.DESCRICAO LIKE 'BARRA%'
               OR NI.DESCRICAO LIKE 'CANTONEIRA%' OR NI.DESCRICAO LIKE 'VIGA%'
               OR NI.DESCRICAO LIKE 'PERFIL%')
        """,
        (desde, *CFOP_COMPRA),
    )
    linhas = [
        LinhaErp(
            descricao=row.DESCRICAO,
            unidade=row.UNIDADE,
            preco_kg=float(row.VLRUNITARIO),
            data_compra=row.DTLANCAMENTO.strftime("%Y-%m-%d"),
            fornecedor=(row.FORNECEDOR or "").strip() or None,
        )
        for row in cur.fetchall()
    ]
    conn.close()
    return linhas


def upsert_fornecedor(cur, nome: str | None) -> str | None:
    if not nome:
        return None
    cur.execute("select id from fornecedores where nome = %s", (nome,))
    row = cur.fetchone()
    if row:
        return row[0]
    cur.execute("insert into fornecedores (nome) values (%s) returning id", (nome,))
    return cur.fetchone()[0]


def material_id_existente(cur, norma: str, tipo: str) -> str | None:
    cur.execute("select id from materiais where norma = %s and tipo = %s", (norma, tipo))
    row = cur.fetchone()
    return row[0] if row else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--desde", default="20260101", help="Data mínima (YYYYMMDD) das compras a considerar")
    parser.add_argument("--dry-run", action="store_true", help="Só mostra o que faria, não escreve no Supabase")
    args = parser.parse_args()

    linhas = buscar_compras_erp(args.desde)
    print(f"{len(linhas)} linhas de compra (matéria-prima, KG) lidas do ERP desde {args.desde}.")

    ignorados: dict[tuple[str | None, str | None], int] = {}
    candidatas: list[tuple[LinhaErp, str, str]] = []
    outliers_preco = 0
    for linha in linhas:
        tipo, norma = classifica(linha.descricao)
        if not tipo or not norma:
            ignorados[(tipo, norma)] = ignorados.get((tipo, norma), 0) + 1
            continue
        if linha.preco_kg > PRECO_KG_MAX_RAZOAVEL:
            outliers_preco += 1
            continue
        candidatas.append((linha, tipo, norma))

    supabase_url = os.environ["SUPABASE_DB_URL"]
    inseridos = 0
    ja_existiam = 0
    sem_material_cadastrado: dict[tuple[str, str], int] = {}

    with psycopg.connect(supabase_url, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cache_material: dict[tuple[str, str], str | None] = {}
            for linha, tipo, norma in candidatas:
                chave = (norma, tipo)
                if chave not in cache_material:
                    cache_material[chave] = material_id_existente(cur, norma, tipo)
                material_id = cache_material[chave]

                if not material_id:
                    sem_material_cadastrado[chave] = sem_material_cadastrado.get(chave, 0) + 1
                    continue

                fornecedor_id = upsert_fornecedor(cur, linha.fornecedor)

                cur.execute(
                    """
                    select 1 from historico_compras
                    where material_id = %s and preco_kg = %s and data_compra = %s
                      and (fornecedor_id = %s or (fornecedor_id is null and %s is null))
                    """,
                    (material_id, linha.preco_kg, linha.data_compra, fornecedor_id, fornecedor_id),
                )
                if cur.fetchone():
                    ja_existiam += 1
                    continue

                if not args.dry_run:
                    cur.execute(
                        """
                        insert into historico_compras (material_id, fornecedor_id, preco_kg, data_compra)
                        values (%s, %s, %s, %s)
                        """,
                        (material_id, fornecedor_id, linha.preco_kg, linha.data_compra),
                    )
                inseridos += 1

        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()

    print(f"\n{'[dry-run] ' if args.dry_run else ''}Inseridos: {inseridos} | já existiam: {ja_existiam}")
    if outliers_preco:
        print(f"Descartados por preço/kg > R$ {PRECO_KG_MAX_RAZOAVEL:.0f} (provável erro de unidade na origem): {outliers_preco}")

    if sem_material_cadastrado:
        print("\nNorma+tipo com compra real mas SEM linha em `materiais` (não inseri, precisa cadastro/decisão):")
        for (norma, tipo), n in sorted(sem_material_cadastrado.items(), key=lambda x: -x[1]):
            print(f"  {tipo} / {norma}: {n} compras")

    if ignorados:
        print("\nDescrições sem tipo/norma reconhecidos (ignoradas):")
        for (tipo, norma), n in sorted(ignorados.items(), key=lambda x: -x[1])[:10]:
            print(f"  tipo={tipo} norma={norma}: {n}")


if __name__ == "__main__":
    main()
