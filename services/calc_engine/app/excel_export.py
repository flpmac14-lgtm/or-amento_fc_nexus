"""Exporta o orçamento como planilha Excel EDITÁVEL — ao contrário do
relatório de impressão (que é só leitura), aqui os valores importantes
(peso, taxas por processo, alíquotas) ficam em células próprias na aba
"Parâmetros" e as outras abas referenciam essas células por fórmula, não
por valor fixo. Mudar um parâmetro recalcula tudo, igual no motor real —
é a mesma matemática de app/processos.py e app/comercial.py, só que
reescrita como fórmula do Excel em vez de Python.

O que NÃO vira fórmula (fica como número editável direto, sem derivação):
usinagem (lista de operações ad hoc) e itens_padrao (idem) — não têm uma
taxa única por kg/peça pra expor como parâmetro, e horas de caldeiraria
quando vêm do histórico combinado (usar_historico_horas) em vez da regra
simples peso×fator.
"""

from __future__ import annotations

import io

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.parametros_padrao import ALIQUOTAS_COMPRA_POR_TIPO, PARAMETROS_PADRAO

MOEDA = '#,##0.00'
PERCENTUAL = '0.00%'

_FUNDO_CABECALHO = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
_FONTE_CABECALHO = Font(color="F1F5F9", bold=True)
_FONTE_TOTAL = Font(bold=True)


def _cabecalho(ws, linha: int, titulos: list[str]) -> None:
    for col, titulo in enumerate(titulos, start=1):
        celula = ws.cell(row=linha, column=col, value=titulo)
        celula.fill = _FUNDO_CABECALHO
        celula.font = _FONTE_CABECALHO


def _ajustar_largura(ws, larguras: dict[str, int]) -> None:
    for col, largura in larguras.items():
        ws.column_dimensions[col].width = largura


def _montar_parametros(ws, entrada: dict, params: dict, comercial) -> dict[str, int]:
    """Escreve a aba de parâmetros e devolve {chave: numero_da_linha} pra
    as outras abas referenciarem por fórmula."""
    _cabecalho(ws, 1, ["Parâmetro", "Valor"])
    linhas: dict[str, int] = {}
    r = 2

    def add(chave: str, rotulo: str, valor, fmt: str | None = None):
        nonlocal r
        ws.cell(row=r, column=1, value=rotulo)
        celula = ws.cell(row=r, column=2, value=valor)
        if fmt:
            celula.number_format = fmt
        linhas[chave] = r
        r += 1

    add("peso_liquido_kg", "Peso líquido (kg)", entrada["peso_liquido_kg"], MOEDA)
    add("fator_margem", "Fator de margem de venda", params["fator_margem_venda"], "0.00")
    add("corte_valor_kg", "Corte — R$/kg", params["corte_valor_kg"], MOEDA)
    add("caldeiraria_fator_h_kg", "Caldeiraria — fator h/kg", params["caldeiraria_fator_h_kg"], "0.0000")
    add("caldeiraria_valor_hora", "Caldeiraria — R$/h", params["caldeiraria_valor_hora"], MOEDA)
    add("jateamento_divisor", "Jateamento/pintura — divisor sobre h caldeiraria", params["jateamento_pintura_divisor"], "0")
    add("jateamento_valor_hora", "Jateamento/pintura — R$/h", params["jateamento_pintura_valor_hora"], MOEDA)
    add("solda_fator_consumo", "Solda — % consumível sobre peso", params["solda_fator_consumo_percentual"], PERCENTUAL)
    add("solda_preco_consumivel", "Solda — R$/kg consumível", params["solda_preco_kg_consumivel"], MOEDA)
    add("solda_fator_gas", "Solda — % gás sobre consumível", params["solda_fator_gas_sobre_consumivel"], PERCENTUAL)
    add("solda_preco_gas", "Solda — R$/unidade gás", params["solda_preco_unidade_gas"], MOEDA)
    add("pintura_fator_l_m2", "Pintura — L/m² por demão", params["pintura_fator_l_m2"], "0.0000")
    add("area_pintura_m2", "Área de pintura (m²)", entrada.get("area_pintura_m2") or 0, "0.00")
    demaos = params["pintura_demaos"]
    preco_fundo = next((d["preco_litro"] for d in demaos if d["tipo"] == "fundo"), 0.0)
    preco_acabamento = next((d["preco_litro"] for d in demaos if d["tipo"] == "acabamento"), 0.0)
    add("pintura_preco_fundo", "Pintura — R$/L fundo", preco_fundo, MOEDA)
    add("pintura_preco_acabamento", "Pintura — R$/L acabamento", preco_acabamento, MOEDA)
    add("ndt_valor_kg", "NDT — R$/kg", params["ndt_valor_kg"], MOEDA)
    add("engenharia_valor_unitario", "Engenharia — R$/posição", params["engenharia_valor_unitario"], MOEDA)
    add("qtd_posicoes_engenharia", "Quantidade de posições de engenharia", entrada.get("quantidade_posicoes_engenharia") or 0, "0")
    add("embalagem_valor_kg", "Embalagem — R$/kg", params["embalagem_valor_kg"], MOEDA)
    add("transporte_valor_kg", "Transporte — R$/kg", params["transporte_valor_kg"], MOEDA)
    add("energia_valor_kg", "Energia — R$/kg", params["energia_valor_kg"], MOEDA)
    add("aliquota_venda", f"Alíquota de venda ({comercial.cenario_comercial})", comercial.aliquota_venda, PERCENTUAL)

    _ajustar_largura(ws, {"A": 44, "B": 16})
    return linhas


def _ref(linhas: dict[str, int], chave: str) -> str:
    return f"Parâmetros!$B${linhas[chave]}"


def _montar_materia_prima(ws, itens: list[dict]) -> str | None:
    """Devolve a referência da célula de total líquido (ou None se vazio)."""
    _cabecalho(ws, 1, ["Descrição", "Peso (kg)", "Preço/kg", "Bruto", "ICMS", "PIS/COFINS", "Líquido"])
    icms, pis_cofins = ALIQUOTAS_COMPRA_POR_TIPO["materia_prima"]

    r = 2
    for item in itens:
        ws.cell(row=r, column=1, value=item["descricao"])
        ws.cell(row=r, column=2, value=item["peso_kg"]).number_format = "0.00"
        ws.cell(row=r, column=3, value=item["preco_kg"]).number_format = MOEDA
        ws.cell(row=r, column=4, value=f"=B{r}*C{r}").number_format = MOEDA
        ws.cell(row=r, column=5, value=icms).number_format = PERCENTUAL
        ws.cell(row=r, column=6, value=pis_cofins).number_format = PERCENTUAL
        ws.cell(row=r, column=7, value=f"=D{r}*(1-E{r}-F{r})").number_format = MOEDA
        r += 1

    if r == 2:
        return None

    total_row = r
    ws.cell(row=total_row, column=1, value="Total").font = _FONTE_TOTAL
    celula_total = ws.cell(row=total_row, column=7, value=f"=SUM(G2:G{total_row - 1})")
    celula_total.number_format = MOEDA
    celula_total.font = _FONTE_TOTAL
    _ajustar_largura(ws, {"A": 40, "B": 12, "C": 12, "D": 14, "E": 10, "F": 12, "G": 14})
    return f"'Matéria-prima'!$G${total_row}"


def _formula_bruto_processo(codigo: str, entrada: dict, linhas_p: dict[str, int], linha_caldeiraria_horas_cel: str | None) -> tuple[str, str | None]:
    """Devolve (formula_bruto, formula_horas_ou_None) pro código de processo."""
    peso = _ref(linhas_p, "peso_liquido_kg")

    if codigo == "corte":
        return f"={peso}*{_ref(linhas_p, 'corte_valor_kg')}", None

    if codigo == "caldeiraria":
        if entrada.get("usar_historico_horas"):
            return None, None  # tratado como valor estático fora daqui
        # app/processos.py calcula o bruto com as horas SEM arredondar, mas
        # guarda linha.horas arredondado (2 casas) — e é esse valor
        # arredondado que orcamento.py repassa pro jateamento/pintura. Pra
        # bater exato com o motor real, o bruto daqui usa a expressão cheia
        # (sem arredondar) e a célula de Horas (que o jateamento referencia)
        # arredonda, replicando a mesma perda de precisão intermediária.
        horas_cheio = f"{peso}*{_ref(linhas_p, 'caldeiraria_fator_h_kg')}"
        return f"={horas_cheio}*{_ref(linhas_p, 'caldeiraria_valor_hora')}", f"=ROUND({horas_cheio},2)"

    if codigo == "jateamento_pintura_mo":
        if linha_caldeiraria_horas_cel is None:
            return None, None
        horas = f"{linha_caldeiraria_horas_cel}/{_ref(linhas_p, 'jateamento_divisor')}"
        return f"={horas}*{_ref(linhas_p, 'jateamento_valor_hora')}", f"=ROUND({horas},2)"

    if codigo == "solda":
        return (
            f"={peso}*{_ref(linhas_p, 'solda_fator_consumo')}*"
            f"({_ref(linhas_p, 'solda_preco_consumivel')}+{_ref(linhas_p, 'solda_fator_gas')}*{_ref(linhas_p, 'solda_preco_gas')})",
            None,
        )

    if codigo == "pintura_material":
        return (
            f"={_ref(linhas_p, 'area_pintura_m2')}*{_ref(linhas_p, 'pintura_fator_l_m2')}*"
            f"({_ref(linhas_p, 'pintura_preco_fundo')}+{_ref(linhas_p, 'pintura_preco_acabamento')})",
            None,
        )

    if codigo == "ndt":
        return f"={peso}*{_ref(linhas_p, 'ndt_valor_kg')}", None

    if codigo == "engenharia":
        return f"={_ref(linhas_p, 'qtd_posicoes_engenharia')}*{_ref(linhas_p, 'engenharia_valor_unitario')}", None

    if codigo == "embalagem":
        return f"={peso}*{_ref(linhas_p, 'embalagem_valor_kg')}", None

    if codigo == "transporte":
        return f"={peso}*{_ref(linhas_p, 'transporte_valor_kg')}", None

    if codigo == "energia":
        return f"={peso}*{_ref(linhas_p, 'energia_valor_kg')}", None

    return None, None  # usinagem, itens_padrao — sem taxa única, fica estático


def _montar_processos(ws, resultado_linhas: list, entrada: dict, linhas_p: dict[str, int]) -> str:
    _cabecalho(ws, 1, ["Processo", "Horas", "Bruto", "ICMS", "PIS/COFINS", "Líquido"])

    r = 2
    horas_caldeiraria_cel: str | None = None
    for linha in resultado_linhas:
        if linha.codigo == "materia_prima":
            continue

        ws.cell(row=r, column=1, value=linha.descricao)

        formula_bruto, formula_horas = _formula_bruto_processo(
            linha.codigo, entrada, linhas_p,
            horas_caldeiraria_cel if linha.codigo == "jateamento_pintura_mo" else None,
        )

        if formula_horas is not None:
            ws.cell(row=r, column=2, value=formula_horas).number_format = "0.00"
            if linha.codigo == "caldeiraria":
                horas_caldeiraria_cel = f"Processos!$B${r}"
        elif linha.horas is not None:
            ws.cell(row=r, column=2, value=linha.horas).number_format = "0.00"
            if linha.codigo == "caldeiraria":
                horas_caldeiraria_cel = f"Processos!$B${r}"

        if formula_bruto is not None:
            ws.cell(row=r, column=3, value=formula_bruto).number_format = MOEDA
        else:
            ws.cell(row=r, column=3, value=round(linha.valor_bruto, 2)).number_format = MOEDA

        ws.cell(row=r, column=4, value=linha.aliquota_icms).number_format = PERCENTUAL
        ws.cell(row=r, column=5, value=linha.aliquota_pis_cofins).number_format = PERCENTUAL
        ws.cell(row=r, column=6, value=f"=C{r}*(1-D{r}-E{r})").number_format = MOEDA
        r += 1

    total_row = r
    ws.cell(row=total_row, column=1, value="Total processos").font = _FONTE_TOTAL
    celula_total = ws.cell(row=total_row, column=6, value=f"=SUM(F2:F{total_row - 1})")
    celula_total.number_format = MOEDA
    celula_total.font = _FONTE_TOTAL
    _ajustar_largura(ws, {"A": 42, "B": 10, "C": 14, "D": 10, "E": 12, "F": 14})
    return f"Processos!$F${total_row}"


def _montar_resumo(ws, linhas_p: dict[str, int], ref_total_materia_prima: str | None, ref_total_processos: str) -> None:
    partes_custo = [ref_total_processos]
    if ref_total_materia_prima:
        partes_custo.append(ref_total_materia_prima)
    formula_custo_industrial = "=" + "+".join(partes_custo)

    _cabecalho(ws, 1, ["Resumo comercial", ""])
    linhas = [
        ("Peso líquido (kg)", f"={_ref(linhas_p, 'peso_liquido_kg')}", "0.00"),
        ("Custo industrial", formula_custo_industrial, MOEDA),
        ("Fator de margem", f"={_ref(linhas_p, 'fator_margem')}", "0.00"),
        ("Alíquota de venda", f"={_ref(linhas_p, 'aliquota_venda')}", PERCENTUAL),
    ]
    for i, (rotulo, formula, fmt) in enumerate(linhas, start=2):
        ws.cell(row=i, column=1, value=rotulo)
        ws.cell(row=i, column=2, value=formula).number_format = fmt

    custo_cel, margem_cel, aliquota_cel, peso_cel = "B3", "B4", "B5", "B2"
    ws.cell(row=6, column=1, value="Preço de venda (c/ impostos)")
    ws.cell(row=6, column=2, value=f"={custo_cel}*(1+{margem_cel})").number_format = MOEDA
    venda_com_impostos_cel = "B6"

    ws.cell(row=7, column=1, value="Imposto a pagar")
    ws.cell(row=7, column=2, value=f"={venda_com_impostos_cel}*{aliquota_cel}").number_format = MOEDA
    imposto_cel = "B7"

    ws.cell(row=8, column=1, value="Margem de lucro")
    ws.cell(row=8, column=2, value=f"={venda_com_impostos_cel}-{imposto_cel}-{custo_cel}").number_format = MOEDA

    ws.cell(row=9, column=1, value="Preço de venda (s/ impostos)")
    ws.cell(row=9, column=2, value=f"={venda_com_impostos_cel}*(1-{aliquota_cel})").number_format = MOEDA

    ws.cell(row=10, column=1, value="R$/kg")
    ws.cell(row=10, column=2, value=f"=IF({peso_cel}=0,0,{venda_com_impostos_cel}/{peso_cel})").number_format = MOEDA

    for row in (6, 7, 8, 9, 10):
        ws.cell(row=row, column=1).font = _FONTE_TOTAL
        ws.cell(row=row, column=2).font = _FONTE_TOTAL

    _ajustar_largura(ws, {"A": 32, "B": 16})


def gerar_excel_orcamento(entrada: dict, resultado, params: dict | None = None) -> bytes:
    """entrada: o dict já adaptado (o mesmo que POST /orcamento espera).
    resultado: o ResultadoOrcamento já calculado (evita recalcular e
    garante que os valores estáticos batem com o que apareceu na tela)."""
    params = params or PARAMETROS_PADRAO

    wb = Workbook()
    ws_parametros = wb.active
    ws_parametros.title = "Parâmetros"
    ws_materia_prima = wb.create_sheet("Matéria-prima")
    ws_processos = wb.create_sheet("Processos")
    ws_resumo = wb.create_sheet("Resumo")

    linhas_p = _montar_parametros(ws_parametros, entrada, params, resultado.comercial)
    ref_total_materia_prima = _montar_materia_prima(ws_materia_prima, entrada.get("materia_prima") or [])
    ref_total_processos = _montar_processos(ws_processos, resultado.linhas, entrada, linhas_p)
    _montar_resumo(ws_resumo, linhas_p, ref_total_materia_prima, ref_total_processos)

    wb.move_sheet("Resumo", offset=-3)  # Resumo primeiro, é o que interessa ao abrir

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
