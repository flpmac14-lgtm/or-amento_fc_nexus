"""Corte (laser) — ver supabase/migrations/0023_corte_programas.sql.

Pedido explícito do usuário: aba "Corte" pro operador do laser, fácil até
no celular: ele digita/toca o número do programa (o "Nº do programa" que o
projetista preenche na Croqui de corte), vê as peças do programa e marca
com um toque: Cortando, Finalizado ou Falta material.

As peças de cada programa vêm da Croqui de corte. O campo "Nº do programa"
é texto livre na planilha; formatos encontrados (30/09/2026) e como são lidos:
- "380"                         → 380
- "1198, 1199" / "449/450" / "589-590-591" / "408 , 409" → cada número
- "718 A 733"                   → faixa 718..733 (até 60 programas)
- "1059.106" / "1057.1058"      → o Excel leu "1059,1060" como decimal e
  comeu o zero do fim: o 2º número volta a ter o tamanho do 1º quando fica
  perto dele (1059.106 → 1059 e 1060); senão fica como está (1282.312 → 1282 e 312)
- "COMPRADO", "PERFIL", "TELA"... → não é programa (fica fora).
"""

from __future__ import annotations

import re
from datetime import datetime

from app.orcamentos_salvos import _conectar

MARCAS = {"cortando", "finalizado", "falta_material"}


def programas_de(texto: str | None) -> list[str]:
    if not texto:
        return []
    s = str(texto).strip()
    # Subprogramas (botão "+" na Croqui de corte) vêm separados por vírgula:
    # cada pedaço é lido sozinho ("718 A 733, 740" → faixa + 740).
    if "," in s:
        return list(dict.fromkeys(p for parte in s.split(",") for p in programas_de(parte)))
    faixa = re.fullmatch(r"\s*(\d+)\s*[aA]\s*(\d+)\s*", s)
    if faixa:
        ini, fim = int(faixa.group(1)), int(faixa.group(2))
        if 0 <= fim - ini <= 60:
            return [str(n) for n in range(ini, fim + 1)]
        return [str(ini), str(fim)]
    decimal = re.fullmatch(r"(\d+)\.(\d+)", s)
    if decimal:
        a, b = decimal.group(1), decimal.group(2)
        if len(b) < len(a):
            completo = b + "0" * (len(a) - len(b))
            if abs(int(completo) - int(a)) <= 50:
                b = completo
        return list(dict.fromkeys([str(int(a)), str(int(b))]))
    # Números soltos: "COMPRADO" não tem número; "PORCA M12 ..." também não é programa.
    if re.search(r"[A-Za-z]", s):
        return []
    return list(dict.fromkeys(str(int(n)) for n in re.findall(r"\d+", s)))


def _iso(v):
    return v.isoformat() if isinstance(v, datetime) else v


def _num(v):
    if v is None:
        return None
    f = float(v)
    return int(f) if f.is_integer() else f


def listar() -> dict:
    """Programas (mais novos primeiro) com as peças e as marcações do laser."""
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select id, pedido, mac, descricao, desenho, mp, pos, qt, qtt, un, status, projetista, n_programa, dt_feito
               from croqui_corte_itens where n_programa is not null order by linha_planilha"""
        )
        itens = cur.fetchall()
        cur.execute(
            """select programa, cortando_em, cortando_por, finalizado_em, finalizado_por,
                      falta_material_em, falta_material_por from corte_programas"""
        )
        marcas = {r[0]: r for r in cur.fetchall()}

    programas: dict[str, dict] = {}
    for (item_id, pedido, mac, descricao, desenho, mp, pos, qt, qtt, un, status, projetista, n_prog, dt_feito) in itens:
        for p in programas_de(n_prog):
            prog = programas.setdefault(p, {"programa": p, "itens": [], "liberado_em": None})
            prog["itens"].append({
                "id": str(item_id), "pedido": pedido, "mac": mac, "descricao": descricao, "desenho": desenho,
                "mp": mp, "pos": pos, "qt": _num(qt), "qtt": _num(qtt), "un": un, "status": status,
                "projetista": projetista, "n_programa": n_prog,
            })
            if dt_feito and (prog["liberado_em"] is None or dt_feito > prog["liberado_em"]):
                prog["liberado_em"] = dt_feito

    lista = []
    for p, prog in programas.items():
        m = marcas.get(p)
        prog["liberado_em"] = _iso(prog["liberado_em"])
        prog["mps"] = sorted({i["mp"] for i in prog["itens"] if i["mp"]})
        prog["pecas"] = sum(i["qtt"] or 0 for i in prog["itens"])
        prog["projetistas"] = sorted({i["projetista"] for i in prog["itens"] if i["projetista"]})
        prog["cortando_em"], prog["cortando_por"] = (_iso(m[1]), m[2]) if m else (None, None)
        prog["finalizado_em"], prog["finalizado_por"] = (_iso(m[3]), m[4]) if m else (None, None)
        prog["falta_material_em"], prog["falta_material_por"] = (_iso(m[5]), m[6]) if m else (None, None)
        lista.append(prog)
    lista.sort(key=lambda x: int(x["programa"]), reverse=True)
    return {"programas": lista}


def historico(dias: int = 90) -> dict:
    """Histórico de serviço do laser (mais recente primeiro), com material,
    peças e — nas linhas "Finalizado" — o tempo desde o último "Cortando"."""
    dias = max(1, min(int(dias), 3650))
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select id, programa, marca, valor, por, em from corte_historico
               where em >= now() - make_interval(days => %s) order by em desc, id desc""",
            (dias,),
        )
        linhas = cur.fetchall()
        # "Cortando" anterior de cada programa (pra calcular o tempo de corte).
        cur.execute("select programa, em from corte_historico where marca = 'cortando' and valor order by em")
        cortando: dict[str, list[datetime]] = {}
        for p, em in cur.fetchall():
            cortando.setdefault(p, []).append(em)
    info = {p["programa"]: p for p in listar()["programas"]}
    saida = []
    for (hid, programa, marca, valor, por, em) in linhas:
        prog = info.get(programa, {})
        minutos = None
        if marca == "finalizado" and valor:
            anteriores = [c for c in cortando.get(programa, []) if c <= em]
            if anteriores:
                minutos = round((em - anteriores[-1]).total_seconds() / 60)
        saida.append({
            "id": hid, "programa": programa, "marca": marca, "valor": valor, "por": por, "em": em.isoformat(),
            "mps": prog.get("mps", []), "pecas": prog.get("pecas"), "itens": len(prog.get("itens", [])),
            "projetistas": prog.get("projetistas", []), "minutos_corte": minutos,
        })
    return {"historico": saida}


def marcar(programa: str, marca: str, valor: bool, por: str | None) -> dict:
    """Liga/desliga uma marcação (grava quem e quando). Devolve o programa atualizado."""
    if marca not in MARCAS:
        raise ValueError(f"Marcação inválida: {marca}")
    programa = str(programa).strip()
    if not re.fullmatch(r"\d+", programa):
        raise ValueError("Número de programa inválido.")
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"""insert into corte_programas (programa, {marca}_em, {marca}_por, atualizado_em)
                values (%s, case when %s then now() end, case when %s then %s end, now())
                on conflict (programa) do update set
                  {marca}_em = case when %s then now() end,
                  {marca}_por = case when %s then %s end,
                  atualizado_em = now()""",
            (programa, valor, valor, por, valor, valor, por),
        )
        # Histórico de serviço (migration 0024) — pedido do usuário.
        cur.execute("insert into corte_historico (programa, marca, valor, por) values (%s, %s, %s, %s)",
                    (programa, marca, valor, por))
        conn.commit()
    return next((p for p in listar()["programas"] if p["programa"] == programa), {"programa": programa})
