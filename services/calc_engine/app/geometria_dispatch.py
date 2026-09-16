"""Despacha um pedido de cálculo manual de geometria (cartão escolhido +
medidas digitadas no app) pra função certa de app/geometria.py. Existe
separado do endpoint HTTP pra ficar testável sem precisar do FastAPI.

Cada tipo tem sua própria lista de medidas — ver TIPOS_GEOMETRIA, que
também alimenta o card grid do frontend (rótulo + campos por tipo).
"""

from __future__ import annotations

import math

from app import geometria
from app.geometria import PesoCalculado

# {tipo: (rótulo do cartão, [(chave, rótulo do campo, unidade), ...])}
# Usado tanto pra validar o pedido aqui quanto pro frontend desenhar o
# formulário certo por trás de cada cartão.
TIPOS_GEOMETRIA: dict[str, tuple[str, list[tuple[str, str, str]]]] = {
    "chapa_retangular": ("Chapa retangular/quadrada", [
        ("comprimento_mm", "Comprimento", "mm"), ("largura_mm", "Largura", "mm"),
        ("espessura_mm", "Espessura", "mm"), ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "chapa_circular": ("Chapa circular (disco)", [
        ("diametro_mm", "Diâmetro", "mm"), ("espessura_mm", "Espessura", "mm"),
        ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "chapa_triangular": ("Chapa triangular", [
        ("base_mm", "Base", "mm"), ("altura_mm", "Altura", "mm"),
        ("espessura_mm", "Espessura", "mm"), ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "chapa_losango": ("Chapa losango", [
        ("diagonal_maior_mm", "Diagonal maior", "mm"), ("diagonal_menor_mm", "Diagonal menor", "mm"),
        ("espessura_mm", "Espessura", "mm"), ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "chapa_trapezoidal": ("Chapa trapezoidal", [
        ("base_menor_mm", "Base menor", "mm"), ("base_maior_mm", "Base maior", "mm"),
        ("altura_mm", "Altura", "mm"), ("espessura_mm", "Espessura", "mm"),
        ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "chapa_anel": ("Anel / coroa circular (disco vazado)", [
        ("diametro_externo_mm", "Diâmetro externo", "mm"), ("diametro_interno_mm", "Diâmetro interno", "mm"),
        ("espessura_mm", "Espessura", "mm"), ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "cilindro": ("Cilindro (chapa calandrada)", [
        ("diametro_mm", "Diâmetro", "mm"), ("espessura_mm", "Espessura", "mm"),
        ("comprimento_mm", "Comprimento", "mm"), ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "cone_altura": ("Cone / tronco de cone (por altura)", [
        ("diametro_maior_mm", "Diâmetro maior", "mm"), ("diametro_menor_mm", "Diâmetro menor (0 = cone fechado)", "mm"),
        ("altura_mm", "Altura", "mm"), ("espessura_mm", "Espessura", "mm"),
        ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "cone_angulo": ("Cone / tronco de cone (por ângulo)", [
        ("diametro_maior_mm", "Diâmetro maior", "mm"), ("diametro_menor_mm", "Diâmetro menor (0 = cone fechado)", "mm"),
        ("angulo_graus", "Semiângulo em relação ao eixo", "°"), ("espessura_mm", "Espessura", "mm"),
        ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "cantoneira": ("Cantoneira L (abas iguais)", [
        ("aba_mm", "Medida da aba", "mm"), ("espessura_mm", "Espessura", "mm"),
        ("comprimento_mm", "Comprimento", "mm"), ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "barra_redonda": ("Barra redonda (vergalhão)", [
        ("diametro_mm", "Diâmetro", "mm"), ("comprimento_mm", "Comprimento", "mm"),
        ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "tubo_redondo": ("Tubo redondo", [
        ("diametro_externo_mm", "Diâmetro externo", "mm"), ("espessura_parede_mm", "Espessura da parede", "mm"),
        ("comprimento_mm", "Comprimento", "mm"), ("densidade_kg_m3", "Densidade", "kg/m³"),
    ]),
    "perfil": ("Perfil laminado (I, H, W, U)", [
        ("peso_kg_m", "Peso por metro (catálogo)", "kg/m"), ("comprimento_mm", "Comprimento", "mm"),
    ]),
}


# Pra qual categoria de materiais/preço (repositorio_materiais.py) cada
# tipo de geometria mapeia — todo "chapa_*" e formas caldeiradas a partir
# de chapa (cilindro, cone, cantoneira reta) usam a mesma matéria-prima
# base (chapa/perfil comprada), só a forma final que muda.
CATEGORIA_PRECO_POR_TIPO: dict[str, str] = {
    "chapa_retangular": "chapa_retangular",
    "chapa_circular": "chapa_circular",
    "chapa_triangular": "chapa_retangular",
    "chapa_losango": "chapa_retangular",
    "chapa_trapezoidal": "chapa_retangular",
    "chapa_anel": "chapa_circular",
    "cilindro": "chapa_retangular",
    "cone_altura": "chapa_retangular",
    "cone_angulo": "chapa_retangular",
    "cantoneira": "perfil",
    "barra_redonda": "barra_redonda",
    "tubo_redondo": "chapa_retangular",
    "perfil": "perfil",
}


def calcular_peso(tipo: str, medidas: dict[str, float], quantidade: float = 1) -> PesoCalculado:
    if tipo not in TIPOS_GEOMETRIA:
        raise ValueError(f"Tipo de geometria desconhecido: {tipo}")

    def m(chave: str) -> float:
        if chave not in medidas:
            raise ValueError(f"Falta a medida '{chave}' para o tipo '{tipo}'")
        return float(medidas[chave])

    if tipo == "chapa_retangular":
        r = geometria.peso_chapa_retangular(m("comprimento_mm"), m("largura_mm"), m("espessura_mm"), m("densidade_kg_m3"))
        return PesoCalculado(peso_kg=r.peso_kg * quantidade, memoria=f"{r.memoria} × qtd {quantidade}")

    if tipo == "chapa_circular":
        r = geometria.peso_chapa_circular(m("diametro_mm"), m("espessura_mm"), m("densidade_kg_m3"))
        return PesoCalculado(peso_kg=r.peso_kg * quantidade, memoria=f"{r.memoria} × qtd {quantidade}")

    if tipo == "chapa_triangular":
        return geometria.peso_chapa_triangular(m("base_mm"), m("altura_mm"), m("espessura_mm"), m("densidade_kg_m3"), quantidade)

    if tipo == "chapa_losango":
        return geometria.peso_chapa_losango(m("diagonal_maior_mm"), m("diagonal_menor_mm"), m("espessura_mm"), m("densidade_kg_m3"), quantidade)

    if tipo == "chapa_trapezoidal":
        return geometria.peso_chapa_trapezoidal(
            m("base_menor_mm"), m("base_maior_mm"), m("altura_mm"), m("espessura_mm"), m("densidade_kg_m3"), quantidade
        )

    if tipo == "chapa_anel":
        de, di = m("diametro_externo_mm"), m("diametro_interno_mm")
        if di >= de:
            raise ValueError("O diâmetro interno precisa ser menor que o diâmetro externo")
        return geometria.peso_chapa_anel(de, di, m("espessura_mm"), m("densidade_kg_m3"), quantidade)

    if tipo == "cilindro":
        return geometria.peso_cilindro_casca(m("diametro_mm"), m("espessura_mm"), m("comprimento_mm"), m("densidade_kg_m3"), quantidade)

    if tipo == "cone_altura":
        return geometria.peso_cone_tronco(
            m("diametro_maior_mm"), m("diametro_menor_mm"), m("altura_mm"), m("espessura_mm"), m("densidade_kg_m3"), quantidade
        )

    if tipo == "cone_angulo":
        return geometria.peso_cone_tronco_por_angulo(
            m("diametro_maior_mm"), m("diametro_menor_mm"), m("angulo_graus"), m("espessura_mm"), m("densidade_kg_m3"), quantidade
        )

    if tipo == "cantoneira":
        return geometria.peso_cantoneira_abas_iguais(m("aba_mm"), m("espessura_mm"), m("comprimento_mm"), m("densidade_kg_m3"), quantidade)

    if tipo == "barra_redonda":
        # peso_barra_redonda espera fator_b_kg_m (constante prática por
        # material); a partir de densidade pura, π/4×densidade é a mesma
        # aproximação já documentada em app/geometria.py.
        fator_b = math.pi / 4 * m("densidade_kg_m3")
        r = geometria.peso_barra_redonda(m("diametro_mm"), m("comprimento_mm"), fator_b)
        return PesoCalculado(peso_kg=r.peso_kg * quantidade, memoria=f"{r.memoria} × qtd {quantidade}")

    if tipo == "tubo_redondo":
        de, espessura = m("diametro_externo_mm"), m("espessura_parede_mm")
        if 2 * espessura >= de:
            raise ValueError("A parede (2 × espessura) precisa ser menor que o diâmetro externo")
        r = geometria.peso_tubo_redondo(de, espessura, m("comprimento_mm"), m("densidade_kg_m3"))
        return PesoCalculado(peso_kg=r.peso_kg * quantidade, memoria=f"{r.memoria} × qtd {quantidade}")

    if tipo == "perfil":
        return geometria.peso_perfil(m("peso_kg_m"), m("comprimento_mm"), quantidade)

    raise ValueError(f"Tipo '{tipo}' reconhecido mas sem cálculo implementado")
