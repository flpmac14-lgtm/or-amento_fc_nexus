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


def test_preco_kg_override_tem_prioridade_sobre_fixture():
    resultado_extracao = {"bom": [item_chapa_retangular_a36()], "caracteristicas": {}}

    resultado = montar_entrada_orcamento(
        resultado_extracao,
        estimativas={"preco_kg_override": {("ASTM A36", "chapa_retangular"): 12.5}},
    )

    assert resultado.entrada["materia_prima"][0]["preco_kg"] == 12.5


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
