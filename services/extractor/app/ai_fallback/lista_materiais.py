"""Extração da lista de materiais (BOM) por IA a partir das páginas do
desenho — SÓ ISSO, sem relatório narrativo. Substitui o antigo "relatório
técnico completo" (removido a pedido explícito do usuário por custo: o
texto narrativo era a parte mais cara de cada chamada e ele só usa a BOM
mesmo; qualquer análise de fabricação/solda/pintura/crítica o orçamentista
faz à parte).

Uma chamada só, com tool_choice forçado — nunca gera texto solto, só o
retorno estruturado da ferramenta reportar_bom_estruturada. O peso que a IA
estima aqui vira o valor inicial (editável) do cartão "Peso direto" no
Cálculo manual — nunca é o peso oficial do orçamento sem o orçamentista
confirmar (ver apps/web/src/lib/itensCalculados.ts::converterParaPesoDireto).

Orçamento de custo (pedido explícito do usuário, ~300 desenhos/mês por
R$50): modelo Sonnet (bem mais barato que Opus), prompt curto (~1000
caracteres contra os ~11000 do relatório antigo), sem geração de texto
longo, e MAX_PAGINAS_LISTA baixo pra um PDF fora do padrão não estourar o
orçamento do mês sozinho."""

from __future__ import annotations

import base64
import os

MODEL_ID = "claude-sonnet-5"

# Baixo de propósito (era 15 no relatório antigo) — desenhos do usuário têm
# em média 2-5 páginas; um teto baixo protege o orçamento mensal de um PDF
# fora do padrão custar sozinho o equivalente a vários desenhos normais.
MAX_PAGINAS_LISTA = 5

# Sem texto longo pra gerar (só a ferramenta) — 4000 já é folgado pra uma
# BOM de várias dezenas de itens.
MAX_TOKENS_LISTA = 4000

PROMPT_LISTA_MATERIAIS = """Você é um engenheiro mecânico industrial. Analise as imagens do desenho \
técnico e extraia SÓ a lista de materiais (BOM) — nada de relatório, \
análise de fabricação, solda ou pintura, isso não faz parte desta tarefa.

Chame a ferramenta reportar_bom_estruturada UMA VEZ, com um item por peça/posição:

- posicao: número da posição exatamente como aparece no desenho.
- descricao: objetiva, sem repetir a norma do material.
- quantidade: quantas peças essa posição contém.
- norma: material/norma, se especificado no desenho (senão null — não invente).
- tipo_geometria: só se conseguir classificar com confiança num dos valores \
exatos do schema da ferramenta; senão null.
- as medidas numéricas que esse tipo_geometria usa (ver descrição de cada \
campo no schema) — deixe as demais null, nunca invente cota.
- peso_unitario_estimado_kg: peso de UMA peça (não multiplique pela \
quantidade). Use o peso IMPRESSO no desenho/BOM quando existir; senão, \
estime pela geometria. Preencha sempre que houver informação suficiente.
- observacao: só quando a peça exigir usinagem (furo usinado, rosca, \
rebaixo, encaixe, tolerância apertada, acabamento Ra, GD&T, ajuste H7/g6 \
etc.) — descreva brevemente o que precisa ser usinado. Deixe null se não \
houver nada relevante.
- confianca: 0 a 1, sua confiança na geometria/medidas desse item específico.

Ordene os itens pela posição do desenho, em ordem crescente. Não invente \
peça nem medida que não conseguir identificar com segurança — marque null \
e confiança baixa em vez de chutar. Não duplique peças que aparecem em \
vistas ou páginas diferentes do mesmo desenho."""

# Tipos exatos de services/calc_engine/app/geometria_dispatch.py::TIPOS_GEOMETRIA
# — precisa bater com essas chaves pra /geometria/calcular aceitar.
_TIPOS_GEOMETRIA_VALIDOS = [
    "chapa_retangular", "chapa_circular", "chapa_triangular", "chapa_losango",
    "chapa_trapezoidal", "chapa_anel", "cilindro", "cone_altura", "cone_angulo",
    "cantoneira", "barra_redonda", "tubo_redondo", "perfil",
]

_CAMPO_NUM = {"type": ["number", "null"]}

TOOL_BOM_ESTRUTURADA = {
    "name": "reportar_bom_estruturada",
    "description": (
        "Reporta a lista de materiais do desenho em formato estruturado, um item por "
        "peça, pra montagem automática no cálculo manual do sistema."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "itens": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "posicao": {"type": "string"},
                        "descricao": {"type": "string"},
                        "quantidade": {"type": "number"},
                        "norma": {"type": ["string", "null"]},
                        "tipo_geometria": {
                            "type": ["string", "null"],
                            "enum": [*_TIPOS_GEOMETRIA_VALIDOS, None],
                        },
                        "comprimento_mm": {**_CAMPO_NUM, "description": "chapa_retangular, cilindro, cantoneira, barra_redonda, tubo_redondo, perfil"},
                        "largura_mm": {**_CAMPO_NUM, "description": "chapa_retangular"},
                        "espessura_mm": {**_CAMPO_NUM, "description": "todos os tipos de chapa/cilindro/cone/cantoneira"},
                        "diametro_mm": {**_CAMPO_NUM, "description": "chapa_circular, cilindro, barra_redonda"},
                        "diametro_externo_mm": {**_CAMPO_NUM, "description": "chapa_anel, tubo_redondo"},
                        "diametro_interno_mm": {**_CAMPO_NUM, "description": "chapa_anel"},
                        "diametro_maior_mm": {**_CAMPO_NUM, "description": "cone_altura, cone_angulo"},
                        "diametro_menor_mm": {**_CAMPO_NUM, "description": "cone_altura, cone_angulo (0 = cone fechado)"},
                        "base_mm": {**_CAMPO_NUM, "description": "chapa_triangular"},
                        "altura_mm": {**_CAMPO_NUM, "description": "chapa_triangular, chapa_trapezoidal, cone_altura"},
                        "base_menor_mm": {**_CAMPO_NUM, "description": "chapa_trapezoidal"},
                        "base_maior_mm": {**_CAMPO_NUM, "description": "chapa_trapezoidal"},
                        "diagonal_maior_mm": {**_CAMPO_NUM, "description": "chapa_losango"},
                        "diagonal_menor_mm": {**_CAMPO_NUM, "description": "chapa_losango"},
                        "aba_mm": {**_CAMPO_NUM, "description": "cantoneira (medida da aba)"},
                        "angulo_graus": {**_CAMPO_NUM, "description": "cone_angulo (semiângulo)"},
                        "espessura_parede_mm": {**_CAMPO_NUM, "description": "tubo_redondo"},
                        "peso_kg_m": {**_CAMPO_NUM, "description": "perfil (peso por metro de catálogo, se legível no desenho)"},
                        "peso_unitario_estimado_kg": {
                            **_CAMPO_NUM,
                            "description": (
                                "Peso unitário da peça (uma unidade, não multiplicado pela "
                                "quantidade). Use o peso IMPRESSO no desenho/BOM quando "
                                "existir; senão, sua estimativa. Nunca deixe null se houver "
                                "geometria ou peso suficiente pra estimar."
                            ),
                        },
                        "observacao": {
                            "type": ["string", "null"],
                            "description": "Só se a peça exigir usinagem — breve. Null se não houver nada relevante.",
                        },
                        "confianca": {"type": "number", "minimum": 0, "maximum": 1},
                    },
                    "required": ["posicao", "descricao", "quantidade", "confianca"],
                },
            },
        },
        "required": ["itens"],
    },
}


def fallback_habilitado() -> bool:
    if os.environ.get("EXTRACTOR_AI_FALLBACK_ENABLED", "0") != "1":
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def _validar_item_estruturado(bruto: dict) -> dict:
    """Mantém só os campos conhecidos e garante tipo_geometria dentro do
    enum — a IA às vezes inventa um valor fora do combinado, mais seguro
    descartar (vira null = "revisar manualmente") do que mandar pro
    /geometria/calcular um tipo que ele não reconhece."""
    tipo = bruto.get("tipo_geometria")
    if tipo not in _TIPOS_GEOMETRIA_VALIDOS:
        tipo = None

    campos_medida = (
        "comprimento_mm", "largura_mm", "espessura_mm", "diametro_mm",
        "diametro_externo_mm", "diametro_interno_mm", "diametro_maior_mm",
        "diametro_menor_mm", "base_mm", "altura_mm", "base_menor_mm",
        "base_maior_mm", "diagonal_maior_mm", "diagonal_menor_mm", "aba_mm",
        "angulo_graus", "espessura_parede_mm", "peso_kg_m",
        "peso_unitario_estimado_kg",
    )
    item = {
        "posicao": str(bruto.get("posicao") or ""),
        "descricao": str(bruto.get("descricao") or ""),
        "quantidade": float(bruto.get("quantidade") or 1),
        "norma": bruto.get("norma") or None,
        "tipo_geometria": tipo,
        "observacao": bruto.get("observacao") or None,
        "confianca": float(bruto.get("confianca") or 0),
    }
    for campo in campos_medida:
        valor = bruto.get(campo)
        item[campo] = float(valor) if isinstance(valor, (int, float)) else None
    return item


def extrair_lista_materiais(paginas_png: list[bytes]) -> list[dict] | None:
    """Devolve os itens da BOM extraídos pela IA, ou None em qualquer falha
    (nunca propaga exceção — é um recurso de apoio, não pode derrubar
    nada)."""
    if not fallback_habilitado():
        return None
    if not paginas_png:
        return None

    import anthropic

    paginas_png = paginas_png[:MAX_PAGINAS_LISTA]
    conteudo = [
        {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": base64.standard_b64encode(png).decode("ascii"),
            },
        }
        for png in paginas_png
    ]
    conteudo.append({
        "type": "text",
        "text": "Extraia a lista de materiais (BOM) deste desenho técnico.",
    })

    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        resposta = client.with_options(timeout=120.0).messages.create(
            model=MODEL_ID,
            max_tokens=MAX_TOKENS_LISTA,
            system=PROMPT_LISTA_MATERIAIS,
            messages=[{"role": "user", "content": conteudo}],
            tools=[TOOL_BOM_ESTRUTURADA],
            tool_choice={"type": "tool", "name": "reportar_bom_estruturada"},
        )

        itens: list[dict] = []
        for bloco in resposta.content:
            if bloco.type == "tool_use" and bloco.name == "reportar_bom_estruturada":
                for bruto in bloco.input.get("itens", []):
                    itens.append(_validar_item_estruturado(bruto))
        return itens
    except Exception as exc:
        print(f"[ai_fallback] extrair_lista_materiais falhou: {type(exc).__name__}: {exc}")
        return None
