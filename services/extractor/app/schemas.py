"""Estruturas de dados devolvidas pelo serviço de extração.

Regra central do projeto: este serviço NUNCA calcula peso, custo, hora ou
preço. Ele só interpreta o PDF e devolve valores + nível de confiança por
campo. Todo cálculo é feito depois pelo motor matemático do app principal.
"""

from __future__ import annotations

from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class CampoExtraido(BaseModel, Generic[T]):
    valor: Optional[T] = None
    confianca: float = 0.0
    origem: str = "regra_local"  # regra_local | ocr | ia_externa | manual


class Identificacao(BaseModel):
    cliente: CampoExtraido[str] = CampoExtraido()
    numero_desenho: CampoExtraido[str] = CampoExtraido()
    revisao: CampoExtraido[str] = CampoExtraido()
    codigo_equipamento: CampoExtraido[str] = CampoExtraido()
    pedido_po: CampoExtraido[str] = CampoExtraido()
    descricao: CampoExtraido[str] = CampoExtraido()
    quantidade: CampoExtraido[int] = CampoExtraido()


class CaracteristicasGerais(BaseModel):
    comprimento_mm: CampoExtraido[float] = CampoExtraido()
    largura_mm: CampoExtraido[float] = CampoExtraido()
    altura_mm: CampoExtraido[float] = CampoExtraido()
    peso_informado_kg: CampoExtraido[float] = CampoExtraido()
    escala: CampoExtraido[str] = CampoExtraido()
    numero_folhas: CampoExtraido[int] = CampoExtraido()
    normas: CampoExtraido[List[str]] = CampoExtraido(valor=[])
    observacoes: CampoExtraido[List[str]] = CampoExtraido(valor=[])


class ItemBom(BaseModel):
    item_numero: CampoExtraido[str] = CampoExtraido()
    descricao: CampoExtraido[str] = CampoExtraido()
    tipo_geometria: CampoExtraido[str] = CampoExtraido()  # chapa | perfil | barra_redonda | tubo
    perfil: CampoExtraido[str] = CampoExtraido()
    espessura_mm: CampoExtraido[float] = CampoExtraido()
    comprimento_mm: CampoExtraido[float] = CampoExtraido()
    largura_mm: CampoExtraido[float] = CampoExtraido()
    diametro_mm: CampoExtraido[float] = CampoExtraido()
    material: CampoExtraido[str] = CampoExtraido()
    norma: CampoExtraido[str] = CampoExtraido()
    usinado: CampoExtraido[bool] = CampoExtraido(valor=False)
    quantidade: CampoExtraido[float] = CampoExtraido()
    # Peso da peça já informado pela fonte (ex: export SAP com "Weight
    # KG/unit") — quando presente, o adapter usa direto em vez de tentar
    # calcular por geometria. Comum em BOM de peça acabada/comprada, onde
    # não tem tipo_geometria/norma pra calcular (ver bom_sap_export.py).
    peso_kg: CampoExtraido[float] = CampoExtraido()


class ResultadoExtracao(BaseModel):
    identificacao: Identificacao = Identificacao()
    caracteristicas: CaracteristicasGerais = CaracteristicasGerais()
    bom: List[ItemBom] = []
    confianca_geral: float = 0.0
    paginas_total: int = 0
    paginas_com_texto_nativo: int = 0
    paginas_via_ocr: int = 0
    usou_ia_externa: bool = False
    texto_bruto: Optional[str] = None
