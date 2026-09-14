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
    "caldeiraria_fator_h_kg": 0.05,
    "caldeiraria_valor_hora": 60.0,
    "jateamento_pintura_divisor": 24,
    "jateamento_pintura_valor_hora": 60.0,
    "solda_fator_consumo_percentual": 0.03,
    "solda_preco_kg_consumivel": 25.0,
    "solda_fator_gas_sobre_consumivel": 0.5,
    "solda_preco_unidade_gas": 40.0,
    "pintura_fator_l_m2": 0.04,
    "pintura_demaos": [
        {"tipo": "fundo", "preco_litro": 500.0},
        {"tipo": "acabamento", "preco_litro": 450.0},
    ],
    "ndt_valor_kg": 0.5,
    "engenharia_valor_unitario": 60.0,
    "embalagem_valor_kg": 0.20,
    "transporte_valor_kg": 0.25,
    "energia_valor_kg": 0.25,
    "aliquotas_compra_por_tipo": ALIQUOTAS_COMPRA_POR_TIPO,
    "aliquota_venda_por_cenario": ALIQUOTA_VENDA_POR_CENARIO,
}
