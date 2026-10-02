"""Regras da Visão Geral (app/painel.py) — sem banco: _itens() é trocado por
uma lista fixa."""

from datetime import date, timedelta

import pytest

from app import painel

HOJE = date(2026, 10, 2)  # sexta-feira


def _item(po, mac="690.25.01", cliente="A1", prazo=None, coleta=None, st="A", status="Falta Pintura", eng=100.0,
          peso=100.0, **etapas):
    i = {"id": po, "po": po, "mac": mac, "cliente": cliente, "descricao": "x", "prazo_contratual": prazo,
         "coleta_data": coleta, "coleta": None, "status": status, "st": st, "peso_total": peso, "quantidade": 1.0,
         "nf": None, "eng": eng}
    for e, _ in painel.ETAPAS[1:]:
        i[e] = etapas.get(e, 0.0)
    i["obra"] = painel.obra_de(mac)
    return i


@pytest.fixture
def com_itens(monkeypatch):
    def usar(itens):
        monkeypatch.setattr(painel, "_itens", lambda: itens)
        monkeypatch.setattr(painel, "hoje", lambda: HOJE)
    return usar


def test_obra_e_mac_com_2_partes():
    assert painel.obra_de("690.25.20.01") == "690.25"
    assert painel.obra_de("626.26") == "626.26"
    assert painel.obra_de(None) == ""


def test_dias_uteis_pula_fim_de_semana():
    dias = painel._dias_uteis(HOJE, 3)
    assert dias == [HOJE, HOJE + timedelta(days=3), HOJE + timedelta(days=4)]


def test_alertas_atraso_projetado_e_coleta_em_risco():
    i = _item("1", prazo=HOJE, coleta=HOJE + timedelta(days=1))
    regras = {r for _, r, _, _ in painel._alertas_pedido(i, HOJE)}
    assert regras == {"atraso_projetado", "coleta_em_risco"}


def test_alertas_prazo_vencido_sem_coleta_e_pronto_sem_folga():
    vencido = _item("1", prazo=HOJE - timedelta(days=4))
    assert [(r, d) for _, r, d, _ in painel._alertas_pedido(vencido, HOJE)] == [("prazo_vencido", 4)]
    pronto = _item("2", prazo=HOJE + timedelta(days=2), status="Pronto")
    assert painel._alertas_pedido(pronto, HOJE) == []
    entregue = _item("3", prazo=HOJE - timedelta(days=9), st="E")
    assert painel._alertas_pedido(entregue, HOJE) == []


def test_folga_apertada_usa_a_coleta_como_data_prevista():
    i = _item("1", prazo=HOJE + timedelta(days=20), coleta=HOJE + timedelta(days=17))
    assert [(r, d) for _, r, d, _ in painel._alertas_pedido(i, HOJE)] == [("folga_apertada", 3)]


def test_coletas_alerta_de_prontidao(com_itens):
    com_itens([
        _item("1", coleta=HOJE, status="Pronto"),
        _item("2", coleta=HOJE + timedelta(days=3), cliente="W1"),  # segunda, não pronto
    ])
    dias = painel.coletas()["dias"]
    assert dias[0]["hoje"] and dias[0]["clientes"][0]["alerta"] is None
    assert dias[1]["clientes"][0]["cliente"] == "W1"
    assert dias[1]["clientes"][0]["alerta"] == "vermelho"  # 3 dias corridos = coleta em risco


def test_entregas_separa_entregue_e_programado(com_itens):
    com_itens([
        _item("1", coleta=date(2026, 10, 5), st="E", peso=10),
        _item("2", coleta=date(2026, 10, 9), peso=5),
        _item("3", coleta=date(2026, 11, 1)),
    ])
    c = painel.entregas("2026-10")["clientes"]
    assert [(x["cliente"], x["entregues"], x["programados"], x["kg_entregue"], x["kg_programado"]) for x in c] == [
        ("A1", 1, 1, 10, 5)
    ]


def test_esteira_pondera_etapa_pelo_peso(com_itens):
    com_itens([
        _item("1", prazo=HOJE + timedelta(days=30), peso=300, cor=100.0),
        _item("2", prazo=HOJE + timedelta(days=30), peso=100, cor=0.0),
    ])
    linha = painel.esteira()["linhas"][0]
    assert linha["obra"] == "690.25" and linha["etapas"]["cor"] == 75.0 and linha["semaforo"] == "verde"


def test_otd(com_itens):
    com_itens([
        _item("1", st="E", prazo=HOJE, coleta=HOJE - timedelta(days=1)),
        _item("2", st="E", prazo=HOJE - timedelta(days=5), coleta=HOJE - timedelta(days=2)),
    ])
    otd = painel.kpis()["otd"]
    assert (otd["base"], otd["no_prazo"], otd["percentual"]) == (2, 1, 50.0)
