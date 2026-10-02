"""Tela inicial "Visão Geral" — torre de controle da fábrica (pedido do usuário).

Uma função por bloco (cada uma vira um endpoint /painel/..., carregado de
forma independente pela tela). Regras combinadas com o usuário (02/10/2026):

- Obra = MAC com 2 partes ("690.25" junta 690.25.20.01, 690.25.20.02...),
  mesmo critério do relatório por obra (obraDoItem em lib/followUp.ts).
- Data prevista de entrega = data da Coleta (coleta_data), que o usuário
  digita no Follow up. O sistema não calcula nem sugere coleta.
- Prazo do cliente = prazo_contratual do pedido.
- Entregue = pedido com ST = "E"; ativo = ST = "A".
- Pronto = Status "Pronto" (todas as etapas ENG..PIN = 100, fórmula da planilha).
  Etapa vazia conta como "falta" (igual à planilha) — não há "não se aplica".
- Sem log de auditoria por enquanto: "Registros do dia" junta o que as
  tabelas já guardam (ver registros()).

Nunca inventa dado: o que não existe volta em "pendencias" e a tela mostra
estado vazio. Parâmetros em app/painel_config.py.
"""

from __future__ import annotations

import threading
import time
from datetime import date, datetime, timedelta, timezone

from app.orcamentos_salvos import _conectar
from app.painel_config import PAINEL_CONFIG

# Brasil sem horário de verão desde 2019: "hoje" da fábrica = UTC-3.
FUSO = timezone(timedelta(hours=-3))
ETAPAS = [("eng", "Engenharia"), ("cor", "Corte"), ("mon", "Montagem"), ("sol", "Solda"),
          ("usi", "Usinagem"), ("dob", "Dobra"), ("jat", "Jato"), ("pin", "Pintura")]

PENDENCIAS = {
    "kg_corte": "Kg cortados e meta semanal de corte não são registrados (o Corte marca programas, sem peso).",
    "materiais": "Data prometida e recebimento de material não existem na Material de compra.",
    "pecas_paradas": "Peças cortadas aguardando a próxima operação: falta ligar o pedido da Croqui (PO+IT+POS) à etapa do Follow up.",
    "horario_coleta": "Horário e transportadora da coleta não são cadastrados.",
    "databook": "Inspeção/Databook e Expedição não existem como etapas.",
    "auditoria": "Sem log de auditoria: edições guardam só a última alteração de cada pedido, sem o valor anterior.",
}


def hoje() -> date:
    return datetime.now(FUSO).date()


def obra_de(mac: str | None) -> str:
    return ".".join((mac or "").split(".")[:2])


def _pronto(i: dict) -> bool:
    return (i["status"] or "").strip().casefold() == "pronto"


# --- leitura base (cache curto: os 6 blocos da tela pedem quase juntos) -----

_CACHE: dict = {"em": 0.0, "itens": None}
_TRAVA = threading.Lock()
_CACHE_SEGUNDOS = 60

_CAMPOS = ["id", "po", "mac", "cliente", "descricao", "prazo_contratual", "coleta_data", "coleta",
           "status", "st", "peso_total", "quantidade", "nf", *[e for e, _ in ETAPAS]]


def _itens() -> list[dict]:
    with _TRAVA:
        if _CACHE["itens"] is not None and time.monotonic() - _CACHE["em"] < _CACHE_SEGUNDOS:
            return _CACHE["itens"]
        with _conectar() as conn, conn.cursor() as cur:
            cur.execute(f"select {', '.join(_CAMPOS)} from follow_up_itens where st in ('A', 'E')")
            itens = []
            for row in cur.fetchall():
                i = dict(zip(_CAMPOS, row))
                i["id"] = str(i["id"])
                i["obra"] = obra_de(i["mac"])
                i["peso_total"] = float(i["peso_total"]) if i["peso_total"] is not None else None
                i["quantidade"] = float(i["quantidade"]) if i["quantidade"] is not None else None
                for e, _ in ETAPAS:
                    i[e] = float(i[e]) if i[e] is not None else None
                itens.append(i)
        _CACHE.update(em=time.monotonic(), itens=itens)
        return itens


def _filtrar(itens: list[dict], cliente: str | None, obra: str | None,
             prazo_de: date | None = None, prazo_ate: date | None = None) -> list[dict]:
    out = []
    for i in itens:
        if cliente and i["cliente"] != cliente:
            continue
        if obra and i["obra"] != obra:
            continue
        if prazo_de and (not i["prazo_contratual"] or i["prazo_contratual"] < prazo_de):
            continue
        if prazo_ate and (not i["prazo_contratual"] or i["prazo_contratual"] > prazo_ate):
            continue
        out.append(i)
    return out


def _resumo_pedido(i: dict) -> dict:
    return {
        "id": i["id"], "po": i["po"], "mac": i["mac"], "obra": i["obra"], "cliente": i["cliente"],
        "descricao": i["descricao"], "prazo": _iso(i["prazo_contratual"]), "coleta": _iso(i["coleta_data"]),
        "status": i["status"], "st": i["st"], "kg": i["peso_total"], "qtd": i["quantidade"],
    }


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def opcoes() -> dict:
    """Listas dos filtros globais + horário da última sincronização da planilha."""
    itens = _itens()
    ativos = [i for i in itens if i["st"] == "A"]
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select ultima_verificacao_em from controle_obras_status where id = 1")
        row = cur.fetchone()
    return {
        "clientes": sorted({i["cliente"] for i in ativos if i["cliente"]}),
        "obras": sorted({i["obra"] for i in ativos if i["obra"]}),
        "planilha_sincronizada_em": row[0].isoformat() if row and row[0] else None,
        "config": PAINEL_CONFIG,
        "pendencias": list(PENDENCIAS.values()),
    }


# --- 1. Coletas ---------------------------------------------------------------

def _dias_uteis(inicio: date, n: int) -> list[date]:
    dias, d = [], inicio
    while len(dias) < n:
        if d.weekday() < 5:
            dias.append(d)
        d += timedelta(days=1)
    return dias


def _motivo_nao_pronto(pedidos: list[dict]) -> list[str]:
    return [f"{p['obra'] or p['po']} · {p['po']}: {p['status'] or 'sem status'}" for p in pedidos]


def coletas(cliente: str | None = None, obra: str | None = None) -> dict:
    """Próximos dias úteis com as coletas marcadas (só coleta_data). Um cliente
    por dia; alerta de prontidão se algum pedido da coleta não está Pronto."""
    h = hoje()
    dias = _dias_uteis(h, PAINEL_CONFIG["dias_uteis_coletas"])
    por_dia: dict[date, dict[str, list[dict]]] = {d: {} for d in dias}
    for i in _filtrar(_itens(), cliente, obra):
        d = i["coleta_data"]
        if d in por_dia:
            por_dia[d].setdefault(i["cliente"] or "Sem cliente", []).append(i)
    risco = PAINEL_CONFIG["dias_coleta_em_risco"]
    saida = []
    for d in dias:
        clientes = []
        for nome, pedidos in sorted(por_dia[d].items()):
            nao_prontos = [p for p in pedidos if p["st"] == "A" and not _pronto(p)]
            alerta = None
            if PAINEL_CONFIG["alerta_prontidao"] and nao_prontos:
                alerta = "vermelho" if (d - h).days <= risco else "amarelo"
            clientes.append({
                "cliente": nome,
                "pedidos": [_resumo_pedido(p) for p in sorted(pedidos, key=lambda p: (p["obra"], p["po"]))],
                "obras": sorted({p["obra"] for p in pedidos if p["obra"]}),
                "kg": sum(p["peso_total"] or 0 for p in pedidos),
                "entregue": all(p["st"] == "E" for p in pedidos),
                "alerta": alerta,
                "motivo": _motivo_nao_pronto(nao_prontos) if alerta else [],
            })
        saida.append({"data": d.isoformat(), "hoje": d == h, "clientes": clientes})
    # Coleta digitada como texto (não é data) não entra no painel — aviso na tela.
    sem_data = sum(1 for i in _filtrar(_itens(), cliente, obra)
                   if i["st"] == "A" and not i["coleta_data"] and (i["coleta"] or "").strip())
    return {"dias": saida, "coletas_em_texto": sem_data}


# --- 3. Atenção hoje (regras usadas também no semáforo da esteira e nos KPIs) -

def _alertas_pedido(i: dict, h: date) -> list[tuple[str, str, int, date]]:
    """(severidade, regra, dias, data de referência) de um pedido ativo."""
    if i["st"] != "A":
        return []
    out = []
    prazo, coleta, pronto = i["prazo_contratual"], i["coleta_data"], _pronto(i)
    if prazo and coleta and coleta > prazo:
        out.append(("vermelho", "atraso_projetado", (coleta - prazo).days, prazo))
    elif prazo and not coleta and prazo < h:
        out.append(("vermelho", "prazo_vencido", (h - prazo).days, prazo))
    elif prazo and not pronto:
        base = coleta or h
        folga = (prazo - base).days
        if 0 <= folga < PAINEL_CONFIG["folga_dias"]:
            out.append(("amarelo", "folga_apertada", folga, prazo))
    if coleta and not pronto and 0 <= (coleta - h).days <= PAINEL_CONFIG["dias_coleta_em_risco"]:
        out.append(("vermelho", "coleta_em_risco", (coleta - h).days, coleta))
    if (i["eng"] or 0) < 100:
        out.append(("amarelo", "engenharia", (prazo - h).days if prazo else 0, prazo or date.max))
    return out


_TEXTO_REGRA = {
    "atraso_projetado": ("Atraso projetado", "coleta depois do prazo contratual"),
    "prazo_vencido": ("Prazo vencido", "prazo contratual passou e não há coleta marcada"),
    "folga_apertada": ("Folga apertada", "folga até o prazo menor que {folga} dias e não está pronto"),
    "coleta_em_risco": ("Coleta em risco", "coleta em até {risco} dias e pedido não está pronto"),
    "engenharia": ("Pendência de engenharia", "ENG abaixo de 100"),
}


def _texto_dias(regra: str, dias: int) -> str:
    if regra == "atraso_projetado":
        return f"{dias} dia(s) após o prazo"
    if regra == "prazo_vencido":
        return f"vencido há {dias} dia(s)"
    if regra == "folga_apertada":
        return f"folga de {dias} dia(s)"
    if regra == "coleta_em_risco":
        return "coleta hoje" if dias == 0 else f"coleta em {dias} dia(s)"
    return "prazo vencido" if dias < 0 else f"prazo em {dias} dia(s)"


def atencao(cliente: str | None = None, obra: str | None = None,
            prazo_de: date | None = None, prazo_ate: date | None = None) -> dict:
    """Exceções agrupadas por obra + regra, 🔴 antes de 🟡, depois pela data."""
    h = hoje()
    grupos: dict[tuple[str, str], dict] = {}
    for i in _filtrar(_itens(), cliente, obra, prazo_de, prazo_ate):
        for sev, regra, dias, ref in _alertas_pedido(i, h):
            chave = (i["obra"] or i["po"], regra)
            g = grupos.setdefault(chave, {
                "severidade": sev, "regra": regra, "obra": chave[0], "clientes": set(), "pedidos": [],
                "dias": dias, "ref": ref,
            })
            g["clientes"].add(i["cliente"] or "")
            g["pedidos"].append(_resumo_pedido(i))
            # pior caso do grupo: mais dias de atraso / menos folga / data mais próxima
            if regra in ("atraso_projetado", "prazo_vencido"):
                g["dias"] = max(g["dias"], dias)
            else:
                g["dias"] = min(g["dias"], dias)
            g["ref"] = min(g["ref"], ref)
    linhas = []
    for g in grupos.values():
        titulo, criterio = _TEXTO_REGRA[g["regra"]]
        linhas.append({
            "severidade": g["severidade"], "regra": g["regra"], "titulo": titulo,
            "criterio": criterio.format(folga=PAINEL_CONFIG["folga_dias"], risco=PAINEL_CONFIG["dias_coleta_em_risco"]),
            "obra": g["obra"], "cliente": ", ".join(sorted(c for c in g["clientes"] if c)),
            "n_pedidos": len(g["pedidos"]), "dias": g["dias"], "texto_dias": _texto_dias(g["regra"], g["dias"]),
            "data_ref": g["ref"].isoformat() if g["ref"] != date.max else None,
            "pedidos": g["pedidos"],
        })
    linhas.sort(key=lambda l: (l["severidade"] != "vermelho", l["data_ref"] or "9999", l["obra"]))
    return {
        "linhas": linhas,
        "max": PAINEL_CONFIG["max_atencao"],
        "pendencias": [PENDENCIAS["materiais"], PENDENCIAS["pecas_paradas"]],
    }


# --- 2. KPIs ------------------------------------------------------------------

def _semana(d: date) -> tuple[date, date]:
    inicio = d - timedelta(days=d.weekday())
    return inicio, inicio + timedelta(days=6)


def _otd(itens: list[dict], de: date, ate: date) -> dict:
    base = [i for i in itens if i["st"] == "E" and i["coleta_data"] and de <= i["coleta_data"] <= ate
            and i["prazo_contratual"]]
    no_prazo = [i for i in base if i["coleta_data"] <= i["prazo_contratual"]]
    return {
        "base": len(base), "no_prazo": len(no_prazo),
        "percentual": round(100 * len(no_prazo) / len(base), 1) if base else None,
        "atrasados": [_resumo_pedido(i) for i in base if i["coleta_data"] > i["prazo_contratual"]],
    }


def kpis(cliente: str | None = None, obra: str | None = None,
         prazo_de: date | None = None, prazo_ate: date | None = None) -> dict:
    h = hoje()
    todos = _filtrar(_itens(), cliente, obra)
    no_periodo = _filtrar(todos, None, None, prazo_de, prazo_ate)
    ativos = [i for i in no_periodo if i["st"] == "A"]

    obras_ativas: dict[str, list[dict]] = {}
    for i in ativos:
        obras_ativas.setdefault(i["obra"] or i["po"], []).append(i)
    em_atraso = {o: ps for o, ps in obras_ativas.items()
                 if any(r in ("atraso_projetado", "prazo_vencido") for p in ps for _, r, _, _ in _alertas_pedido(p, h))}

    ini, fim = _semana(h)
    ini_ant, fim_ant = ini - timedelta(days=7), fim - timedelta(days=7)

    def coletas_entre(a: date, b: date) -> list[dict]:
        # uma coleta = um cliente num dia
        grupos: dict[tuple[date, str], list[dict]] = {}
        for i in todos:
            if i["coleta_data"] and a <= i["coleta_data"] <= b:
                grupos.setdefault((i["coleta_data"], i["cliente"] or ""), []).append(i)
        return [{"data": d.isoformat(), "cliente": c, "n_pedidos": len(ps), "kg": sum(p["peso_total"] or 0 for p in ps),
                 "obras": sorted({p["obra"] for p in ps if p["obra"]})} for (d, c), ps in sorted(grupos.items())]

    semana, semana_ant = coletas_entre(ini, fim), coletas_entre(ini_ant, fim_ant)
    janela = PAINEL_CONFIG["otd_dias"]
    otd = _otd(todos, h - timedelta(days=janela), h)
    otd_ant = _otd(todos, h - timedelta(days=2 * janela), h - timedelta(days=janela + 1))

    def lista_obras(obras: dict[str, list[dict]]) -> list[dict]:
        out = []
        for o, ps in obras.items():
            prazos = [p["prazo_contratual"] for p in ps if p["prazo_contratual"]]
            out.append({"obra": o, "cliente": ", ".join(sorted({p["cliente"] or "" for p in ps} - {""})),
                        "n_pedidos": len(ps), "prazo": _iso(min(prazos)) if prazos else None,
                        "kg": sum(p["peso_total"] or 0 for p in ps)})
        return sorted(out, key=lambda x: x["prazo"] or "9999")

    return {
        "obras": {"ativas": len(obras_ativas), "em_atraso": len(em_atraso),
                  "lista_atraso": lista_obras(em_atraso), "lista_ativas": lista_obras(obras_ativas)},
        "coletas_semana": {"valor": len(semana), "anterior": len(semana_ant), "de": ini.isoformat(),
                           "ate": fim.isoformat(), "lista": semana},
        "kg_corte": {"valor": None, "pendencia": PENDENCIAS["kg_corte"]},
        "materiais_criticos": {"valor": None, "pendencia": PENDENCIAS["materiais"]},
        "otd": {**otd, "anterior": otd_ant["percentual"], "dias": janela},
    }


# --- 4. Entregas do mês por cliente -----------------------------------------

def entregas(mes: str, cliente: str | None = None, obra: str | None = None) -> dict:
    """Entregue = ST "E" com coleta no mês; programado = ST "A" com coleta no mês."""
    ano, m = (int(x) for x in mes.split("-"))
    inicio = date(ano, m, 1)
    fim = (date(ano + (m == 12), m % 12 + 1, 1)) - timedelta(days=1)
    por_cliente: dict[str, dict] = {}
    for i in _filtrar(_itens(), cliente, obra):
        d = i["coleta_data"]
        if not d or not inicio <= d <= fim:
            continue
        c = por_cliente.setdefault(i["cliente"] or "Sem cliente", {
            "cliente": i["cliente"] or "Sem cliente", "entregues": 0, "programados": 0,
            "kg_entregue": 0.0, "kg_programado": 0.0, "pedidos": []})
        if i["st"] == "E":
            c["entregues"] += 1
            c["kg_entregue"] += i["peso_total"] or 0
        else:
            c["programados"] += 1
            c["kg_programado"] += i["peso_total"] or 0
        c["pedidos"].append(_resumo_pedido(i))
    for c in por_cliente.values():
        c["pedidos"].sort(key=lambda p: (p["coleta"] or "", p["obra"] or ""))
    return {"mes": mes, "de": inicio.isoformat(), "ate": fim.isoformat(), "top": PAINEL_CONFIG["top_clientes"],
            "clientes": list(por_cliente.values())}


# --- 5. Esteira das obras -----------------------------------------------------

def esteira(cliente: str | None = None, obra: str | None = None,
            prazo_de: date | None = None, prazo_ate: date | None = None) -> dict:
    """Uma linha por obra ativa: % de cada etapa ponderado pelo peso (kg) dos
    pedidos (sem peso → peso 1), prazo mais próximo e pior semáforo."""
    h = hoje()
    obras: dict[str, list[dict]] = {}
    for i in _filtrar(_itens(), cliente, obra, prazo_de, prazo_ate):
        if i["st"] == "A":
            obras.setdefault(i["obra"] or i["po"], []).append(i)
    linhas = []
    for o, ps in obras.items():
        pesos = [p["peso_total"] if p["peso_total"] and p["peso_total"] > 0 else 1.0 for p in ps]
        total = sum(pesos)
        etapas = {e: round(sum((p[e] or 0) * w for p, w in zip(ps, pesos)) / total, 1) for e, _ in ETAPAS}
        alertas = [a for p in ps for a in _alertas_pedido(p, h) if a[1] != "engenharia"]
        semaforo = ("vermelho" if any(a[0] == "vermelho" for a in alertas)
                    else "amarelo" if alertas else "verde")
        prazos = [p["prazo_contratual"] for p in ps if p["prazo_contratual"]]
        coletas_fut = [p["coleta_data"] for p in ps if p["coleta_data"] and p["coleta_data"] >= h]
        linhas.append({
            "obra": o, "cliente": ", ".join(sorted({p["cliente"] or "" for p in ps} - {""})),
            "n_pedidos": len(ps), "n_prontos": sum(1 for p in ps if _pronto(p)),
            "kg": round(sum(p["peso_total"] or 0 for p in ps), 1),
            "prazo": _iso(min(prazos)) if prazos else None,
            "proxima_coleta": _iso(min(coletas_fut)) if coletas_fut else None,
            "etapas": etapas, "semaforo": semaforo,
        })
    linhas.sort(key=lambda l: (l["prazo"] or "9999", l["obra"]))
    return {"etapas": [{"campo": e, "nome": n} for e, n in ETAPAS], "linhas": linhas,
            "pendencias": [PENDENCIAS["databook"]]}


# --- 6. Registros do dia ------------------------------------------------------

def registros(dia: date | None = None) -> dict:
    """Junta o que já fica gravado (sem log de auditoria):
    Corte: corte_historico (cada marcar/desmarcar, completo).
    Follow up: registro diário (follow_up_registros) e a última edição de cada
      pedido (editado_em/por — edição anterior do mesmo pedido é sobrescrita).
    Croqui: última edição, Fazendo/Feito (dt_fazendo/dt_feito) e pedidos novos.
    Obras (sincronização da planilha): pedido novo, encerrado (entregue), reaberto.
    """
    dia = dia or hoje()
    ini = datetime(dia.year, dia.month, dia.day, tzinfo=FUSO)
    fim = ini + timedelta(days=1)
    ev: list[dict] = []

    def add(em, modulo, acao, descricao, usuario, link=None):
        ev.append({"em": em.isoformat(), "modulo": modulo, "acao": acao, "descricao": descricao,
                   "usuario": usuario or "—", "link": link})

    def link_obra(mac):
        o = obra_de(mac)
        return f"/follow-up/obra?tipo=mac&valor={o}" if o else None

    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select programa, marca, valor, por, em from corte_historico where em >= %s and em < %s",
                    (ini, fim))
        nomes = {"cortando": "Cortando", "finalizado": "Finalizado", "falta_material": "Falta material"}
        for prog, marca, valor, por, em in cur.fetchall():
            acao = "concluiu" if (marca == "finalizado" and valor) else "alterou"
            add(em, "Corte", acao, f"Programa {prog} — {'marcou' if valor else 'desmarcou'} {nomes.get(marca, marca)}", por)

        cur.execute("""select r.created_at, r.autor, r.texto, i.po, i.mac from follow_up_registros r
                       left join follow_up_itens i on i.id = r.item_id
                       where r.created_at >= %s and r.created_at < %s""", (ini, fim))
        for em, autor, texto, po, mac in cur.fetchall():
            add(em, "Follow up", "criou", f"Registro diário — {po or ''}: {(texto or '')[:90]}", autor, link_obra(mac))

        cur.execute("""select editado_em, editado_por, po, mac, cliente from follow_up_itens
                       where editado_em >= %s and editado_em < %s""", (ini, fim))
        for em, por, po, mac, cli in cur.fetchall():
            add(em, "Follow up", "alterou", f"Pedido {po} ({obra_de(mac) or '—'} · {cli or '—'}) editado", por, link_obra(mac))

        cur.execute("""select tipo, po, cliente, descricao, criado_em, item_id from follow_up_notificacoes
                       where criado_em >= %s and criado_em < %s""", (ini, fim))
        rotulos = {"novo": ("criou", "Pedido novo ativo"), "encerrado": ("concluiu", "Pedido encerrado (entregue)"),
                   "reaberto": ("alterou", "Pedido reaberto")}
        for tipo, po, cli, desc, em, _ in cur.fetchall():
            acao, texto = rotulos.get(tipo, ("alterou", tipo))
            add(em, "Obras", acao, f"{texto} — {po} · {cli or '—'} · {(desc or '')[:50]}", "Planilha (sincronização)")

        cur.execute("""select pedido, mac, editado_em, editado_por, dt_fazendo, dt_feito, status from croqui_corte_itens
                       where (editado_em >= %s and editado_em < %s) or (dt_fazendo >= %s and dt_fazendo < %s)
                          or (dt_feito >= %s and dt_feito < %s)""", (ini, fim, ini, fim, ini, fim))
        for pedido, mac, ed_em, ed_por, dt_faz, dt_feito, status in cur.fetchall():
            marcou = False
            if dt_feito and ini <= dt_feito < fim:
                add(dt_feito, "Croqui", "concluiu", f"Pedido {pedido} — Feito", ed_por, link_obra(mac))
                marcou = True
            if dt_faz and ini <= dt_faz < fim:
                add(dt_faz, "Croqui", "alterou", f"Pedido {pedido} — Fazendo", ed_por, link_obra(mac))
                marcou = True
            if ed_em and ini <= ed_em < fim and not (marcou and ed_em in (dt_feito, dt_faz)):
                add(ed_em, "Croqui", "alterou", f"Pedido {pedido} editado (status: {status or '—'})", ed_por,
                    link_obra(mac))

        cur.execute("""select pedido, mac, descricao, criado_em from croqui_corte_notificacoes
                       where criado_em >= %s and criado_em < %s""", (ini, fim))
        for pedido, mac, desc, em in cur.fetchall():
            add(em, "Croqui", "criou", f"Pedido novo na Croqui — {pedido} · {(desc or '')[:50]}",
                "Planilha (sincronização)", link_obra(mac))

    ev.sort(key=lambda e: e["em"], reverse=True)
    return {"data": dia.isoformat(), "eventos": ev, "aviso": PENDENCIAS["auditoria"]}
