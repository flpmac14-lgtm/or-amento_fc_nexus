import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.relatorio_excel import calcular_itens_da_planilha, gerar_excel, ler_excel

ITEM_VALIDO = {
    "posicao": "1",
    "descricao": "Chapa base",
    "quantidade": 2,
    "norma": "ASTM A36",
    "tipo_geometria": "chapa_retangular",
    "comprimento_mm": 1000.0,
    "largura_mm": 500.0,
    "espessura_mm": 25.0,
}


def test_round_trip_gerar_e_ler_excel():
    conteudo = gerar_excel([ITEM_VALIDO])
    itens = ler_excel(conteudo)

    assert len(itens) == 1
    linha = itens[0]
    assert linha["posicao"] == "1"
    assert linha["descricao"] == "Chapa base"
    assert linha["tipo_geometria"] == "chapa_retangular"
    assert linha["comprimento_mm"] == 1000.0
    assert linha["largura_mm"] == 500.0
    assert linha["espessura_mm"] == 25.0


def test_calcular_itens_da_planilha_calcula_peso_pelo_motor_deterministico():
    calculados, ignorados = calcular_itens_da_planilha([ITEM_VALIDO])

    assert ignorados == []
    assert len(calculados) == 1
    item = calculados[0]
    assert item["tipo"] == "chapa_retangular"
    assert item["quantidade"] == 2
    # 1.0m x 0.5m x 0.025m x 7850 kg/m3 x 2 (quantidade)
    assert item["peso_kg"] == round(1.0 * 0.5 * 0.025 * 7850 * 2, 3)
    assert "formSnapshot" in item


def test_tipo_geometria_nao_reconhecido_vira_ignorado():
    item = {**ITEM_VALIDO, "tipo_geometria": "tipo_que_nao_existe"}
    calculados, ignorados = calcular_itens_da_planilha([item])

    assert calculados == []
    assert len(ignorados) == 1
    assert "não reconhecido" in ignorados[0]["motivo"]


def test_medida_faltando_vira_ignorado_em_vez_de_calcular_errado():
    item = {**ITEM_VALIDO, "largura_mm": None}
    calculados, ignorados = calcular_itens_da_planilha([item])

    assert calculados == []
    assert len(ignorados) == 1
    assert "Largura" in ignorados[0]["motivo"]


def test_linha_totalmente_vazia_e_ignorada_na_leitura():
    conteudo = gerar_excel([ITEM_VALIDO])
    itens = ler_excel(conteudo)
    assert len(itens) == 1  # não conta as 200 linhas em branco da margem pra edição
