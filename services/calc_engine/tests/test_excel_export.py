import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from openpyxl import load_workbook

from app.excel_export import gerar_excel_orcamento
from app.orcamento import montar_orcamento

ENTRADA_BASE = {
    "peso_liquido_kg": 196.25,
    "materia_prima": [
        {"descricao": "CHAPA 1000x500x25 ASTM A36", "peso_kg": 196.25, "preco_kg": 5.984967},
    ],
    "itens_padrao": [],
    "usinagem_operacoes": [],
    "area_pintura_m2": 12.5,
    "quantidade_posicoes_engenharia": 4,
    "cenario_comercial": "venda_fabricacao",
    "usar_historico_horas": False,
}


def _carregar(entrada: dict):
    resultado = montar_orcamento(entrada)
    conteudo = gerar_excel_orcamento(entrada, resultado)
    return load_workbook(io.BytesIO(conteudo)), resultado


def _acha_linha(ws, coluna: int, texto: str, ate_linha: int = 60) -> int:
    for r in range(1, ate_linha):
        valor = ws.cell(row=r, column=coluna).value
        if valor and texto in str(valor):
            return r
    raise AssertionError(f"'{texto}' não encontrado na coluna {coluna}")


def test_gera_uma_aba_so():
    wb, _ = _carregar(ENTRADA_BASE)
    assert wb.sheetnames == ["Orçamento"]


def test_layout_a4_configurado():
    wb, _ = _carregar(ENTRADA_BASE)
    ws = wb["Orçamento"]
    assert str(ws.page_setup.paperSize) == str(ws.PAPERSIZE_A4)
    assert ws.page_setup.orientation == "portrait"
    assert ws.print_area is not None
    # área de impressão cobre só o relatório (A:G), não o painel de parâmetros (I:J)
    assert "I" not in ws.print_area and "J" not in ws.print_area


def test_parametros_ficam_no_mesmo_sheet_fora_da_area_de_impressao():
    wb, _ = _carregar(ENTRADA_BASE)
    ws = wb["Orçamento"]
    assert ws["I1"].value == "PARÂMETROS (editável)"
    linha_peso = _acha_linha(ws, 9, "Peso líquido")
    assert ws.cell(row=linha_peso, column=10).value == 196.25


def test_materia_prima_usa_formula_nao_valor_fixo():
    wb, _ = _carregar(ENTRADA_BASE)
    ws = wb["Orçamento"]
    linha_item = _acha_linha(ws, 1, "CHAPA 1000x500x25")
    assert ws.cell(row=linha_item, column=4).value == f"=B{linha_item}*C{linha_item}"
    assert ws.cell(row=linha_item, column=7).value == f"=D{linha_item}*(1-E{linha_item}-F{linha_item})"


def test_preco_final_referencia_a_linha_de_venda_com_impostos():
    wb, _ = _carregar(ENTRADA_BASE)
    ws = wb["Orçamento"]
    linha_venda = _acha_linha(ws, 1, "Preço de venda (c/ impostos)")
    linha_destaque = _acha_linha(ws, 1, "PREÇO DE VENDA")
    assert ws.cell(row=linha_destaque, column=5).value == f"=$C${linha_venda}"


def test_caldeiraria_arredonda_horas_antes_do_jateamento_usar():
    """Achado real testando com a lib `formulas`: app/processos.py calcula
    o bruto da caldeiraria com horas SEM arredondar, mas guarda/repassa pro
    jateamento o valor JÁ arredondado (2 casas) — sem replicar esse
    arredondamento intermediário no Excel, o jateamento batia ~0,006
    errado. Trava esse comportamento aqui."""
    wb, _ = _carregar(ENTRADA_BASE)
    ws = wb["Orçamento"]

    linha_caldeiraria = _acha_linha(ws, 1, "Caldeiraria")
    formula_horas_caldeiraria = ws.cell(row=linha_caldeiraria, column=2).value
    assert formula_horas_caldeiraria.startswith("=ROUND(")

    formula_bruto_caldeiraria = ws.cell(row=linha_caldeiraria, column=3).value
    assert "ROUND" not in formula_bruto_caldeiraria  # bruto usa a expressão cheia, não a arredondada

    linha_jateamento = _acha_linha(ws, 1, "Jateamento")
    formula_horas_jateamento = ws.cell(row=linha_jateamento, column=2).value
    assert f"$B${linha_caldeiraria}" in formula_horas_jateamento  # referencia a célula (já arredondada)


def test_sem_materia_prima_nao_quebra_resumo():
    entrada = {**ENTRADA_BASE, "materia_prima": []}
    wb, _ = _carregar(entrada)
    ws = wb["Orçamento"]
    linha_custo = _acha_linha(ws, 1, "Custo industrial")
    formula = ws.cell(row=linha_custo, column=3).value
    assert formula.startswith("=$F$")  # só o total de processos, sem "+None"


def test_usar_historico_horas_cai_para_valor_estatico_sem_quebrar():
    entrada = {**ENTRADA_BASE, "usar_historico_horas": True}
    wb, resultado = _carregar(entrada)
    ws = wb["Orçamento"]
    linha_caldeiraria = _acha_linha(ws, 1, "Caldeiraria")
    valor_bruto = ws.cell(row=linha_caldeiraria, column=3).value
    linha_calc = next(l for l in resultado.linhas if l.codigo == "caldeiraria")
    assert valor_bruto == round(linha_calc.valor_bruto, 2)
