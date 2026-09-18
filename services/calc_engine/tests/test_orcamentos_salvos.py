import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import orcamentos_salvos

SEM_BANCO = not os.environ.get("SUPABASE_DB_URL")


def _resultado_exemplo(cliente="Cliente Teste", peso=100.0, venda=500.0):
    return {
        "extracao": {
            "identificacao": {
                "cliente": {"valor": cliente, "confianca": 0.9, "origem": "manual"},
                "numero_desenho": {"valor": "A123", "confianca": 0.9, "origem": "manual"},
            },
        },
        "orcamento": {
            "linhas": [],
            "comercial": {"peso_liquido_kg": peso, "preco_venda_com_impostos": venda},
        },
        "entrada": {"peso_liquido_kg": peso},
    }


def test_sem_supabase_db_url_levanta_erro_claro(monkeypatch):
    monkeypatch.delenv("SUPABASE_DB_URL", raising=False)

    with pytest.raises(orcamentos_salvos.BancoNaoConfigurado):
        orcamentos_salvos.listar()
    with pytest.raises(orcamentos_salvos.BancoNaoConfigurado):
        orcamentos_salvos.salvar("x", "manual", _resultado_exemplo())


@pytest.mark.skipif(SEM_BANCO, reason="SUPABASE_DB_URL não configurada nesta máquina")
def test_salvar_listar_buscar_atualizar_e_excluir_ciclo_completo():
    criado = orcamentos_salvos.salvar(
        nome="Orçamento de teste — pytest",
        origem="manual",
        resultado=_resultado_exemplo(),
        estado_manual={"itens": [{"descricao": "chapa teste"}], "itensComerciais": []},
    )
    orcamento_id = criado["id"]
    try:
        lista = orcamentos_salvos.listar()
        assert any(o["id"] == orcamento_id for o in lista)
        item_na_lista = next(o for o in lista if o["id"] == orcamento_id)
        assert item_na_lista["nome"] == "Orçamento de teste — pytest"
        assert item_na_lista["origem"] == "manual"
        assert item_na_lista["resumo"]["cliente"] == "Cliente Teste"
        assert item_na_lista["resumo"]["peso_liquido_kg"] == 100.0

        completo = orcamentos_salvos.buscar(orcamento_id)
        assert completo is not None
        assert completo["estado_manual"]["itens"][0]["descricao"] == "chapa teste"
        assert completo["estado_texto"] is None

        atualizado = orcamentos_salvos.salvar(
            nome="Orçamento de teste — pytest (editado)",
            origem="manual",
            resultado=_resultado_exemplo(peso=200.0),
            estado_manual={"itens": [], "itensComerciais": []},
            orcamento_id=orcamento_id,
        )
        assert atualizado["id"] == orcamento_id

        recarregado = orcamentos_salvos.buscar(orcamento_id)
        assert recarregado["nome"] == "Orçamento de teste — pytest (editado)"
        assert recarregado["resultado"]["orcamento"]["comercial"]["peso_liquido_kg"] == 200.0
    finally:
        orcamentos_salvos.excluir(orcamento_id)

    assert orcamentos_salvos.buscar(orcamento_id) is None


@pytest.mark.skipif(SEM_BANCO, reason="SUPABASE_DB_URL não configurada nesta máquina")
def test_relatorio_tecnico_salvo_e_preservado_em_update_sem_relatorio():
    criado = orcamentos_salvos.salvar(
        nome="Orçamento com relatório — pytest",
        origem="pdf",
        resultado=_resultado_exemplo(),
        relatorio_tecnico="# Estudo técnico\n\nConteúdo de teste.",
    )
    orcamento_id = criado["id"]
    try:
        completo = orcamentos_salvos.buscar(orcamento_id)
        assert completo["relatorio_tecnico"] == "# Estudo técnico\n\nConteúdo de teste."

        # Atualiza sem reenviar relatorio_tecnico — não pode apagar o que já tinha.
        orcamentos_salvos.salvar(
            nome="Orçamento com relatório — pytest (editado)",
            origem="pdf",
            resultado=_resultado_exemplo(peso=150.0),
            orcamento_id=orcamento_id,
        )
        recarregado = orcamentos_salvos.buscar(orcamento_id)
        assert recarregado["relatorio_tecnico"] == "# Estudo técnico\n\nConteúdo de teste."
    finally:
        orcamentos_salvos.excluir(orcamento_id)


@pytest.mark.skipif(SEM_BANCO, reason="SUPABASE_DB_URL não configurada nesta máquina")
def test_atualizar_id_inexistente_da_erro_claro():
    with pytest.raises(ValueError, match="não encontrado"):
        orcamentos_salvos.salvar(
            nome="x", origem="manual", resultado=_resultado_exemplo(),
            orcamento_id="00000000-0000-0000-0000-000000000000",
        )


@pytest.mark.skipif(SEM_BANCO, reason="SUPABASE_DB_URL não configurada nesta máquina")
def test_excluir_id_inexistente_devolve_false():
    assert orcamentos_salvos.excluir("00000000-0000-0000-0000-000000000000") is False
