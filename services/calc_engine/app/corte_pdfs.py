r"""PDFs dos programas de corte — pedido explícito do usuário: como no Excel,
o número do programa (Croqui de corte / Corte) vira link e abre o PDF do
programa (duplo clique). Os PDFs ficam na rede, em
J:\3 - Projetos\GR_PROJETO\Corte\PCP-Corte-2026, com nome no padrão
"<espessura>-<MAC>-NC<programa>.pdf", por exemplo:
    16,0mm-573.26-NC939.pdf · 0,8mm-747.26-NC-1300-inox304.pdf
    1,0mm-219.26-NC449_450-inox304.pdf (2 programas) · 1,5mm-1131.25-NC.118.pdf
    12,7mm-392_562.25-NC672-673-674-675.pdf · 16,0mm-986.25.10.03-CN606.pdf
    4,8mm-700.26-NC1132aNC1138.pdf (faixa: 1132 a 1138)
Arquivos sem "NC" (ex.: só data) não têm programa e ficam de fora.

Como o app está na nuvem e não enxerga o J:, scripts/sincronizar_pdfs_corte.py
(roda nesta máquina junto com a sincronização de 15 min) sobe os PDFs novos
ou alterados pro Storage do Supabase (bucket privado "programas-corte") e
grava o índice em corte_pdfs (migration 0028). O app lê o índice por
GET /corte/pdfs e abre o PDF com link assinado do Storage.
"""

from __future__ import annotations

import re

from app.orcamentos_salvos import _conectar

# "NC" (ou "CN", erro de digitação comum) + separador opcional + números
# separados por "_", "-" ou "," (ex.: NC449_450, NC-1292-1293, NC845,846).
_NC = re.compile(r"(?<![A-Za-z])(?:NC|CN)[-._ ]?(\d+(?:[-_,]\d+)*)", re.IGNORECASE)
# "NC1132aNC1138" = do 1132 ao 1138.
_FAIXA = re.compile(r"(?:NC|CN)[-._ ]?(\d+)a(?:NC|CN)?[-._ ]?(\d+)", re.IGNORECASE)
_FAIXA_MAX = 50


def programas_do_nome(nome: str) -> list[str]:
    """Números de programa no nome do PDF, sem zeros à esquerda."""
    base = re.sub(r"\.pdf$", "", nome, flags=re.IGNORECASE)
    saida: list[str] = []
    for m in _FAIXA.finditer(base):
        a, b = int(m.group(1)), int(m.group(2))
        if a < b <= a + _FAIXA_MAX:
            saida += [str(n) for n in range(a, b + 1)]
    for m in _NC.finditer(base):
        for n in re.split(r"[-_,]", m.group(1)):
            n = str(int(n))
            if n not in saida:
                saida.append(n)
    return saida


def indice() -> dict:
    """{programa: [{nome, caminho, modificado_em}]} — o mais novo primeiro."""
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select nome, caminho, programas, modificado_em from corte_pdfs order by modificado_em desc")
        linhas = cur.fetchall()
    por_programa: dict[str, list[dict]] = {}
    for nome, caminho, programas, modificado in linhas:
        for p in programas:
            por_programa.setdefault(p, []).append(
                {"nome": nome, "caminho": caminho, "modificado_em": modificado.isoformat()})
    return {"pdfs": por_programa}
