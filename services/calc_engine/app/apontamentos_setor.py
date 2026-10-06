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

Depois, também a pedido do usuário (migration 0027):
- "Pausado": o operador parou pra fazer outra coisa. Ao marcar Usinando, o
  que o mesmo operador estava usinando pode ser pausado automaticamente.
- "Serviço interno Macfab": usinagem pra uso próprio (manutenção, ferramental,
  dispositivos), sem pedido no Follow up — tabela servicos_internos.
- Apontar de uma vez outros pedidos ativos com o mesmo desenho (uma linha por
  pedido, mesmo status/operador/observação).
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.orcamentos_salvos import _conectar

# Rótulo de cada status por setor (o que vai no Registro diário).
SETORES: dict[str, dict] = {
    "usinagem": {
        "nome": "Usinagem",
        "status": {"em_andamento": "Usinando", "pausado": "Pausado", "finalizado": "Fim de usinagem",
                   "falta_material": "Falta material"},
        "operadores": ["Cesar", "Alisson", "Robson", "Val", "Vanderson", "Deivid"],
    },
}
OBS_MAX = 1000
DESCRICAO_MAX = 200
OUTROS_MAX = 50  # pedidos do mesmo desenho apontados junto
SERVICO_FINALIZADO_DIAS = 7  # serviço interno finalizado sai da lista depois disso
_BRASILIA = timezone(timedelta(hours=-3))


def _setor(setor: str) -> dict:
    if setor not in SETORES:
        raise ValueError(f"Setor desconhecido: {setor}")
    return SETORES[setor]


# Sempre com o nome do serviço interno junto (o Histórico mostra serviços já encerrados).
_COLUNAS = "a.id, a.item_id, a.servico_id, s.descricao, a.status, a.operador, a.observacao, a.por, a.em"
_DE = "apontamentos_setor a left join servicos_internos s on s.id = a.servico_id"


def _linha(r) -> dict:
    hid, item_id, servico_id, servico, status, operador, obs, por, em = r
    return {"id": hid, "item_id": item_id and str(item_id), "servico_id": servico_id and str(servico_id),
            "servico": servico, "status": status, "operador": operador, "observacao": obs, "por": por,
            "em": em.isoformat()}


def _servico(r) -> dict:
    sid, descricao, quantidade, por, em = r
    return {"id": str(sid), "descricao": descricao, "quantidade": quantidade, "por": por, "em": em.isoformat()}


def situacao(setor: str) -> dict:
    """Último apontamento de cada pedido/serviço no setor, os serviços internos
    em aberto (ou finalizados há pouco) e a lista de operadores."""
    cfg = _setor(setor)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"""select distinct on (coalesce(a.item_id, a.servico_id)) {_COLUNAS} from {_DE}
                where a.setor = %s order by coalesce(a.item_id, a.servico_id), a.em desc, a.id desc""",
            (setor,),
        )
        atuais = [_linha(r) for r in cur.fetchall()]
        cur.execute(
            "select id, descricao, quantidade, por, em from servicos_internos where setor = %s order by em desc",
            (setor,),
        )
        servicos = [_servico(r) for r in cur.fetchall()]
    por_alvo = {a["item_id"] or a["servico_id"]: a for a in atuais}
    limite = datetime.now(timezone.utc) - timedelta(days=SERVICO_FINALIZADO_DIAS)
    servicos = [
        s for s in servicos
        if (a := por_alvo.get(s["id"])) is None or a["status"] != "finalizado"
        or datetime.fromisoformat(a["em"]) >= limite
    ]
    return {"setor": setor, "operadores": cfg["operadores"], "atuais": por_alvo, "servicos": servicos}


def historico(setor: str, dias: int = 7) -> list[dict]:
    """Todos os apontamentos do setor nos últimos `dias` (aba Histórico)."""
    _setor(setor)
    dias = max(1, min(int(dias), 3650))
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"""select {_COLUNAS} from {_DE}
                where a.setor = %s and a.em >= now() - make_interval(days => %s) order by a.em desc, a.id desc""",
            (setor, dias),
        )
        return [_linha(r) for r in cur.fetchall()]


def historico_alvo(setor: str, alvo_id: str, servico: bool = False) -> list[dict]:
    """Histórico de um pedido do Follow up (ou de um serviço interno)."""
    _setor(setor)
    coluna = "a.servico_id" if servico else "a.item_id"
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"""select {_COLUNAS} from {_DE}
                where a.setor = %s and {coluna} = %s order by a.em desc, a.id desc""",
            (setor, alvo_id),
        )
        return [_linha(r) for r in cur.fetchall()]


def _validar(cfg: dict, status: str, operador: str | None, observacao: str | None) -> str | None:
    if status not in cfg["status"]:
        raise ValueError("Escolha uma das opções antes de salvar.")
    if operador not in cfg["operadores"]:
        raise ValueError("Escolha o operador antes de salvar.")
    obs = (observacao or "").strip() or None
    if obs and len(obs) > OBS_MAX:
        raise ValueError(f"Observação muito longa (máximo {OBS_MAX} caracteres).")
    return obs


def _inserir(cur, setor: str, item_id: str | None, servico_id: str | None, status: str, operador: str,
             obs: str | None, por: str | None) -> int:
    cur.execute(
        """insert into apontamentos_setor (setor, item_id, servico_id, status, operador, observacao, por)
           values (%s, %s, %s, %s, %s, %s, %s) returning id""",
        (setor, item_id, servico_id, status, operador, obs, por),
    )
    return cur.fetchone()[0]


def _registro_diario(cur, cfg: dict, item_id: str, status: str, operador: str, obs: str | None,
                     por: str | None) -> None:
    texto = f"{cfg['nome']}: {cfg['status'][status]} ({operador})" + (f" — {obs}" if obs else "")
    cur.execute(
        "insert into follow_up_registros (item_id, data, texto, autor) values (%s, %s, %s, %s)",
        (item_id, datetime.now(_BRASILIA).date(), texto, por),
    )


def _pausar_outros(cur, setor: str, cfg: dict, operador: str, exceto: set[str], destino: str,
                   por: str | None) -> list[int]:
    """Ao marcar Usinando: o que o mesmo operador estava usinando vira Pausado."""
    cur.execute(
        """select item_id, servico_id from (
             select distinct on (coalesce(item_id, servico_id)) item_id, servico_id, status, operador
             from apontamentos_setor where setor = %s
             order by coalesce(item_id, servico_id), em desc, id desc) u
           where status = 'em_andamento' and operador = %s""",
        (setor, operador),
    )
    ids = []
    obs = f"Pausado automaticamente: {operador} passou para {destino}"
    for item_id, servico_id in cur.fetchall():
        item_id, servico_id = item_id and str(item_id), servico_id and str(servico_id)
        if (item_id or servico_id) in exceto:
            continue
        ids.append(_inserir(cur, setor, item_id, servico_id, "pausado", operador, obs, por))
        if item_id:
            _registro_diario(cur, cfg, item_id, "pausado", operador, obs, por)
    return ids


def _linhas(cur, ids: list[int]) -> list[dict]:
    cur.execute(f"select {_COLUNAS} from {_DE} where a.id = any(%s) order by a.id", (ids,))
    return [_linha(r) for r in cur.fetchall()]


def apontar(setor: str, item_id: str, status: str, operador: str | None, observacao: str | None,
            por: str | None, outros_itens: list[str] | None = None, pausar_outros: bool = False
            ) -> list[dict] | None:
    """Grava o apontamento do pedido (+ os `outros_itens` do mesmo desenho, se
    escolhidos) e o Registro diário de cada um. Devolve as linhas gravadas
    (inclusive as pausadas automaticamente). None = pedido não existe."""
    cfg = _setor(setor)
    obs = _validar(cfg, status, operador, observacao)
    alvos = list(dict.fromkeys([item_id, *(outros_itens or [])]))
    if len(alvos) > OUTROS_MAX + 1:
        raise ValueError(f"Pedidos demais de uma vez (máximo {OUTROS_MAX + 1}).")
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select id, desenho, po from follow_up_itens where id = any(%s::uuid[])", (alvos,))
        achados = {str(r[0]): r for r in cur.fetchall()}
        if item_id not in achados:
            return None
        alvos = [a for a in alvos if a in achados]
        ids = []
        if status == "em_andamento" and pausar_outros:
            _, desenho, po = achados[item_id]
            ids += _pausar_outros(cur, setor, cfg, operador, set(alvos), desenho or f"PO {po}", por)
        junto = f"apontado junto com mais {len(alvos) - 1} pedido(s) do mesmo desenho" if len(alvos) > 1 else None
        for alvo in alvos:
            ids.append(_inserir(cur, setor, alvo, None, status, operador, obs, por))
            _registro_diario(cur, cfg, alvo, status, operador, "; ".join(filter(None, [obs, junto])) or None, por)
        linhas = _linhas(cur, ids)
        conn.commit()
    return linhas


def apontar_servico(setor: str, servico_id: str, status: str, operador: str | None, observacao: str | None,
                    por: str | None, pausar_outros: bool = False) -> list[dict] | None:
    """Apontamento de um serviço interno Macfab já criado. None = não existe."""
    cfg = _setor(setor)
    obs = _validar(cfg, status, operador, observacao)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select descricao from servicos_internos where id = %s and setor = %s", (servico_id, setor))
        r = cur.fetchone()
        if not r:
            return None
        ids = []
        if status == "em_andamento" and pausar_outros:
            ids += _pausar_outros(cur, setor, cfg, operador, {servico_id}, f"serviço interno ({r[0]})", por)
        ids.append(_inserir(cur, setor, None, servico_id, status, operador, obs, por))
        linhas = _linhas(cur, ids)
        conn.commit()
    return linhas


def _quantidade(valor) -> int | None:
    if valor in (None, ""):
        return None
    try:
        q = int(valor)
    except (TypeError, ValueError):
        raise ValueError("Quantidade inválida.") from None
    if q <= 0:
        raise ValueError("Quantidade inválida.")
    return q


def criar_servico(setor: str, descricao: str | None, quantidade, status: str, operador: str | None,
                  observacao: str | None, por: str | None, pausar_outros: bool = False) -> dict:
    """Novo serviço interno Macfab (uso próprio) + o 1º apontamento dele."""
    cfg = _setor(setor)
    descricao = (descricao or "").strip()
    if not descricao:
        raise ValueError("Escreva o que está sendo feito no serviço interno.")
    if len(descricao) > DESCRICAO_MAX:
        raise ValueError(f"Descrição muito longa (máximo {DESCRICAO_MAX} caracteres).")
    quantidade = _quantidade(quantidade)
    obs = _validar(cfg, status, operador, observacao)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """insert into servicos_internos (setor, descricao, quantidade, por) values (%s, %s, %s, %s)
               returning id, descricao, quantidade, por, em""",
            (setor, descricao, quantidade, por),
        )
        servico = _servico(cur.fetchone())
        ids = []
        if status == "em_andamento" and pausar_outros:
            ids += _pausar_outros(cur, setor, cfg, operador, {servico["id"]}, f"serviço interno ({descricao})", por)
        ids.append(_inserir(cur, setor, None, servico["id"], status, operador, obs, por))
        linhas = _linhas(cur, ids)
        conn.commit()
    return {"servico": servico, "apontamentos": linhas}
