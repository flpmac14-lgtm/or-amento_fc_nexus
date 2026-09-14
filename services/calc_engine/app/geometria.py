"""Motor geométrico — a IA identifica a geometria e os parâmetros; estas
funções fazem a matemática, de forma determinística e auditável.

As três fórmulas abaixo foram validadas contra os exemplos numéricos que a
própria planilha de referência da Macfab traz como "folha de consulta"
(aba "RESUMO DO ORÇAMENTO", células B17:B42) — ver
services/calc_engine/tests/test_geometria.py.
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
