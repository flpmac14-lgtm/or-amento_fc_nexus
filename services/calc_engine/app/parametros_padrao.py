"""Espelho em Python dos parâmetros semeados em
`supabase/migrations/0002_seed_regras.sql`, para o motor de cálculo poder
rodar (e ser testado) sem depender de uma conexão real com o Supabase.

Em produção, `app/orcamento.py` deve receber esses mesmos parâmetros vindos
de uma consulta ao banco (tabelas `regras_orcamento`, `custos_indiretos`,
`produtividade_processos`, `soldagem_consumiveis`, `ndt`, `impostos`) — isto
aqui é o fixture/default local, não deve divergir do que está semeado no
banco sem atualizar os dois lados.
"""

from __future__ import annotations

# Alíquotas (ICMS, PIS/COFINS) aplicadas sobre o valor BRUTO de cada tipo de
# custo, para chegar no custo líquido (crédito fiscal já descontado). Vêm do
# comportamento real observado na planilha de referência — cada categoria de
# custo tem um tratamento fiscal diferente hoje (matéria-prima e itens de
# terceiros pagam ICMS, mão de obra própria não, etc.). Devem migrar para a
# tabela `impostos` de forma mais granular numa próxima iteração.
ALIQUOTAS_COMPRA_POR_TIPO: dict[str, tuple[float, float]] = {
    "materia_prima": (0.18, 0.0925),
    "item_padrao": (0.18, 0.0925),
    "corte": (0.0, 0.0),
    "caldeiraria": (0.0, 0.0),
    "jateamento_pintura_mo": (0.0, 0.0),
    "usinagem": (0.0, 0.0925),
    "solda_consumivel": (0.12, 0.0925),
    "pintura_material": (0.12, 0.0925),
    "ndt": (0.0, 0.0925),
    "engenharia": (0.0, 0.0),
    "embalagem": (0.12, 0.0925),
    "transporte": (0.0, 0.0925),
    "energia": (0.12, 0.0925),
}

ALIQUOTA_VENDA_POR_CENARIO: dict[str, float] = {
    "venda_fabricacao": 0.25585,   # 16,335% ICMS + 9,25% PIS-COFINS
    "industrializacao": 0.0925,    # 9,25% PIS-COFINS
    "servico": 0.1433,             # 3,65% PIS-COFINS + 3% ISS + 7,68% CSLL-IRPJ
}

PARAMETROS_PADRAO: dict = {
    "fator_margem_venda": 1.0,
    "corte_valor_kg": 1.5,
    # Overrides opcionais só da linha de corte (ver app/processos.py::corte).
    # None = usa o peso líquido do orçamento (comportamento de sempre); um
    # número aqui troca só o peso usado NESSA linha, sem afetar caldeiraria/
    # solda/ndt/embalagem/transporte/energia, que continuam no peso líquido
    # global. Pedido explícito do usuário: poder cotar o corte pelo peso
    # bruto/de compra (com perda) quando fizer mais sentido pro processo.
    "corte_peso_kg": None,
    # % adicional somado em cima do bruto do corte (ex: 10 = +10%) — pedido
    # explícito do usuário pra poder embutir uma margem extra só nessa linha
    # sem mexer no R$/kg base.
    "corte_fator_percentual_adicional": 0.0,
    "caldeiraria_fator_h_kg": 0.05,
    "caldeiraria_valor_hora": 60.0,
    # Override opcional só do peso usado na regra simples de caldeiraria
    # (ver app/processos.py::caldeiraria) — None = usa o peso líquido do
    # orçamento, igual corte_peso_kg/solda_peso_kg.
    "caldeiraria_peso_kg": None,
    "jateamento_pintura_divisor": 24,
    "jateamento_pintura_valor_hora": 60.0,
    "solda_fator_consumo_percentual": 0.03,
    "solda_preco_kg_consumivel": 25.0,
    "solda_fator_gas_sobre_consumivel": 0.5,
    "solda_preco_unidade_gas": 40.0,
    # Overrides opcionais só da linha de solda (ver app/processos.py::solda):
    # None = comportamento padrão (peso líquido do orçamento como base do
    # consumível; kg de consumível calculado como base do gás). Um número
    # aqui troca só o peso-base dessa conta específica, sem afetar corte/
    # caldeiraria/ndt/embalagem/transporte/energia. Pedido explícito do
    # usuário: poder digitar o peso do consumível e o peso-base do gás direto
    # em vez de ficar preso ao peso líquido/ao consumível calculado.
    "solda_peso_kg": None,
    "solda_gas_peso_kg": None,
    # Consumível/gás inox (GMAW ER308/316L, GTAW ER308/309/316L/904L) — opt-in:
    # quantidade não deriva do peso da peça (não dá pra saber quanto da peça é
    # solda inox só pelo peso total), fica 0 (não soma nada) até o
    # orçamentista digitar quanto usou nesse orçamento específico.
    "solda_inox_qtd_kg": 0.0,
    "solda_inox_preco_kg_consumivel": 100.0,
    "solda_inox_fator_gas_sobre_consumivel": 0.5,
    "solda_inox_preco_unidade_gas": 40.0,
    "pintura_fator_l_m2": 0.04,
    "pintura_demaos": [
        {"tipo": "fundo", "preco_litro": 500.0},
        {"tipo": "acabamento", "preco_litro": 450.0},
    ],
    "ndt_valor_kg": 0.5,
    "engenharia_valor_unitario": 60.0,
    "embalagem_valor_kg": 0.20,
    # Overrides opcionais só do peso usado em cada linha (ver
    # app/processos.py::custo_indireto_por_kg) — None = usa o peso líquido
    # do orçamento, igual corte_peso_kg/solda_peso_kg/caldeiraria_peso_kg.
    "embalagem_peso_kg": None,
    "transporte_valor_kg": 0.25,
    "transporte_peso_kg": None,
    "energia_valor_kg": 0.25,
    "energia_peso_kg": None,
    "aliquotas_compra_por_tipo": ALIQUOTAS_COMPRA_POR_TIPO,
    "aliquota_venda_por_cenario": ALIQUOTA_VENDA_POR_CENARIO,
}
