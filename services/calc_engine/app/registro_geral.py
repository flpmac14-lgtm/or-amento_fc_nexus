"""Registro geral — pedido explícito do usuário (13/10/2026, só o admin
flpmac14): tudo o que cada um está apontando, num painel fácil de ver e
separado por área — Caldeiraria, Usinagem, Pintura, Data book, Corte e Projeto.

Junta o que cada área já grava (sem tabela nova):
- Caldeiraria / Usinagem / Pintura: apontamentos_setor (cada apontamento).
- Data book: databook_historico (cada troca de ST.BOOK, falta, obs., exclusão).
- Corte: corte_historico (cada Cortando / Finalizado / Falta material).
- Projeto (Croqui de corte): dt_fazendo / dt_pausado / dt_feito e a última edição
  de cada pedido (a Croqui não guarda histórico completo — ver app/painel.py::registros).

Fotos (pedido do usuário, 14/10/2026): cada evento leva a 1ª foto do pedido no
Follow up (pelo PO; sem foto no PO, a de outro pedido com o mesmo desenho —
mesma regra da coluna Foto do Data book). Corte: as peças do programa na Croqui.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app import apontamentos_setor
from app.corte import programas_de
from app.databook import _fotos_do_follow_up
from app.orcamentos_salvos import _conectar
from app.painel import FUSO, hoje

AREAS = ["caldeiraria", "usinagem", "pintura", "databook", "corte", "projeto"]
NOMES = {"caldeiraria": "Caldeiraria", "usinagem": "Usinagem", "pintura": "Pintura", "databook": "Data book",
         "corte": "Corte", "projeto": "Projeto"}
_CAMPOS_DATABOOK = {"st_book": "ST.BOOK", "falta": "Falta p/ finalizar", "observacao": "Obs.",
                    "st_book_excluido": "ST.BOOK excluído"}
_MARCAS_CORTE = {"cortando": "Cortando", "finalizado": "Finalizado", "falta_material": "Falta material"}
_TIPO_STATUS = {"finalizado": "fim", "falta_material": "falta", "pausado": "pausa"}
_MAX_FOTOS = 3


# Mesmo nome pra login e nome (Croqui guarda "Honório", a edição guarda "honorio").
_NOME_POR_LOGIN = {"joao": "João", "honorio": "Honório"}


def _pessoa(u: str | None) -> str:
    if not u:
        return "—"
    u = u.strip()
    if "@" in u:
        u = u.split("@")[0]
    return _NOME_POR_LOGIN.get(u.lower(), u[:1].upper() + u[1:])


def registro(dias: int = 1) -> dict:
    dias = max(1, min(int(dias), 90))
    h = hoje()
    ini = datetime(h.year, h.month, h.day, tzinfo=FUSO) - timedelta(days=dias - 1)
    ev: list[dict] = []

    def add(area, em, usuario, acao, alvo, detalhe=None, tipo="andamento", pecas=()):
        ev.append({"area": area, "em": em.isoformat(), "usuario": _pessoa(usuario), "acao": acao, "alvo": alvo,
                   "detalhe": detalhe, "tipo": tipo, "fotos": fotos(pecas)})

    def fotos(pecas) -> list[str]:
        """Fotos do Follow up das peças (po, desenho) do evento, sem repetir."""
        achadas: list[str] = []
        for po, desenho in pecas:
            sha = por_po.get(str(po or "").strip().upper()) or por_desenho.get(str(desenho or "").strip().upper())
            if sha and sha not in achadas:
                achadas.append(sha)
                if len(achadas) >= _MAX_FOTOS:
                    break
        return achadas

    with _conectar() as conn, conn.cursor() as cur:
        por_po, por_desenho = _fotos_do_follow_up(cur)
        por_po.pop("", None)
        por_desenho.pop("", None)
        cur.execute(
            """select a.setor, a.em, a.por, a.status, a.operador, a.observacao, i.po, i.desenho, i.descricao, s.descricao
               from apontamentos_setor a
               left join follow_up_itens i on i.id = a.item_id
               left join servicos_internos s on s.id = a.servico_id
               where a.em >= %s order by a.em desc""",
            (ini,),
        )
        for setor, em, por, status, operador, obs, po, desenho, desc, servico in cur.fetchall():
            if setor not in apontamentos_setor.SETORES:
                continue
            rotulo = apontamentos_setor.SETORES[setor]["status"].get(status, status)
            alvo = f"🔧 {servico} (interno)" if servico else f"{desenho or '—'} · PO {po or '—'}"
            add(setor, em, operador or por, rotulo, alvo,
                " · ".join(x for x in [desc and not servico and desc[:60], obs and f"obs: {obs[:80]}",
                                        por and operador and por != operador.lower() and f"apontado por {por}"] if x)
                or None,
                _TIPO_STATUS.get(status, "andamento"), [] if servico else [(po, desenho)])

        # Lote (Pintura) — só o valor atual fica gravado (lotes_setor).
        cur.execute(
            """select l.setor, l.em, l.por, l.lote, i.po, i.desenho from lotes_setor l
               join follow_up_itens i on i.id = l.item_id where l.em >= %s""",
            (ini,),
        )
        for setor, em, por, lote, po, desenho in cur.fetchall():
            if setor in apontamentos_setor.SETORES:
                add(setor, em, por, f"{apontamentos_setor.SETORES[setor].get('lote') or 'Lote'}: {lote}",
                    f"{desenho or '—'} · PO {po or '—'}", None, "andamento", [(po, desenho)])

        cur.execute(
            """select h.em, h.por, h.campo, h.de, h.para, h.desfeito, d.po, d.cliente, d.descricao, d.desenho
               from databook_historico h join databook_itens d on d.id = h.item_id
               where h.em >= %s and h.campo <> 'finalizado_apagado' order by h.em desc""",
            (ini,),
        )
        for em, por, campo, de, para, desfeito, po, cli, desc, desenho in cur.fetchall():
            nome = _CAMPOS_DATABOOK.get(campo, campo)
            if campo == "st_book_excluido":
                acao, tipo = f"Excluiu {de or '—'} → voltou {para or 'sem status'}", "pausa"
            elif campo == "st_book":
                acao = f"{nome}: {para or '(vazio)'}"
                tipo = "fim" if para in ("PRONTO", "Pronto Aguardando Coleta", "RASTREABILIDADE FINALIZADA") else "andamento"
            else:
                acao, tipo = f"{nome}: {para or '(apagou)'}", "falta" if campo == "falta" and para else "andamento"
            add("databook", em, por, acao + (" (desfeito)" if desfeito else ""), f"PO {po} · {cli or '—'}",
                (desc or "")[:60] or None, tipo, [(po, desenho)])

        cur.execute(
            "select programa, marca, valor, por, em from corte_historico where em >= %s order by em desc", (ini,)
        )
        corte = cur.fetchall()
        pecas_prog: dict[str, list] = {}
        if corte:
            cur.execute("select n_programa, pedido, desenho from croqui_corte_itens where n_programa is not null")
            for n_prog, pedido, desenho in cur.fetchall():
                for p in programas_de(n_prog):
                    pecas_prog.setdefault(p, []).append((pedido, desenho))
        for prog, marca, valor, por, em in corte:
            nome = _MARCAS_CORTE.get(marca, marca)
            tipo = ("fim" if marca == "finalizado" else "falta" if marca == "falta_material" else "andamento") if valor else "pausa"
            add("corte", em, por, f"{'Marcou' if valor else 'Desmarcou'} {nome}", f"Programa {prog}", None, tipo,
                pecas_prog.get(str(prog), []))

        cur.execute(
            """select pedido, mac, descricao, desenho, projetista, status, n_programa, dt_fazendo, dt_pausado, dt_feito,
                      editado_em, editado_por
               from croqui_corte_itens
               where dt_fazendo >= %s or dt_pausado >= %s or dt_feito >= %s or editado_em >= %s""",
            (ini, ini, ini, ini),
        )
        for pedido, mac, desc, desenho, projetista, status, n_prog, dt_faz, dt_pau, dt_feito, ed_em, ed_por in cur.fetchall():
            quem = projetista or ed_por
            alvo = f"{pedido} · MAC {mac or '—'}"
            det = " · ".join(x for x in [(desc or "")[:60], n_prog and f"programa {n_prog}"] if x) or None
            marcados = set()
            for dt, acao, tipo in ((dt_faz, "Fazendo", "andamento"), (dt_pau, "Pausado", "pausa"),
                                   (dt_feito, f"{status or 'Feito'}", "fim")):
                if dt and dt >= ini:
                    add("projeto", dt, quem, acao, alvo, det, tipo, [(pedido, desenho)])
                    marcados.add(dt)
            if ed_em and ed_em >= ini and ed_em not in marcados:
                add("projeto", ed_em, ed_por, f"Editou (status {status or '—'})", alvo, det, "andamento",
                    [(pedido, desenho)])

    ev.sort(key=lambda e: e["em"], reverse=True)
    resumo = []
    for area in AREAS:
        da_area = [e for e in ev if e["area"] == area]
        pessoas: dict[str, dict] = {}
        for e in da_area:
            p = pessoas.setdefault(e["usuario"], {"usuario": e["usuario"], "total": 0, "fim": 0, "ultimo": e["em"]})
            p["total"] += 1
            p["fim"] += e["tipo"] == "fim"
        resumo.append({"area": area, "nome": NOMES[area], "total": len(da_area),
                       "concluidos": sum(e["tipo"] == "fim" for e in da_area),
                       "pessoas": sorted(pessoas.values(), key=lambda p: -p["total"])})
    return {"desde": ini.isoformat(), "dias": dias, "areas": resumo, "eventos": ev[:3000]}
