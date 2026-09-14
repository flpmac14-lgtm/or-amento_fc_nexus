"""Fallback de IA externa — só deve ser chamado quando o pipeline local
(texto nativo + OCR + regras) não atinge a confiança mínima em campos
essenciais. Nunca é chamado incondicionalmente e nunca devolve custo/preço.

Desligado por padrão. Fica ativo só se EXTRACTOR_AI_FALLBACK_ENABLED=1 e uma
chave de API (OPENAI_API_KEY ou ANTHROPIC_API_KEY) estiver configurada.
"""

from __future__ import annotations

import os


def fallback_habilitado() -> bool:
    if os.environ.get("EXTRACTOR_AI_FALLBACK_ENABLED", "0") != "1":
        return False
    return bool(os.environ.get("OPENAI_API_KEY") or os.environ.get("ANTHROPIC_API_KEY"))


def complementar_com_ia(imagem_pagina_png: bytes, campos_com_baixa_confianca: list[str]) -> dict:
    """Stub: envia a página (como imagem) e a lista de campos incertos para
    um modelo multimodal e espera de volta só valores estruturados — nunca
    peso, custo ou preço calculados.

    Implementação real fica para quando houver decisão sobre qual provedor
    usar (OpenAI/Claude) e uma chave configurada; por enquanto devolve vazio
    para manter o pipeline funcionando 100% local por padrão.
    """
    if not fallback_habilitado():
        return {}
    raise NotImplementedError(
        "Fallback de IA externa ainda não implementado. "
        "Configurar client real (OpenAI ou Claude) quando houver chave de API definida."
    )
