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

from datetime import datetime, timezone

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
    return {"inicio_em": None, "inicio_por": None, "fim_em": None, "fim_por": None, "obs": None}


def situacao(cur, ids: list[str] | None = None) -> dict[str, dict[str, dict]]:
    """{item_id: {etapa: {inicio_em, inicio_por, fim_em, fim_por, obs}}} — só o que tem algo."""
    if not tabela_existe(cur):
        return {}
    filtro, params = ("and item_id = any(%s::uuid[])", (ids,)) if ids is not None else ("", ())
    cur.execute(
        f"""select item_id, etapa, acao, observacao, por, em from databook_etapas
            where not desfeito {filtro} order by em, id""",
        params,
    )
    out: dict[str, dict[str, dict]] = {}
    for item_id, etapa, acao, obs, por, em in cur.fetchall():
        e = out.setdefault(str(item_id), {}).setdefault(etapa, _vazio())
        if acao == "inicio":
            # Começou de novo: o fim anterior era de outro ciclo.
            e.update(inicio_em=em.isoformat(), inicio_por=por, fim_em=None, fim_por=None, obs=None)
        else:
            e.update(fim_em=em.isoformat(), fim_por=por)
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
            "insert into databook_etapas (item_id, etapa, acao, observacao, por, em) values (%s, %s, %s, %s, %s, %s)",
            (item_id, etapa, acao, obs, por, agora),
        )
        # Mantém o ST.BOOK e as datas que o resto do app (tabela, relatório semanal) já usa.
        if etapa == "rastreabilidade":
            if acao == "inicio":
                if st_book in (None, "Vazio", RASTREAB_FIM):
                    _salvar(cur, [item_id], {"st_book": RASTREAB}, por)
                else:  # book em andamento/pronto: só grava o início, sem trocar o ST.BOOK
                    cur.execute(
                        """update databook_itens set rastreab_inicio_em = %s, rastreab_inicio_por = %s,
                           rastreab_fim_em = null, rastreab_fim_por = null where id = %s""",
                        (agora, por, item_id),
                    )
            elif st_book == RASTREAB:
                _salvar(cur, [item_id], {"st_book": RASTREAB_FIM}, por)
            else:
                cur.execute(
                    "update databook_itens set rastreab_fim_em = %s, rastreab_fim_por = %s where id = %s",
                    (agora, por, item_id),
                )
        elif etapa == "montando_book" and acao == "inicio" and st_book not in PRONTOS:
            _salvar(cur, [item_id], {"st_book": "FAZENDO"}, por)
        elif etapa == "fim_book" and acao == "fim" and st_book not in PRONTOS:
            _salvar(cur, [item_id], {"st_book": "PRONTO"}, por)
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


def desfazer(apontamento_id: int) -> dict:
    """🗑 Apontado errado: marca como desfeito (fica no histórico, riscado).
    Não volta o ST.BOOK — pra isso há o 🗑 do ST.BOOK na tabela."""
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            "update databook_etapas set desfeito = true where id = %s and not desfeito returning item_id",
            (apontamento_id,),
        )
        r = cur.fetchone()
        if not r:
            raise LookupError("Apontamento não encontrado (ou já desfeito).")
        conn.commit()
        return _item(cur, str(r[0]))
