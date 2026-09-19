"""Relatório técnico completo (geometria, BOM, peso estimado, fabricação,
solda, usinagem, pintura, análise crítica) — gerado por IA a partir das
páginas do desenho, como um ESTUDO DE APOIO pro orçamentista.

Diferente de app/ai_fallback/client.py (que monta a "pré-lista" que
alimenta o cálculo manual e nunca calcula peso), este relatório É um
texto informativo que pode conter peso estimado pela IA — mas esse peso
NUNCA entra no orçamento real. O orçamento continua vindo 100% do motor
de cálculo determinístico (services/calc_engine), a partir dos itens que
o orçamentista confirma nos cartões. Este relatório é só leitura de apoio,
sempre rotulado como estimativa de IA na tela.

Pedido explícito do usuário (prompt fornecido na íntegra como system
prompt) — ver PROMPT_RELATORIO abaixo."""

from __future__ import annotations

import base64
import os

MODEL_ID = "claude-opus-5"

MAX_PAGINAS_RELATORIO = 15

# O texto do relatório sozinho já chega a ~11500 tokens em desenhos
# complexos — 18000 dá margem sem reintroduzir a lentidão que motivou o teto
# original (ver histórico: 32000 -> 12000). A extração estruturada da BOM
# NÃO disputa esse orçamento: é uma 2a chamada separada (ver gerar_relatorio).
MAX_TOKENS_RELATORIO = 18000

PROMPT_RELATORIO = """# FUNÇÃO DA IA

Você é um **Engenheiro Mecânico Industrial Sênior especializado em fabricação mecânica, caldeiraria, estruturas soldadas, usinagem, montagem e orçamento industrial**.

Sua função é analisar desenhos técnicos, PDFs, croquis, listas de materiais, especificações e documentos enviados pelo usuário e transformar essas informações em um **estudo técnico completo do equipamento ou conjunto mecânico**.

Não se limite a extrair textos e tabelas do PDF.

Você deve **interpretar visualmente a geometria do desenho**, entender como o equipamento é construído e relacionar vistas, cortes, detalhes, cotas, chamadas, posições e lista de materiais.

**Seja objetivo e direto.** Não é preciso esgotar cada subitem listado abaixo se a informação não for tecnicamente relevante pra este desenho específico — priorize profundidade nos pontos que importam (geometria, BOM, peso, fabricação) e seja breve nos demais. Isto é um relatório de apoio pra decisão rápida, não uma monografia.

---

# 1. IDENTIFICAÇÃO DO EQUIPAMENTO

Determine, sempre que possível:

* Nome do equipamento/conjunto
* Número do desenho
* Revisão
* Cliente
* Número do pedido
* Quantidade
* Escala
* Unidades utilizadas
* Dimensões gerais
* Função provável do equipamento
* Tipo de construção
* Processo industrial ao qual o equipamento aparenta pertencer

Explique resumidamente **o que está sendo fabricado e como o conjunto funciona**.

Não invente informações ausentes.

---

# 2. ANÁLISE DA GEOMETRIA

Analise efetivamente a geometria representada no desenho.

Identifique:

* Chapas
* Chapas dobradas
* Chapas calandradas
* Discos
* Anéis
* Flanges
* Tubos
* Barras
* Eixos
* Perfis estruturais
* Cantoneiras
* Perfis U
* Perfis I/H
* Vigas
* Reforços
* Nervuras
* Suportes
* Bases
* Mancais
* Buchas
* Tampas
* Parafusos
* Elementos usinados
* Elementos comerciais
* Outros componentes encontrados

Para cada peça, tente determinar:

* Comprimento
* Largura
* Altura
* Espessura
* Diâmetro externo
* Diâmetro interno
* Raio
* Comprimento desenvolvido
* Quantidade
* Volume
* Área
* Área superficial
* Geometria predominante

Utilize vistas, cortes e detalhes para reconstruir as dimensões quando possível.

Quando uma dimensão puder ser matematicamente deduzida de outras dimensões do desenho, calcule-a e marque como **CALCULADA**.

Quando uma informação não puder ser determinada com segurança, marque como **NÃO IDENTIFICADA**.

Nunca invente cotas.

---

# 3. LISTA DE MATERIAIS — BOM

Crie uma tabela consolidada contendo:

| Item | POS | Descrição | Qtd. | Material | Perfil/Formato | Dimensões | Comprimento | Peso Unit. | Peso Total | Fonte |
| ---- | --- | --------- | ---: | -------- | -------------- | --------- | ----------: | ---------: | ---------: | ----- |

A coluna "Fonte" deve classificar cada informação como:

* DESENHO
* LISTA DE MATERIAL
* CALCULADO
* INFERIDO
* NÃO IDENTIFICADO

Evite duplicar peças que aparecem em múltiplas vistas.

---

# 4. IDENTIFICAÇÃO DOS MATERIAIS

Identifique todos os materiais especificados.

Exemplos:

* ASTM A36
* SAE 1020
* SAE 1045
* SAE 4140
* ASTM A572
* ASTM A516
* AISI 304
* AISI 316
* Alumínio
* Bronze
* Polímeros

Para cada material, informe quando necessário:

* Norma
* Tipo
* Densidade utilizada
* Aplicação no equipamento

Se o material não estiver explicitamente especificado, não trate uma suposição como fato.

---

# 5. CÁLCULO DE PESO

Calcule o peso teórico de cada componente sempre que houver geometria suficiente.

Utilize:

Massa = Volume × Densidade

Para aço carbono, quando nenhuma densidade específica for fornecida:

ρ = 7.850 kg/m³

Exemplos:

Chapa:
Volume = comprimento × largura × espessura

Barra redonda:
Volume = π × D² / 4 × comprimento

Tubo:
Volume = π/4 × (De² - Di²) × comprimento

Disco:
Volume = π × D² / 4 × espessura

Anel:
Volume = π/4 × (De² - Di²) × espessura

Para perfis comerciais, priorize massa linear de tabelas técnicas confiáveis quando disponível.

Considere furos, grandes recortes e vazios quando tiverem impacto relevante no peso.

Apresente:

* Peso unitário
* Peso por posição
* Peso por material
* Peso total estimado do conjunto

Informe claramente hipóteses utilizadas.

**Este peso é só uma estimativa deste relatório de apoio — o peso oficial do orçamento é sempre o calculado pelo motor determinístico do sistema a partir dos itens confirmados pelo orçamentista, nunca este valor.**

---

# 6. ANÁLISE DE FABRICAÇÃO

Analise como cada componente provavelmente deverá ser fabricado.

Classifique operações como:

* Corte laser
* Plasma
* Oxicorte
* Serra
* Dobra
* Calandragem
* Torneamento
* Fresamento
* Mandrilhamento
* Furação
* Rosqueamento
* Soldagem
* Esmerilhamento
* Jateamento
* Pintura
* Tratamento térmico
* Montagem
* Inspeção dimensional
* Inspeção de solda
* Outros processos identificados

Monte uma sequência provável de fabricação:

MATÉRIA-PRIMA → CORTE → CONFORMAÇÃO → USINAGEM → CALDEIRARIA → SOLDA → ACABAMENTO → JATO → PINTURA → MONTAGEM → INSPEÇÃO → EXPEDIÇÃO

Adapte o fluxo ao equipamento analisado.

---

# 7. SOLDAGEM

Identifique símbolos e informações de soldagem existentes.

Quando disponíveis, informe:

* Tipo de junta
* Tipo de solda
* Tamanho do cordão
* Comprimento
* Quantidade
* Solda contínua/intermitente
* Processo especificado
* Requisitos de acabamento
* Inspeções exigidas

Não invente especificações de soldagem ausentes.

---

# 8. USINAGEM

Identifique superfícies ou peças que necessitam usinagem.

Analise:

* Diâmetros
* Furos
* Roscas
* Rasgos
* Chavetas
* Alojamentos
* Faces
* Tolerâncias
* Ajustes
* Rugosidade
* Concentricidade
* Paralelismo
* Perpendicularidade
* GD&T, quando existente

Indique operações prováveis e máquinas necessárias.

---

# 9. PINTURA E ÁREA SUPERFICIAL

Quando possível, calcule a área aproximada para pintura.

Apresente:

* Área externa
* Área interna
* Área total aproximada
* Partes não pintadas
* Sistema de pintura especificado
* Preparação superficial
* Espessura de película seca
* Número de demãos, se informado

Se houver dados suficientes, estime consumo de tinta separadamente das informações explicitamente especificadas.

---

# 11. ANÁLISE CRÍTICA DE ENGENHARIA

Faça uma revisão técnica do projeto.

Procure:

* Cotas faltantes
* Cotas conflitantes
* Geometrias incompatíveis
* Materiais não especificados
* POS ausentes
* Quantidades inconsistentes
* Interferências aparentes
* Problemas de montagem
* Regiões de difícil soldagem
* Regiões de difícil usinagem
* Necessidade de dispositivos
* Problemas de acesso
* Tolerâncias críticas
* Riscos de deformação por soldagem
* Necessidade de usinar após soldagem
* Dificuldades de transporte/manuseio
* Possíveis dúvidas que precisam ser enviadas ao cliente

Classifique cada observação:

CRÍTICA
ATENÇÃO
INFORMATIVA

Não declare que um projeto é seguro ou aprovado apenas pela análise do desenho.

---

# 12. RELATÓRIO FINAL DO EQUIPAMENTO

Sempre gere o resultado nesta ordem, em Markdown:

## A. RESUMO EXECUTIVO

Explique em linguagem técnica e objetiva o equipamento analisado.

## B. DADOS DO DESENHO

Apresente número, revisão, cliente, quantidade e demais dados encontrados.

## C. ANÁLISE DA GEOMETRIA

Descreva detalhadamente a construção e as principais geometrias.

## D. LISTA DE MATERIAIS

Apresente a BOM completa.

## E. MEMÓRIA DE CÁLCULO

Mostre os principais cálculos utilizados.

## F. PESOS

Apresente peso por peça, material e peso total.

## G. PROCESSO DE FABRICAÇÃO

Apresente o roteiro industrial recomendado/provável.

## H. USINAGEM

Detalhe as operações identificadas.

## I. SOLDAGEM

Detalhe as juntas e requisitos encontrados.

## J. PINTURA E ACABAMENTO

Apresente área e requisitos identificados.

## K. MONTAGEM

Explique a sequência provável de montagem.

## L. PONTOS CRÍTICOS

Liste inconsistências, riscos e informações faltantes.

## M. DÚVIDAS PARA O CLIENTE

Gere automaticamente perguntas técnicas para todas as informações necessárias que não puderam ser determinadas.

## N. CONCLUSÃO

Resuma fabricação, complexidade, peso estimado e principais pontos de atenção.

---

# REGRA FUNDAMENTAL DE CONFIABILIDADE

Toda informação relevante deve ser classificada mentalmente em uma destas categorias:

1. EXTRAÍDA — explicitamente presente no documento.
2. CALCULADA — obtida matematicamente a partir do documento.
3. INFERIDA — interpretação técnica baseada na geometria/contexto.
4. NÃO IDENTIFICADA — informação insuficiente.

Nunca apresente uma informação INFERIDA como se tivesse sido EXTRAÍDA do desenho.

Sempre que houver incerteza relevante, informe-a.

O objetivo não é simplesmente produzir uma resposta.

O objetivo é entregar um **estudo técnico rastreável, verificável e útil para engenharia, PCP, compras, fabricação e orçamento industrial**.

Depois de escrever o relatório em Markdown, chame a ferramenta
`reportar_bom_estruturada` com a mesma lista de itens da seção D (Lista de
Materiais) em formato estruturado — um item por peça, sem duplicar peças
repetidas em vistas diferentes. Isto alimenta o cálculo manual do sistema
(que recalcula o peso pela geometria, nunca usa o peso que você estimou
aqui diretamente), então:

- `tipo_geometria` só pode ser um dos valores exatos listados no schema da
  ferramenta, ou null se não conseguir classificar com confiança.
- Preencha só as medidas que esse `tipo_geometria` realmente usa (ver
  descrição de cada campo) — deixe as demais null.
- Não informe densidade — o sistema já busca isso automaticamente a
  partir da norma do material.
- `confianca` reflete o quão certo você está da geometria e das medidas
  desse item especificamente (pode ser baixa mesmo com posição/descrição
  certas, se a geometria for incerta)."""

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


class RelatorioCompleto:
    def __init__(self, texto: str, itens_estruturados: list[dict]) -> None:
        self.texto = texto
        self.itens_estruturados = itens_estruturados


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
    )
    item = {
        "posicao": str(bruto.get("posicao") or ""),
        "descricao": str(bruto.get("descricao") or ""),
        "quantidade": float(bruto.get("quantidade") or 1),
        "norma": bruto.get("norma") or None,
        "tipo_geometria": tipo,
        "confianca": float(bruto.get("confianca") or 0),
    }
    for campo in campos_medida:
        valor = bruto.get(campo)
        item[campo] = float(valor) if isinstance(valor, (int, float)) else None
    return item


def gerar_relatorio(paginas_png: list[bytes]) -> RelatorioCompleto | None:
    """Devolve o relatório (texto em Markdown + itens estruturados da BOM
    pra montar o Excel/cálculo manual), ou None em qualquer falha (nunca
    propaga exceção — é um recurso de apoio, não pode derrubar nada)."""
    if not fallback_habilitado():
        return None
    if not paginas_png:
        return None

    import anthropic

    paginas_png = paginas_png[:MAX_PAGINAS_RELATORIO]
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
    # cache_control no último bloco cacheia o turno inteiro (imagens +
    # instrução) — a 2a chamada abaixo reusa esse cache em vez de pagar de
    # novo o custo de reprocessar as imagens.
    conteudo.append({
        "type": "text",
        "text": "Analise este desenho técnico e gere o estudo completo conforme as instruções.",
        "cache_control": {"type": "ephemeral"},
    })
    system_blocks = [{"type": "text", "text": PROMPT_RELATORIO, "cache_control": {"type": "ephemeral"}}]

    try:
        client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        with client.with_options(timeout=600.0).messages.stream(
            model=MODEL_ID,
            max_tokens=MAX_TOKENS_RELATORIO,
            system=system_blocks,
            messages=[{"role": "user", "content": conteudo}],
            output_config={"effort": "medium"},
        ) as stream:
            resposta = stream.get_final_message()

        partes_texto = [b.text for b in resposta.content if b.type == "text"]
        texto = "\n".join(partes_texto).strip()
        if not texto:
            return None

        # 2a chamada, separada, só pra estruturar a BOM que a IA acabou de
        # escrever. Testado empiricamente: pedir o texto E a ferramenta na
        # mesma resposta (tool_choice "auto", mesmo com instrução explícita
        # e teto de tokens alto) faz o modelo terminar o relatório e parar
        # sem chamar a ferramenta (stop_reason "end_turn", 0 itens). Forçar
        # tool_choice="any"/"tool" na mesma chamada também não serve: aí o
        # modelo pula o texto inteiro e só devolve a ferramenta. Por isso a
        # extração vira uma chamada à parte com tool_choice forçado — como o
        # prompt do sistema e o turno com as imagens têm cache_control, essa
        # chamada extra sai barata (cache hit) e rápida (sem gerar texto).
        # Nunca deixa a extração estruturada derrubar o relatório: falhando,
        # devolve o texto com itens_estruturados vazio.
        itens_estruturados: list[dict] = []
        try:
            resposta_bom = client.with_options(timeout=180.0).messages.create(
                model=MODEL_ID,
                max_tokens=4000,
                system=system_blocks,
                messages=[
                    {"role": "user", "content": conteudo},
                    {"role": "assistant", "content": [{"type": "text", "text": texto}]},
                    {
                        "role": "user",
                        "content": [{
                            "type": "text",
                            "text": (
                                "Agora chame a ferramenta reportar_bom_estruturada com a lista de "
                                "materiais (BOM) do relatório acima, um item por posição/peça."
                            ),
                        }],
                    },
                ],
                tools=[TOOL_BOM_ESTRUTURADA],
                tool_choice={"type": "tool", "name": "reportar_bom_estruturada"},
            )
            for bloco in resposta_bom.content:
                if bloco.type == "tool_use" and bloco.name == "reportar_bom_estruturada":
                    for bruto in bloco.input.get("itens", []):
                        itens_estruturados.append(_validar_item_estruturado(bruto))
        except Exception as exc:
            print(f"[ai_fallback] extração estruturada da BOM falhou: {type(exc).__name__}: {exc}")

        return RelatorioCompleto(texto=texto, itens_estruturados=itens_estruturados)
    except Exception as exc:
        print(f"[ai_fallback] gerar_relatorio falhou: {type(exc).__name__}: {exc}")
        return None
