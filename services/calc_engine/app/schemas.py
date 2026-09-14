from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class LinhaCusto(BaseModel):
    codigo: str
    descricao: str
    valor_bruto: float
    aliquota_icms: float
    aliquota_pis_cofins: float
    valor_liquido: float
    horas: Optional[float] = None
    memoria_calculo: List[str] = []


class ResumoComercial(BaseModel):
    cenario_comercial: str
    custo_industrial: float
    fator_margem: float
    aliquota_venda: float
    preco_venda_com_impostos: float
    preco_venda_sem_impostos: float
    imposto_a_pagar: float
    margem_lucro: float
    margem_percentual: float
    peso_liquido_kg: float
    preco_venda_por_kg: float


class ResultadoOrcamento(BaseModel):
    linhas: List[LinhaCusto]
    comercial: ResumoComercial
