"""Excel "Programas de corte (FC Nexus).xlsx" pra Compras puxar por PROCV.

Pedido do usuário (22/10/2026): Compras precisa ver, na coluna O (PJ) do
MACLM.xlsx, o Nº do programa que o Projeto aponta na Croqui de corte. O
sistema NÃO escreve no MACLM (33 MB, vínculos externos, consultas e
conexões que o openpyxl perderia; e o arquivo vive aberto) — grava este
arquivo pequeno ao lado, e a coluna O usa:

    =SEERRO(PROCV(N2;'J:\\6 - PCP\\PCP-CP\\[Programas de corte (FC Nexus).xlsx]Programas'!$A:$B;2;0);"")

só nas células vazias (o que Compras já digitou continua valendo — escolha do usuário).

Colunas: A PO+IT+POS, B Nº programa ("1418/1419" como Compras escreve;
número puro vira número), "N" quando o status é Sem Corte (igual à planilha).
Roda junto do sync de 15 min (scripts/sincronizar_material_compra.py).
"""

from __future__ import annotations

import hashlib
import io
import os
import re
from pathlib import Path

from app.orcamentos_salvos import _conectar

ABA = "Programas"


def _programa(n_programa: str | None, status: str | None):
    if n_programa and n_programa.strip():
        partes = [p for p in re.split(r"[,;/\s]+", n_programa.strip()) if p]
        texto = "/".join(partes)
        return int(texto) if texto.isdigit() else texto
    if status == "Sem Corte":
        return "N"
    return None


def linhas() -> list[tuple[str, object]]:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select pedido, n_programa, status from croqui_corte_itens where pedido is not null order by pedido")
        rows = cur.fetchall()
    vistos: dict[str, object] = {}
    for pedido, n_programa, status in rows:
        chave = str(pedido).strip().upper()
        valor = _programa(n_programa, status)
        if valor is not None and chave not in vistos:
            vistos[chave] = valor
    return sorted(vistos.items())


def gerar(dados: list[tuple[str, object]]) -> bytes:
    import openpyxl

    wb = openpyxl.Workbook(write_only=True)
    ws = wb.create_sheet(ABA)
    ws.append(["PO+IT+POS", "Nº programa"])
    for pedido, valor in dados:
        ws.append([pedido, valor])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def exportar(caminho: str) -> dict:
    """Regrava o arquivo só se os dados mudaram (marca o hash num arquivo .estado ao lado do script)."""
    dados = linhas()
    sha = hashlib.sha256(repr(dados).encode()).hexdigest()
    destino = Path(caminho)
    estado = Path(__file__).resolve().parent.parent / "programas_corte_excel.estado"
    if destino.exists() and estado.exists() and estado.read_text().strip() == sha:
        return {"alterado": False, "linhas": len(dados)}
    temporario = destino.with_name(destino.stem + ".tmp.xlsx")
    temporario.write_bytes(gerar(dados))
    # Troca atômica; se alguém estiver com o arquivo aberto no Excel, falha e tenta no próximo ciclo.
    os.replace(temporario, destino)
    estado.write_text(sha)
    return {"alterado": True, "linhas": len(dados)}
