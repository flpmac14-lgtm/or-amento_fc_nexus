"""Referência de preço/kg de chapa a partir do histórico real de compras —
pedido explícito do usuário: em vez de digitar o preço/kg de cabeça no
cartão de cálculo (chapa/cilindro/cone), buscar automaticamente o último
preço pago por norma + espessura, do jeito que já é feito com densidade
(auto-preenche, mas continua editável — "casos excepcionais").

Fonte: tabela `historico_compras` no Supabase (ver
supabase/migrations/0001_init.sql e 0006_historico_compras_espessura.sql),
alimentada do ERP (SQL Server da Macfab) por
`scripts/importar_precos_erp.py`. Antes esta tela dependia de uma planilha
local (`dados-locais/Lista sectra de material.xlsx`, só existente na
máquina com o OneDrive do projeto sincronizado) — trocado por banco
compartilhado pra funcionar igual local e hospedado (Render não enxerga
o disco do usuário). "Ficar atualizando" agora é rodar
`importar_precos_erp.py` periodicamente (agendado numa máquina dentro da
rede da Macfab, único lugar que alcança o ERP) — ver README do
calc_engine.

Só entram no auto-preenchimento (`buscar_preco_chapa`) linhas
`materiais.tipo = 'chapa'` com `espessura_mm` preenchida — outros tipos
(barra/perfil) ficam de fora do auto-preenchimento por enquanto (mesma
limitação de antes), mas aparecem em `listar_todas_compras` (aba
"Referência de preços", pedida pra mostrar tudo, não só chapa/KG).

Quando a mesma norma+espessura tem mais de uma compra, usa a mais
recente por `data_compra` — mesma estratégia "último comprado" já
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
    """Linha de `historico_compras` (join materiais/fornecedores), qualquer
    tipo/material — usada pela aba "Referência de preços" do frontend, que
    pediu pra ver o histórico completo, não só o subconjunto chapa/KG usado
    no auto-preenchimento (`buscar_preco_chapa`).

    `codigo` e `obra` sempre vêm vazios: são campos do ERP que
    `historico_compras` nunca guardou (schema normalizado por
    material/fornecedor/preço/data, não uma cópia 1:1 da nota fiscal)."""

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


def _consultar_historico() -> tuple[list[PrecoChapa], list[LinhaCompra]]:
    import psycopg

    melhores: dict[tuple[str, float], PrecoChapa] = {}
    todas: list[LinhaCompra] = []

    with psycopg.connect(_db_url(), connect_timeout=10) as conn, conn.cursor() as cur:
        cur.execute(
            """
            select m.norma, m.tipo, hc.espessura_mm, hc.preco_kg, hc.data_compra,
                   f.nome, hc.descricao_original
            from historico_compras hc
            join materiais m on m.id = hc.material_id
            left join fornecedores f on f.id = hc.fornecedor_id
            order by hc.data_compra desc
            """
        )
        for norma, tipo, espessura_mm, preco_kg, data_compra, fornecedor, descricao_original in cur.fetchall():
            data_iso = data_compra.isoformat() if data_compra else None
            fornecedor = (fornecedor or "").strip()

            todas.append(LinhaCompra(
                codigo="", material=norma, descricao=descricao_original or f"{tipo or ''} {norma}".strip(),
                preco_unitario=float(preco_kg), unidade="KG", fornecedor=fornecedor, obra="",
                data_compra=data_iso,
            ))

            if tipo != "chapa" or espessura_mm is None:
                continue
            chave = (norma, float(espessura_mm))
            candidato = PrecoChapa(
                norma=norma, norma_original=norma, espessura_mm=float(espessura_mm),
                preco_kg=float(preco_kg), fornecedor=fornecedor, data_compra=data_iso,
            )
            atual = melhores.get(chave)
            if atual is None or (data_iso or "") > (atual.data_compra or ""):
                melhores[chave] = candidato

    return list(melhores.values()), todas


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
