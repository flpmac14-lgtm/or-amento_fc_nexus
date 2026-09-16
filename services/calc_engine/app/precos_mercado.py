"""Referência de preço/kg de chapa a partir do histórico real de compras
2026 — pedido explícito do usuário: em vez de digitar o preço/kg de
cabeça no cartão de cálculo (chapa/cilindro/cone), buscar automaticamente
o último preço pago por norma + espessura, do jeito que já é feito com
densidade (auto-preenche, mas continua editável — "casos excepcionais").

Fonte: uma planilha local (export do ERP, `CODIGO, MATERIAL, DESCRICAO,
VLRUNITARIO, UNIDADE, FORNECEDOR, OBRA, DTLANCAMENTO`) que o usuário mantém
atualizando manualmente — não é um arquivo do repositório (é o Desktop
dele, dado de compra real. Vive em `dados-locais/` na raiz do projeto —
pasta sincronizada pelo OneDrive junto com o resto do repo, mas ignorada
pelo git (`.gitignore`), pra não versionar preço/compra real da empresa.
Caminho configurável via `PRECOS_MERCADO_XLSX_PATH`; sem a variável, cai
no caminho padrão calculado a partir da raiz do projeto (funciona em
qualquer máquina onde a pasta `dados-locais/` estiver sincronizada).

Só entram linhas onde `UNIDADE == "KG"` (preço já é por quilo, sem
precisar converter de PC/M2/CT etc — esses têm preço por peça/caixa/m²,
não dá pra virar R$/kg sem saber peso unitário) e `DESCRICAO` no formato
"CHAPA #<espessura> <norma>" (é como o ERP registra chapa — outros
formatos, ex. BARRA/TUBO/VIGA/CANTONEIRA, ficam pra uma iteração futura,
a estrutura já dá pra estender).

Quando a mesma norma+espessura tem mais de uma compra, usa a mais
recente por `DTLANCAMENTO` — mesma estratégia "último comprado" já
documentada em `repositorio_materiais.py`.

Releitura: em vez de um timer fixo de 15 min rodando em background (que
deixaria o app até 15 min desatualizado mesmo logo depois de uma edição
na planilha), o cache é invalidado por `mtime` do arquivo — reflete uma
edição salva quase na hora da próxima consulta. Os 15 min viram só um
teto de segurança (releitura força mesmo sem mudança de mtime, caso o
sistema de arquivos não reporte direito, ex. alguns compartilhamentos de
rede)."""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from pathlib import Path

TETO_SEGUNDOS = 15 * 60

# Raiz do projeto = 3 níveis acima deste arquivo (app/ -> calc_engine/ -> services/ -> raiz)
_RAIZ_PROJETO = Path(__file__).resolve().parents[3]
_CAMINHO_PADRAO = _RAIZ_PROJETO / "dados-locais" / "Lista sectra de material.xlsx"

_PADRAO_CHAPA = re.compile(r"^CHAPA\s*#\s*([0-9]+[,.][0-9]+)\s+(.+)$", re.IGNORECASE)

# ERP grava a norma como texto livre — mapeia pros valores exatos da
# biblioteca de materiais (app/materiais_catalogo.py) quando dá pra
# identificar com segurança; o que não mapear fica como veio (só não
# casa com nenhum material do seletor, não quebra nada).
_MAPEAMENTO_NORMA: dict[str, str] = {
    "A36": "ASTM A36",
    "A572-50": "ASTM A572 Gr.50",
    "A572 GR 50": "ASTM A572 Gr.50",
    "AC": "Aço carbono genérico",
    "AISI 304": "AISI 304",
    "AISI 304L": "AISI 304",
    "AISI 304/L": "AISI 304",
    "AISI 316": "AISI 316",
    "AISI 316L": "AISI 316",
}

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
    """Linha bruta da planilha, sem o filtro/normalização de `PrecoChapa` —
    qualquer material e qualquer unidade, exatamente como o ERP registrou.
    Usada pela aba "Referência de preços" do frontend, que pediu pra ver a
    planilha completa, não só o subconjunto chapa/KG usado no auto-preenchimento
    (`buscar_preco_chapa`)."""

    codigo: str
    material: str
    descricao: str
    preco_unitario: float
    unidade: str
    fornecedor: str
    obra: str
    data_compra: str | None  # ISO (YYYY-MM-DD) ou None


def _caminho_arquivo() -> Path:
    return Path(os.environ.get("PRECOS_MERCADO_XLSX_PATH", _CAMINHO_PADRAO))


def _normalizar_norma(bruta: str) -> str:
    return _MAPEAMENTO_NORMA.get(bruta.strip().upper(), bruta.strip())


def _ler_planilha(caminho: Path) -> tuple[list[PrecoChapa], list[LinhaCompra]]:
    import openpyxl  # import tardio: só exige o pacote quando há arquivo pra ler

    wb = openpyxl.load_workbook(caminho, data_only=True, read_only=True)
    if "Consulta1" not in wb.sheetnames:
        return [], []
    ws = wb["Consulta1"]

    melhores: dict[tuple[str, float], PrecoChapa] = {}
    todas: list[LinhaCompra] = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if len(row) < 8:
            continue
        codigo, material, descricao, vlrunitario, unidade, fornecedor, obra, dtlancamento = row[:8]
        if not descricao:
            continue

        data_iso = dtlancamento.date().isoformat() if hasattr(dtlancamento, "date") else None
        todas.append(LinhaCompra(
            codigo=str(codigo or "").strip(), material=str(material or "").strip(),
            descricao=str(descricao).strip(),
            preco_unitario=float(vlrunitario) if vlrunitario is not None else 0.0,
            unidade=str(unidade or "").strip(), fornecedor=str(fornecedor or "").strip(),
            obra=str(obra or "").strip(), data_compra=data_iso,
        ))

        if unidade != "KG" or vlrunitario is None:
            continue
        m = _PADRAO_CHAPA.match(str(descricao).strip())
        if not m:
            continue

        espessura_mm = float(m.group(1).replace(",", "."))
        norma_original = m.group(2).strip()
        norma = _normalizar_norma(norma_original)
        chave = (norma, espessura_mm)

        candidato = PrecoChapa(
            norma=norma, norma_original=norma_original, espessura_mm=espessura_mm,
            preco_kg=float(vlrunitario), fornecedor=str(fornecedor or "").strip(), data_compra=data_iso,
        )

        atual = melhores.get(chave)
        if atual is None or (data_iso or "") > (atual.data_compra or ""):
            melhores[chave] = candidato

    return list(melhores.values()), todas


class _Cache:
    def __init__(self) -> None:
        self.precos: list[PrecoChapa] = []
        self.todas: list[LinhaCompra] = []
        self.mtime_lido: float | None = None
        self.lido_em_monotonic: float | None = None  # p/ comparar o teto de 15 min (imune a mudança de relógio)
        self.lido_em: float = 0.0  # epoch, só pra exibir "sincronizado em"
        self.arquivo_encontrado = False

    def garantir_atualizado(self) -> None:
        caminho = _caminho_arquivo()
        agora_monotonic = time.monotonic()
        if not caminho.exists():
            self.arquivo_encontrado = False
            return

        try:
            mtime_atual = caminho.stat().st_mtime
        except OSError:
            return

        precisa_reler = (
            self.mtime_lido is None
            or mtime_atual != self.mtime_lido
            or self.lido_em_monotonic is None
            or (agora_monotonic - self.lido_em_monotonic) > TETO_SEGUNDOS
        )
        if not precisa_reler:
            return

        self.precos, self.todas = _ler_planilha(caminho)
        self.mtime_lido = mtime_atual
        self.lido_em_monotonic = agora_monotonic
        self.lido_em = time.time()
        self.arquivo_encontrado = True


_cache = _Cache()


def status_sincronizacao() -> dict:
    _cache.garantir_atualizado()
    caminho = _caminho_arquivo()
    return {
        "arquivo_encontrado": _cache.arquivo_encontrado,
        "caminho": str(caminho),
        "total_referencias": len(_cache.precos),
        "sincronizado_em": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(_cache.lido_em)) if _cache.lido_em else None,
    }


def listar_precos_chapa() -> list[PrecoChapa]:
    _cache.garantir_atualizado()
    return sorted(_cache.precos, key=lambda p: (p.norma, p.espessura_mm))


def listar_todas_compras() -> list[LinhaCompra]:
    """Planilha completa, sem filtro de material/unidade — pedido explícito
    do usuário pra aba "Referência de preços" mostrar tudo que está no
    arquivo, não só o subconjunto chapa/KG usado no auto-preenchimento."""
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
