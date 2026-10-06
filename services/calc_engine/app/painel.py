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

from app import apontamentos_setor
from app.jornada import minutos_uteis
from app.orcamentos_salvos import _conectar
from app.painel_config import PAINEL_CONFIG

# Brasil sem horário de verão desde 2019: "hoje" da fábrica = UTC-3.
FUSO = timezone(timedelta(hours=-3))
ETAPAS = [("eng", "Engenharia"), ("cor", "Corte"), ("mon", "Montagem"), ("sol", "Solda"),
          ("usi", "Usinagem"), ("dob", "Dobra"), ("jat", "Jato"), ("pin", "Pintura")]

PENDENCIAS = {
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
    ini, fim = _semana(h)
    filtrados = _filtrar(_itens(), cliente, obra)
    semana = {"valor": _n_coletas(filtrados, ini, fim),
              "anterior": _n_coletas(filtrados, ini - timedelta(days=7), fim - timedelta(days=7))}
    return {"dias": saida, "coletas_em_texto": sem_data, "semana": semana}


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


# --- semana das coletas (vai no cabeçalho do bloco de Coletas) --------------

def _semana(d: date) -> tuple[date, date]:
    inicio = d - timedelta(days=d.weekday())
    return inicio, inicio + timedelta(days=6)


def _n_coletas(itens: list[dict], a: date, b: date) -> int:
    """Uma coleta = um cliente num dia."""
    return len({(i["coleta_data"], i["cliente"]) for i in itens if i["coleta_data"] and a <= i["coleta_data"] <= b})


# --- Corte a laser recente (pedido do usuário: "painel bonito do histórico") --

def corte_recente(limite: int = 12, limite_operador: int = 40) -> dict:
    """Situação do laser a partir do que o operador marca na aba Corte
    (corte_programas + corte_historico) e das peças da Croqui (app/corte.py)."""
    from app.corte import listar as listar_corte

    h = hoje()
    ini_hoje = datetime(h.year, h.month, h.day, tzinfo=FUSO)
    ini_semana = ini_hoje - timedelta(days=h.weekday())
    programas = listar_corte()["programas"]

    def resumo(p: dict) -> dict:
        obras = sorted({obra_de(i["mac"]) for i in p["itens"] if i.get("mac")} - {""})
        minutos = None
        if p["cortando_em"] and p["finalizado_em"] and p["cortando_em"] <= p["finalizado_em"]:
            # Só a jornada da fábrica (app/jornada.py), não relógio corrido.
            minutos = minutos_uteis(datetime.fromisoformat(p["cortando_em"]), datetime.fromisoformat(p["finalizado_em"]))
        return {
            "programa": p["programa"], "obras": obras, "mps": p["mps"], "pecas": p["pecas"], "itens": len(p["itens"]),
            "cortando_em": p["cortando_em"], "cortando_por": p["cortando_por"],
            "finalizado_em": p["finalizado_em"], "finalizado_por": p["finalizado_por"],
            "falta_material_em": p["falta_material_em"], "falta_material_por": p["falta_material_por"],
            "minutos": minutos,
        }

    def finalizado(p: dict) -> bool:
        return bool(p["finalizado_em"]) and not (p["cortando_em"] and p["cortando_em"] > p["finalizado_em"])

    cortando = [resumo(p) for p in programas if p["cortando_em"] and not finalizado(p) and not p["falta_material_em"]]
    falta = [resumo(p) for p in programas if p["falta_material_em"] and not finalizado(p)]
    finalizados = sorted((p for p in programas if finalizado(p)), key=lambda p: p["finalizado_em"], reverse=True)

    def desde(p: dict, t: datetime) -> bool:
        return datetime.fromisoformat(p["finalizado_em"]) >= t

    # Finalizados por dia (últimos 7 dias) — barrinhas do painel.
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select (em at time zone 'America/Sao_Paulo')::date, count(distinct programa) from corte_historico
               where marca = 'finalizado' and valor and em >= %s group by 1""",
            (ini_hoje - timedelta(days=6),),
        )
        por_dia = dict(cur.fetchall())
    dias = [h - timedelta(days=k) for k in range(6, -1, -1)]

    # Cortados por operador (quem marcou Finalizado) — bloco "Cortados" do painel,
    # no mesmo formato do Projeto: hoje, semana, barrinhas de 7 dias e os últimos.
    operadores: dict[str, dict] = {}
    for p in finalizados:
        nome = p["finalizado_por"] or "Sem nome"
        o = operadores.setdefault(nome, {"operador": nome, "hoje": 0, "semana": 0, "minutos_hoje": 0,
                                          "por_dia": {d: 0 for d in dias}, "recentes": []})
        em = datetime.fromisoformat(p["finalizado_em"])
        r = resumo(p)
        if em >= ini_hoje:
            o["hoje"] += 1
            o["minutos_hoje"] += r["minutos"] or 0
        if em >= ini_semana:
            o["semana"] += 1
        dia = em.astimezone(FUSO).date()
        if dia in o["por_dia"]:
            o["por_dia"][dia] += 1
        if len(o["recentes"]) < limite_operador:
            o["recentes"].append(r)
    for o in operadores.values():
        o["por_dia"] = [{"data": d.isoformat(), "programas": n} for d, n in o["por_dia"].items()]
    return {
        "cortando": cortando,
        "falta_material": falta,
        "hoje": {"programas": sum(1 for p in finalizados if desde(p, ini_hoje)),
                 "pecas": sum(p["pecas"] or 0 for p in finalizados if desde(p, ini_hoje))},
        "semana": {"programas": sum(1 for p in finalizados if desde(p, ini_semana)),
                   "pecas": sum(p["pecas"] or 0 for p in finalizados if desde(p, ini_semana))},
        "por_dia": [{"data": d.isoformat(), "programas": por_dia.get(d, 0)} for d in dias],
        "recentes": [resumo(p) for p in finalizados[:limite]],
        # Quem cortou mais recentemente primeiro.
        "operadores": sorted(operadores.values(), key=lambda o: o["recentes"][0]["finalizado_em"], reverse=True),
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


def _fotos() -> dict[str, str]:
    """1ª foto de cada pedido (item_id → sha256 da mídia)."""
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select distinct on (item_id) item_id, midia_sha256 from follow_up_imagens order by item_id, ordem")
        return {str(i): sha for i, sha in cur.fetchall()}


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
    foto_do_item = _fotos()
    linhas = []
    for o, ps in obras.items():
        com_foto = sorted((p for p in ps if p["id"] in foto_do_item),
                          key=lambda p: (p["prazo_contratual"] or date.max, p["po"]))
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
            "foto": foto_do_item[com_foto[0]["id"]] if com_foto else None,
            "dias_prazo": (min(prazos) - h).days if prazos else None,
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
    Usinagem: cada apontamento do saymon (apontamentos_setor — Usinando, Pausado,
      Fim, Falta material, inclusive serviço interno Macfab). O Registro diário
      "Usinagem: ..." que ele também gera fica de fora pra não duplicar.
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

        cur.execute("""select a.em, a.por, a.status, a.operador, a.observacao, i.po, i.mac, i.desenho, s.descricao
                       from apontamentos_setor a
                       left join follow_up_itens i on i.id = a.item_id
                       left join servicos_internos s on s.id = a.servico_id
                       where a.setor = 'usinagem' and a.em >= %s and a.em < %s""", (ini, fim))
        status_usi = apontamentos_setor.SETORES["usinagem"]["status"]
        for em, por, status, operador, obs, po, mac, desenho, servico in cur.fetchall():
            alvo = f"Serviço interno Macfab — {servico}" if servico else f"{desenho or '—'} · PO {po or '—'}"
            acao = "concluiu" if status == "finalizado" else "alterou"
            add(em, "Usinagem", acao, f"{status_usi.get(status, status)} ({operador or '—'}) — {alvo}"
                + (f": {obs[:60]}" if obs else ""), por, None if servico else link_obra(mac))

        cur.execute("""select r.created_at, r.autor, r.texto, i.po, i.mac from follow_up_registros r
                       left join follow_up_itens i on i.id = r.item_id
                       where r.created_at >= %s and r.created_at < %s and r.texto not like 'Usinagem:%%'""", (ini, fim))
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


# --- Compras recentes (pedido do usuário: "o que foi comprado recentemente") --

def _obra_da_compra(obra: str | None) -> str | None:
    """'MAC.618.25' / '0723.26' → '618.25' / '723.26'; 'EMPRESA' etc. → None."""
    import re

    m = re.fullmatch(r"(?:MAC\.?)?0*(\d+\.\d{2})", (obra or "").strip().upper())
    return m.group(1) if m else None


def compras(dias: int = 15) -> dict:
    """Compras lançadas no ERP (notas de entrada), copiadas todo dia para
    historico_compras_geral por scripts/importar_precos_erp.py. Atenção: essa
    tabela guarda só a ÚLTIMA compra de cada material+unidade (é a base da
    Referência de preços) e não tem quantidade. Datas no futuro são erro de
    digitação no ERP e ficam de fora."""
    h = hoje()
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select data_compra, nfe_codigo, fornecedor, codigo_item, descricao, preco_unitario, unidade, obra
               from historico_compras_geral where data_compra between %s and %s
               order by data_compra desc, nfe_codigo desc, descricao""",
            (h - timedelta(days=dias), h),
        )
        linhas = cur.fetchall()
        cur.execute("select max(created_at) from historico_compras_geral")
        atualizado = cur.fetchone()[0]
    notas: dict[tuple, dict] = {}
    for data, nfe, fornecedor, codigo, descricao, preco, unidade, obra in linhas:
        n = notas.setdefault((data, nfe), {"data": data.isoformat(), "nfe": nfe, "fornecedor": fornecedor or "—", "itens": []})
        n["itens"].append({
            "codigo": codigo, "descricao": descricao, "preco": float(preco) if preco is not None else None,
            "unidade": unidade, "obra": obra, "obra_mac": _obra_da_compra(obra),
        })
    return {"dias": dias, "notas": list(notas.values()), "n_itens": len(linhas),
            "atualizado_em": atualizado.isoformat() if atualizado else None}


# --- Projeto: o que os projetistas apontaram na Croqui de corte ---------------

def _agrupar_apontamentos(linhas: list[tuple], maximo: int = 8) -> list[dict]:
    """Últimos apontamentos (já em ordem do mais novo) juntados por obra + dia."""
    grupos: dict[tuple, dict] = {}
    for p, m, ds, np_, st, em in linhas:
        dia = em.astimezone(FUSO).date()
        g = grupos.get((obra_de(m), dia))
        if g is None:
            if len(grupos) >= maximo:
                continue
            g = grupos[(obra_de(m), dia)] = {"obra": obra_de(m), "descricao": ds, "em": _iso(em), "n": 0,
                                             "programas": [], "status": {}}
        g["n"] += 1
        g["status"][st or "—"] = g["status"].get(st or "—", 0) + 1
        for prog in (np_ or "").replace(";", ",").split(","):
            if prog.strip() and prog.strip() not in g["programas"]:
                g["programas"].append(prog.strip())
    return list(grupos.values())


def projeto(limite: int = 80) -> dict:
    """Por projetista (coluna Projetista da Croqui): pedidos em "Fazendo" agora,
    apontados (dt_feito com status Feito / Sem Corte / Estoque) hoje, na semana,
    por dia nos últimos 7 dias e os últimos apontamentos. Fonte: croqui_corte_itens
    (Status Fazendo grava dt_fazendo, Feito grava dt_feito — app/croqui_corte.py)."""
    h = hoje()
    ini_hoje = datetime(h.year, h.month, h.day, tzinfo=FUSO)
    ini_semana = ini_hoje - timedelta(days=h.weekday())
    ini_7 = ini_hoje - timedelta(days=6)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select projetista, pedido, mac, descricao, n_programa, dt_fazendo from croqui_corte_itens
               where status = 'Fazendo' and projetista is not null order by dt_fazendo nulls last"""
        )
        fazendo = cur.fetchall()
        cur.execute(
            """select projetista, status, (dt_feito at time zone 'America/Sao_Paulo')::date, count(*)
               from croqui_corte_itens where projetista is not null and dt_feito >= %s
               group by 1, 2, 3""",
            (min(ini_7, ini_semana),),
        )
        contagens = cur.fetchall()
        cur.execute(
            """select projetista, pedido, mac, descricao, n_programa, status, dt_feito from (
                   select *, row_number() over (partition by projetista order by dt_feito desc) n
                   from croqui_corte_itens where projetista is not null and dt_feito is not null) x
               where n <= %s order by dt_feito desc""",
            (limite,),
        )
        recentes = cur.fetchall()
        cur.execute("select distinct projetista from croqui_corte_itens where projetista is not null")
        nomes = sorted(r[0] for r in cur.fetchall())

    def item(pedido, mac, descricao, n_programa):
        return {"pedido": pedido, "obra": obra_de(mac), "descricao": descricao, "programa": n_programa}

    saida = []
    dias = [h - timedelta(days=k) for k in range(6, -1, -1)]
    for nome in nomes:
        cs = [c for c in contagens if c[0] == nome]
        hoje_por_status: dict[str, int] = {}
        for _, status, d, n in cs:
            if d == h:
                hoje_por_status[status or "—"] = hoje_por_status.get(status or "—", 0) + n
        saida.append({
            "projetista": nome,
            "fazendo": [{**item(p, m, ds, np_), "desde": _iso(df)} for (pj, p, m, ds, np_, df) in fazendo if pj == nome],
            "hoje": sum(hoje_por_status.values()),
            "hoje_por_status": hoje_por_status,
            "semana": sum(n for _, _, d, n in cs if d >= ini_semana.date()),
            "por_dia": [{"data": d.isoformat(), "n": sum(n for _, _, dd, n in cs if dd == d)} for d in dias],
            "recentes": _agrupar_apontamentos([r[1:] for r in recentes if r[0] == nome]),
        })
    # quem apontou mais hoje primeiro
    saida.sort(key=lambda x: (-x["hoje"], -x["semana"], x["projetista"]))
    return {"projetistas": saida}


# --- Usinagem (pedido do usuário: no lugar do "Atenção hoje") ----------------

def usinagem() -> dict:
    """Apontamentos da Usinagem (líder saymon, app/apontamentos_setor.py): o que
    cada operador está usinando agora / pausou, quantos estão com falta de
    material e todos os apontamentos de hoje (Usinando, Pausado, Fim, Falta
    material — pedidos do Follow up e serviços internos Macfab)."""
    cfg = apontamentos_setor.SETORES["usinagem"]
    ini = datetime.combine(hoje(), datetime.min.time(), tzinfo=FUSO)
    sel = """a.em, a.status, a.operador, a.observacao, a.por, i.po, i.mac, i.desenho, i.descricao, s.descricao
             from apontamentos_setor a
             left join follow_up_itens i on i.id = a.item_id
             left join servicos_internos s on s.id = a.servico_id"""

    def linha(r) -> dict:
        em, status, operador, obs, por, po, mac, desenho, descricao, servico = r
        return {"em": em.isoformat(), "status": status, "rotulo": cfg["status"].get(status, status),
                "operador": operador, "observacao": obs, "por": por, "po": po, "obra_mac": obra_de(mac) or None,
                "desenho": desenho, "descricao": descricao, "servico": servico}

    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"""select * from (select distinct on (coalesce(a.item_id, a.servico_id)) {sel}
                where a.setor = 'usinagem' order by coalesce(a.item_id, a.servico_id), a.em desc, a.id desc) u
                where u.status in ('em_andamento', 'pausado', 'falta_material')"""
        )
        atuais = [linha(r) for r in cur.fetchall()]
        cur.execute(f"select {sel} where a.setor = 'usinagem' and a.em >= %s order by a.em desc, a.id desc", (ini,))
        hoje_ = [linha(r) for r in cur.fetchall()]
    operadores = [
        {"nome": op,
         "usinando": [a for a in atuais if a["operador"] == op and a["status"] == "em_andamento"],
         "pausados": [a for a in atuais if a["operador"] == op and a["status"] == "pausado"]}
        for op in cfg["operadores"]
    ]
    return {"operadores": operadores, "falta_material": [a for a in atuais if a["status"] == "falta_material"],
            "hoje": hoje_}
