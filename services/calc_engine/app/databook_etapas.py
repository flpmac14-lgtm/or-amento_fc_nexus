"""Apontamento do Data book por etapa — pedido do usuário (17/10/2026).

Igual à Usinagem/Pintura (app/apontamentos_setor.py), mas cada pedido do Data
book tem várias etapas, cada uma com Início e Finalizado:
Relatório de caldeiraria, de usinagem, de solda, de pintura, Rastreabilidade,
Montando book e Fim de book. Cada toque vira uma linha em databook_etapas
(migration 0051) — o histórico vai se montando.

Sem perder o que já estava apontado (pedido do usuário):
- Rastreabilidade usa as colunas rastreab_* do databook_itens (migration 0044)
  e o ST.BOOK RASTREABILIDADE / RASTREABILIDADE FINALIZADA como antes;
- Montando book: Início = ST.BOOK FAZENDO (grava fazendo_em);
- Fim de book: Finalizado = ST.BOOK PRONTO (grava D.FINALIZAÇÃO e AUTOR(A)).
Pedido sem linha numa dessas três etapas mostra o que já estava no Data book.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.databook import PRONTOS, RASTREAB, RASTREAB_FIM, _carregar, _salvar
from app.orcamentos_salvos import _conectar

ETAPAS: dict[str, str] = {
    "rel_caldeiraria": "Relatório de caldeiraria",
    "rel_usinagem": "Relatório de usinagem",
    "rel_solda": "Relatório de solda",
    "rel_pintura": "Relatório de pintura",
    "rastreabilidade": "Rastreabilidade",
    "montando_book": "Montando book",
    "fim_book": "Fim de book",
}
OBS_MAX = 500


def tabela_existe(cur) -> bool:
    """Antes da migration 0051 ser aplicada o Data book continua funcionando (sem etapas)."""
    cur.execute("select to_regclass('public.databook_etapas') is not null")
    return bool(cur.fetchone()[0])


def _vazio() -> dict:
    # inicio_id / fim_id: o apontamento (linha) por trás — pra ✏️ editar / 🗑 excluir na etapa.
    return {"inicio_em": None, "inicio_por": None, "fim_em": None, "fim_por": None, "obs": None,
            "inicio_id": None, "fim_id": None}


def situacao(cur, ids: list[str] | None = None) -> dict[str, dict[str, dict]]:
    """{item_id: {etapa: {inicio_em, inicio_por, fim_em, fim_por, obs}}} — só o que tem algo."""
    if not tabela_existe(cur):
        return {}
    filtro, params = ("and item_id = any(%s::uuid[])", (ids,)) if ids is not None else ("", ())
    cur.execute(
        f"""select item_id, etapa, acao, observacao, por, em, id from databook_etapas
            where not desfeito {filtro} order by em, id""",
        params,
    )
    out: dict[str, dict[str, dict]] = {}
    for item_id, etapa, acao, obs, por, em, aid in cur.fetchall():
        e = out.setdefault(str(item_id), {}).setdefault(etapa, _vazio())
        if acao == "inicio":
            # Começou de novo: o fim anterior era de outro ciclo.
            e.update(inicio_em=em.isoformat(), inicio_por=por, inicio_id=aid, fim_em=None, fim_por=None,
                     fim_id=None, obs=None)
        else:
            e.update(fim_em=em.isoformat(), fim_por=por, fim_id=aid)
        if obs:
            e["obs"] = obs
    return out


def com_legado(itens: list[dict], estado: dict[str, dict[str, dict]]) -> None:
    """Põe `etapas` em cada item: o apontado + o que já estava no Data book."""
    for i in itens:
        et = {k: dict(v) for k, v in estado.get(i["id"], {}).items()}
        if "rastreabilidade" not in et and (i.get("rastreab_inicio_em") or i.get("rastreab_fim_em")):
            et["rastreabilidade"] = {**_vazio(), "inicio_em": i.get("rastreab_inicio_em"),
                                     "inicio_por": i.get("rastreab_inicio_por"),
                                     "fim_em": i.get("rastreab_fim_em"), "fim_por": i.get("rastreab_fim_por")}
        if "montando_book" not in et and i.get("fazendo_em"):
            # Book já pronto (da planilha/ST.BOOK): a montagem terminou junto.
            et["montando_book"] = {**_vazio(), "inicio_em": i["fazendo_em"], "inicio_por": i.get("fazendo_por"),
                                   "fim_em": i.get("finalizado_em"), "fim_por": i.get("finalizado_por")}
        if "fim_book" not in et and i.get("finalizado_em"):
            et["fim_book"] = {**_vazio(), "fim_em": i["finalizado_em"], "fim_por": i.get("finalizado_por")}
        i["etapas"] = et


def _item(cur, item_id: str) -> dict:
    item = _carregar(cur, [item_id])[0]
    com_legado([item], situacao(cur, [item_id]))
    return item


def apontar(item_id: str, etapa: str, acao: str, observacao: str | None, por: str | None) -> dict:
    if etapa not in ETAPAS:
        raise ValueError(f"Etapa desconhecida: {etapa}")
    if acao not in ("inicio", "fim"):
        raise ValueError("Ação deve ser inicio ou fim.")
    obs = (observacao or "").strip()[:OBS_MAX] or None
    agora = datetime.now(timezone.utc)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select st_book from databook_itens where id = %s for update", (item_id,))
        r = cur.fetchone()
        if not r:
            raise LookupError("Pedido não encontrado no Data book.")
        st_book = r[0]
        cur.execute(
            """insert into databook_etapas (item_id, etapa, acao, observacao, por, em)
               values (%s, %s, %s, %s, %s, %s) returning id""",
            (item_id, etapa, acao, obs, por, agora),
        )
        apontamento_id = cur.fetchone()[0]

        def trocar_status(novo: str) -> None:
            # Troca o ST.BOOK e guarda qual troca foi (o 🗑 Excluir volta ela).
            _salvar(cur, [item_id], {"st_book": novo}, por)
            cur.execute(
                """update databook_etapas set st_historico_id = (
                     select id from databook_historico where item_id = %s and campo = 'st_book'
                     order by em desc, id desc limit 1) where id = %s""",
                (item_id, apontamento_id),
            )

        # Mantém o ST.BOOK e as datas que o resto do app (tabela, relatório semanal) já usa.
        if etapa == "rastreabilidade":
            if acao == "inicio":
                if st_book in (None, "Vazio", RASTREAB_FIM):
                    trocar_status(RASTREAB)
                else:  # book em andamento/pronto: só grava o início, sem trocar o ST.BOOK
                    cur.execute(
                        """update databook_itens set rastreab_inicio_em = %s, rastreab_inicio_por = %s,
                           rastreab_fim_em = null, rastreab_fim_por = null where id = %s""",
                        (agora, por, item_id),
                    )
            elif st_book == RASTREAB:
                trocar_status(RASTREAB_FIM)
            else:
                cur.execute(
                    "update databook_itens set rastreab_fim_em = %s, rastreab_fim_por = %s where id = %s",
                    (agora, por, item_id),
                )
        elif etapa == "montando_book" and acao == "inicio" and st_book not in PRONTOS:
            trocar_status("FAZENDO")
        elif etapa == "fim_book" and acao == "fim" and st_book not in PRONTOS:
            trocar_status("PRONTO")
        conn.commit()
        return _item(cur, item_id)


def historico(item_id: str) -> list[dict]:
    """Apontamentos de etapa do pedido (mais recente primeiro), inclusive os desfeitos."""
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select id, etapa, acao, observacao, por, em, desfeito from databook_etapas
               where item_id = %s order by em desc, id desc limit 300""",
            (item_id,),
        )
        return [{"id": r[0], "etapa": r[1], "acao": r[2], "observacao": r[3], "por": r[4],
                 "em": r[5].isoformat(), "desfeito": r[6]} for r in cur.fetchall()]


def _perto(a: datetime | None, b: datetime, segundos: int = 10) -> bool:
    return a is not None and abs((a - b).total_seconds()) <= segundos


def _sincronizar(cur, item_id: str, etapa: str, removido: tuple[str, datetime] | None = None) -> None:
    """Depois de editar/excluir: as colunas que o resto do app usa (rastreab_*,
    fazendo_em, finalizado_em) acompanham o que sobrou nas etapas."""
    st = situacao(cur, [item_id]).get(item_id, {}).get(etapa)
    cur.execute(
        "select st_book, rastreab_inicio_em, rastreab_fim_em, fazendo_em, finalizado_em from databook_itens where id = %s",
        (item_id,),
    )
    st_book, r_ini, r_fim, faz, fim = cur.fetchone()
    if etapa == "rastreabilidade":
        if st:
            cur.execute(
                """update databook_itens set rastreab_inicio_em = %s, rastreab_inicio_por = %s,
                   rastreab_fim_em = %s, rastreab_fim_por = %s where id = %s""",
                (st["inicio_em"], st["inicio_por"], st["fim_em"], st["fim_por"], item_id),
            )
        elif removido:  # não sobrou nada apontado: apaga o que esse apontamento tinha gravado
            acao, em = removido
            if acao == "inicio" and _perto(r_ini, em):
                cur.execute("""update databook_itens set rastreab_inicio_em = null, rastreab_inicio_por = null,
                               rastreab_fim_em = null, rastreab_fim_por = null where id = %s""", (item_id,))
            elif acao == "fim" and _perto(r_fim, em):
                cur.execute("update databook_itens set rastreab_fim_em = null, rastreab_fim_por = null where id = %s",
                            (item_id,))
    elif etapa == "montando_book" and st and st["inicio_em"] and faz:
        cur.execute("update databook_itens set fazendo_em = %s, fazendo_por = %s where id = %s",
                    (st["inicio_em"], st["inicio_por"], item_id))
    elif etapa == "fim_book" and st and st["fim_em"] and fim and st_book in PRONTOS:
        cur.execute("update databook_itens set finalizado_em = %s, finalizado_por = %s where id = %s",
                    (st["fim_em"], st["fim_por"], item_id))


# Pedido do usuário (17/10/2026): cada um só edita/exclui o que ELE apontou;
# o admin (flpmac14) mexe em qualquer um.
ADMIN = "flpmac14@gmail.com"


class SemPermissao(Exception):
    pass


def _conferir_dono(dono: str | None, por: str | None) -> None:
    quem = (por or "").strip().lower()
    if not quem:
        raise SemPermissao("Faça login de novo para editar ou excluir.")
    if quem != ADMIN and quem != (dono or "").strip().lower():
        raise SemPermissao(f"Só quem apontou ({dono or '—'}) ou o administrador pode editar/excluir este apontamento.")


def editar(apontamento_id: int, em: str | None, observacao: str | None, por: str | None) -> dict:
    """✏️ Corrige a data/hora e a observação de um apontamento (pedido do usuário)."""
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select item_id, etapa, por from databook_etapas where id = %s and not desfeito", (apontamento_id,))
        r = cur.fetchone()
        if not r:
            raise LookupError("Apontamento não encontrado (ou excluído).")
        item_id, etapa = str(r[0]), r[1]
        _conferir_dono(r[2], por)
        sets, params = [], []
        if em:
            quando = datetime.fromisoformat(em)
            if quando.tzinfo is None:
                raise ValueError("Data/hora sem fuso.")
            if quando > datetime.now(timezone.utc):
                raise ValueError("A data/hora não pode ser no futuro.")
            sets.append("em = %s")
            params.append(quando)
        sets.append("observacao = %s")
        params.append((observacao or "").strip()[:OBS_MAX] or None)
        cur.execute(f"update databook_etapas set {', '.join(sets)} where id = %s", (*params, apontamento_id))
        _sincronizar(cur, item_id, etapa)
        cur.execute("update databook_itens set editado_em = now(), editado_por = %s where id = %s", (por, item_id))
        conn.commit()
        return _item(cur, item_id)


def desfazer(apontamento_id: int, por: str | None = None) -> dict:
    """🗑 Exclui o apontamento feito errado (fica no histórico, riscado). Se foi
    ele que trocou o ST.BOOK (Rastreabilidade / Montando book / Fim de book) e
    essa ainda é a última troca, o ST.BOOK volta pro anterior também."""
    from app.databook import excluir_status

    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select por from databook_etapas where id = %s and not desfeito", (apontamento_id,))
        dono = cur.fetchone()
        if not dono:
            raise LookupError("Apontamento não encontrado (ou já excluído).")
        _conferir_dono(dono[0], por)
        cur.execute(
            """update databook_etapas set desfeito = true where id = %s and not desfeito
               returning item_id, etapa, acao, em, st_historico_id""",
            (apontamento_id,),
        )
        r = cur.fetchone()
        item_id, etapa, acao, em, st_hist = str(r[0]), r[1], r[2], r[3], r[4]
        voltar_status = False
        if st_hist:  # foi este apontamento que trocou o ST.BOOK: volta, se ainda for a última troca
            cur.execute(
                """select id from databook_historico where item_id = %s and campo = 'st_book' and not desfeito
                   order by em desc, id desc limit 1""",
                (item_id,),
            )
            ult = cur.fetchone()
            voltar_status = bool(ult and ult[0] == st_hist)
        if not voltar_status:
            _sincronizar(cur, item_id, etapa, (acao, em))
        conn.commit()
    if voltar_status:
        excluir_status(item_id, por)  # volta o ST.BOOK (e as datas) como o 🗑 da planilha
    with _conectar() as conn, conn.cursor() as cur:
        return _item(cur, item_id)


def historico_geral(dias: int = 1) -> list[dict]:
    """🕘 Histórico pra todos (pedido do usuário, 17/10/2026): tudo o que a
    Qualidade apontou no Data book no período — etapas e trocas de ST.BOOK,
    falta e observação —, mais recente primeiro, com o pedido."""
    dias = max(1, min(int(dias), 90))
    desde = datetime.now(timezone.utc) - timedelta(days=dias)
    out: list[dict] = []
    with _conectar() as conn, conn.cursor() as cur:
        if tabela_existe(cur):
            cur.execute(
                """select e.id, e.item_id, e.etapa, e.acao, e.observacao, e.por, e.em, e.desfeito
                   from databook_etapas e where e.em >= %s order by e.em desc limit 2000""",
                (desde,),
            )
            for aid, item_id, etapa, acao, obs, por, em, desfeito in cur.fetchall():
                out.append({"tipo": "etapa", "id": aid, "item_id": str(item_id), "etapa": etapa, "acao": acao,
                            "observacao": obs, "por": por, "em": em.isoformat(), "desfeito": desfeito})
        cur.execute(
            """select h.id, h.item_id, h.campo, h.de, h.para, h.por, h.em, h.desfeito from databook_historico h
               where h.em >= %s and h.campo in ('st_book', 'st_book_excluido', 'falta', 'observacao')
               order by h.em desc limit 2000""",
            (desde,),
        )
        for hid, item_id, campo, de, para, por, em, desfeito in cur.fetchall():
            out.append({"tipo": "campo", "id": hid, "item_id": str(item_id), "campo": campo, "de": de, "para": para,
                        "por": por, "em": em.isoformat(), "desfeito": desfeito})
    out.sort(key=lambda x: x["em"], reverse=True)
    return out
