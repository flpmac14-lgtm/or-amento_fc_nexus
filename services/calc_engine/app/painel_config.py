"""Parâmetros da tela Visão Geral (app/painel.py) — pedido do usuário: todos
num lugar só. Mudou aqui → vale na próxima atualização da tela (após o
deploy do calc_engine)."""

PAINEL_CONFIG = {
    # Coletas: quantos dias úteis (seg–sex) mostrar a partir de hoje.
    "dias_uteis_coletas": 7,
    # Ponto amarelo/vermelho no cliente da coleta quando a obra não está pronta.
    "alerta_prontidao": True,
    # "Coleta em risco": coleta marcada em até N dias com pedido não pronto.
    "dias_coleta_em_risco": 3,
    # "Folga apertada": folga até o prazo contratual menor que X dias.
    "folga_dias": 5,
    # Gráfico de entregas: top N clientes + "Outros".
    "top_clientes": 8,
    # OTD: janela em dias.
    "otd_dias": 90,
    # Quantas linhas de "Atenção hoje" aparecem antes do "ver todas".
    "max_atencao": 10,
}
