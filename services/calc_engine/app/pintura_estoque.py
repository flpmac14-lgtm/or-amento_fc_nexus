"""Pintura — espelho de "J:\\6 - PCP\\PCP-Pintura\\PCP-Pintura-Estoque.xlsx"
(ver supabase/migrations/0074_pintura_estoque.sql).

Pedido do usuário (17/11/2026): aba principal "Pintura" no app, atualizada a
cada 15 min como a Controle de obras (roda dentro de
scripts/sincronizar_controle_obras.py — a máquina da empresa enxerga o J:).

A planilha tem duas abas:
- "Estoque" (A:AG): cada linha é uma tinta em estoque, com o componente A
  (Qt/Lote/Venc.) e o componente B (Qt(B)/Lote(B)/Venc.(B)); as colunas R:AG
  são PROCV na aba Tinta pelo Produto(A). Da AH em diante só há sobra.
- "Tinta" (A:AB): catálogo técnico (fabricante, diluente, sólidos, micras...).
Linhas sem produto (só o número do IT) são ignoradas.
"""

from __future__ import annotations

import hashlib
import io
import re
from datetime import datetime, timezone

from app.controle_obras import _letra, _normalizar
from app.material_compra import _limpo
from app.orcamentos_salvos import _conectar

# chave -> (nome da aba na planilha, última coluna, cabeçalho obrigatório = produto)
ABAS = {
    "estoque": ("Estoque", 33, "produto(a)"),  # A:AG
    "tinta": ("Tinta", 28, "produto (cpa)"),  # A:AB
}
_TIPOS = {
    "qt(a)": "numero", "saida(cpa)": "numero", "qt(b)": "numero", "saida(b)": "numero", "qt": "numero",
    "saida": "numero", "venc.(a)": "data", "venc.(b)": "data", "venc.": "data", "it": "codigo",
    "lote": "codigo", "lote(b)": "codigo",
}


def _campo(cabecalho, i: int, usados: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", _normalizar(cabecalho)).strip("_") or f"col_{_letra(i + 1).lower()}"
    campo, n = base, 2
    while campo in usados:
        campo, n = f"{base}_{n}", n + 1
    usados.add(campo)
    return campo


def ler_planilha(conteudo: bytes) -> tuple[dict, dict]:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(conteudo), data_only=True, read_only=True)
    colunas_por_aba: dict[str, list[dict]] = {}
    linhas_por_aba: dict[str, list[tuple[int, list]]] = {}
    for chave, (aba, ultima, obrigatorio) in ABAS.items():
        nome = next((a for a in wb.sheetnames if a.strip().casefold() == aba.casefold()), None)
        if not nome:
            raise ValueError(f"Aba '{aba}' não encontrada. Abas: {', '.join(wb.sheetnames)}")
        ws = wb[nome]
        colunas: list[dict] = []
        linhas: list[tuple[int, list]] = []
        i_produto = None
        for n, row in enumerate(ws.iter_rows(min_row=1, max_col=ultima, values_only=True), start=1):
            if n == 1:
                usados: set[str] = set()
                colunas = [
                    {"letra": _letra(i + 1), "cabecalho": str(c or "").strip() or _letra(i + 1),
                     "campo": _campo(c, i, usados), "tipo": _TIPOS.get(_normalizar(c), "texto")}
                    for i, c in enumerate(list(row) + [None] * (ultima - len(row)))
                ]
                i_produto = next((i for i, c in enumerate(colunas) if _normalizar(c["cabecalho"]) == obrigatorio), None)
                if i_produto is None:
                    raise ValueError(f"Cabeçalho da aba {aba} mudou (não achei '{obrigatorio}'): "
                                     f"{[c['cabecalho'] for c in colunas]}")
                continue
            valores = [_limpo(row[i]) if i < len(row) else None for i in range(ultima)]
            for i, v in enumerate(valores):
                if isinstance(v, datetime):
                    valores[i] = v.date().isoformat()
                elif isinstance(v, float) and v.is_integer():
                    valores[i] = int(v)
            if valores[i_produto] not in (None, "", 0, "0"):
                linhas.append((n, valores))
        colunas_por_aba[chave] = colunas
        linhas_por_aba[chave] = linhas
    wb.close()
    return colunas_por_aba, linhas_por_aba


def sincronizar(conteudo: bytes, caminho: str, modificado_em: datetime | None, forcar: bool = False) -> dict:
    """Grava o espelho se o arquivo mudou (hash). Sempre registra a verificação."""
    from psycopg.types.json import Jsonb

    sha = hashlib.sha256(conteudo).hexdigest()
    agora = datetime.now(timezone.utc)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select arquivo_sha256 from pintura_status where id = 1")
        atual = cur.fetchone()
        if atual and atual[0] == sha and not forcar:
            cur.execute(
                "update pintura_status set ultima_verificacao_em = %s, ultimo_erro = null, ultimo_erro_em = null where id = 1",
                (agora,),
            )
            conn.commit()
            return {"alterado": False, "sha256": sha}

    colunas, linhas = ler_planilha(conteudo)
    contagem = {k: len(v) for k, v in linhas.items()}
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select pg_advisory_xact_lock(hashtext('pintura_sync'))")
        cur.execute("delete from pintura_linhas")
        with cur.copy("copy pintura_linhas (aba, linha_planilha, valores) from stdin") as copia:
            for aba, lista in linhas.items():
                for n, valores in lista:
                    copia.write_row((aba, n, Jsonb(valores)))
        cur.execute(
            """
            insert into pintura_status
                (id, arquivo, colunas, linhas, arquivo_sha256, arquivo_modificado_em,
                 ultima_alteracao_em, ultima_verificacao_em, ultimo_erro, ultimo_erro_em)
            values (1, %s, %s, %s, %s, %s, %s, %s, null, null)
            on conflict (id) do update set
                arquivo = excluded.arquivo, colunas = excluded.colunas, linhas = excluded.linhas,
                arquivo_sha256 = excluded.arquivo_sha256, arquivo_modificado_em = excluded.arquivo_modificado_em,
                ultima_alteracao_em = excluded.ultima_alteracao_em,
                ultima_verificacao_em = excluded.ultima_verificacao_em, ultimo_erro = null, ultimo_erro_em = null
            """,
            (caminho, Jsonb(colunas), Jsonb(contagem), sha, modificado_em, agora, agora),
        )
        conn.commit()
    return {"alterado": True, "sha256": sha, "linhas": contagem}


def registrar_erro(mensagem: str) -> None:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            "update pintura_status set ultimo_erro = %s, ultimo_erro_em = now() where id = 1",
            (mensagem[:2000],),
        )
        conn.commit()


# (hash do arquivo, linhas) da última leitura — por processo (egress do Supabase).
_CACHE: tuple[str, dict] | None = None


def listar() -> dict:
    global _CACHE
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select arquivo, colunas, linhas, arquivo_modificado_em, ultima_alteracao_em,
                      ultima_verificacao_em, ultimo_erro, ultimo_erro_em, arquivo_sha256
               from pintura_status where id = 1"""
        )
        st = cur.fetchone()
        sha = st[8] if st else None
        if sha and _CACHE and _CACHE[0] == sha:
            linhas = _CACHE[1]
        else:
            cur.execute("select aba, linha_planilha, valores from pintura_linhas order by aba, linha_planilha")
            linhas = {k: [] for k in ABAS}
            for aba, n, valores in cur.fetchall():
                linhas.setdefault(aba, []).append({"linha": n, "valores": valores})
            _CACHE = (sha, linhas) if sha else None

    def _iso(v):
        return v.isoformat() if v else None

    status = None
    if st:
        status = {
            "arquivo": st[0], "colunas": st[1], "linhas": st[2], "arquivo_modificado_em": _iso(st[3]),
            "ultima_alteracao_em": _iso(st[4]), "ultima_verificacao_em": _iso(st[5]),
            "ultimo_erro": st[6], "ultimo_erro_em": _iso(st[7]),
        }
    return {"status": status, "linhas": linhas}
