"""Motor geométrico — a IA identifica a geometria e os parâmetros; estas
funções fazem a matemática, de forma determinística e auditável.

As cinco primeiras fórmulas foram validadas contra os exemplos numéricos
que a própria planilha de referência da Macfab traz como "folha de
consulta" (aba "RESUMO DO ORÇAMENTO", células B17:B42) — ver
services/calc_engine/tests/test_geometria.py.

As fórmulas seguintes (triangular em diante) vêm de outra planilha de
referência real, `Estudo de material.xls` (pasta do orçamento
MAC_0573.26/A752193), que tem uma tabela de 18 tipos de geometria com
fórmula própria cada uma — pedido explícito do usuário pra virar cartões
de cálculo manual no app. Reescritas na convenção deste módulo (densidade
em kg/m³, não g/cm³ como no Excel original) e revalidadas numericamente
contra os exemplos reais da planilha (bateram exato após a conversão de
unidade). Três variantes de anel do Excel original ("calandrado", "em
setores", "recortado") viraram um `peso_chapa_anel` só — o líquido delas é
idêntico, a diferença entre as três é só quanto de sobra/bruto cada
técnica de corte gera, e este motor não modela peso bruto/sobra ainda
(só peso líquido, que é o que entra no custo). Duas variantes bem raras
do Excel (perfil ou cantoneira calandrado em anel/semicírculo) não têm
fórmula aqui ainda — ficam para uma iteração futura se aparecer caso real.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class PesoCalculado:
    peso_kg: float
    memoria: str


def peso_chapa_retangular(
    comprimento_mm: float, largura_mm: float, espessura_mm: float, densidade_kg_m3: float
) -> PesoCalculado:
    comprimento_m = comprimento_mm / 1000
    largura_m = largura_mm / 1000
    espessura_m = espessura_mm / 1000
    peso = comprimento_m * largura_m * espessura_m * densidade_kg_m3
    memoria = (
        f"{comprimento_mm} × {largura_mm} × {espessura_mm} mm × {densidade_kg_m3} kg/m³ "
        f"= {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_chapa_circular(diametro_mm: float, espessura_mm: float, densidade_kg_m3: float) -> PesoCalculado:
    diametro_m = diametro_mm / 1000
    espessura_m = espessura_mm / 1000
    peso = math.pi * diametro_m**2 / 4 * espessura_m * densidade_kg_m3
    memoria = (
        f"π × {diametro_mm}² / 4 × {espessura_mm} mm × {densidade_kg_m3} kg/m³ = {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_barra_redonda(
    diametro_mm: float, comprimento_mm: float, fator_b_kg_m: float
) -> PesoCalculado:
    """fator_b_kg_m é a constante prática por material (ver materiais.fator_barra_redonda_kg_m),
    equivalente a aproximadamente π/4 × densidade. Com D em metros: peso/m = D² × fator_b."""
    diametro_m = diametro_mm / 1000
    comprimento_m = comprimento_mm / 1000
    peso_por_metro = diametro_m**2 * fator_b_kg_m
    peso = peso_por_metro * comprimento_m
    memoria = (
        f"{diametro_mm/1000:.3f}² × {fator_b_kg_m} = {peso_por_metro:.2f} kg/m × "
        f"{comprimento_m:.3f} m = {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_perfil(peso_kg_m: float, comprimento_mm: float, quantidade: float = 1) -> PesoCalculado:
    comprimento_m = comprimento_mm / 1000
    peso = peso_kg_m * comprimento_m * quantidade
    memoria = f"{peso_kg_m} kg/m × {comprimento_m:.3f} m × qtd {quantidade} = {peso:.2f} kg"
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_tubo_redondo(
    diametro_externo_mm: float, espessura_parede_mm: float, comprimento_mm: float, densidade_kg_m3: float
) -> PesoCalculado:
    """peso/m (kg) = π × (D - e) × e × densidade / 1_000_000, com D e e em mm."""
    constante = math.pi * densidade_kg_m3 / 1_000_000
    peso_por_metro = (diametro_externo_mm - espessura_parede_mm) * espessura_parede_mm * constante
    comprimento_m = comprimento_mm / 1000
    peso = peso_por_metro * comprimento_m
    memoria = (
        f"({diametro_externo_mm} - {espessura_parede_mm}) × {espessura_parede_mm} × "
        f"{constante:.5f} = {peso_por_metro:.2f} kg/m × {comprimento_m:.3f} m = {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_chapa_triangular(
    base_mm: float, altura_mm: float, espessura_mm: float, densidade_kg_m3: float, quantidade: float = 1
) -> PesoCalculado:
    area_m2 = (base_mm / 1000) * (altura_mm / 1000) / 2
    peso = area_m2 * (espessura_mm / 1000) * densidade_kg_m3 * quantidade
    memoria = (
        f"({base_mm} × {altura_mm} / 2) mm² × {espessura_mm} mm × {densidade_kg_m3} kg/m³ "
        f"× qtd {quantidade} = {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_chapa_losango(
    diagonal_maior_mm: float, diagonal_menor_mm: float, espessura_mm: float, densidade_kg_m3: float,
    quantidade: float = 1,
) -> PesoCalculado:
    """Área do losango = D × d / 2 — mesma fórmula do triângulo, só troca
    base/altura por diagonal maior/menor."""
    r = peso_chapa_triangular(diagonal_maior_mm, diagonal_menor_mm, espessura_mm, densidade_kg_m3, quantidade)
    return PesoCalculado(peso_kg=r.peso_kg, memoria=r.memoria.replace("base", "diagonal maior", 1))


def peso_chapa_trapezoidal(
    base_menor_mm: float, base_maior_mm: float, altura_mm: float, espessura_mm: float,
    densidade_kg_m3: float, quantidade: float = 1,
) -> PesoCalculado:
    area_m2 = ((base_menor_mm / 1000 + base_maior_mm / 1000) / 2) * (altura_mm / 1000)
    peso = area_m2 * (espessura_mm / 1000) * densidade_kg_m3 * quantidade
    memoria = (
        f"(({base_menor_mm} + {base_maior_mm}) / 2 × {altura_mm}) mm² × {espessura_mm} mm × "
        f"{densidade_kg_m3} kg/m³ × qtd {quantidade} = {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_chapa_anel(
    diametro_externo_mm: float, diametro_interno_mm: float, espessura_mm: float, densidade_kg_m3: float,
    quantidade: float = 1,
) -> PesoCalculado:
    """Coroa circular (disco vazado) — mesmo peso líquido valha o anel
    calandrado inteiro, feito em setores ou recortado de uma chapa maior
    (o que muda entre essas três técnicas é só o desperdício/bruto, que
    este motor não modela ainda)."""
    area_m2 = math.pi / 4 * ((diametro_externo_mm / 1000) ** 2 - (diametro_interno_mm / 1000) ** 2)
    peso = area_m2 * (espessura_mm / 1000) * densidade_kg_m3 * quantidade
    memoria = (
        f"π/4 × ({diametro_externo_mm}² − {diametro_interno_mm}²) mm² × {espessura_mm} mm × "
        f"{densidade_kg_m3} kg/m³ × qtd {quantidade} = {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_cilindro_casca(
    diametro_mm: float, espessura_mm: float, comprimento_mm: float, densidade_kg_m3: float,
    quantidade: float = 1,
) -> PesoCalculado:
    """Chapa calandrada em cilindro (casca), não barra maciça — peso pela
    superfície lateral × espessura, usando o diâmetro médio (diâmetro +
    espessura) como aproximação padrão de caldeiraria."""
    diametro_medio_m = (diametro_mm + espessura_mm) / 1000
    peso = quantidade * diametro_medio_m * math.pi * (comprimento_mm / 1000) * (espessura_mm / 1000) * densidade_kg_m3
    memoria = (
        f"({diametro_mm} + {espessura_mm}) × π × {comprimento_mm} × {espessura_mm} mm² × "
        f"{densidade_kg_m3} kg/m³ × qtd {quantidade} = {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_cone_tronco(
    diametro_maior_mm: float, diametro_menor_mm: float, altura_mm: float, espessura_mm: float,
    densidade_kg_m3: float, quantidade: float = 1,
) -> PesoCalculado:
    """Chapa calandrada em cone ou tronco de cone — cone fechado é só o
    caso `diametro_menor_mm = 0`. Geratriz (comprimento da lateral) via
    Pitágoras a partir da diferença de raios e da altura."""
    geratriz_mm = math.sqrt(((diametro_maior_mm - diametro_menor_mm) / 2) ** 2 + altura_mm**2)
    diametro_medio_m = ((diametro_maior_mm + diametro_menor_mm) / 2 + espessura_mm) / 1000
    peso = quantidade * diametro_medio_m * math.pi * (geratriz_mm / 1000) * (espessura_mm / 1000) * densidade_kg_m3
    memoria = (
        f"geratriz = √(({diametro_maior_mm}−{diametro_menor_mm})/2² + {altura_mm}²) = {geratriz_mm:.2f} mm; "
        f"(({diametro_maior_mm}+{diametro_menor_mm})/2 + {espessura_mm}) × π × {geratriz_mm:.2f} × {espessura_mm} mm² × "
        f"{densidade_kg_m3} kg/m³ × qtd {quantidade} = {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)


def peso_cone_tronco_por_angulo(
    diametro_maior_mm: float, diametro_menor_mm: float, angulo_graus: float, espessura_mm: float,
    densidade_kg_m3: float, quantidade: float = 1,
) -> PesoCalculado:
    """Igual `peso_cone_tronco`, mas a altura vem do ângulo de abertura em
    vez de ser informada direto — útil quando o desenho cota o ângulo do
    cone, não a altura."""
    altura_mm = ((diametro_maior_mm - diametro_menor_mm) / 2) / math.tan(math.radians(angulo_graus))
    r = peso_cone_tronco(diametro_maior_mm, diametro_menor_mm, altura_mm, espessura_mm, densidade_kg_m3, quantidade)
    memoria = f"altura = ((D−d)/2) / tan({angulo_graus}°) = {altura_mm:.2f} mm; " + r.memoria
    return PesoCalculado(peso_kg=r.peso_kg, memoria=memoria)


def peso_cantoneira_abas_iguais(
    aba_mm: float, espessura_mm: float, comprimento_mm: float, densidade_kg_m3: float, quantidade: float = 1
) -> PesoCalculado:
    """Cantoneira de abas iguais (perfil L) — aproximação padrão de
    engenharia pra área da seção: (2×aba − espessura) × espessura (ignora
    o raio de concordância do laminado, erro típico < 2%). Cantoneira
    hoje é o único tipo de geometria real e comum que o motor ainda não
    sabia calcular (ver bom_table.py) — fecha essa lacuna."""
    area_secao_m2 = ((2 * aba_mm - espessura_mm) * espessura_mm) / 1_000_000
    peso = area_secao_m2 * (comprimento_mm / 1000) * densidade_kg_m3 * quantidade
    memoria = (
        f"(2×{aba_mm} − {espessura_mm}) × {espessura_mm} mm² × {comprimento_mm/1000:.3f} m × "
        f"{densidade_kg_m3} kg/m³ × qtd {quantidade} = {peso:.2f} kg"
    )
    return PesoCalculado(peso_kg=peso, memoria=memoria)
