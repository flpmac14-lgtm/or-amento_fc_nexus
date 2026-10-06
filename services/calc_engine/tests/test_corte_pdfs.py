"""Leitura do nº do programa no nome dos PDFs de corte (app/corte_pdfs.py)."""

import pytest

from app.corte_pdfs import programas_do_nome


@pytest.mark.parametrize("nome, esperado", [
    ("16,0mm-573.26-NC939.pdf", ["939"]),
    ("0,8mm-747.26-NC-1300-inox304.pdf", ["1300"]),
    ("1,5mm-1131.25-NC.118.pdf", ["118"]),
    ("1,0mm-219.26-NC449_450-inox304.pdf", ["449", "450"]),
    ("12,7mm-392_562.25-NC672-673-674-675.pdf", ["672", "673", "674", "675"]),
    ("19,0mm-1131.25_299_438_476_475_498_499.26-NC845,846.pdf", ["845", "846"]),
    ("16,0mm-986.25.10.03-CN606.pdf", ["606"]),
    ("4,8mm-700.26-NC1132aNC1138.pdf", ["1132", "1133", "1134", "1135", "1136", "1137", "1138"]),
    ("1,5mm-493.25_983.25_1131.25-NC1076_inox316.pdf", ["1076"]),
    ("50,0mm-027.26-NC.32.pdf", ["32"]),
    ("0,9mm-UniStain-04.02.2026.pdf", []),
    ("1,0mm-486.25-07.01.2026.pdf", []),
])
def test_programas_do_nome(nome, esperado):
    assert programas_do_nome(nome) == esperado
