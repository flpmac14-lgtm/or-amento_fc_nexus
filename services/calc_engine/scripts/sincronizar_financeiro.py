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


# --- Painel do financeiro (perfil "financeiro" — pedido do usuário, 15/10/2026) ---
# Compras recentes (pedidos de compra), contas a pagar e a receber.
DIAS_COMPRAS = 45
DIAS_PAGAR = 60  # a pagar: vencidos + vencendo nos próximos 60 dias
DIAS_BAIXAS = 15  # pagos / recebidos nos últimos 15 dias

STATUS_COMPRA = {"$": "Aprovado", "A": "Aberto", "D": "Pré-liberado", "E": "Encerrado", "L": "Liberado",
                 "V": "Confirmado", "C": "Cancelado", "R": "Recusado"}

SQL_COMPRAS = """
SELECT P.CODIGO, P.DTPEDIDO, P.DTPRAZO, P.STATUS, P.VLRTOTAL, P.VLRFRETE,
  COALESCE(NULLIF(LTRIM(RTRIM(F.FANTASIA)), ''), F.RAZAO) AS FORNECEDOR
FROM CO_PEDIDOS P
LEFT JOIN FN_FORNECEDORES F ON F.CODIGO = P.FORNECEDOR
WHERE P.FILIAL = ? AND P.DTPEDIDO >= ? AND P.STATUS NOT IN ('C', 'R')
"""

SQL_COMPRAS_ITENS = """
SELECT I.PEDIDO, I.ITEM, I.DESCRICAO, I.QTDEPED, I.UNDSUP, I.VLRTOTAL, I.DTPRAZOREC, R.OBRA
FROM CO_PEDIDOITENS I
INNER JOIN CO_PEDIDOS P ON P.CODIGO = I.PEDIDO
LEFT JOIN CO_REQUISICAO R ON R.CODIGO = I.CODREQ
WHERE P.FILIAL = ? AND P.DTPEDIDO >= ? AND P.STATUS NOT IN ('C', 'R') AND I.STATUS <> 'C'
"""

# STATUS 'A' = ativa (B = bloqueada, C = cancelada); sem DTPAGAMENTO = em aberto.
SQL_PAGAR = """
SELECT P.CODIGO, P.DTVENCIMENTO, P.DTPAGAMENTO, P.VLRDEVIDO, P.VLREFETIVO, P.NRODOCUMENTO, P.TPPAGAMENTO, P.FILIAL,
  COALESCE(NULLIF(LTRIM(RTRIM(F.FANTASIA)), ''), F.RAZAO, P.BENEFICIARIONOME) AS NOME
FROM FN_PAGAR P
LEFT JOIN FN_FORNECEDORES F ON F.CODIGO = P.CODFORNECEDOR
WHERE P.STATUS = 'A'
  AND ((P.DTPAGAMENTO IS NULL AND P.DTVENCIMENTO <= ?) OR P.DTPAGAMENTO >= ?)
"""

SQL_RECEBER = """
SELECT R.CODIGO, R.DTVENCIMENTO, R.DTPAGAMENTO, R.VLRDEVIDO, R.VLREFETIVO, R.NRODOCUMENTO, R.TPPAGAMENTO,
  (SELECT TOP 1 E.RAZAO FROM VW_FN_CLIENTEENDERECO E WHERE E.CLIENTE = R.CODCLIENTE) AS CLIENTE, R.NRONOTA
FROM FN_RECEBER R
WHERE R.STATUS = 'A' AND R.FILIAL = ?
  AND (R.DTPAGAMENTO IS NULL OR R.DTPAGAMENTO >= ?)
"""

# Forma de pagamento: só os códigos de significado certo; o resto vai como veio.
FORMAS = {"BLQ": "Boleto", "PIX": "PIX", "TED": "TED", "DOC": "DOC", "CH": "Cheque"}


def _texto(v) -> str | None:
    v = (v or "").strip() if isinstance(v, str) else v
    return v or None


def _dia(v) -> str | None:
    return v.date().isoformat() if v else None


def _painel(cur, hoje: date) -> dict:
    from datetime import timedelta

    ini_compras = hoje - timedelta(days=DIAS_COMPRAS)
    ini_baixas = hoje - timedelta(days=DIAS_BAIXAS)
    compras: dict[int, dict] = {}
    cur.execute(SQL_COMPRAS, FILIAL, ini_compras)
    for codigo, dt, prazo, status, total, frete, fornecedor in cur.fetchall():
        st = (status or "").strip()
        compras[int(codigo)] = {"pedido": str(int(codigo)), "data": _dia(dt), "prazo": _dia(prazo), "status": st,
                                "status_rotulo": STATUS_COMPRA.get(st, st), "fornecedor": _texto(fornecedor),
                                "total": round(float(total or 0), 2), "frete": round(float(frete or 0), 2),
                                "obras": [], "itens": []}
    cur.execute(SQL_COMPRAS_ITENS, FILIAL, ini_compras)
    for pedido, item, descricao, qtd, und, total, prazo, obra in cur.fetchall():
        c = compras.get(int(pedido))
        if not c:
            continue
        mac = _mac(obra)
        c["itens"].append({"item": _texto(item), "descricao": _texto(descricao), "qtd": float(qtd or 0),
                           "und": _texto(und), "total": round(float(total or 0), 2), "obra": mac,
                           "prazo": _dia(prazo)})
        if mac and mac not in c["obras"]:
            c["obras"].append(mac)
    for c in compras.values():
        c["itens"].sort(key=lambda i: i["item"] or "")

    pagar_aberto, pagos = [], []
    cur.execute(SQL_PAGAR, hoje + timedelta(days=DIAS_PAGAR), ini_baixas)
    for codigo, venc, pago, devido, efetivo, doc, forma, filial, nome in cur.fetchall():
        t = {"id": int(codigo), "vencimento": _dia(venc), "nome": _texto(nome), "documento": _texto(doc),
             "forma": FORMAS.get((forma or "").strip(), _texto(forma)), "filial": int(filial or 1)}
        if pago:
            pagos.append({**t, "pago_em": _dia(pago), "valor": round(float(efetivo or devido or 0), 2)})
        else:
            pagar_aberto.append({**t, "valor": round(float(devido or 0), 2)})

    receber_aberto, recebidos = [], []
    cur.execute(SQL_RECEBER, FILIAL, ini_baixas)
    for codigo, venc, pago, devido, efetivo, doc, forma, cliente, nota in cur.fetchall():
        t = {"id": int(codigo), "vencimento": _dia(venc), "nome": _texto(cliente), "documento": _texto(doc),
             "nota": (_texto(nota) or "").lstrip("0") or None, "forma": FORMAS.get((forma or "").strip(), _texto(forma))}
        if pago:
            recebidos.append({**t, "pago_em": _dia(pago), "valor": round(float(efetivo or devido or 0), 2)})
        else:
            receber_aberto.append({**t, "valor": round(float(devido or 0), 2)})

    por_venc = lambda t: (t["vencimento"] or "", t["id"])  # noqa: E731
    por_baixa = lambda t: (t["pago_em"] or "", t["id"])  # noqa: E731
    return {
        "hoje": hoje.isoformat(),
        "compras": sorted(compras.values(), key=lambda c: (c["data"] or "", int(c["pedido"])), reverse=True),
        "pagar": {"abertos": sorted(pagar_aberto, key=por_venc), "pagos": sorted(pagos, key=por_baixa, reverse=True)},
        "receber": {"abertos": sorted(receber_aberto, key=por_venc),
                    "recebidos": sorted(recebidos, key=por_baixa, reverse=True)},
    }


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
        painel = _painel(cur, hoje)
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
        **painel,
    }


def sincronizar(simular: bool = False) -> str | None:
    """Grava o resumo se mudou desde a última vez (None = nada mudou)."""
    dados = montar()
    texto = json.dumps(dados, ensure_ascii=False, sort_keys=True)
    assinatura = hashlib.sha256(texto.encode()).hexdigest()
    resumo = (f"{len(dados['notas'])} NFs · {len(dados['compras'])} compras · "
              f"{len(dados['pagar']['abertos'])} a pagar · {len(dados['receber']['abertos'])} a receber · faturamento {dados['meses'][-1]}: "
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


# --- Pedidos de venda (aba Financeiro → Pedidos) -----------------------------
# Pedido do usuário (17/10/2026): consulta passada por ele, do jeito que veio
# (obra com 4 dígitos, PO do cliente com o item tirado do "ITEM nn" da
# descrição, status por item, semana ISO da entrega). Um item por linha.
ESTADO_PEDIDOS = RAIZ / "sincronizar_financeiro_pedidos.estado"  # hash (fora do git)
SQL_PEDIDOS_VENDA = r"""
SELECT
P.CODIGO AS [PEDIDO],
CASE
WHEN CHARINDEX('.', REPLACE(P.OBRA, 'MAC.', '')) > 0 THEN RIGHT('0000' + LEFT(REPLACE(P.OBRA, 'MAC.', ''), CHARINDEX('.', REPLACE(P.OBRA, 'MAC.', '')) - 1), 4) + SUBSTRING(REPLACE(P.OBRA, 'MAC.', ''), CHARINDEX('.', REPLACE(P.OBRA, 'MAC.', '')), 10)
ELSE REPLACE(P.OBRA, 'MAC.', '') END AS [OBRA],
(SELECT X.DESCRICAO FROM VE_OBRA AS X WHERE X.CODIGO = P.OBRA) AS [OBRA DESC],
CASE
WHEN CHARINDEX(' METI', REVERSE(RTRIM(CAST(PI.OBS AS VARCHAR(MAX))))) > 0 THEN P.PEDIDOCLI + '-' + LEFT(SUBSTRING(RTRIM(CAST(PI.OBS AS VARCHAR(MAX))), LEN(RTRIM(CAST(PI.OBS AS VARCHAR(MAX)))) - CHARINDEX(' METI', REVERSE(RTRIM(CAST(PI.OBS AS VARCHAR(MAX))))) + 2, 20), PATINDEX('%[^0-9]%', SUBSTRING(RTRIM(CAST(PI.OBS AS VARCHAR(MAX))), LEN(RTRIM(CAST(PI.OBS AS VARCHAR(MAX)))) - CHARINDEX(' METI', REVERSE(RTRIM(CAST(PI.OBS AS VARCHAR(MAX))))) + 2, 20) + 'X') - 1)
ELSE P.PEDIDOCLI END AS [PEDIDO CLIENTE],
CASE
WHEN PI.STATUS = 'A' THEN 'EM ABERTO'
WHEN PI.STATUS = 'L' THEN 'LIBERADO'
WHEN PI.STATUS = 'F' THEN 'FATURADO'
WHEN PI.STATUS = 'C' THEN 'CANCELADO'
WHEN PI.STATUS = 'P' THEN 'EM PRODUCAO'
ELSE 'FATURADO' END AS STATUS,
PI.MATERIAL,
PI.OBS AS [DESC MATERIAL],
PI.QTDE,
PI.VLRTOTAL,
CONVERT(VARCHAR(10), P.DTENTREGA, 103) AS [PREV ENTREGA],
'W' + RIGHT(CAST(YEAR(P.DTENTREGA) AS VARCHAR(4)), 2) + RIGHT('0' + CAST(DATEPART(ISO_WEEK, P.DTENTREGA) AS VARCHAR(2)), 2) AS [ANO-SEM ENTREGA],
(SELECT X.FANTASIA FROM FN_FORNECEDORES AS X WHERE X.CODIGO = P.CLIENTE) AS CLIENTE
FROM VE_PEDIDOITENS AS PI
LEFT JOIN VE_PEDIDO AS P ON P.CODIGO = PI.PEDIDO
WHERE P.DTPEDIDO >= '20240101'
ORDER BY P.CODIGO DESC
"""
# Colunas gravadas (cada pedido vira uma lista, nessa ordem — ocupa bem menos que dicionário).
COLUNAS_PEDIDOS = ["pedido", "obra", "obra_desc", "pedido_cliente", "status", "material", "descricao", "qtde",
                   "valor", "entrega", "ano_semana", "cliente"]


def montar_pedidos() -> dict:
    linhas = []
    with _conectar_erp() as erp:
        cur = erp.cursor()
        cur.execute(SQL_PEDIDOS_VENDA)
        for pedido, obra, obra_desc, po, status, material, desc, qtde, valor, entrega, ano_sem, cliente in cur.fetchall():
            # "21/10/2026" → "2026-10-21"
            iso = None
            if entrega and len(entrega.strip()) == 10:
                d, m, a = entrega.strip().split("/")
                iso = f"{a}-{m}-{d}"
            linhas.append([
                str(int(pedido)) if pedido is not None else None, _texto(obra), _texto(obra_desc), _texto(po),
                _texto(status), _texto(material), _texto(desc), float(qtde or 0), round(float(valor or 0), 2),
                iso, _texto(ano_sem), _texto(cliente),
            ])
    return {"colunas": COLUNAS_PEDIDOS, "linhas": linhas, "comparativo": comparar_com_follow_up(linhas)}


# --- Pedido - ativo (comparativo) --------------------------------------------
# Pedido do usuário (17/10/2026): pros pedidos ATIVOS do Follow up (ST = A,
# filha da Controle de obras — descrição, MAC etc. vêm de lá), saber se já foi
# dada entrada no Sectra e em que situação está, e achar duplicidade. A
# referência é o número do pedido do cliente + item ("4501742482-010" no
# Follow up = "4501742482-10" no Sectra).

def chave_po(po: str | None, descricao: str | None = None) -> tuple[str, int | None]:
    po = re.sub(r"\s+", "", (po or "").upper())
    m = re.match(r"^(.*?)-0*(\d+)$", po)
    if m:
        return m.group(1), int(m.group(2))
    # Sectra sem o "ITEM nn" na descrição: às vezes o item vem só como "... - 10" no fim.
    m = re.search(r"-\s*0*(\d{1,4})\s*$", descricao or "")
    return po, (int(m.group(1)) if m else None)


ABERTOS_ERP = {"EM ABERTO", "LIBERADO", "EM PRODUCAO"}


def comparar_com_follow_up(linhas: list[list]) -> dict:
    col = {c: i for i, c in enumerate(COLUNAS_PEDIDOS)}
    erp: dict[tuple, list[list]] = {}
    for l in linhas:
        erp.setdefault(chave_po(l[col["pedido_cliente"]], l[col["descricao"]]), []).append(l)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select po, mac, cliente, desenho, descricao, quantidade, prazo_contratual, status
               from follow_up_itens where st = 'A' and presente_na_ultima_importacao order by po"""
        )
        ativos = cur.fetchall()
    vistos: dict[tuple, int] = {}
    for a in ativos:
        k = chave_po(a[0])
        vistos[k] = vistos.get(k, 0) + 1
    itens = []
    for po, mac, cliente, desenho, descricao, qtd, prazo, status_fu in ativos:
        k = chave_po(po)
        ls = erp.get(k, [])
        validas = [l for l in ls if l[col["status"]] != "CANCELADO"]
        pedidos = sorted({l[col["pedido"]] for l in ls}, key=lambda x: int(x or 0))
        status_erp = sorted({l[col["status"]] for l in ls})
        alertas = []
        if not ls:
            situacao = "sem_entrada"
        elif not validas:
            situacao = "cancelado"
        elif all(l[col["status"]] == "FATURADO" for l in validas):
            situacao = "faturado"
        else:
            situacao = "em_aberto"
        if len(validas) > 1:
            alertas.append(f"Duplicado no Sectra: {len(validas)} linhas (pedido {', '.join(sorted({l[col['pedido']] for l in validas}))})")
        if vistos[k] > 1:
            alertas.append(f"Duplicado no Follow up: {vistos[k]} linhas ativas com esse pedido/item")
        qtd_erp = sum(l[col["qtde"]] for l in validas)
        if validas and qtd and abs(float(qtd) - qtd_erp) > 0.001 and len(validas) == 1:
            alertas.append(f"Quantidade diferente: Follow up {float(qtd):g} × Sectra {qtd_erp:g}")
        itens.append({
            "po": po, "mac": mac, "cliente": cliente, "desenho": desenho, "descricao": descricao,
            "qtd": float(qtd) if qtd is not None else None, "prazo": prazo.isoformat() if prazo else None,
            "status_fu": status_fu, "situacao": situacao, "duplicado": len(validas) > 1 or vistos[k] > 1,
            "pedidos": pedidos, "status_erp": status_erp, "qtd_erp": qtd_erp if validas else None,
            "valor": round(sum(l[col["valor"]] for l in validas), 2) if validas else None,
            "entrega": min((l[col["entrega"]] for l in validas if l[col["entrega"]]), default=None),
            "cliente_erp": next((l[col["cliente"]] for l in validas), None), "alertas": alertas,
        })
    # Ao contrário: em aberto no Sectra sem pedido ativo no Follow up.
    so_sectra = []
    for k, ls in erp.items():
        if k in vistos:
            continue
        for l in ls:
            if l[col["status"]] in ABERTOS_ERP:
                so_sectra.append({c: l[i] for c, i in col.items()})
    so_sectra.sort(key=lambda x: (-(int(x["pedido"] or 0)), x["pedido_cliente"] or ""))
    return {"itens": itens, "so_sectra": so_sectra}


def sincronizar_pedidos(simular: bool = False) -> str | None:
    """Grava os pedidos de venda se mudaram (None = nada mudou)."""
    dados = montar_pedidos()
    texto = json.dumps(dados, ensure_ascii=False, sort_keys=True)
    assinatura = hashlib.sha256(texto.encode()).hexdigest()
    comp = dados["comparativo"]["itens"]
    resumo = (f"{len(dados['linhas'])} itens de pedido de venda ({len({l[0] for l in dados['linhas']})} pedidos) · "
              f"ativos: {sum(i['situacao'] == 'sem_entrada' for i in comp)} sem entrada, "
              f"{sum(i['duplicado'] for i in comp)} duplicados")
    if simular:
        return resumo
    if ESTADO_PEDIDOS.exists() and ESTADO_PEDIDOS.read_text(encoding="utf-8").strip() == assinatura:
        return None
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """insert into financeiro_pedidos (id, dados, gerado_em) values (1, %s, %s)
               on conflict (id) do update set dados = excluded.dados, gerado_em = excluded.gerado_em""",
            (texto, datetime.now(timezone.utc)),
        )
        conn.commit()
    ESTADO_PEDIDOS.write_text(assinatura, encoding="utf-8")
    return resumo


# --- NF de cada pedido (relatório de coleta) ---------------------------------
# Pedido do usuário (20/10/2026): opção "com Nota fiscal" no relatório de
# coleta, com a NF de cada pedido e o dia de emissão vindos do ERP. Cada item
# de NF de saída guarda o pedido do cliente e o item (PEDCOMPRA +
# PEDCOMPRAITEM: 4501690746 + 10 = 4501690746-010 do Follow up). Só número e
# data de emissão (nada de valor) — tabela follow_up_notas_fiscais (0054).
# Romaneio (pedido do usuário, 24/10/2026): também a quantidade do item em
# cada NF (item fracionado em 2+ notas) — po → [[NF, emissão, qtde], …].
ESTADO_NOTAS_PEDIDO = RAIZ / "sincronizar_financeiro_notas_pedido.estado"  # hash (fora do git)
DIAS_NOTAS_PEDIDO = 400
SQL_NOTAS_PEDIDO = """
SELECT F.NRONOTA, F.DTEMISSAO, I.PEDCOMPRA, I.PEDCOMPRAITEM, SUM(I.QTDE)
FROM FN_NFSITENS I
INNER JOIN FN_NFS F ON I.NFS = F.CODIGO
WHERE F.DTEMISSAO >= ? AND F.ENTSAIDA = 'S' AND F.STATUSNF = 'F' AND F.FILIAL = ?
GROUP BY F.NRONOTA, F.DTEMISSAO, I.PEDCOMPRA, I.PEDCOMPRAITEM
"""


def montar_notas_pedido(hoje: date | None = None) -> dict:
    from datetime import timedelta

    hoje = hoje or date.today()
    por_po: dict[str, list[list]] = {}
    por_nf: dict[str, str] = {}
    with _conectar_erp() as erp:
        cur = erp.cursor()
        cur.execute(SQL_NOTAS_PEDIDO, hoje - timedelta(days=DIAS_NOTAS_PEDIDO), FILIAL)
        for nronota, emissao, pedcompra, item, qtde in cur.fetchall():
            nf = (nronota or "").strip().lstrip("0")
            if not nf or not emissao:
                continue
            dia = emissao.date().isoformat()
            por_nf[nf] = dia
            po = re.sub(r"\s+", "", (pedcompra or "").upper())
            if po and item is not None:
                lista = por_po.setdefault(f"{po}-{int(item):03d}", [])
                q = float(qtde or 0)
                lista.append([nf, dia, int(q) if q.is_integer() else round(q, 4)])
    for lista in por_po.values():
        lista.sort(key=lambda n: (n[1], int(n[0]) if n[0].isdigit() else 0))
    return {"po": por_po, "nf": por_nf}


def sincronizar_notas_pedido(simular: bool = False) -> str | None:
    """Grava NF × pedido se mudou (None = nada mudou)."""
    dados = montar_notas_pedido()
    texto = json.dumps(dados, ensure_ascii=False, sort_keys=True)
    assinatura = hashlib.sha256(texto.encode()).hexdigest()
    resumo = f"{len(dados['nf'])} NFs · {len(dados['po'])} pedidos/itens com NF"
    if simular:
        return resumo
    if ESTADO_NOTAS_PEDIDO.exists() and ESTADO_NOTAS_PEDIDO.read_text(encoding="utf-8").strip() == assinatura:
        return None
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """insert into follow_up_notas_fiscais (id, dados, gerado_em) values (1, %s, %s)
               on conflict (id) do update set dados = excluded.dados, gerado_em = excluded.gerado_em""",
            (texto, datetime.now(timezone.utc)),
        )
        conn.commit()
    ESTADO_NOTAS_PEDIDO.write_text(assinatura, encoding="utf-8")
    return resumo


# --- Compras de terceiros de cada item (coluna "Compra / Retorno") ------------
# Pedido do usuário (24/10/2026): no Sectra (ERP) os serviços terceirizados
# têm pedido de compra (CO_PEDIDOS/CO_PEDIDOITENS) e, conforme os itens voltam,
# o Financeiro dá entrada nas notas (FN_NFE). Não há chave com o Follow up: o
# nº do desenho vem escrito no texto — na OBS do item do pedido de compra, na
# OBS do item de serviço da NF de entrada e na DETALHADA da nossa remessa
# (FN_NFSITENS, CFOP 59xx/69xx), que a linha "DEVOLUCAO DA NF…" da entrada
# aponta (NFSITENS). Para cada item do Follow up procura o desenho nesses
# textos; se o texto cita uma MAC (723.26) diferente da do item, descarta.
# Só número, data, fornecedor, quantidade e status (nada de valor) — tabela
# follow_up_compras (0058), chave = id do item do Follow up.
ESTADO_COMPRAS = RAIZ / "sincronizar_financeiro_compras.estado"  # hash (fora do git)
DIAS_COMPRAS = 400
SQL_COMPRAS_PC = """
SELECT P.CODIGO, I.ITEM, P.DTPEDIDO, FO.FANTASIA, I.QTDEPED, I.STATUS,
       CAST(I.DESCRICAO AS varchar(max)), CAST(I.OBS AS varchar(max))
FROM CO_PEDIDOITENS I
INNER JOIN CO_PEDIDOS P ON P.CODIGO = I.PEDIDO
LEFT JOIN FN_FORNECEDORES FO ON FO.CODIGO = P.FORNECEDOR
WHERE P.FILIAL = ? AND P.DTPEDIDO >= ?
"""
SQL_COMPRAS_REMESSA = """
SELECT I.CODIGO, F.NRONOTA, F.DTEMISSAO, I.QTDE, I.OBRA,
       CAST(I.DESCRICAO AS varchar(max)), CAST(I.DETALHADA AS varchar(max))
FROM FN_NFSITENS I
INNER JOIN FN_NFS F ON F.CODIGO = I.NFS
WHERE F.FILIAL = ? AND F.DTEMISSAO >= ? AND F.ENTSAIDA = 'S' AND F.STATUSNF = 'F'
  AND (I.CFOP LIKE '59%' OR I.CFOP LIKE '69%')
"""
SQL_COMPRAS_ENTRADA = """
SELECT E.CODIGO, E.NRODOCUMENTO, E.DTENTRADA, FO.FANTASIA, I.QTDE, I.OBRA, I.CFOP, I.NFSITENS,
       CAST(I.DESCRICAO AS varchar(max)), CAST(I.OBS AS varchar(max))
FROM FN_NFEITENS I
INNER JOIN FN_NFE E ON E.CODIGO = I.NFE
LEFT JOIN FN_FORNECEDORES FO ON FO.CODIGO = E.FORNECEDOR
WHERE E.FILIAL = ? AND E.DTENTRADA >= ?
"""
SQL_COMPRAS_NFE_PC = "SELECT NFE, PEDIDO FROM VW_FN_NFE_PEDIDO"
# Retorno de remessa (industrialização / conserto) — o resto é "entrada" (serviço).
CFOP_RETORNO = ("1902", "2902", "1903", "2903", "1916", "2916", "1925", "2925")
RE_MAC_TEXTO = re.compile(r"(?<![\d.,])0*(\d{3,4})\.(\d{2})(?![\d,])")


def _texto_norm(s: str | None) -> str:
    return " " + re.sub(r"[^A-Z0-9]+", " ", (s or "").upper()).strip() + " "


def _obra(s: str | None) -> str:
    """'0723.26' / 'MAC.723.26.10' → '723.26' ('' se não tiver)."""
    m = RE_MAC_TEXTO.search(s or "")
    return f"{int(m.group(1))}.{m.group(2)}" if m else ""


def _obras_citadas(s: str | None) -> set[str]:
    return {f"{int(a)}.{b}" for a, b in RE_MAC_TEXTO.findall(s or "")}


def _num(v) -> float | int:
    q = float(v or 0)
    return int(q) if q.is_integer() else round(q, 4)


def _dia(v) -> str | None:
    return v.date().isoformat() if v else None


def _fornecedor(s: str | None) -> str:
    return re.sub(r"\s+", " ", (s or "").strip())


def montar_compras(itens: list[tuple[str, str, str]], hoje: date | None = None) -> dict:
    """itens = [(id, desenho, mac)] do Follow up → {id: {"pc": […], "rem": […], "ent": […]}}."""
    from datetime import timedelta

    desde = (hoje or date.today()) - timedelta(days=DIAS_COMPRAS)
    # Textos do Sectra: (tipo, registro, texto normalizado, obras citadas / obra do item)
    textos: list[tuple[str, dict, str, set[str]]] = []
    with _conectar_erp() as erp:
        cur = erp.cursor()
        cur.execute(SQL_COMPRAS_NFE_PC)
        pcs_da_nfe: dict[int, list[int]] = {}
        for nfe, pedido in cur.fetchall():
            if pedido is not None:
                pcs_da_nfe.setdefault(int(nfe), []).append(int(pedido))
        cur.execute(SQL_COMPRAS_PC, FILIAL, desde)
        for pedido, item, dt, forn, qtd, status, descr, obs in cur.fetchall():
            texto = f"{descr or ''} {obs or ''}"
            reg = {"pc": int(pedido), "it": (item or "").strip(), "d": _dia(dt), "f": _fornecedor(forn),
                   "q": _num(qtd), "s": (status or "").strip()}
            textos.append(("pc", reg, _texto_norm(texto), _obras_citadas(texto)))
        cur.execute(SQL_COMPRAS_REMESSA, FILIAL, desde)
        remessas: dict[int, tuple[dict, str, set[str]]] = {}
        for codigo, nota, dt, qtd, obra, descr, det in cur.fetchall():
            texto = f"{descr or ''} {det or ''}"
            reg = {"nf": (nota or "").strip().lstrip("0"), "d": _dia(dt), "q": _num(qtd)}
            obras = {_obra(obra)} - {""} or _obras_citadas(texto)
            remessas[int(codigo)] = (reg, _texto_norm(texto), obras)
            textos.append(("rem", reg, _texto_norm(texto), obras))
        cur.execute(SQL_COMPRAS_ENTRADA, FILIAL, desde)
        for nfe, nota, dt, forn, qtd, obra, cfop, nfsitem, descr, obs in cur.fetchall():
            reg = {"nf": (nota or "").strip().lstrip("0"), "d": _dia(dt), "f": _fornecedor(forn), "q": _num(qtd),
                   "t": "R" if (cfop or "").strip()[:4] in CFOP_RETORNO else "S",
                   "pc": sorted(set(pcs_da_nfe.get(int(nfe), [])))}
            if nfsitem is not None and int(nfsitem) in remessas:
                # "DEVOLUCAO DA NF…": o desenho está na nossa remessa.
                rem, norm, obras = remessas[int(nfsitem)]
                reg["rem"] = rem["nf"]
                textos.append(("ent", reg, norm, obras))
            elif obs:
                texto = f"{descr or ''} {obs}"
                textos.append(("ent", reg, _texto_norm(texto), ({_obra(obra)} - {""}) | _obras_citadas(texto)))

    # Índice por palavra pra não testar cada desenho contra todos os textos.
    indice: dict[str, list[int]] = {}
    for n, (_, _, norm, _) in enumerate(textos):
        for palavra in set(norm.split()):
            indice.setdefault(palavra, []).append(n)

    saida: dict[str, dict] = {}
    for item_id, desenho, mac in itens:
        alvo = _texto_norm(desenho).strip()
        palavras = alvo.split()
        if len(alvo.replace(" ", "")) < 6 or not palavras:
            continue
        obra_item = _obra(mac)
        achado: dict[str, list[dict]] = {}
        for n in indice.get(palavras[0], []):
            tipo, reg, norm, obras = textos[n]
            if f" {alvo} " not in norm:
                continue
            if obras and obra_item and obra_item not in obras:
                continue  # o texto é de outra MAC
            if reg not in achado.setdefault(tipo, []):
                achado[tipo].append(reg)
        if achado:
            for lista in achado.values():
                lista.sort(key=lambda r: (r.get("d") or "", str(r.get("pc") or r.get("nf"))))
            saida[str(item_id)] = achado
    return saida


def sincronizar_compras(simular: bool = False) -> str | None:
    """Grava pedido de compra / remessa / NF de entrada de cada item se mudou (None = nada mudou)."""
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select id, desenho, mac from follow_up_itens where coalesce(desenho, '') <> ''")
        itens = [(str(i), d, m) for i, d, m in cur.fetchall()]
    dados = montar_compras(itens)
    texto = json.dumps(dados, ensure_ascii=False, sort_keys=True)
    assinatura = hashlib.sha256(texto.encode()).hexdigest()
    conta = lambda t: sum(1 for v in dados.values() if t in v)  # noqa: E731
    resumo = f"{len(dados)} itens · {conta('pc')} com pedido de compra · {conta('ent')} com NF de entrada"
    if simular:
        return resumo
    if ESTADO_COMPRAS.exists() and ESTADO_COMPRAS.read_text(encoding="utf-8").strip() == assinatura:
        return None
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """insert into follow_up_compras (id, dados, gerado_em) values (1, %s, %s)
               on conflict (id) do update set dados = excluded.dados, gerado_em = excluded.gerado_em""",
            (texto, datetime.now(timezone.utc)),
        )
        conn.commit()
    ESTADO_COMPRAS.write_text(assinatura, encoding="utf-8")
    return resumo


if __name__ == "__main__":
    print(sincronizar(simular="--simular" in sys.argv) or "sem alteração")
    print(sincronizar_pedidos(simular="--simular" in sys.argv) or "pedidos: sem alteração")
    print(sincronizar_notas_pedido(simular="--simular" in sys.argv) or "NF × pedido: sem alteração")
