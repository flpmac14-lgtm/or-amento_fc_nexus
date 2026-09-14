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


def test_gera_as_quatro_abas_com_resumo_primeiro():
    wb, _ = _carregar(ENTRADA_BASE)
    assert wb.sheetnames == ["Resumo", "Parâmetros", "Matéria-prima", "Processos"]


def test_materia_prima_usa_formula_nao_valor_fixo():
    wb, _ = _carregar(ENTRADA_BASE)
    ws = wb["Matéria-prima"]
    assert ws["D2"].value == "=B2*C2"  # bruto = peso × preço
    assert ws["G2"].value == "=D2*(1-E2-F2)"  # líquido = bruto líquido de impostos


def test_resumo_encadeia_formulas_ate_preco_de_venda():
    wb, _ = _carregar(ENTRADA_BASE)
    ws = wb["Resumo"]
    assert ws["B6"].value == "=B3*(1+B4)"  # venda c/ impostos = custo × (1 + margem)
    assert ws["B7"].value == "=B6*B5"  # imposto = venda × alíquota
    assert ws["B10"].value == "=IF(B2=0,0,B6/B2)"  # R$/kg


def test_caldeiraria_arredonda_horas_antes_do_jateamento_usar():
    """Achado real testando com a lib `formulas`: app/processos.py calcula
    o bruto da caldeiraria com horas SEM arredondar, mas guarda/repassa pro
    jateamento o valor JÁ arredondado (2 casas) — sem replicar esse
    arredondamento intermediário no Excel, o jateamento batia ~0,006
    errado. Trava esse comportamento aqui."""
    wb, _ = _carregar(ENTRADA_BASE)
    ws = wb["Processos"]

    linha_caldeiraria = next(r for r in range(2, 20) if ws.cell(row=r, column=1).value and "Caldeiraria" in ws.cell(row=r, column=1).value)
    formula_horas_caldeiraria = ws.cell(row=linha_caldeiraria, column=2).value
    assert formula_horas_caldeiraria.startswith("=ROUND(")

    formula_bruto_caldeiraria = ws.cell(row=linha_caldeiraria, column=3).value
    assert "ROUND" not in formula_bruto_caldeiraria  # bruto usa a expressão cheia, não a arredondada

    linha_jateamento = next(r for r in range(2, 20) if ws.cell(row=r, column=1).value and "Jateamento" in ws.cell(row=r, column=1).value)
    formula_horas_jateamento = ws.cell(row=linha_jateamento, column=2).value
    assert f"$B${linha_caldeiraria}" in formula_horas_jateamento  # referencia a célula (já arredondada)


def test_sem_materia_prima_nao_quebra_resumo():
    entrada = {**ENTRADA_BASE, "materia_prima": []}
    wb, resultado = _carregar(entrada)
    ws = wb["Resumo"]
    assert ws["B3"].value == "=Processos!$F$12"  # sem "+None" nem referência quebrada


def test_usar_historico_horas_cai_para_valor_estatico_sem_quebrar():
    entrada = {**ENTRADA_BASE, "usar_historico_horas": True}
    wb, resultado = _carregar(entrada)
    ws = wb["Processos"]
    linha_caldeiraria = next(r for r in range(2, 20) if ws.cell(row=r, column=1).value and "Caldeiraria" in ws.cell(row=r, column=1).value)
    valor_bruto = ws.cell(row=linha_caldeiraria, column=3).value
    linha_calc = next(l for l in resultado.linhas if l.codigo == "caldeiraria")
    assert valor_bruto == round(linha_calc.valor_bruto, 2)
