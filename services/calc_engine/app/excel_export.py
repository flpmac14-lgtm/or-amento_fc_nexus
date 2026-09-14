"""Exporta o orçamento como planilha Excel EDITÁVEL — ao contrário do
relatório de impressão (que é só leitura), aqui os valores importantes
(peso, taxas por processo, alíquotas) ficam em células próprias (painel
"Parâmetros" à direita, colunas I:J) e o relatório em si (colunas A:G)
referencia essas células por fórmula, não por valor fixo. Mudar um
parâmetro recalcula tudo — é a mesma matemática de app/processos.py e
app/comercial.py, só que reescrita como fórmula do Excel em vez de Python.

Tudo numa aba só (pedido do usuário): o relatório (A:G) é o que aparece
ao imprimir/exportar em PDF do Excel (`print_area` cobre só essas
colunas, layout A4 retrato); o painel de parâmetros fica ao lado, visível
e editável na mesma aba, mas fora da área de impressão.

O que NÃO vira fórmula (fica como número editável direto, sem derivação):
usinagem (lista de operações ad hoc) e itens_padrao (idem) — não têm uma
taxa única por kg/peça pra expor como parâmetro, e horas de caldeiraria
quando vêm do histórico combinado (usar_historico_horas) em vez da regra
simples peso×fator.
"""

from __future__ import annotations

import io
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import column_index_from_string, get_column_letter
from openpyxl.worksheet.page import PageMargins

from app.parametros_padrao import ALIQUOTAS_COMPRA_POR_TIPO, PARAMETROS_PADRAO

MOEDA = '"R$" #,##0.00'
PERCENTUAL = "0.00%"

_AZUL_ESCURO = "0F172A"
_AZUL_MEDIO = "1E293B"
_CIANO = "0891B2"
_CINZA_CLARO = "E2E8F0"
_BRANCO = "FFFFFF"

_FONTE_TITULO = Font(color=_BRANCO, bold=True, size=16)
_FONTE_SUBTITULO = Font(color=_CINZA_CLARO, size=10, italic=True)
_FONTE_SECAO = Font(color=_BRANCO, bold=True, size=11)
_FONTE_CABECALHO_TABELA = Font(bold=True, size=10)
_FONTE_TOTAL = Font(bold=True, size=10)
_FONTE_RESUMO_ROTULO = Font(size=10)
_FONTE_RESUMO_VALOR = Font(bold=True, size=10)
_FONTE_PRECO_FINAL = Font(color=_BRANCO, bold=True, size=15)
_FONTE_PARAMETROS_TITULO = Font(bold=True, size=10, color=_BRANCO)

_FILL_TITULO = PatternFill(start_color=_AZUL_ESCURO, end_color=_AZUL_ESCURO, fill_type="solid")
_FILL_SECAO = PatternFill(start_color=_AZUL_MEDIO, end_color=_AZUL_MEDIO, fill_type="solid")
_FILL_CABECALHO_TABELA = PatternFill(start_color=_CINZA_CLARO, end_color=_CINZA_CLARO, fill_type="solid")
_FILL_PRECO_FINAL = PatternFill(start_color=_CIANO, end_color=_CIANO, fill_type="solid")
_FILL_PARAMETROS_TITULO = PatternFill(start_color=_AZUL_MEDIO, end_color=_AZUL_MEDIO, fill_type="solid")

_BORDA_FINA = Border(*(Side(style="thin", color="CBD5E1") for _ in range(4)))

_COL_PARAM_VALOR = "J"


def _mesclar_e_estilizar(ws, linha: int, col_ini: str, col_fim: str, valor, fonte: Font, fill: PatternFill, alinhamento: str = "left") -> None:
    ws.merge_cells(f"{col_ini}{linha}:{col_fim}{linha}")
    celula = ws[f"{col_ini}{linha}"]
    celula.value = valor
    celula.font = fonte
    celula.fill = fill
    celula.alignment = Alignment(horizontal=alinhamento, vertical="center")
    for indice_col in range(column_index_from_string(col_ini), column_index_from_string(col_fim) + 1):
        ws[f"{get_column_letter(indice_col)}{linha}"].fill = fill


def _cabecalho_tabela(ws, linha: int, titulos: list[str]) -> None:
    for i, titulo in enumerate(titulos):
        celula = ws.cell(row=linha, column=i + 1, value=titulo)
        celula.font = _FONTE_CABECALHO_TABELA
        celula.fill = _FILL_CABECALHO_TABELA
        celula.border = _BORDA_FINA
        celula.alignment = Alignment(horizontal="left" if i == 0 else "center")


def _bordar_linha(ws, linha: int, n_colunas: int) -> None:
    for col in range(1, n_colunas + 1):
        ws.cell(row=linha, column=col).border = _BORDA_FINA


def _montar_parametros(ws, entrada: dict, params: dict, comercial) -> dict[str, int]:
    """Escreve o painel de parâmetros (colunas I:J) e devolve
    {chave: numero_da_linha} pro relatório referenciar por fórmula."""
    _mesclar_e_estilizar(
        ws, 1, "I", "J", "PARÂMETROS (editável)", _FONTE_PARAMETROS_TITULO, _FILL_PARAMETROS_TITULO, "center"
    )
    linhas: dict[str, int] = {}
    r = 2

    def add(chave: str, rotulo: str, valor, fmt: str | None = None):
        nonlocal r
        ws.cell(row=r, column=9, value=rotulo).font = Font(size=9)
        celula = ws.cell(row=r, column=10, value=valor)
        celula.font = Font(size=9, bold=True)
        if fmt:
            celula.number_format = fmt
        linhas[chave] = r
        r += 1

    add("peso_liquido_kg", "Peso líquido (kg)", entrada["peso_liquido_kg"], "0.00")
    add("fator_margem", "Fator de margem de venda", params["fator_margem_venda"], "0.00")
    add("corte_valor_kg", "Corte — R$/kg", params["corte_valor_kg"], MOEDA)
    add("caldeiraria_fator_h_kg", "Caldeiraria — fator h/kg", params["caldeiraria_fator_h_kg"], "0.0000")
    add("caldeiraria_valor_hora", "Caldeiraria — R$/h", params["caldeiraria_valor_hora"], MOEDA)
    add("jateamento_divisor", "Jateamento/pintura — divisor sobre h caldeiraria", params["jateamento_pintura_divisor"], "0")
    add("jateamento_valor_hora", "Jateamento/pintura — R$/h", params["jateamento_pintura_valor_hora"], MOEDA)
    add("solda_fator_consumo", "Solda — % consumível sobre peso", params["solda_fator_consumo_percentual"], PERCENTUAL)
    add("solda_preco_consumivel", "Solda — R$/kg consumível", params["solda_preco_kg_consumivel"], MOEDA)
    add("solda_fator_gas", "Solda — % gás sobre consumível", params["solda_fator_gas_sobre_consumivel"], PERCENTUAL)
    add("solda_preco_gas", "Solda — R$/unidade gás", params["solda_preco_unidade_gas"], MOEDA)
    add("pintura_fator_l_m2", "Pintura — L/m² por demão", params["pintura_fator_l_m2"], "0.0000")
    add("area_pintura_m2", "Área de pintura (m²)", entrada.get("area_pintura_m2") or 0, "0.00")
    demaos = params["pintura_demaos"]
    preco_fundo = next((d["preco_litro"] for d in demaos if d["tipo"] == "fundo"), 0.0)
    preco_acabamento = next((d["preco_litro"] for d in demaos if d["tipo"] == "acabamento"), 0.0)
    add("pintura_preco_fundo", "Pintura — R$/L fundo", preco_fundo, MOEDA)
    add("pintura_preco_acabamento", "Pintura — R$/L acabamento", preco_acabamento, MOEDA)
    add("ndt_valor_kg", "NDT — R$/kg", params["ndt_valor_kg"], MOEDA)
    add("engenharia_valor_unitario", "Engenharia — R$/posição", params["engenharia_valor_unitario"], MOEDA)
    add("qtd_posicoes_engenharia", "Quantidade de posições de engenharia", entrada.get("quantidade_posicoes_engenharia") or 0, "0")
    add("embalagem_valor_kg", "Embalagem — R$/kg", params["embalagem_valor_kg"], MOEDA)
    add("transporte_valor_kg", "Transporte — R$/kg", params["transporte_valor_kg"], MOEDA)
    add("energia_valor_kg", "Energia — R$/kg", params["energia_valor_kg"], MOEDA)
    add("aliquota_venda", f"Alíquota de venda ({comercial.cenario_comercial})", comercial.aliquota_venda, PERCENTUAL)

    ws.column_dimensions["I"].width = 40
    ws.column_dimensions["J"].width = 14
    return linhas


def _ref(linhas: dict[str, int], chave: str) -> str:
    return f"${_COL_PARAM_VALOR}${linhas[chave]}"


def _formula_bruto_processo(codigo: str, entrada: dict, linhas_p: dict[str, int], linha_caldeiraria_horas_cel: str | None) -> tuple[str, str | None]:
    """Devolve (formula_bruto, formula_horas_ou_None) pro código de processo."""
    peso = _ref(linhas_p, "peso_liquido_kg")

    if codigo == "corte":
        return f"={peso}*{_ref(linhas_p, 'corte_valor_kg')}", None

    if codigo == "caldeiraria":
        if entrada.get("usar_historico_horas"):
            return None, None  # tratado como valor estático fora daqui
        # app/processos.py calcula o bruto com as horas SEM arredondar, mas
        # guarda linha.horas arredondado (2 casas) — e é esse valor
        # arredondado que orcamento.py repassa pro jateamento/pintura. Pra
        # bater exato com o motor real, o bruto usa a expressão cheia (sem
        # arredondar) e a célula de Horas (que o jateamento referencia)
        # arredonda, replicando a mesma perda de precisão intermediária.
        horas_cheio = f"{peso}*{_ref(linhas_p, 'caldeiraria_fator_h_kg')}"
        return f"={horas_cheio}*{_ref(linhas_p, 'caldeiraria_valor_hora')}", f"=ROUND({horas_cheio},2)"

    if codigo == "jateamento_pintura_mo":
        if linha_caldeiraria_horas_cel is None:
            return None, None
        horas = f"{linha_caldeiraria_horas_cel}/{_ref(linhas_p, 'jateamento_divisor')}"
        return f"={horas}*{_ref(linhas_p, 'jateamento_valor_hora')}", f"=ROUND({horas},2)"

    if codigo == "solda":
        return (
            f"={peso}*{_ref(linhas_p, 'solda_fator_consumo')}*"
            f"({_ref(linhas_p, 'solda_preco_consumivel')}+{_ref(linhas_p, 'solda_fator_gas')}*{_ref(linhas_p, 'solda_preco_gas')})",
            None,
        )

    if codigo == "pintura_material":
        return (
            f"={_ref(linhas_p, 'area_pintura_m2')}*{_ref(linhas_p, 'pintura_fator_l_m2')}*"
            f"({_ref(linhas_p, 'pintura_preco_fundo')}+{_ref(linhas_p, 'pintura_preco_acabamento')})",
            None,
        )

    if codigo == "ndt":
        return f"={peso}*{_ref(linhas_p, 'ndt_valor_kg')}", None

    if codigo == "engenharia":
        return f"={_ref(linhas_p, 'qtd_posicoes_engenharia')}*{_ref(linhas_p, 'engenharia_valor_unitario')}", None

    if codigo == "embalagem":
        return f"={peso}*{_ref(linhas_p, 'embalagem_valor_kg')}", None

    if codigo == "transporte":
        return f"={peso}*{_ref(linhas_p, 'transporte_valor_kg')}", None

    if codigo == "energia":
        return f"={peso}*{_ref(linhas_p, 'energia_valor_kg')}", None

    return None, None  # usinagem, itens_padrao — sem taxa única, fica estático


def gerar_excel_orcamento(entrada: dict, resultado, params: dict | None = None) -> bytes:
    """entrada: o dict já adaptado (o mesmo que POST /orcamento espera).
    resultado: o ResultadoOrcamento já calculado (evita recalcular e
    garante que os valores estáticos batem com o que apareceu na tela)."""
    params = params or PARAMETROS_PADRAO

    wb = Workbook()
    ws = wb.active
    ws.title = "Orçamento"
    ws.sheet_view.showGridLines = False

    linhas_p = _montar_parametros(ws, entrada, params, resultado.comercial)

    # ---- Cabeçalho do relatório ----
    r = 1
    _mesclar_e_estilizar(ws, r, "A", "G", "ORÇAMENTO INDUSTRIAL", _FONTE_TITULO, _FILL_TITULO)
    ws.row_dimensions[r].height = 28
    r += 1
    gerado_em = datetime.now().strftime("%d/%m/%Y %H:%M")
    _mesclar_e_estilizar(
        ws, r, "A", "G", f"FC Nexus — Orçamento Industrial I.A.  ·  Gerado em {gerado_em}",
        _FONTE_SUBTITULO, _FILL_TITULO,
    )
    r += 2

    # ---- Matéria-prima ----
    itens_mp = entrada.get("materia_prima") or []
    ref_total_materia_prima = None
    if itens_mp:
        _mesclar_e_estilizar(ws, r, "A", "G", "MATÉRIA-PRIMA", _FONTE_SECAO, _FILL_SECAO)
        r += 1
        _cabecalho_tabela(ws, r, ["Descrição", "Peso (kg)", "Preço/kg", "Bruto", "ICMS", "PIS/COFINS", "Líquido"])
        r += 1
        icms, pis_cofins = ALIQUOTAS_COMPRA_POR_TIPO["materia_prima"]
        primeira_linha_mp = r
        for item in itens_mp:
            ws.cell(row=r, column=1, value=item["descricao"])
            ws.cell(row=r, column=2, value=item["peso_kg"]).number_format = "0.00"
            ws.cell(row=r, column=3, value=item["preco_kg"]).number_format = MOEDA
            ws.cell(row=r, column=4, value=f"=B{r}*C{r}").number_format = MOEDA
            ws.cell(row=r, column=5, value=icms).number_format = PERCENTUAL
            ws.cell(row=r, column=6, value=pis_cofins).number_format = PERCENTUAL
            ws.cell(row=r, column=7, value=f"=D{r}*(1-E{r}-F{r})").number_format = MOEDA
            _bordar_linha(ws, r, 7)
            r += 1
        ws.cell(row=r, column=1, value="Total matéria-prima").font = _FONTE_TOTAL
        celula_total = ws.cell(row=r, column=7, value=f"=SUM(G{primeira_linha_mp}:G{r - 1})")
        celula_total.number_format = MOEDA
        celula_total.font = _FONTE_TOTAL
        _bordar_linha(ws, r, 7)
        ref_total_materia_prima = f"$G${r}"
        r += 2

    # ---- Processos ----
    _mesclar_e_estilizar(ws, r, "A", "G", "PROCESSOS", _FONTE_SECAO, _FILL_SECAO)
    r += 1
    _cabecalho_tabela(ws, r, ["Processo", "Horas", "Bruto", "ICMS", "PIS/COFINS", "Líquido", ""])
    r += 1
    primeira_linha_proc = r
    horas_caldeiraria_cel: str | None = None
    for linha in resultado.linhas:
        if linha.codigo == "materia_prima":
            continue

        ws.cell(row=r, column=1, value=linha.descricao)

        formula_bruto, formula_horas = _formula_bruto_processo(
            linha.codigo, entrada, linhas_p,
            horas_caldeiraria_cel if linha.codigo == "jateamento_pintura_mo" else None,
        )

        if formula_horas is not None:
            ws.cell(row=r, column=2, value=formula_horas).number_format = "0.00"
            if linha.codigo == "caldeiraria":
                horas_caldeiraria_cel = f"$B${r}"
        elif linha.horas is not None:
            ws.cell(row=r, column=2, value=linha.horas).number_format = "0.00"
            if linha.codigo == "caldeiraria":
                horas_caldeiraria_cel = f"$B${r}"

        if formula_bruto is not None:
            ws.cell(row=r, column=3, value=formula_bruto).number_format = MOEDA
        else:
            ws.cell(row=r, column=3, value=round(linha.valor_bruto, 2)).number_format = MOEDA

        ws.cell(row=r, column=4, value=linha.aliquota_icms).number_format = PERCENTUAL
        ws.cell(row=r, column=5, value=linha.aliquota_pis_cofins).number_format = PERCENTUAL
        ws.cell(row=r, column=6, value=f"=C{r}*(1-D{r}-E{r})").number_format = MOEDA
        _bordar_linha(ws, r, 7)
        r += 1

    ws.cell(row=r, column=1, value="Total processos").font = _FONTE_TOTAL
    celula_total_proc = ws.cell(row=r, column=6, value=f"=SUM(F{primeira_linha_proc}:F{r - 1})")
    celula_total_proc.number_format = MOEDA
    celula_total_proc.font = _FONTE_TOTAL
    _bordar_linha(ws, r, 7)
    ref_total_processos = f"$F${r}"
    r += 2

    # ---- Resumo comercial ----
    linha_resumo_ini = r
    _mesclar_e_estilizar(ws, r, "A", "G", "RESUMO COMERCIAL", _FONTE_SECAO, _FILL_SECAO)
    r += 1

    partes_custo = [ref_total_processos] + ([ref_total_materia_prima] if ref_total_materia_prima else [])
    formula_custo_industrial = "=" + "+".join(partes_custo)

    def linha_resumo(rotulo: str, formula, fmt: str):
        nonlocal r
        ws.cell(row=r, column=1, value=rotulo).font = _FONTE_RESUMO_ROTULO
        celula = ws.cell(row=r, column=3, value=formula)
        celula.font = _FONTE_RESUMO_VALOR
        celula.number_format = fmt
        return celula

    linha_peso = r
    linha_resumo("Peso líquido (kg)", f"={_ref(linhas_p, 'peso_liquido_kg')}", "0.00")
    r += 1
    linha_custo = r
    linha_resumo("Custo industrial", formula_custo_industrial, MOEDA)
    r += 1
    linha_margem = r
    linha_resumo("Fator de margem", f"={_ref(linhas_p, 'fator_margem')}", "0.00")
    r += 1
    linha_aliquota = r
    linha_resumo("Alíquota de venda", f"={_ref(linhas_p, 'aliquota_venda')}", PERCENTUAL)
    r += 1

    custo_cel, margem_cel, aliquota_cel, peso_cel = f"$C${linha_custo}", f"$C${linha_margem}", f"$C${linha_aliquota}", f"$C${linha_peso}"

    linha_venda_com = r
    linha_resumo("Preço de venda (c/ impostos)", f"={custo_cel}*(1+{margem_cel})", MOEDA)
    venda_com_cel = f"$C${linha_venda_com}"
    r += 1
    linha_imposto = r
    linha_resumo("Imposto a pagar", f"={venda_com_cel}*{aliquota_cel}", MOEDA)
    imposto_cel = f"$C${linha_imposto}"
    r += 1
    linha_resumo("Margem de lucro", f"={venda_com_cel}-{imposto_cel}-{custo_cel}", MOEDA)
    r += 1
    linha_resumo("Preço de venda (s/ impostos)", f"={venda_com_cel}*(1-{aliquota_cel})", MOEDA)
    r += 1
    linha_resumo("R$/kg", f"=IF({peso_cel}=0,0,{venda_com_cel}/{peso_cel})", MOEDA)
    r += 1

    for linha_i in range(linha_resumo_ini + 1, r):
        _bordar_linha(ws, linha_i, 3)

    r += 1
    # Preço final em destaque
    _mesclar_e_estilizar(ws, r, "A", "D", "PREÇO DE VENDA (C/ IMPOSTOS)", _FONTE_PRECO_FINAL, _FILL_PRECO_FINAL)
    ws.row_dimensions[r].height = 26
    ws.merge_cells(f"E{r}:G{r}")
    celula_preco_final = ws[f"E{r}"]
    celula_preco_final.value = f"={venda_com_cel}"
    celula_preco_final.font = _FONTE_PRECO_FINAL
    celula_preco_final.fill = _FILL_PRECO_FINAL
    celula_preco_final.number_format = MOEDA
    celula_preco_final.alignment = Alignment(horizontal="right", vertical="center")
    ultima_linha = r

    # ---- Layout A4 ----
    ws.column_dimensions["A"].width = 34
    for col in ("B", "C", "D", "E", "F", "G"):
        ws.column_dimensions[col].width = 13

    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = "portrait"
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_margins = PageMargins(left=0.5, right=0.5, top=0.6, bottom=0.6, header=0.3, footer=0.3)
    ws.print_area = f"A1:G{ultima_linha}"

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
