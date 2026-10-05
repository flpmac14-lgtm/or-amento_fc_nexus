"""Apontamento por setor no Follow up — pedido explícito do usuário: o líder
da Usinagem (conta saymon) aponta pelo celular, por pedido do Follow up,
Usinando / Fim de usinagem / Falta material, qual operador está fazendo
(pedido do usuário: Cesar, Alisson, Robson, Val, Vanderson, Deivid) +
observação opcional.

Mesmo padrão do Corte (app/corte.py), mas por pedido do Follow up em vez de
programa da Croqui. Genérico por setor: pra criar outro (Solda, Montagem...)
basta acrescentar em SETORES (e a config da tela em lib/apontamento.ts).

Cada apontamento vira uma linha em apontamentos_setor (histórico completo) e
também um registro no Registro diário do item (follow_up_registros), pra
aparecer no card e no relatório do Follow up. A situação atual = o último.
Não mexe nas colunas do Follow up (ex.: USI) — pedido do usuário: não alterar
o funcionamento dos outros setores.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.orcamentos_salvos import _conectar

# Rótulo de cada status por setor (o que vai no Registro diário).
SETORES: dict[str, dict] = {
    "usinagem": {
        "nome": "Usinagem",
        "status": {"em_andamento": "Usinando", "finalizado": "Fim de usinagem", "falta_material": "Falta material"},
        "operadores": ["Cesar", "Alisson", "Robson", "Val", "Vanderson", "Deivid"],
    },
}
OBS_MAX = 1000
_BRASILIA = timezone(timedelta(hours=-3))


def _setor(setor: str) -> dict:
    if setor not in SETORES:
        raise ValueError(f"Setor desconhecido: {setor}")
    return SETORES[setor]


_COLUNAS = "id, item_id, status, operador, observacao, por, em"


def _linha(r) -> dict:
    hid, item_id, status, operador, obs, por, em = r
    return {"id": hid, "item_id": str(item_id), "status": status, "operador": operador, "observacao": obs,
            "por": por, "em": em.isoformat()}


def situacao(setor: str) -> dict:
    """Último apontamento de cada pedido no setor + a lista de operadores."""
    cfg = _setor(setor)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"""select distinct on (item_id) {_COLUNAS} from apontamentos_setor
                where setor = %s order by item_id, em desc, id desc""",
            (setor,),
        )
        atuais = [_linha(r) for r in cur.fetchall()]
    return {"setor": setor, "operadores": cfg["operadores"], "atuais": {a["item_id"]: a for a in atuais}}


def historico(setor: str, dias: int = 7) -> list[dict]:
    """Todos os apontamentos do setor nos últimos `dias` (aba Histórico)."""
    _setor(setor)
    dias = max(1, min(int(dias), 3650))
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"""select {_COLUNAS} from apontamentos_setor
                where setor = %s and em >= now() - make_interval(days => %s) order by em desc, id desc""",
            (setor, dias),
        )
        return [_linha(r) for r in cur.fetchall()]


def historico_item(setor: str, item_id: str) -> list[dict]:
    _setor(setor)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"""select {_COLUNAS} from apontamentos_setor
                where setor = %s and item_id = %s order by em desc, id desc""",
            (setor, item_id),
        )
        return [_linha(r) for r in cur.fetchall()]


def apontar(setor: str, item_id: str, status: str, operador: str | None, observacao: str | None,
            por: str | None) -> dict | None:
    """Grava o apontamento (+ Registro diário do item). None = pedido não existe."""
    cfg = _setor(setor)
    if status not in cfg["status"]:
        raise ValueError("Escolha uma das opções antes de salvar.")
    if operador not in cfg["operadores"]:
        raise ValueError("Escolha o operador antes de salvar.")
    obs = (observacao or "").strip() or None
    if obs and len(obs) > OBS_MAX:
        raise ValueError(f"Observação muito longa (máximo {OBS_MAX} caracteres).")
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select 1 from follow_up_itens where id = %s", (item_id,))
        if not cur.fetchone():
            return None
        cur.execute(
            f"""insert into apontamentos_setor (setor, item_id, status, operador, observacao, por)
                values (%s, %s, %s, %s, %s, %s) returning {_COLUNAS}""",
            (setor, item_id, status, operador, obs, por),
        )
        linha = _linha(cur.fetchone())
        texto = f"{cfg['nome']}: {cfg['status'][status]} ({operador})" + (f" — {obs}" if obs else "")
        cur.execute(
            "insert into follow_up_registros (item_id, data, texto, autor) values (%s, %s, %s, %s)",
            (item_id, datetime.now(_BRASILIA).date(), texto, por),
        )
        conn.commit()
    return linha
