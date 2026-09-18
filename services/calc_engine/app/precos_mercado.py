"""Referência de preço a partir do histórico real de compras — duas fontes
distintas no Supabase, alimentadas do ERP (SQL Server da Macfab) por
`scripts/importar_precos_erp.py`:

  1. `historico_compras` (ver supabase/migrations/0001_init.sql e
     0006_historico_compras_espessura.sql) — só matéria-prima estrutural
     (chapa/barra/perfil) já cruzada com o catálogo `materiais` (precisa de
     norma+densidade validada). Usada só pra auto-preenchimento de "Preço
     por kg" nos cartões de cálculo (`buscar_preco_chapa`), do jeito que já
     acontece com densidade — auto-preenche mas continua editável.

  2. `historico_compras_geral` (ver
     supabase/migrations/0007_historico_compras_geral.sql) — QUALQUER item
     de compra (tinta, parafuso, porca, consumível etc.), sem exigir
     catálogo de engenharia — pedido explícito do usuário pra aba
     "Referência de preços" mostrar o histórico completo, não só matéria-
     prima estrutural.

Antes esta tela dependia de uma planilha local (`dados-locais/Lista sectra
de material.xlsx`, só existente na máquina com o OneDrive do projeto
sincronizado) — trocado por banco compartilhado pra funcionar igual local
e hospedado (Render não enxerga o disco do usuário). "Ficar atualizando"
agora é rodar `importar_precos_erp.py` periodicamente (agendado numa
máquina dentro da rede da Macfab, único lugar que alcança o ERP) — ver
README do calc_engine.

Quando a mesma norma+espessura (fonte 1) tem mais de uma compra, usa a
mais recente por `data_compra` — mesma estratégia "último comprado" já
documentada em `repositorio_materiais.py`.

Cache: TTL simples (não tem mais arquivo com mtime pra vigiar) — reconsulta
o banco a cada `TETO_SEGUNDOS`, ou na primeira chamada."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

TETO_SEGUNDOS = 5 * 60

_DB_URL_ENV = "SUPABASE_DB_URL"

TOLERANCIA_ESPESSURA_MM = 0.3


@dataclass
class PrecoChapa:
    norma: str
    norma_original: str
    espessura_mm: float
    preco_kg: float
    fornecedor: str
    data_compra: str | None  # ISO (YYYY-MM-DD) ou None


@dataclass
class LinhaCompra:
    """Linha de `historico_compras_geral` — qualquer item de compra do ERP
    (tinta, parafuso, porca, matéria-prima etc.), sem exigir catálogo de
    engenharia. Usada pela aba "Referência de preços" do frontend, que
    pediu pra ver o histórico completo, não só o subconjunto estrutural
    (chapa/barra/perfil) usado no auto-preenchimento (`buscar_preco_chapa`).

    `material` sempre vem vazio: esta fonte não cruza com o catálogo
    `materiais` (é cópia fiel do item de compra, não dado de engenharia
    validado)."""

    codigo: str
    material: str
    descricao: str
    preco_unitario: float
    unidade: str
    fornecedor: str
    obra: str
    data_compra: str | None  # ISO (YYYY-MM-DD) ou None


def _db_url() -> str | None:
    return os.environ.get(_DB_URL_ENV)


def _consultar_precos_chapa(cur) -> list[PrecoChapa]:
    """Subconjunto estrutural (chapa/KG, ligado a `materiais`) usado no
    auto-preenchimento dos cartões de cálculo — precisa do catálogo de
    engenharia porque cruza com densidade/norma validada."""
    melhores: dict[tuple[str, float], PrecoChapa] = {}

    cur.execute(
        """
        select m.norma, hc.espessura_mm, hc.preco_kg, hc.data_compra, f.nome
        from historico_compras hc
        join materiais m on m.id = hc.material_id
        left join fornecedores f on f.id = hc.fornecedor_id
        where m.tipo = 'chapa' and hc.espessura_mm is not null
        order by hc.data_compra desc
        """
    )
    for norma, espessura_mm, preco_kg, data_compra, fornecedor in cur.fetchall():
        data_iso = data_compra.isoformat() if data_compra else None
        chave = (norma, float(espessura_mm))
        candidato = PrecoChapa(
            norma=norma, norma_original=norma, espessura_mm=float(espessura_mm),
            preco_kg=float(preco_kg), fornecedor=(fornecedor or "").strip(), data_compra=data_iso,
        )
        atual = melhores.get(chave)
        if atual is None or (data_iso or "") > (atual.data_compra or ""):
            melhores[chave] = candidato

    return list(melhores.values())


def _consultar_historico_geral(cur) -> list[LinhaCompra]:
    """Histórico completo (qualquer item — tinta, parafuso, porca,
    matéria-prima etc.), sem exigir catálogo de engenharia — ver
    `historico_compras_geral` (migração 0007)."""
    cur.execute(
        """
        select codigo_item, descricao, preco_unitario, unidade, fornecedor, obra, data_compra
        from historico_compras_geral
        order by data_compra desc
        """
    )
    return [
        LinhaCompra(
            codigo=codigo_item or "", material="", descricao=descricao,
            preco_unitario=float(preco_unitario), unidade=unidade or "",
            fornecedor=(fornecedor or "").strip(), obra=(obra or "").strip(),
            data_compra=data_compra.isoformat() if data_compra else None,
        )
        for codigo_item, descricao, preco_unitario, unidade, fornecedor, obra, data_compra in cur.fetchall()
    ]


def _consultar_historico() -> tuple[list[PrecoChapa], list[LinhaCompra]]:
    import psycopg

    with psycopg.connect(_db_url(), connect_timeout=10, prepare_threshold=None) as conn, conn.cursor() as cur:
        precos = _consultar_precos_chapa(cur)
        todas = _consultar_historico_geral(cur)

    return precos, todas


class _Cache:
    def __init__(self) -> None:
        self.precos: list[PrecoChapa] = []
        self.todas: list[LinhaCompra] = []
        self.lido_em_monotonic: float | None = None
        self.lido_em: float = 0.0  # epoch, só pra exibir "sincronizado em"
        self.disponivel = False

    def garantir_atualizado(self) -> None:
        agora_monotonic = time.monotonic()
        precisa_reler = (
            self.lido_em_monotonic is None
            or (agora_monotonic - self.lido_em_monotonic) > TETO_SEGUNDOS
        )
        if not precisa_reler:
            return

        if not _db_url():
            self.disponivel = False
            return

        try:
            self.precos, self.todas = _consultar_historico()
            self.disponivel = True
        except Exception:
            # Banco fora do ar/instável não pode derrubar a tela — mantém o
            # último resultado bom conhecido (ou vazio, na primeira falha).
            return

        self.lido_em_monotonic = agora_monotonic
        self.lido_em = time.time()


_cache = _Cache()


def status_sincronizacao() -> dict:
    _cache.garantir_atualizado()
    return {
        "fonte_disponivel": _cache.disponivel,
        "fonte": "Supabase (historico_compras)" if _db_url() else "SUPABASE_DB_URL não configurada",
        "total_referencias": len(_cache.precos),
        "sincronizado_em": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(_cache.lido_em)) if _cache.lido_em else None,
    }


def listar_precos_chapa() -> list[PrecoChapa]:
    _cache.garantir_atualizado()
    return sorted(_cache.precos, key=lambda p: (p.norma, p.espessura_mm))


def listar_todas_compras() -> list[LinhaCompra]:
    """Histórico completo, sem filtro de material/tipo — pedido explícito
    do usuário pra aba "Referência de preços" mostrar tudo que já foi
    importado do ERP, não só o subconjunto chapa/KG usado no
    auto-preenchimento (`buscar_preco_chapa`)."""
    _cache.garantir_atualizado()
    return sorted(_cache.todas, key=lambda c: c.data_compra or "", reverse=True)


def buscar_preco_chapa(norma: str | None, espessura_mm: float | None) -> tuple[PrecoChapa, bool] | None:
    """Devolve (preço, exato) — exato=False quando casou pela espessura
    mais próxima dentro da tolerância, não pela espessura pedida."""
    if not norma or not espessura_mm:
        return None
    _cache.garantir_atualizado()

    candidatos = [p for p in _cache.precos if p.norma.strip().upper() == norma.strip().upper()]
    if not candidatos:
        return None

    for p in candidatos:
        if abs(p.espessura_mm - espessura_mm) < 1e-6:
            return p, True

    mais_proximo = min(candidatos, key=lambda p: abs(p.espessura_mm - espessura_mm))
    if abs(mais_proximo.espessura_mm - espessura_mm) <= TOLERANCIA_ESPESSURA_MM:
        return mais_proximo, False
    return None
