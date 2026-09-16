import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.adapter import montar_entrada_orcamento
from app.orcamento import montar_orcamento


def campo(valor, confianca=0.9):
    return {"valor": valor, "confianca": confianca, "origem": "regra_local"}


def item_chapa_retangular_a36():
    return {
        "item_numero": campo("1"),
        "descricao": campo('CH 1" (25,4) ASTM A36'),
        "tipo_geometria": campo("chapa_retangular"),
        "material": campo("ASTM A36"),
        "norma": campo("ASTM A36"),
        "comprimento_mm": campo(1000),
        "largura_mm": campo(500),
        "espessura_mm": campo(25.4),
        "quantidade": campo(2),
    }


def item_perfil_w310():
    return {
        "item_numero": campo("2"),
        "descricao": campo("PERFIL W310 x 52,0 kg/m"),
        "tipo_geometria": campo("perfil"),
        "perfil": campo("W310x52"),
        "material": campo("ASTM A36"),
        "norma": campo("ASTM A36"),
        "comprimento_mm": campo(4750),
        "quantidade": campo(1),
    }


def item_barra_redonda_sae1020():
    return {
        "item_numero": campo("3"),
        "descricao": campo("BARRA REDONDA SAE 1020"),
        "tipo_geometria": campo("barra_redonda"),
        "material": campo("SAE 1020"),
        "norma": campo("SAE 1020"),
        "diametro_mm": campo(100),
        "comprimento_mm": campo(500),
        "quantidade": campo(1),
    }


def item_geometria_incompleta():
    return {
        "item_numero": campo("4"),
        "descricao": campo("Peça sem cotas legíveis"),
        "tipo_geometria": campo(None, confianca=0.0),
        "material": campo("ASTM A36"),
        "norma": campo("ASTM A36"),
        "quantidade": campo(1),
    }


def item_material_desconhecido():
    return {
        "item_numero": campo("5"),
        "descricao": campo("Chapa de material não cadastrado"),
        "tipo_geometria": campo("chapa_retangular"),
        "material": campo("ASTM A588"),
        "norma": campo("ASTM A588"),
        "comprimento_mm": campo(300),
        "largura_mm": campo(200),
        "espessura_mm": campo(10),
        "quantidade": campo(1),
    }


def item_perfil_material_desconhecido():
    return {
        "item_numero": campo("7"),
        "descricao": campo("PERFIL W310 x 52,0 kg/m"),
        "tipo_geometria": campo("perfil"),
        "perfil": campo("W310x52"),
        "material": campo("ASTM A588"),
        "norma": campo("ASTM A588"),
        "comprimento_mm": campo(4750),
        "quantidade": campo(1),
    }


def item_baixa_confianca():
    return {
        "item_numero": campo("6"),
        "descricao": campo("Chapa com leitura duvidosa"),
        "tipo_geometria": campo("chapa_retangular", confianca=0.4),
        "material": campo("ASTM A36", confianca=0.3),
        "norma": campo("ASTM A36", confianca=0.3),
        "comprimento_mm": campo(400, confianca=0.4),
        "largura_mm": campo(200, confianca=0.4),
        "espessura_mm": campo(12.7, confianca=0.4),
        "quantidade": campo(1),
    }


def item_peca_comprada_com_peso_informado():
    # Formato real de anexo de BOM SAP (ver bom_sap_export.py): peça
    # acabada/comprada, sem geometria/norma — mas com peso já pronto.
    return {
        "item_numero": campo("0130"),
        "descricao": campo("ANCHOR BOLT"),
        "tipo_geometria": campo(None, confianca=0.0),
        "material": campo("133823914", confianca=0.5),
        "norma": campo(None, confianca=0.0),
        "quantidade": campo(24),
        "peso_kg": campo(0.5),
    }


def test_calcula_peso_de_chapa_perfil_e_barra_redonda():
    resultado_extracao = {
        "bom": [item_chapa_retangular_a36(), item_perfil_w310(), item_barra_redonda_sae1020()],
        "caracteristicas": {},
    }

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})

    materia_prima = resultado.entrada["materia_prima"]
    assert len(materia_prima) == 3
    assert resultado.itens_para_revisao == []

    por_descricao = {m["descricao"]: m for m in materia_prima}
    chapa = por_descricao['CH 1" (25,4) ASTM A36']
    assert round(chapa["peso_kg"], 2) == round(1.0 * 0.5 * 0.0254 * 7850 * 2, 2)

    perfil = por_descricao["PERFIL W310 x 52,0 kg/m"]
    assert round(perfil["peso_kg"], 2) == round(52.0 * 4.75, 2)

    barra = por_descricao["BARRA REDONDA SAE 1020"]
    assert round(barra["peso_kg"], 2) == round(0.1**2 * 6200 * 0.5, 2)


def test_item_com_geometria_incompleta_vai_para_revisao_e_nao_entra_no_custo():
    resultado_extracao = {"bom": [item_geometria_incompleta()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})

    assert resultado.entrada["materia_prima"] == []
    assert len(resultado.itens_para_revisao) == 1
    assert resultado.itens_para_revisao[0].item_numero == "4"


def test_item_com_material_desconhecido_vai_para_revisao_com_motivo_especifico():
    resultado_extracao = {"bom": [item_material_desconhecido()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})

    assert resultado.entrada["materia_prima"] == []
    assert len(resultado.itens_para_revisao) == 1
    assert "não cadastrado" in resultado.itens_para_revisao[0].motivo


def test_perfil_com_peso_calculavel_mas_sem_preco_vai_para_revisao():
    # Geometria do perfil é conhecida (kg/m cadastrado), mas o material não
    # tem preço/kg cadastrado — peso é calculável, custo não.
    resultado_extracao = {"bom": [item_perfil_material_desconhecido()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})

    assert resultado.entrada["materia_prima"] == []
    assert len(resultado.itens_para_revisao) == 1
    assert "preço/kg" in resultado.itens_para_revisao[0].motivo


def test_item_com_baixa_confianca_entra_no_custo_mas_fica_sinalizado():
    resultado_extracao = {"bom": [item_baixa_confianca()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})

    assert len(resultado.entrada["materia_prima"]) == 1
    assert len(resultado.itens_para_revisao) == 1
    assert resultado.itens_para_revisao[0].confianca < 0.6


def test_item_com_peso_informado_usa_direto_sem_geometria_e_vai_para_revisao_de_preco():
    # Peça sem tipo_geometria/norma (acabada/comprada) mas com peso_kg
    # informado pela fonte: o peso é usado direto (não tenta geometria),
    # mas como não tem matéria-prima associada, cai em revisão de preço —
    # comportamento correto, não é possível calcular R$/kg pra "ANCHOR BOLT".
    resultado_extracao = {"bom": [item_peca_comprada_com_peso_informado()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})

    assert resultado.entrada["materia_prima"] == []
    assert len(resultado.itens_para_revisao) == 1
    revisao = resultado.itens_para_revisao[0]
    assert revisao.item_numero == "0130"
    assert "sem matéria-prima associada" in revisao.motivo


def item_perfil_w310x74_com_preco_manual_e_perda():
    # Formato que o cartão "Perfil laminado" do cálculo manual monta:
    # preço/kg digitado na tela (não vem de material/norma cadastrados) e
    # perda de material configurada — ver app/main.py `orcamento_de_bom`.
    return {
        "item_numero": campo("8"),
        "descricao": campo("PERFIL W 310 x 74,0"),
        "tipo_geometria": campo("perfil"),
        "perfil": campo("W 310 x 74,0"),
        "material": campo(None, confianca=0.0),
        "norma": campo(None, confianca=0.0),
        "comprimento_mm": campo(6000),
        "quantidade": campo(4),
        "preco_kg_manual": campo(8.5),
        "perda_pct": campo(5),
    }


def test_preco_kg_manual_do_cartao_de_perfil_dispensa_material_cadastrado():
    resultado_extracao = {"bom": [item_perfil_w310x74_com_preco_manual_e_perda()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})

    assert resultado.itens_para_revisao == []
    assert len(resultado.entrada["materia_prima"]) == 1
    assert resultado.entrada["materia_prima"][0]["preco_kg"] == 8.5


def test_perda_de_material_infla_so_o_peso_de_compra_nao_o_peso_liquido():
    resultado_extracao = {"bom": [item_perfil_w310x74_com_preco_manual_e_perda()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})

    peso_liquido_esperado = 74.0 * 6.0 * 4  # kg/m × m × qtd = 1776,0 kg
    item = resultado.entrada["materia_prima"][0]

    # peso de compra = peso líquido × (1 + perda/100)
    assert round(item["peso_kg"], 2) == round(peso_liquido_esperado * 1.05, 2)
    # o peso líquido que alimenta corte/caldeiraria/solda etc. não leva a perda
    assert round(resultado.entrada["peso_liquido_kg"], 2) == round(peso_liquido_esperado, 2)


def test_preco_kg_override_tem_prioridade_sobre_fixture():
    resultado_extracao = {"bom": [item_chapa_retangular_a36()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(
        resultado_extracao,
        estimativas={"preco_kg_override": {("ASTM A36", "chapa_retangular"): 12.5}},
    )

    assert resultado.entrada["materia_prima"][0]["preco_kg"] == 12.5


def test_corte_valor_kg_override_do_cartao_tem_prioridade_sobre_padrao():
    resultado_extracao = {"bom": [item_chapa_retangular_a36()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={"corte_valor_kg": 2.75})
    assert resultado.entrada["corte_valor_kg"] == 2.75

    orcamento = montar_orcamento(resultado.entrada)
    linha_corte = next(l for l in orcamento.linhas if l.codigo == "corte")
    peso_liquido = resultado.entrada["peso_liquido_kg"]
    assert round(linha_corte.valor_bruto, 2) == round(peso_liquido * 2.75, 2)


def test_sem_corte_valor_kg_override_usa_o_padrao_cadastrado():
    resultado_extracao = {"bom": [item_chapa_retangular_a36()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})
    assert resultado.entrada["corte_valor_kg"] is None

    orcamento = montar_orcamento(resultado.entrada)
    linha_corte = next(l for l in orcamento.linhas if l.codigo == "corte")
    peso_liquido = resultado.entrada["peso_liquido_kg"]
    assert round(linha_corte.valor_bruto, 2) == round(peso_liquido * 1.5, 2)


def test_insumos_pintura_do_cartao_entram_na_entrada_e_no_orcamento():
    resultado_extracao = {"bom": [item_chapa_retangular_a36()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(
        resultado_extracao,
        estimativas={
            "insumos_pintura": [
                {"descricao": "Tinta fundo INTERGARD", "quantidade": 10, "preco_unitario": 45},
                {"descricao": "Tinta acabamento INTERSEAL", "quantidade": 8, "preco_unitario": 60},
            ],
        },
    )
    assert len(resultado.entrada["insumos_pintura"]) == 2

    orcamento = montar_orcamento(resultado.entrada)
    linha = next(l for l in orcamento.linhas if l.codigo == "insumos_pintura")
    bruto_esperado = 10 * 45 + 8 * 60
    assert round(linha.valor_bruto, 2) == round(bruto_esperado, 2)
    # mesma alíquota de "pintura_material" (12% ICMS + 9,25% PIS/COFINS)
    assert round(linha.valor_liquido, 2) == round(bruto_esperado * (1 - 0.12 - 0.0925), 2)


def test_sem_insumos_pintura_nao_gera_linha():
    resultado_extracao = {"bom": [item_chapa_retangular_a36()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})
    assert resultado.entrada["insumos_pintura"] == []

    orcamento = montar_orcamento(resultado.entrada)
    assert not any(l.codigo == "insumos_pintura" for l in orcamento.linhas)


def test_servicos_terceiros_tratamento_termico_e_contingenciamento_entram_no_orcamento():
    resultado_extracao = {"bom": [item_chapa_retangular_a36()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(
        resultado_extracao,
        estimativas={
            "servicos_terceiros": [{"descricao": "Conformação pesada", "peso_kg": 100, "valor_kg": 8}],
            "tratamento_termico": [{"descricao": "Alívio de tensões", "peso_kg": 100, "valor_kg": 1.5}],
            "contingenciamento": [{"descricao": "Contingenciamento", "quantidade": 1, "valor_unitario": 150}],
        },
    )
    assert len(resultado.entrada["servicos_terceiros"]) == 1
    assert len(resultado.entrada["tratamento_termico"]) == 1
    assert len(resultado.entrada["contingenciamento"]) == 1

    orcamento = montar_orcamento(resultado.entrada)

    linha_servicos = next(l for l in orcamento.linhas if l.codigo == "servicos_terceiros")
    assert round(linha_servicos.valor_bruto, 2) == 800.0
    assert round(linha_servicos.valor_liquido, 2) == round(800 * (1 - 0.0925), 2)  # mesma alíquota de usinagem

    linha_tratamento = next(l for l in orcamento.linhas if l.codigo == "tratamento_termico")
    assert round(linha_tratamento.valor_bruto, 2) == 150.0

    linha_contingencia = next(l for l in orcamento.linhas if l.codigo == "contingenciamento")
    assert round(linha_contingencia.valor_bruto, 2) == 150.0
    assert round(linha_contingencia.valor_liquido, 2) == 150.0  # sem ICMS/PIS-COFINS, igual engenharia


def test_sem_servicos_terceirizados_nao_gera_linhas():
    resultado_extracao = {"bom": [item_chapa_retangular_a36()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(resultado_extracao, estimativas={})
    orcamento = montar_orcamento(resultado.entrada)
    codigos = {l.codigo for l in orcamento.linhas}
    assert not codigos & {"servicos_terceiros", "tratamento_termico", "contingenciamento"}


def test_integracao_end_to_end_extractor_para_orcamento():
    resultado_extracao = {
        "bom": [item_chapa_retangular_a36(), item_perfil_w310(), item_barra_redonda_sae1020()],
        "caracteristicas": {},
    }

    adaptacao = montar_entrada_orcamento(
        resultado_extracao,
        estimativas={
            "usinagem_operacoes": [{"maquina": "convencional", "horas": 4, "valor_hora": 75}],
            "area_pintura_m2": 10,
            "quantidade_posicoes_engenharia": 5,
            "cenario_comercial": "venda_fabricacao",
        },
    )

    orcamento = montar_orcamento(adaptacao.entrada)

    assert orcamento.comercial.custo_industrial > 0
    assert orcamento.comercial.preco_venda_com_impostos > orcamento.comercial.custo_industrial
    assert orcamento.comercial.peso_liquido_kg == adaptacao.entrada["peso_liquido_kg"]
