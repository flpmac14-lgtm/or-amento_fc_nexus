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

# CFOPs de compra usados só pela referência GERAL (buscar_compras_geral_erp)
# — lista bem mais ampla que CFOP_COMPRA porque cobre qualquer tipo de
# compra (industrialização, revenda, imobilizado, combustível, importação
# etc.), não só matéria-prima pra fabricação. Lista fornecida pelo usuário
# (mesma referência que a Macfab já usa no relatório "Sectra").
CFOP_COMPRA_GERAL = (
    "1101", "1101A", "1101B", "1101C", "1101D", "1101J", "1101V",
    "1116", "1122", "1252",
    "1401", "1401E", "1401F", "1406", "1407",
    "1551", "1551A", "1551B", "1551C", "1556",
    "1651", "1653",
    "2101", "2101C", "2101D", "2101X", "2406", "2551", "2556A",
    "3127", "3551",
)

# Preço de matéria-prima bruta (chapa/barra/perfil de aço) acima disso é
# quase certamente erro de unidade na origem (ver docstring do módulo),
# não um preço real de R$/kg.
PRECO_KG_MAX_RAZOAVEL = 50.0

# norma_regex -> nome canônico igual ao cadastrado em `materiais.norma`
NORMAS_RECONHECIDAS = [
    (re.compile(r"\bA ?572\b"), "ASTM A572"),
    (re.compile(r"\bA ?36\b"), "ASTM A36"),
    # "A240-304"/"A240 304" = ASTM A240 tipo 304 — especificação de chapa
    # inox, mesmo material de "AISI 304" (mesma norma comercial, nome
    # diferente porque A240 é a especificação de PRODUTO/chapa, não da
    # liga em si). Checar ANTES do padrão AISI304 abaixo não importa aqui
    # (não colidem), mas a ordem da lista é sempre norma mais específica
    # primeiro por clareza.
    (re.compile(r"\bA ?240.*304L?\b"), "AISI 304"),
    (re.compile(r"\bAISI ?304L?\b"), "AISI 304"),
    (re.compile(r"\bSAE ?1020\b"), "SAE 1020"),
]

# "CHAPA #<espessura> <norma>" — mesmo padrão de app/precos_mercado.py.
_PADRAO_ESPESSURA_CHAPA = re.compile(r"^CHAPA\s*#\s*([0-9]+[,.][0-9]+)", re.IGNORECASE)


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


def extrai_espessura_chapa(descricao: str) -> float | None:
    m = _PADRAO_ESPESSURA_CHAPA.match(descricao.strip())
    return float(m.group(1).replace(",", ".")) if m else None


def _conectar_erp():
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
    return conn


def buscar_compras_erp(desde: str) -> list[LinhaErp]:
    conn = _conectar_erp()
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


@dataclass
class LinhaErpGeral:
    """Último preço conhecido por (material, unidade) — qualquer item do
    ERP, sem filtro de descrição/tipo (tinta, parafuso, porca, consumível,
    matéria-prima, o que for). Ver `sincronizar_geral` (grava em
    `historico_compras_geral`)."""

    nfe_codigo: int
    material_codigo: str | None
    codigo_item: str | None
    descricao: str
    unidade: str
    preco_unitario: float
    obra: str | None
    data_compra: str
    fornecedor: str | None


def buscar_compras_geral_erp(desde: str) -> list[LinhaErpGeral]:
    """Mesma lógica do relatório "Sectra" que a Macfab já usa (versão
    atualizada pelo usuário: CFOP_COMPRA_GERAL bem mais amplo, cobrindo
    qualquer tipo de compra, não só industrialização) — ROW_NUMBER()
    particionado por (MATERIAL, UNIDADE), pegando só o mais recente
    (DTLANCAMENTO desc, CODIGO da nota desc como desempate). Isto é uma
    referência de PREÇO ATUAL por item, não um log de toda transação.

    A consulta do usuário não filtra mais DESCRICAO/VLRUNITARIO nulos (ao
    contrário da versão anterior) — como `historico_compras_geral` exige
    os dois (NOT NULL), essas linhas são só puladas aqui no Python em vez
    de tentar inserir e quebrar o lote inteiro."""
    conn = _conectar_erp()
    cur = conn.cursor()
    cur.execute(
        f"""
        WITH ULTIMO_VALOR AS (
            SELECT
                NI.NFE, NI.CODIGO, NI.MATERIAL, NI.DESCRICAO, NI.VLRUNITARIO,
                NI.UNIDADE, NI.OBRA, N.DTLANCAMENTO, F.FANTASIA AS FORNECEDOR,
                ROW_NUMBER() OVER (
                    PARTITION BY NI.MATERIAL, NI.UNIDADE
                    ORDER BY N.DTLANCAMENTO DESC, N.CODIGO DESC
                ) AS ORDEM
            FROM FN_NFEITENS AS NI
            INNER JOIN FN_NFE AS N ON N.CODIGO = NI.NFE
            LEFT JOIN FN_FORNECEDORES AS F ON F.CODIGO = N.FORNECEDOR
            WHERE N.DTLANCAMENTO >= ?
              AND NI.CFOP IN ({",".join("?" for _ in CFOP_COMPRA_GERAL)})
        )
        SELECT NFE, CODIGO, MATERIAL, DESCRICAO, VLRUNITARIO, UNIDADE, OBRA, DTLANCAMENTO, FORNECEDOR
        FROM ULTIMO_VALOR
        WHERE ORDEM = 1
        ORDER BY MATERIAL
        """,
        (desde, *CFOP_COMPRA_GERAL),
    )
    linhas = [
        LinhaErpGeral(
            nfe_codigo=int(row.NFE),
            material_codigo=(str(row.MATERIAL).strip() if row.MATERIAL is not None else None),
            codigo_item=(str(row.CODIGO).strip() if row.CODIGO is not None else None),
            descricao=str(row.DESCRICAO).strip(), unidade=(row.UNIDADE or "").strip(),
            preco_unitario=float(row.VLRUNITARIO),
            obra=(str(row.OBRA).strip() if row.OBRA else None),
            data_compra=row.DTLANCAMENTO.strftime("%Y-%m-%d"),
            fornecedor=(row.FORNECEDOR or "").strip() or None,
        )
        for row in cur.fetchall()
        if row.DESCRICAO is not None and row.VLRUNITARIO is not None
    ]
    conn.close()
    return linhas


def sincronizar_geral(desde: str, dry_run: bool) -> None:
    linhas = buscar_compras_geral_erp(desde)
    print(f"\n{len(linhas)} referências (último preço por material+unidade) lidas do ERP desde {desde}.")

    supabase_url = os.environ["SUPABASE_DB_URL"]
    with psycopg.connect(supabase_url, connect_timeout=15, prepare_threshold=None) as conn:
        with conn.cursor() as cur:
            if not dry_run:
                for linha in linhas:
                    cur.execute(
                        """
                        insert into historico_compras_geral
                            (nfe_codigo, material_codigo, codigo_item, descricao, preco_unitario,
                             unidade, fornecedor, obra, data_compra)
                        values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        on conflict (material_codigo, unidade) do update set
                            nfe_codigo = excluded.nfe_codigo,
                            codigo_item = excluded.codigo_item,
                            descricao = excluded.descricao,
                            preco_unitario = excluded.preco_unitario,
                            fornecedor = excluded.fornecedor,
                            obra = excluded.obra,
                            data_compra = excluded.data_compra
                        """,
                        (linha.nfe_codigo, linha.material_codigo, linha.codigo_item, linha.descricao,
                         linha.preco_unitario, linha.unidade, linha.fornecedor, linha.obra,
                         linha.data_compra),
                    )
        if dry_run:
            conn.rollback()
        else:
            conn.commit()

    print(f"{'[dry-run] ' if dry_run else ''}Histórico geral sincronizado: {len(linhas)} referências.")


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

    with psycopg.connect(supabase_url, connect_timeout=15, prepare_threshold=None) as conn:
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
                espessura_mm = extrai_espessura_chapa(linha.descricao) if tipo == "chapa" else None

                cur.execute(
                    """
                    select 1 from historico_compras
                    where material_id = %s and preco_kg = %s and data_compra = %s
                      and (fornecedor_id = %s or (fornecedor_id is null and %s is null))
                      and (espessura_mm = %s::numeric or (espessura_mm is null and %s::numeric is null))
                    """,
                    (material_id, linha.preco_kg, linha.data_compra, fornecedor_id, fornecedor_id,
                     espessura_mm, espessura_mm),
                )
                if cur.fetchone():
                    ja_existiam += 1
                    continue

                if not args.dry_run:
                    cur.execute(
                        """
                        insert into historico_compras
                            (material_id, fornecedor_id, preco_kg, data_compra, espessura_mm, descricao_original)
                        values (%s, %s, %s, %s, %s, %s)
                        """,
                        (material_id, fornecedor_id, linha.preco_kg, linha.data_compra,
                         espessura_mm, linha.descricao),
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

    # Histórico completo (tinta, parafuso, porca, qualquer item) — aba
    # "Referência de preços" do frontend, sem exigir cadastro de engenharia.
    sincronizar_geral(args.desde, args.dry_run)


if __name__ == "__main__":
    main()
