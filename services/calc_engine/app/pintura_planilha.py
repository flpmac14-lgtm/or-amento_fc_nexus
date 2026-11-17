"""Planilha NOVA e organizada da Pintura — pedido do usuário (17/11/2026).

A original (J:\\6 - PCP\\PCP-Pintura\\PCP-Pintura-Estoque.xlsx) só é lida; esta
aqui é gerada pelo script de 15 min com o estoque do app (planilha original +
entradas/saídas do felipe), o histórico de movimentos e o "vai ter tinta?".
Só regrava quando o conteúdo muda. Se alguém estiver com ela aberta no Excel,
a gravação falha e tenta de novo no próximo ciclo.
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime
from pathlib import Path

CAMINHO = os.environ.get("PINTURA_PLANILHA_APP_PATH", r"J:\6 - PCP\PCP-Pintura\PCP-Pintura-Estoque (FC Nexus).xlsx")
ESTADO = Path(__file__).resolve().parent.parent / "pintura_planilha_app.estado"

_COR_CAB = "1F4E78"
_SITUACAO = {"tem": "Tem", "vencida": "Só vencida", "zerada": "Zerada", "nao_tem": "Não tem"}


def _data(v):
    if not v:
        return None
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return v


def _data_hora(v):
    if not v:
        return None
    from datetime import timedelta, timezone

    d = datetime.fromisoformat(str(v))
    return d.astimezone(timezone(timedelta(hours=-3))).replace(tzinfo=None)


def _aba(wb, titulo, cabecalho, linhas, larguras, formatos=None):
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    ws = wb.create_sheet(titulo)
    ws.append(cabecalho)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=_COR_CAB)
        c.alignment = Alignment(vertical="center", wrap_text=True)
    for linha in linhas:
        ws.append(linha)
    for i, w in enumerate(larguras, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for col, fmt in (formatos or {}).items():
        for c in ws[col][1:]:
            c.number_format = fmt
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    ws.row_dimensions[1].height = 30
    return ws


def chave_tinta(i: dict) -> tuple[str, str]:
    """Mesma tinta = mesmo produto + mesma cor (normalizados: "AM-M. 5Y 8/12" = "AM 5 Y 8/12")."""
    from app.pintura_movimentos import norm_cor, norm_produto

    return norm_produto(i.get("produto")), norm_cor(i.get("cor"))


def totais_por_tinta(itens: list[dict]) -> dict:
    """Soma o saldo de todas as linhas (ITs) da mesma tinta."""
    totais: dict = {}
    for i in itens:
        t = totais.setdefault(chave_tinta(i), {"produto": i["produto"], "cor": i["cor"], "fabricante": i["fabricante"],
                                              "un_a": i["un_a"], "un_b": i["un_b"], "qt_a": 0.0, "qt_b": 0.0,
                                              "linhas": 0, "com_saldo": 0, "its": [], "venc": None})
        t["linhas"] += 1
        t["qt_a"] = round(t["qt_a"] + max(i["qt_a"], 0), 3)
        t["qt_b"] = round(t["qt_b"] + max(i["qt_b"], 0), 3)
        if i["qt_a"] > 0 or i["qt_b"] > 0:
            t["com_saldo"] += 1
            t["its"].append(str(i["it"]))
            v = str(i.get("venc_a") or "")[:10] or None
            if v and (t["venc"] is None or v < t["venc"]):
                t["venc"] = v
    return totais


def gerar_se_mudou() -> str | None:
    from openpyxl import Workbook
    from openpyxl.styles import PatternFill

    from app.pintura_movimentos import estoque_atual, necessidade

    dados = estoque_atual()
    nec = necessidade()
    sha = hashlib.sha256(json.dumps([dados, nec], default=str, sort_keys=True).encode()).hexdigest()
    if ESTADO.exists() and ESTADO.read_text().strip() == sha and Path(CAMINHO).exists():
        return None

    wb = Workbook()
    wb.remove(wb.active)
    hoje = date.today()
    est = sorted(dados["estoque"], key=lambda i: (int(i["it"]) if str(i["it"] or "").isdigit() else 10**9, i["chave"]))
    # Cada entrada é uma linha com IT próprio (mesmo que a tinta já exista); o total
    # da tinta (produto + cor) soma todas as linhas — pedido do usuário (17/11/2026).
    totais = totais_por_tinta(est)
    ws = _aba(
        wb, "Estoque",
        ["IT", "Origem", "Fabricante", "Produto", "Cor", "Tipo", "Local", "Saldo A", "UN A", "Lote A", "Venc. A",
         "Saldo B", "UN B", "Lote B", "Venc. B", "Diluente", "MAC", "Situação", "Total da tinta A (todas as linhas)",
         "Total da tinta B", "Linhas da tinta", "Inserido no sistema em", "Lançado por"],
        [[
            int(i["it"]) if str(i["it"] or "").isdigit() else i["it"],
            "App" if i["origem"] == "app" else "Planilha", i["fabricante"], i["produto"], i["cor"], i["tipo"], i["local"],
            i["qt_a"], i["un_a"], i["lote_a"], _data(i["venc_a"]), i["qt_b"], i["un_b"], i["lote_b"], _data(i["venc_b"]),
            i["diluente"], i["mac"],
            "Zerada" if i["qt_a"] <= 0 and i["qt_b"] <= 0
            else "Vencida" if _data(i["venc_a"]) and isinstance(_data(i["venc_a"]), date) and _data(i["venc_a"]) < hoje
            else "OK",
            totais[chave_tinta(i)]["qt_a"], totais[chave_tinta(i)]["qt_b"], totais[chave_tinta(i)]["linhas"],
            _data_hora(i["entrada_em"]), i["entrada_por"],
        ] for i in est],
        [6, 9, 13, 32, 18, 12, 7, 8, 6, 14, 10, 8, 6, 14, 10, 14, 14, 10, 14, 10, 9, 18, 12],
        {"K": "mm/yyyy", "O": "mm/yyyy", "V": "dd/mm/yyyy hh:mm"},
    )
    vermelho, amarelo, cinza = (PatternFill("solid", fgColor=c) for c in ("F8CBAD", "FFE699", "E7E6E6"))
    for row in ws.iter_rows(min_row=2):
        s = row[17].value
        if s == "Vencida":
            row[17].fill = vermelho
        elif s == "Zerada":
            for c in row:
                c.fill = cinza

    _aba(
        wb, "Total por tinta",
        ["Produto", "Cor", "Fabricante", "Saldo A (soma)", "UN A", "Saldo B (soma)", "UN B", "Linhas com saldo", "ITs",
         "Vencimento mais próximo"],
        [[
            t["produto"], t["cor"], t["fabricante"], t["qt_a"], t["un_a"], t["qt_b"], t["un_b"], t["com_saldo"],
            ", ".join(t["its"]), _data(t["venc"]),
        ] for t in sorted(totais.values(), key=lambda t: (str(t["produto"] or "").casefold(), str(t["cor"] or "")))
          if t["qt_a"] > 0 or t["qt_b"] > 0],
        [32, 18, 13, 12, 6, 12, 6, 10, 24, 12],
        {"J": "mm/yyyy"},
    )

    _aba(
        wb, "Movimentos",
        ["Seq", "Data/hora", "Tipo", "IT", "Fabricante", "Produto", "Cor", "Qt A", "UN A", "Lote A", "Venc. A",
         "Qt B", "UN B", "Lote B", "Venc. B", "Local", "MAC", "Obs.", "Lançado por", "Fotos"],
        [[
            m["seq"], _data_hora(m["em"]), "Entrada" if m["tipo"] == "entrada" else "Saída", m["it"], m["fabricante"],
            m["produto"], m["cor"], m["qt_a"], m["un_a"], m["lote_a"], _data(m["venc_a"]), m["qt_b"], m["un_b"],
            m["lote_b"], _data(m["venc_b"]), m["local"], m["mac"], m["obs"], m["por"], len(m["fotos"]),
        ] for m in dados["movimentos"]],
        [6, 16, 9, 6, 13, 32, 18, 7, 6, 14, 10, 7, 6, 14, 10, 7, 14, 30, 12, 6],
        {"B": "dd/mm/yyyy hh:mm", "K": "mm/yyyy", "O": "mm/yyyy"},
    )

    ws3 = _aba(
        wb, "Vai ter tinta",
        ["Situação", "Produto (plano)", "Cor", "Micras", "Pedidos", "Peso total (kg)", "Prazo mais próximo",
         "Saldo A no estoque", "No estoque (produto · cor · saldo)", "Pedidos (PO · MAC)"],
        [[
            _SITUACAO[g["situacao"]], g["produto"] or "(só pela cor)", g["cor"], ", ".join(str(m) for m in g["micras"]),
            len(g["pedidos"]), g["peso_total"], _data(g["pedidos"][0]["prazo"]) if g["pedidos"] else None, g["saldo_a"],
            "; ".join(f"{e['produto']} · {e['cor'] or '-'} · {e['qt_a']:g} {e['un_a'] or ''}" for e in g["estoque"]),
            "; ".join(f"{p['po']} · {p['mac'] or '-'}" for p in g["pedidos"]),
        ] for g in nec["grupos"]],
        [11, 28, 18, 10, 8, 12, 12, 10, 60, 60],
        {"G": "dd/mm/yyyy"},
    )
    verde = PatternFill("solid", fgColor="C6EFCE")
    for row in ws3.iter_rows(min_row=2):
        row[0].fill = {"Tem": verde, "Não tem": vermelho, "Zerada": vermelho, "Só vencida": amarelo}[row[0].value]

    ws4 = wb.create_sheet("Sobre")
    for linha in [
        ["Planilha gerada pelo FC Nexus a cada 15 min — NÃO editar aqui (é regravada)."],
        ["Estoque = planilha original (PCP-Pintura-Estoque.xlsx) + entradas e saídas lançadas no app."],
        [f"Gerada em {datetime.now():%d/%m/%Y %H:%M}."],
    ]:
        ws4.append(linha)
    ws4.column_dimensions["A"].width = 100

    destino = Path(CAMINHO)
    temporario = destino.with_name(f"~tmp_{destino.name}")
    wb.save(temporario)
    try:
        os.replace(temporario, destino)
    except PermissionError:
        temporario.unlink(missing_ok=True)
        raise PermissionError(f"{destino.name} está aberta no Excel — gravo no próximo ciclo.")
    ESTADO.write_text(sha)
    return f"planilha nova gravada ({len(est)} tintas, {len(dados['movimentos'])} movimentos)"
