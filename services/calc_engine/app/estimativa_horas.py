"""Combina a camada 1 (regra simples) com a camada 2 (histórico Macfab)
para estimar horas de caldeiraria — a peça que faltava entre
app.processos (regra) e app.historico (histórico).

Regra de combinação definida aqui (média ponderada pela confiança do
histórico, não um corte abrupto):

    horas_final = confianca_historico × horas_historico
                + (1 − confianca_historico) × horas_regra_simples

Por quê média ponderada em vez de "usa histórico se confiança > limiar":
um corte abrupto faz a estimativa pular de valor quando a confiança cruza
o limiar por uma amostra a mais ou a menos — a ponderação contínua evita
esse degrau e deixa o histórico "puxar" a estimativa proporcionalmente ao
quanto ele é confiável, sem nunca ignorá-lo nem depender só dele.

O histórico (app.historico) devolve horas de MÃO DE OBRA PRÓPRIA total
(caldeiraria + jateamento/pintura MO combinados — ver o aviso em
app/historico.py). Para virar "horas de caldeiraria" isoladas, reverte a
mesma proporção fixa que app.processos.jateamento_pintura_mo usa na outra
direção (horas_jato = horas_caldeiraria ÷ 24):

    horas_mo_propria = horas_caldeiraria × (1 + 1/24) = horas_caldeiraria × 25/24
    horas_caldeiraria = horas_mo_propria × 24/25

Limite real encontrado ao validar com o dataset de 35 orçamentos: peso
sozinho é um preditor fraco de complexidade. Consultando o peso do A752193
(3319 kg, uma baseplate soldada simples — 52 h/ton), a amostra de peso
parecido também traz um inserto de moinho fortemente usinado (229 h/ton) e
uma plataforma complexa (322 h/ton) — peças bem mais trabalhosas por
tonelada apesar do peso semelhante. A mediana dessa amostra pequena (3
orçamentos) puxa a sugestão bem acima do valor real do próprio A752193.
Isso não é um bug — é exatamente a lacuna que a "Camada 3" da especificação
(IA avaliando complexidade geométrica) deveria preencher; por enquanto a
confiança calculada aqui reflete o tamanho/largura da amostra, não a
qualidade da similaridade, então a mediana pode legitimamente vir bem longe
do valor esperado quando a amostra é pequena ou heterogênea. Ver
`services/calc_engine/README.md` para o exemplo numérico completo.
"""

from __future__ import annotations

from app import historico as historico_mod

FATOR_CALDEIRARIA_SOBRE_MO_PROPRIA = 24 / 25  # inverso de (1 + 1/jateamento_pintura_divisor), divisor=24


def estimar_horas_caldeiraria(peso_liquido_kg: float, params: dict, historico: list[dict] | None = None) -> dict:
    fator = params["caldeiraria_fator_h_kg"]
    horas_regra_simples = peso_liquido_kg * fator

    sugestao = historico_mod.sugerir_horas_mo_propria(peso_liquido_kg, historico)
    horas_mo_propria_sugeridas = sugestao["horas_mo_propria_sugeridas"]
    confianca = sugestao["confianca"]

    if horas_mo_propria_sugeridas is None:
        horas_historico = None
        horas_final = horas_regra_simples
        confianca = 0.0
    else:
        horas_historico = horas_mo_propria_sugeridas * FATOR_CALDEIRARIA_SOBRE_MO_PROPRIA
        horas_final = confianca * horas_historico + (1 - confianca) * horas_regra_simples

    memoria = [
        f"Regra simples: {peso_liquido_kg} kg × {fator} h/kg = {horas_regra_simples:.2f} h",
    ]
    if horas_historico is not None:
        memoria.append(
            f"Histórico ({sugestao['n_amostras']} orçamentos parecidos, faixa "
            f"±{sugestao['faixa_toneladas_usada']} t): mediana {sugestao['mediana_horas_por_tonelada']} "
            f"h/ton de MO própria → {horas_mo_propria_sugeridas:.2f} h totais → "
            f"{horas_historico:.2f} h de caldeiraria (revertendo a proporção de jateamento/pintura)"
        )
        memoria.append(
            f"Combinação: {confianca:.0%} histórico + {1 - confianca:.0%} regra simples "
            f"= {horas_final:.2f} h"
        )
    else:
        memoria.append("Sem histórico com amostra suficiente — usando só a regra simples")

    return {
        "horas_caldeiraria": round(horas_final, 2),
        "horas_regra_simples": round(horas_regra_simples, 2),
        "horas_historico": round(horas_historico, 2) if horas_historico is not None else None,
        "confianca_historico": confianca,
        "n_amostras_historico": sugestao["n_amostras"],
        "memoria": memoria,
    }
