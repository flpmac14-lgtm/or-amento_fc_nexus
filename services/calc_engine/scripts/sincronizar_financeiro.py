"""Aba Financeiro (só flpmac14) — pedido explícito do usuário: trazer pro app
os números do "DashboardIndustrial" (app Streamlit em
Desktop\\all\\DashboardIndustrial), com as MESMAS consultas dele no ERP:
faturamento (notas de saída, Produção x Serviço pelo CFOP), custos e
despesas por grupo de conta de custo e entrada de pedidos. Depois, a pedido
do usuário, a carteira aberta saiu e entrou a tabela de NFs faturadas (mesmo
filtro do faturamento, então a soma da tabela bate com os cartões).

O ERP (SQL Server 192.168.2.100, login só leitura) só existe na rede da
fábrica, então este script roda nesta máquina (a cada 15 min, dentro de
sincronizar_controle_obras.py), lê o ERP (só SELECT — regra combinada) e
grava um resumo em financeiro_resumo (migration 0029). O site lê esse resumo
pela rota /api/financeiro, que só responde pra conta flpmac14.

Uso: python scripts/sincronizar_financeiro.py [--simular]
"""

import hashlib
import json
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")

from app.orcamentos_salvos import _conectar  # noqa: E402

ESTADO = RAIZ / "sincronizar_financeiro.estado"  # hash do último resumo gravado (fora do git)
FILIAL = "1"
MESES = 13

# Grupos = conta-pai do plano de custos; cada "1.0X" arrasta os filhos "1.0X.*"
# (igual ao DashboardIndustrial/queries.py).
GRUPOS = [
    ("1.01", "PESSOAL"),
    ("1.02", "DESPESAS FIXAS"),
    ("1.03", "PATRIMÔNIO"),
    ("1.04", "IMPOSTOS"),
    ("1.05", "CUSTOS DE FABRICAÇÃO"),
    ("1.06", "SERVIÇOS TERCEIRIZADOS"),
]
CFOP_SERVICO = {"5933", "6933", "9999"}

SQL_CARTEIRA = """
SELECT P.CODIGO, P.DTPEDIDO, P.STATUS, P.VLRBRUTO, P.DTENTREGA, P.TPPEDIDO
FROM VE_PEDIDO AS P
WHERE P.FILIAL = ? AND P.DTPEDIDO >= ? AND P.STATUS NOT IN ('C')
"""

SQL_CUSTOS = f"""
SELECT R.VLRRATEIO, R.CONTACUSTO, N.DTCONTABILIDADE
FROM FN_RATEIOCUSTO R, FN_NFE N
WHERE R.NFE = N.CODIGO
  AND N.DTCONTABILIDADE >= ?
  AND N.STATUSNF = 'F'
  AND N.TPDOCUMENTO <> 'ADT'
  AND N.TPDOCUMENTO <> 'PRE'
  AND N.FILIAL IN ('{FILIAL}')
  AND ({" OR ".join(f"R.CONTACUSTO = '{c}' OR R.CONTACUSTO LIKE '{c}.%'" for c, _ in GRUPOS)})
"""

SQL_FATURAMENTO = """
SELECT LEFT(I.CFOP, 4) AS CFOP, F.DTEMISSAO, SUM(I.VLRTOTAL) AS VLRTOTAL
FROM FN_NFSITENS I
INNER JOIN FN_NFS F ON I.NFS = F.CODIGO
WHERE F.DTEMISSAO >= ?
  AND F.ENTSAIDA = 'S'
  AND F.STATUSNF = 'F'
  AND F.FILIAL = ?
  AND F.TPDOCUMENTO IN ('NF', 'NFS', 'LOC', 'REC')
  AND I.CFOP IN (
        '5101', '5102', '6101', '6102',
        '5101A', '5102A', '6101A', '6102A',
        '5933', '5933A', '6933', '6933A', '5124', '5124A', '6124', '9999'
  )
GROUP BY LEFT(I.CFOP, 4), F.NRONOTA, F.DTEMISSAO
"""


# Uma linha por nota + CFOP (pra separar Produção x Serviço), mesmo filtro do faturamento.
# Canceladas (STATUSNF = 'C') vêm também — pedido do usuário (08/10): aparecem em
# vermelho na tabela, mas não entram na soma (o faturamento continua só 'F').
SQL_NOTAS = """
SELECT F.CODIGO, F.NRONOTA, F.DTEMISSAO,
  (SELECT TOP 1 E.RAZAO FROM VW_FN_CLIENTEENDERECO E WHERE E.CLIENTE = F.CLIENTE) AS CLIENTE,
  F.VEPEDIDO, LEFT(I.CFOP, 4) AS CFOP, SUM(I.VLRTOTAL) AS VALOR,
  P.OBRA AS MAC, P.PEDIDOCLI AS PO, MAX(I.OBRA) AS MAC_ITEM, MAX(I.PEDCOMPRA) AS PO_ITEM, F.STATUSNF
FROM FN_NFSITENS I
INNER JOIN FN_NFS F ON I.NFS = F.CODIGO
LEFT JOIN VE_PEDIDO P ON P.CODIGO = F.VEPEDIDO
WHERE F.DTEMISSAO >= ?
  AND F.ENTSAIDA = 'S'
  AND F.STATUSNF IN ('F', 'C')
  AND F.FILIAL = ?
  AND F.TPDOCUMENTO IN ('NF', 'NFS', 'LOC', 'REC')
  AND I.CFOP IN (
        '5101', '5102', '6101', '6102',
        '5101A', '5102A', '6101A', '6102A',
        '5933', '5933A', '6933', '6933A', '5124', '5124A', '6124', '9999'
  )
GROUP BY F.CODIGO, F.NRONOTA, F.DTEMISSAO, F.CLIENTE, F.VEPEDIDO, LEFT(I.CFOP, 4), P.OBRA, P.PEDIDOCLI, F.STATUSNF
"""


def _mac(obra: str | None) -> str | None:
    """Obra no formato do Follow up (MAC com 2 partes): '0924.26' / 'MAC.251.25' /
    'MAC.1131.25.10.03' → '924.26' / '251.25' / '1131.25'. Sem número (ex.:
    'EMPRESA') fica como veio."""
    obra = (obra or "").strip()
    if not obra:
        return None
    m = re.match(r"(?:MAC\.?)?0*(\d+)\.(\d{2})(?!\d)", obra, re.IGNORECASE)
    return f"{m.group(1)}.{m.group(2)}" if m else obra


def _conectar_erp():
    import pyodbc

    return pyodbc.connect(
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={os.environ['ERP_SQL_SERVER']};DATABASE={os.environ['ERP_SQL_DATABASE']};"
        f"UID={os.environ['ERP_SQL_USER']};PWD={os.environ['ERP_SQL_PASSWORD']};TrustServerCertificate=yes",
        timeout=10,
    )


def _meses(hoje: date) -> list[str]:
    a, m = hoje.year, hoje.month
    saida = []
    for _ in range(MESES):
        saida.append(f"{a:04d}-{m:02d}")
        a, m = (a, m - 1) if m > 1 else (a - 1, 12)
    return saida[::-1]


def _grupo(conta: str | None) -> str | None:
    conta = (conta or "").strip()
    for c, nome in GRUPOS:
        if conta == c or conta.startswith(c + "."):
            return nome
    return None


def montar(hoje: date | None = None) -> dict:
    hoje = hoje or date.today()
    meses = _meses(hoje)
    inicio = date(int(meses[0][:4]), int(meses[0][5:]), 1)
    faturamento = {m: {"producao": 0.0, "servico": 0.0} for m in meses}
    custos = {m: {nome: 0.0 for _, nome in GRUPOS} for m in meses}
    entrada = {m: 0.0 for m in meses}
    notas: dict[int, dict] = {}
    with _conectar_erp() as erp:
        cur = erp.cursor()
        cur.execute(SQL_FATURAMENTO, inicio, FILIAL)
        for cfop, emissao, valor in cur.fetchall():
            m = emissao.strftime("%Y-%m")
            if m in faturamento:
                faturamento[m]["servico" if cfop in CFOP_SERVICO else "producao"] += float(valor or 0)
        cur.execute(SQL_CUSTOS, inicio)
        for valor, conta, data_ref in cur.fetchall():
            m, g = data_ref.strftime("%Y-%m"), _grupo(conta)
            if m in custos and g:
                custos[m][g] += float(valor or 0)
        cur.execute(SQL_CARTEIRA, FILIAL, inicio)
        for _codigo, dt_pedido, _status, valor, _dt_entrega, _tipo in cur.fetchall():
            m = dt_pedido.strftime("%Y-%m")
            if m in entrada:
                entrada[m] += float(valor or 0)
        cur.execute(SQL_NOTAS, inicio, FILIAL)
        for codigo, nronota, emissao, cliente, pedido, cfop, valor, mac, po, mac_item, po_item, status in cur.fetchall():
            n = notas.setdefault(int(codigo), {
                # MAC e PO do cliente vêm do pedido de venda; se faltar, dos itens da nota.
                "mac": _mac(mac) or _mac(mac_item),
                "po": (po or po_item or "").strip() or None,
                "nota": (nronota or "").strip().lstrip("0") or (nronota or ""),
                "emissao": emissao.date().isoformat(),
                "cliente": (cliente or "").strip() or None,
                "pedido": str(int(pedido)) if pedido is not None else None,
                "producao": 0.0, "servico": 0.0,
                "cancelada": (status or "").strip() == "C",
            })
            n["servico" if cfop in CFOP_SERVICO else "producao"] += float(valor or 0)
    r2 = lambda d: {k: round(v, 2) for k, v in d.items()}  # noqa: E731
    return {
        "meses": meses,
        "faturamento": {m: r2(v) for m, v in faturamento.items()},
        "custos": {m: r2(v) for m, v in custos.items()},
        "grupos": [nome for _, nome in GRUPOS],
        "entrada_pedidos": r2(entrada),
        # Mais recente primeiro (pedido do usuário: "conforme vai saindo").
        "notas": [
            {**n, "producao": round(n["producao"], 2), "servico": round(n["servico"], 2),
             "total": round(n["producao"] + n["servico"], 2)}
            for _, n in sorted(notas.items(), key=lambda kv: (kv[1]["emissao"], kv[0]), reverse=True)
        ],
    }


def sincronizar(simular: bool = False) -> str | None:
    """Grava o resumo se mudou desde a última vez (None = nada mudou)."""
    dados = montar()
    texto = json.dumps(dados, ensure_ascii=False, sort_keys=True)
    assinatura = hashlib.sha256(texto.encode()).hexdigest()
    resumo = (f"{len(dados['notas'])} NFs · faturamento {dados['meses'][-1]}: "
              f"R$ {sum(dados['faturamento'][dados['meses'][-1]].values()):,.2f}")
    if simular:
        return resumo
    if ESTADO.exists() and ESTADO.read_text(encoding="utf-8").strip() == assinatura:
        return None
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """insert into financeiro_resumo (id, dados, gerado_em) values (1, %s, %s)
               on conflict (id) do update set dados = excluded.dados, gerado_em = excluded.gerado_em""",
            (texto, datetime.now(timezone.utc)),
        )
        conn.commit()
    ESTADO.write_text(assinatura, encoding="utf-8")
    return resumo


if __name__ == "__main__":
    print(sincronizar(simular="--simular" in sys.argv) or "sem alteração")
