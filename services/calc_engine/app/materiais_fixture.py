"""Fixture local de materiais/preços, só para o motor de cálculo poder rodar
e ser testado sem uma conexão real com o Supabase.

Em produção isto é substituído por consultas reais às tabelas `materiais`,
`perfis` e principalmente `historico_compras` (a especificação pede várias
fontes de preço: último comprado, média das últimas 3 compras, média
30/60/90 dias, fornecedor preferencial, cotação atual — ver item 3 do
README raiz). Os preços aqui são só um ponto de partida plausível, não
devem ser tratados como preço real de compra.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class InfoMaterial:
    densidade_kg_m3: float
    fator_barra_redonda_kg_m: float | None
    preco_kg_padrao: float | None


MATERIAIS: dict[tuple[str, str], InfoMaterial] = {
    ("ASTM A36", "chapa"): InfoMaterial(7850, 6200, 8.5),
    ("ASTM A36", "perfil"): InfoMaterial(7850, 6200, 10.0),
    ("ASTM A572", "chapa"): InfoMaterial(7850, 6200, 9.0),
    ("ASTM A572", "perfil"): InfoMaterial(7850, 6200, 10.0),
    ("ASTM A572 GR.50", "perfil"): InfoMaterial(7850, 6200, 10.5),
    ("SAE 1020", "barra"): InfoMaterial(7850, 6200, 12.0),
    ("SAE 1020", "perfil"): InfoMaterial(7850, 6200, 10.0),
    ("AISI 304", "chapa"): InfoMaterial(8000, 6318, 25.0),
}

# Opções sugeridas pro campo Norma/Material do cartão de perfil laminado —
# lista curta e editável, não um cadastro fechado (o campo aceita texto
# livre; isto só alimenta o autocomplete). Preço/kg padrão de cada uma
# (quando cadastrado) vem de MATERIAIS acima, por norma+"perfil".
NORMAS_PERFIL_SUGERIDAS: list[str] = [
    "ASTM A36",
    "ASTM A572 Gr.50",
    "ASTM A992",
    "SAE 1020",
]

# kg/m por perfil — hoje é um cadastro fixo (tabela `perfis`); em produção
# vem de consulta ao Supabase.
PERFIS_KG_M: dict[str, float] = {
    "W310x52": 52.0,
    "W310 x 52,0": 52.0,
    "W250x32.7": 32.7,
    "W250 x 32,7": 32.7,
    "W200x22.5": 22.5,
    "W200 x 22,5": 22.5,
}


def buscar_info_material(norma: str | None, tipo_geometria: str | None) -> InfoMaterial | None:
    if not norma:
        return None
    tipo = _normaliza_tipo(tipo_geometria)
    return MATERIAIS.get((norma.strip().upper().replace("  ", " "), tipo))


def buscar_peso_kg_m_perfil(designacao: str | None) -> float | None:
    if not designacao:
        return None
    if designacao.strip() in PERFIS_KG_M:
        return PERFIS_KG_M[designacao.strip()]
    # Fallback pro catálogo maior (app/perfis_catalogo.py, hoje a série W —
    # ver data/perfis_laminados.json), usado tanto pelo cartão de cálculo
    # manual quanto por perfis identificados num desenho/BOM extraído.
    from app.perfis_catalogo import buscar_peso_kg_m

    return buscar_peso_kg_m(designacao)


def _normaliza_tipo(tipo_geometria: str | None) -> str:
    if not tipo_geometria:
        return "chapa"
    if tipo_geometria in ("chapa_retangular", "chapa_circular"):
        return "chapa"
    if tipo_geometria == "barra_redonda":
        return "barra"
    if tipo_geometria == "perfil":
        return "perfil"
    return tipo_geometria
