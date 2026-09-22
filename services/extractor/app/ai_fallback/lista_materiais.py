"""Extração da lista de materiais (BOM) por IA a partir das páginas do
desenho — SÓ ISSO, sem relatório narrativo. Substitui o antigo "relatório
técnico completo" (removido a pedido explícito do usuário por custo: o
texto narrativo era a parte mais cara de cada chamada e ele só usa a BOM
mesmo; qualquer análise de fabricação/solda/pintura/crítica o orçamentista
faz à parte).

Uma chamada só, com saída estruturada forçada (response_schema) — nunca
gera texto solto. O peso que a IA estima aqui vira o valor inicial
(editável) do cartão "Peso direto" no Cálculo manual — nunca é o peso
oficial do orçamento sem o orçamentista confirmar (ver
apps/web/src/lib/itensCalculados.ts::converterParaPesoDireto).

Orçamento de custo (pedido explícito do usuário, ~300 desenhos/mês por
R$50): Gemini 3.5 Flash-Lite (Google) em vez de Claude — ~6-7x mais barato
que o Sonnet usado antes (o Gemini 2.5 Flash-Lite, ainda mais barato, não
está mais disponível pra chaves de API novas — ver
console do Google/erro 404 "no longer available to new users"). Prompt
curto (~1000 caracteres), sem geração de texto longo, e
MAX_PAGINAS_LISTA baixo pra um PDF fora do padrão não estourar o
orçamento do mês sozinho."""

from __future__ import annotations

import os
import time
from typing import Literal, Optional

from pydantic import BaseModel, Field

MODEL_ID = "gemini-3.5-flash-lite"

# Baixo de propósito (era 15 no relatório antigo por Claude) — desenhos do
# usuário têm em média 2-5 páginas; um teto baixo protege o orçamento
# mensal de um PDF fora do padrão custar sozinho o equivalente a vários
# desenhos normais.
MAX_PAGINAS_LISTA = 5

# Sem texto longo pra gerar (só o JSON estruturado), mas cada item no
# schema tem ~20 campos de medida (a maioria null pra qualquer peça) —
# um desenho com bastante peças (ex.: uma plataforma modular completa)
# passa fácil de 20-30 itens e estourava o teto antigo (4000) no meio do
# JSON, invalidando o parse inteiro e devolvendo lista vazia sem erro
# nenhum (bug real visto em produção com um desenho de 30+ posições).
MAX_TOKENS_LISTA = 24000

PROMPT_LISTA_MATERIAIS = """Você é um engenheiro mecânico industrial. Analise as imagens do desenho \
técnico e extraia SÓ a lista de materiais (BOM) — nada de relatório, \
análise de fabricação, solda ou pintura, isso não faz parte desta tarefa.

Devolva um item por peça/posição, com:

- posicao: número da posição exatamente como aparece no desenho.
- descricao: objetiva, sem repetir a norma do material.
- quantidade: quantas peças essa posição contém.
- norma: material/norma, se especificado no desenho (senão null — não invente).
- tipo_geometria: CLASSIFIQUE SEMPRE que a peça tiver forma geométrica simples \
reconhecível, mesmo peças comerciais pequenas (ex.: um pino/parafuso é \
barra_redonda, uma placa/etiqueta plana é chapa_retangular ou \
chapa_circular). Só deixe null se a forma for genuinamente complexa demais \
pra classificar num dos valores exatos permitidos — não deixe null só por \
ser um item pequeno ou comercial. Use `confianca` baixa quando tiver dúvida, \
em vez de pular a classificação.
- as medidas numéricas que esse tipo_geometria usa — pode estimar por \
proporção visual quando a cota exata não estiver legível (marque confiança \
mais baixa nesse caso), mas tente sempre preencher em vez de deixar null.
- peso_unitario_estimado_kg: peso de UMA peça (não multiplique pela \
quantidade). Use o peso IMPRESSO no desenho/BOM quando existir; senão, \
ESTIME pela geometria e material — inclusive pra peças comerciais pequenas \
(parafuso, pino, placa de sinalização): calcule volume aproximado × \
densidade típica do material (aço ~7850 kg/m³, alumínio ~2700 kg/m³). Só \
deixe null se for realmente impossível estimar nem grosseiramente.
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
_TIPOS_GEOMETRIA_VALIDOS = (
    "chapa_retangular", "chapa_circular", "chapa_triangular", "chapa_losango",
    "chapa_trapezoidal", "chapa_anel", "cilindro", "cone_altura", "cone_angulo",
    "cantoneira", "barra_redonda", "tubo_redondo", "perfil",
)

_TipoGeometria = Literal[
    "chapa_retangular", "chapa_circular", "chapa_triangular", "chapa_losango",
    "chapa_trapezoidal", "chapa_anel", "cilindro", "cone_altura", "cone_angulo",
    "cantoneira", "barra_redonda", "tubo_redondo", "perfil",
]


class _ItemBOM(BaseModel):
    posicao: str
    descricao: str
    quantidade: float
    norma: Optional[str] = None
    tipo_geometria: Optional[_TipoGeometria] = None
    comprimento_mm: Optional[float] = None
    largura_mm: Optional[float] = None
    espessura_mm: Optional[float] = None
    diametro_mm: Optional[float] = None
    diametro_externo_mm: Optional[float] = None
    diametro_interno_mm: Optional[float] = None
    diametro_maior_mm: Optional[float] = None
    diametro_menor_mm: Optional[float] = None
    base_mm: Optional[float] = None
    altura_mm: Optional[float] = None
    base_menor_mm: Optional[float] = None
    base_maior_mm: Optional[float] = None
    diagonal_maior_mm: Optional[float] = None
    diagonal_menor_mm: Optional[float] = None
    aba_mm: Optional[float] = None
    angulo_graus: Optional[float] = None
    espessura_parede_mm: Optional[float] = None
    peso_kg_m: Optional[float] = None
    peso_unitario_estimado_kg: Optional[float] = None
    observacao: Optional[str] = None
    confianca: float = Field(ge=0, le=1)


class _ListaMateriais(BaseModel):
    itens: list[_ItemBOM]


def fallback_habilitado() -> bool:
    if os.environ.get("EXTRACTOR_AI_FALLBACK_ENABLED", "0") != "1":
        return False
    return bool(os.environ.get("GOOGLE_API_KEY"))


def _validar_item_estruturado(bruto: dict) -> dict:
    """Mantém só os campos conhecidos e garante tipo_geometria dentro do
    enum — defesa extra além do response_schema (a IA raramente foge do
    schema, mas mais seguro nunca confiar cegamente). tipo_geometria fora
    do enum vira null (= "revisar manualmente") em vez de quebrar."""
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


# Códigos HTTP que o Gemini devolve pra sobrecarga/limite passageiro (rate
# limit, modelo ocupado) — vale tentar de novo. Qualquer outro (400 pedido
# inválido, 403 chave sem permissão etc.) não tem porque repetir, o
# resultado seria o mesmo.
_CODIGOS_TRANSITORIOS = {429, 500, 503, 504}
_TENTATIVAS = 2
_ESPERA_ENTRE_TENTATIVAS_S = 4


def extrair_lista_materiais(paginas_png: list[bytes]) -> tuple[list[dict] | None, str | None]:
    """Devolve (itens, None) em sucesso ou (None, motivo) em qualquer falha
    (nunca propaga exceção — é um recurso de apoio, não pode derrubar
    nada). `motivo` é só pra log/diagnóstico (ex.: aparecer no erro HTTP
    devolvido pro calc_engine/frontend) — antes esse erro real (rate limit,
    timeout, modelo sobrecarregado etc.) ficava só no log do processo,
    inacessível sem entrar no painel do Render pra debugar um 502 genérico.

    Erro transitório (429/500/503/504, achado real em produção: dois
    desenhos seguidos falharam por sobrecarga do modelo) ganha até
    `_TENTATIVAS` tentativas com uma pequena espera entre elas antes de
    desistir — roda dentro de run_in_threadpool (ver main.py), então o
    time.sleep aqui não trava o event loop do serviço."""
    if not fallback_habilitado():
        return None, "Extração de lista de materiais por IA não está configurada neste ambiente."
    if not paginas_png:
        return None, "Nenhuma página do desenho pra analisar."

    from google import genai
    from google.genai import errors, types

    paginas_png = paginas_png[:MAX_PAGINAS_LISTA]
    partes = [
        types.Part.from_bytes(data=png, mime_type="image/png")
        for png in paginas_png
    ]
    partes.append("Extraia a lista de materiais (BOM) deste desenho técnico.")

    for tentativa in range(1, _TENTATIVAS + 1):
        try:
            client = genai.Client(api_key=os.environ["GOOGLE_API_KEY"])
            resposta = client.models.generate_content(
                model=MODEL_ID,
                contents=partes,
                config=types.GenerateContentConfig(
                    system_instruction=PROMPT_LISTA_MATERIAIS,
                    response_mime_type="application/json",
                    response_schema=_ListaMateriais,
                    max_output_tokens=MAX_TOKENS_LISTA,
                ),
            )
            dados: _ListaMateriais | None = resposta.parsed
            if dados is None:
                candidatos = getattr(resposta, "candidates", None) or []
                motivo = candidatos[0].finish_reason if candidatos else "desconhecido"
                print(
                    f"[ai_fallback] extrair_lista_materiais: resposta não veio no schema esperado "
                    f"(finish_reason={motivo}) — devolvendo lista vazia. Se finish_reason for "
                    f"MAX_TOKENS, o desenho tem mais itens do que MAX_TOKENS_LISTA comporta."
                )
                return [], None
            itens = [_validar_item_estruturado(item.model_dump()) for item in dados.itens]
            return itens, None
        except errors.APIError as exc:
            motivo = f"{type(exc).__name__}: {exc}"
            transitorio = exc.code in _CODIGOS_TRANSITORIOS
            ultima_tentativa = tentativa == _TENTATIVAS
            print(
                f"[ai_fallback] extrair_lista_materiais tentativa {tentativa}/{_TENTATIVAS} "
                f"falhou: {motivo}"
            )
            if not transitorio or ultima_tentativa:
                return None, motivo
            time.sleep(_ESPERA_ENTRE_TENTATIVAS_S)
        except Exception as exc:
            motivo = f"{type(exc).__name__}: {exc}"
            print(f"[ai_fallback] extrair_lista_materiais falhou: {motivo}")
            return None, motivo
    return None, "Falhou após todas as tentativas."
