"""Fallback de IA externa — só deve ser chamado quando o pipeline local
(texto nativo + OCR + regras) não atinge a confiança mínima em campos
essenciais OU não acha nenhuma tabela de BOM no desenho. Nunca é chamado
incondicionalmente e NUNCA devolve peso/custo/preço calculado — só o que
está escrito/desenhado na folha, com confiança por campo (mesma regra do
resto do pipeline local, ver app/schemas.py).

Desligado por padrão. Fica ativo só se EXTRACTOR_AI_FALLBACK_ENABLED=1 e
ANTHROPIC_API_KEY estiver configurada.

Pedido explícito do usuário: a IA monta uma "pré-lista" (posição,
descrição, norma, quantidade) pra revisão — ela NÃO tenta adivinhar tipo
de geometria nem medidas (espessura/comprimento/largura/diâmetro). Isso
fica sempre para o orçamentista escolher no cartão de cálculo manual,
que então calcula o peso pelo motor determinístico."""

from __future__ import annotations

import base64
import os

from pydantic import BaseModel, Field

MODEL_ID = "claude-opus-5"

# Cobre título/BOM na maioria dos desenhos reais sem mandar o PDF inteiro
# (custo/latência) — desenhos com BOM em anexo separado já viram um PDF à
# parte em app/pipeline.py::processar_pdfs, então isto é por-arquivo.
MAX_PAGINAS_POR_CHAMADA = 6

_PROMPT = """Você está vendo página(s) de um desenho técnico industrial (fabricação
metalúrgica). Extraia SOMENTE o que está escrito ou desenhado na folha —
nunca calcule, estime ou infira peso, custo, hora ou preço.

1. Identificação (procure no carimbo/título, se existir):
   número do desenho, revisão, número de pedido/PO, código do equipamento.

2. Lista de materiais (BOM), se houver uma tabela "LISTA DE MATERIAL" /
   "BILL OF MATERIALS" / similar na folha: para cada linha, extraia
   posição/item, descrição, norma do material (se aparecer) e quantidade.
   NÃO tente identificar o tipo de geometria (chapa/tubo/perfil/barra) nem
   medir dimensões a partir do desenho — isso fica para revisão manual.
   Se não achar nenhuma tabela de BOM na folha, devolva a lista vazia.

Para cada campo, dê um `confianca` de 0 a 1 refletindo o quão certo você
está do que leu (1.0 = texto nítido e inequívoco; valores baixos para
texto borrado, cortado ou ambíguo). Campo que você não encontrou na folha:
valor null e confianca 0."""


class _CampoTexto(BaseModel):
    valor: str | None = None
    confianca: float = Field(ge=0, le=1)


class _ItemPreLista(BaseModel):
    posicao: str | None = None
    descricao: str | None = None
    norma: str | None = None
    quantidade: float | None = None
    confianca: float = Field(ge=0, le=1)


class _IdentificacaoIA(BaseModel):
    numero_desenho: _CampoTexto
    revisao: _CampoTexto
    pedido_po: _CampoTexto
    codigo_equipamento: _CampoTexto


class RespostaIA(BaseModel):
    identificacao: _IdentificacaoIA
    itens_bom: list[_ItemPreLista]


def fallback_habilitado() -> bool:
    if os.environ.get("EXTRACTOR_AI_FALLBACK_ENABLED", "0") != "1":
        return False
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def analisar_paginas(paginas_png: list[bytes]) -> RespostaIA | None:
    """Envia as páginas (já renderizadas como PNG) pra Claude e devolve a
    pré-lista estruturada. Devolve None em qualquer falha (chave inválida,
    rate limit, timeout, resposta malformada etc.) — este caminho é só um
    complemento opcional, nunca pode derrubar o pipeline principal."""
    if not fallback_habilitado():
        return None
    if not paginas_png:
        return None

    import anthropic

    paginas_png = paginas_png[:MAX_PAGINAS_POR_CHAMADA]
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
    conteudo.append({"type": "text", "text": _PROMPT})

    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        resposta = client.with_options(timeout=60.0).messages.parse(
            model=MODEL_ID,
            max_tokens=4096,
            messages=[{"role": "user", "content": conteudo}],
            output_format=RespostaIA,
        )
        return resposta.parsed_output
    except Exception:
        # Qualquer erro (rede, chave inválida, rate limit, JSON fora do
        # schema) — loga implicitamente via retorno None; quem chama decide
        # o que fazer sem propagar exceção pro pipeline determinístico.
        return None
