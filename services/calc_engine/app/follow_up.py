"""Aba FOLLOW UP — importa a aba "Gerencia" do "Gerenciamento de obras
ativas.xlsb" para o banco (ver supabase/migrations/0013_follow_up.sql).

Pedido explícito do usuário: NÃO é "Excel → JSON → tabela". Aqui se
interpreta, a partir do arquivo binário (app/xlsb_leitor.py):

- valores em cache das fórmulas (Status, PROCVs...), exatamente como o
  Excel mostra — Status nunca é recalculado nem inventado;
- datas (serial do Excel → data real), percentuais das etapas (0–100);
- códigos (PO, MAC, DESENHO, NF, Tipagem) sempre como TEXTO;
- cores manuais das células, linhas ocultas pela segmentação;
- formatação condicional da aba (barras de dados das etapas, "Pronto"
  verde, PO duplicado vermelho...), guardada para o app reproduzir;
- imagens: "imagem dentro da célula" (coluna A — é assim que as fotos
  estão ligadas a cada linha) e imagens flutuantes do desenho da aba,
  estas só quando visíveis e ancoradas numa linha de registro.

Análise do arquivo real (26/09/2026) que definiu as decisões acima: as 987
imagens flutuantes da aba têm altura ZERO e estão empilhadas em 6 linhas —
são restos de linhas apagadas, invisíveis no Excel, e por isso não são
vinculadas a registro nenhum (entram só no relatório). As 595 fotos reais
estão dentro das células da coluna A.
"""

from __future__ import annotations

import hashlib
import io
import json
import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime

from app.orcamentos_salvos import _conectar
from app.xlsb_leitor import Aba, Celula, LeitorXlsb, coluna_letra, serial_para_data

ABA_PADRAO = "Gerencia"

# (campo no banco, cabeçalho na planilha, tipo)
CAMPOS: list[tuple[str, str, str]] = [
    ("imagem", "0", "imagem"),  # coluna A: cabeçalho "0", fotos dentro da célula
    ("po", "PO", "codigo"),
    ("prazo_contratual", "PRAZO CONTRATUAL", "data"),
    ("cliente", "CLIENTE", "texto"),
    ("quantidade", "QUANTIDADE", "numero"),
    ("mac", "MAC", "codigo"),
    ("desenho", "DESENHO", "codigo"),
    ("descricao", "DESCRIÇÃO", "texto"),
    ("eng", "ENG", "etapa"),
    ("cor", "COR", "etapa"),
    ("mon", "MON", "etapa"),
    ("sol", "SOL", "etapa"),
    ("usi", "USI", "etapa"),
    ("dob", "DOB", "etapa"),
    ("jat", "JAT", "etapa"),
    ("pin", "PIN", "etapa"),
    ("coleta", "COLETA", "data_ou_texto"),
    ("status", "Status", "texto"),
    ("fornecedor", "Fornecedor", "texto"),
    ("orcamento_terceirizado_unid", "Orçamento tercerizado unid", "numero"),
    ("orcamento_custo_macfab_unid", "Orçamento de custo Macfab unid", "numero"),
    ("obs_felipe_marcelo", "Obs.Felipe / Marcelo", "texto"),
    ("obs_alisson", "OBS.Alisson", "texto"),
    ("cor2", "COR2", "texto"),
    ("cor_2", "COR-2", "texto"),
    ("plano_pintura", "PLANO DE PINTURA", "texto"),
    ("st", "ST", "codigo"),
    ("nf", "NF", "codigo"),
    ("tipagem", "Tipagem", "codigo"),
    ("peso_unid", "PESO UNID", "numero"),
    ("peso_total", "PESO TOTAL", "numero"),
    ("ano", "ano", "inteiro"),
    ("preco_previsto", "Preço previsto", "numero"),
    ("d", "d", "data"),  # coluna auxiliar da planilha (PROCV do prazo) — só em dados_originais
]
ETAPAS = ["eng", "cor", "mon", "sol", "usi", "dob", "jat", "pin"]
_COLUNAS_ITEM = [c for c, _, t in CAMPOS if t != "imagem" and c != "d"]


class ImportacaoInvalida(ValueError):
    pass


def _normalizar(texto: str) -> str:
    s = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().casefold()


_CABECALHO_PARA_CAMPO = {_normalizar(cab): (campo, tipo) for campo, cab, tipo in CAMPOS}


@dataclass
class Imagem:
    sha256: str
    conteudo: bytes
    content_type: str
    largura: int | None
    altura: int | None
    origem: str
    celula: str
    media_original: str
    ordem: int
    ancora: dict | None = None


@dataclass
class ItemImportado:
    chave: str
    linha_planilha: int  # 1-based, como no Excel
    oculta_na_planilha: bool
    campos: dict
    cores: dict
    dados_originais: dict
    imagens: list[Imagem] = field(default_factory=list)

    def hash_conteudo(self) -> str:
        base = {
            "campos": self.campos, "cores": self.cores, "dados": self.dados_originais,
            "oculta": self.oculta_na_planilha, "imagens": [i.sha256 for i in self.imagens],
        }
        return hashlib.sha256(json.dumps(base, sort_keys=True, default=str).encode()).hexdigest()


@dataclass
class PlanilhaInterpretada:
    aba: str
    colunas: list[dict]
    itens: list[ItemImportado]
    regras: list[dict]
    barra_etapas: dict | None
    indicadores: list[dict]
    relatorio: dict


# --- conversões -------------------------------------------------------------

def _eh_data(leitor: LeitorXlsb, cel: Celula) -> bool:
    est = leitor.estilo(cel.estilo)
    return bool(est and est.eh_data)


def _numero_como_texto(valor: float, formato: str) -> str:
    if float(valor).is_integer():
        s = str(int(valor))
        # formato só de zeros ("000000") = código com zeros à esquerda
        if re.fullmatch(r"0+", formato or ""):
            s = s.zfill(len(formato))
        return s
    return repr(float(valor))


def _data_de_texto(texto: str) -> date | None:
    m = re.fullmatch(r"\s*(\d{1,2})/(\d{1,2})/(\d{2,4})\s*", texto)
    if not m:
        return None
    d, mes, a = (int(x) for x in m.groups())
    if a < 100:
        a += 2000
    try:
        return date(a, mes, d)
    except ValueError:
        return None


def _numero_de_texto(texto: str) -> float | None:
    s = texto.strip().replace("R$", "").replace("%", "").strip()
    if not s:
        return None
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})*(,\d+)?|-?\d+(,\d+)?", s):
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _valor_original(leitor: LeitorXlsb, cel: Celula | None):
    """Valor como a planilha mostra (para `dados_originais`)."""
    if cel is None or cel.valor is None or cel.valor == "":
        return None
    if cel.erro:
        return cel.valor
    if isinstance(cel.valor, (int, float)) and not isinstance(cel.valor, bool) and _eh_data(leitor, cel):
        return serial_para_data(cel.valor, leitor.data1904).isoformat()
    return cel.valor


def _converter(leitor: LeitorXlsb, cel: Celula | None, tipo: str, avisos: list[str], ref: str):
    """Devolve o valor tipado do campo (e, para COLETA, também a data)."""
    if cel is None or cel.valor is None or cel.valor == "":
        return None
    v = cel.valor
    if cel.erro:
        avisos.append(f"{ref}: erro do Excel '{v}' — campo ficou vazio (valor original guardado).")
        return None
    est = leitor.estilo(cel.estilo)
    formato = est.formato if est else ""
    eh_num = isinstance(v, (int, float)) and not isinstance(v, bool)

    if tipo in ("codigo", "texto"):
        if isinstance(v, bool):
            return "VERDADEIRO" if v else "FALSO"
        if eh_num:
            if _eh_data(leitor, cel):
                return serial_para_data(v, leitor.data1904).strftime("%d/%m/%Y")
            return _numero_como_texto(v, formato)
        return str(v)

    if tipo == "etapa":
        if eh_num:
            return round(float(v) * 100, 4) if (est and est.eh_percentual) else round(float(v), 4)
        n = _numero_de_texto(str(v))
        if n is None:
            avisos.append(f"{ref}: etapa com texto '{v}' (não é percentual) — valor original guardado.")
        return n

    if tipo in ("numero", "inteiro"):
        if eh_num:
            return int(v) if tipo == "inteiro" and float(v).is_integer() else float(v)
        n = _numero_de_texto(str(v))
        if n is None:
            avisos.append(f"{ref}: esperado número, veio '{v}' — valor original guardado.")
        return n

    if tipo == "data":
        if eh_num:
            # Serial do Excel (ex.: 46276) → data real, mesmo sem formato de data na célula.
            if _eh_data(leitor, cel) or 20000 <= float(v) <= 80000:
                return serial_para_data(v, leitor.data1904)
            avisos.append(f"{ref}: esperado data, veio o número {v}.")
            return None
        d = _data_de_texto(str(v))
        if d is None:
            avisos.append(f"{ref}: esperado data, veio o texto '{v}' — valor original guardado.")
        return d

    if tipo == "data_ou_texto":
        if eh_num and (_eh_data(leitor, cel) or 20000 <= float(v) <= 80000):
            return serial_para_data(v, leitor.data1904)
        if eh_num:
            return _numero_como_texto(v, formato)
        return _data_de_texto(str(v)) or str(v)

    return v


def _mime(caminho: str) -> str:
    ext = caminho.rsplit(".", 1)[-1].lower()
    return {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
            "bmp": "image/bmp", "tif": "image/tiff", "tiff": "image/tiff", "webp": "image/webp",
            "emf": "image/emf", "wmf": "image/wmf"}.get(ext, "application/octet-stream")


def _dimensoes(conteudo: bytes) -> tuple[int | None, int | None]:
    try:
        from PIL import Image

        with Image.open(io.BytesIO(conteudo)) as im:
            return im.size
    except Exception:
        return None, None


# --- interpretação ----------------------------------------------------------

def interpretar(conteudo: bytes, nome_aba: str = ABA_PADRAO) -> PlanilhaInterpretada:
    leitor = LeitorXlsb(conteudo)
    aba = leitor.ler_aba(nome_aba)
    avisos: list[str] = []

    # Cabeçalho: primeira linha (até a 10ª) que tenha PO e PRAZO CONTRATUAL.
    linha_cab = None
    for r in range(0, 10):
        textos = {_normalizar(c.valor) for (lr, _), c in aba.celulas.items() if lr == r and isinstance(c.valor, str)}
        if "po" in textos and "prazo contratual" in textos:
            linha_cab = r
            break
    if linha_cab is None:
        raise ImportacaoInvalida(f"Não achei o cabeçalho (PO / PRAZO CONTRATUAL) nas 10 primeiras linhas da aba '{nome_aba}'.")

    col_para_campo: dict[int, tuple[str, str]] = {}
    colunas: list[dict] = []
    ultima_col = max(c for (_, c) in aba.celulas)
    for col in range(ultima_col + 1):
        cel = aba.celulas.get((linha_cab, col))
        if cel is None or cel.valor in (None, ""):
            continue
        cab = str(cel.valor) if not isinstance(cel.valor, float) else _numero_como_texto(cel.valor, "")
        chave = _CABECALHO_PARA_CAMPO.get(_normalizar(cab))
        if chave is None:
            avisos.append(f"Coluna {coluna_letra(col)} ('{cab}') não é um campo conhecido do Follow Up — guardada só em dados originais.")
            campo, tipo = None, "texto"
        else:
            campo, tipo = chave
            col_para_campo[col] = chave
        # formato da 1ª célula de dado (para referência)
        amostra = aba.celulas.get((linha_cab + 1, col))
        est = leitor.estilo(amostra.estilo) if amostra else None
        colunas.append({"campo": campo, "cabecalho": cab, "letra": coluna_letra(col), "tipo": tipo,
                        "formato": est.formato if est else None})

    faltando = [cab for campo, cab, _ in CAMPOS if campo not in {c for c, _ in col_para_campo.values()}]
    if "po" not in {c for c, _ in col_para_campo.values()}:
        raise ImportacaoInvalida("A aba não tem a coluna PO — não dá pra identificar os registros.")
    if faltando:
        avisos.append(f"Colunas esperadas que não estão na aba: {', '.join(faltando)}.")
    campo_para_col = {campo: col for col, (campo, _) in col_para_campo.items()}
    cabecalho_col = {c["letra"]: c["cabecalho"] for c in colunas}

    # Imagens flutuantes: só as visíveis e ancoradas numa linha de registro.
    flutuantes_por_linha: dict[int, list] = {}
    flut_invisiveis = 0
    flut_fora = 0
    linhas_com_dado = {r for (r, c) in aba.celulas if r > linha_cab and c == campo_para_col["po"]
                       and aba.celulas[(r, c)].valor not in (None, "")}
    for img in aba.imagens_flutuantes:
        visivel = (img.largura_emu > 0 and img.altura_emu > 0) or (
            img.linha_fim is not None and img.linha_fim > img.linha and img.coluna_fim is not None and img.coluna_fim > img.coluna)
        if not visivel:
            flut_invisiveis += 1
        elif img.linha not in linhas_com_dado:
            flut_fora += 1
        else:
            flutuantes_por_linha.setdefault(img.linha, []).append(img)

    itens: list[ItemImportado] = []
    chaves_vistas: dict[str, int] = {}
    ignoradas_sem_po = 0
    linhas = sorted({r for (r, _) in aba.celulas if r > linha_cab})
    for r in linhas:
        cel_po = aba.celulas.get((r, campo_para_col["po"]))
        po = _converter(leitor, cel_po, "codigo", avisos, f"PO linha {r + 1}")
        tem_algo = any(aba.celulas.get((r, col)) is not None and aba.celulas[(r, col)].valor not in (None, "")
                       and not aba.celulas[(r, col)].erro for col in col_para_campo)
        if not po or not str(po).strip():
            if tem_algo:
                ignoradas_sem_po += 1
            continue

        campos: dict = {}
        cores: dict = {}
        dados: dict = {}
        for col in range(ultima_col + 1):
            letra = coluna_letra(col)
            cel = aba.celulas.get((r, col))
            if letra in cabecalho_col:
                dados[cabecalho_col[letra]] = _valor_original(leitor, cel)
            if col not in col_para_campo:
                continue
            campo, tipo = col_para_campo[col]
            if tipo == "imagem":
                continue
            ref = f"{cabecalho_col[letra]} linha {r + 1}"
            valor = _converter(leitor, cel, tipo, avisos, ref)
            if campo == "coleta":
                campos["coleta_data"] = valor if isinstance(valor, date) else None
                campos["coleta"] = valor.strftime("%d/%m/%Y") if isinstance(valor, date) else valor
            elif campo != "d":
                campos[campo] = valor
            if cel is not None:
                est = leitor.estilo(cel.estilo)
                if est and (est.preenchimento or est.fonte_cor or est.negrito):
                    cores[campo] = {k: v for k, v in (("fundo", est.preenchimento), ("fonte", est.fonte_cor),
                                                     ("negrito", est.negrito or None)) if v}

        base = str(po).strip()
        n = chaves_vistas.get(base, 0) + 1
        chaves_vistas[base] = n
        chave = base if n == 1 else f"{base} #{n}"
        if n > 1:
            avisos.append(f"PO {base} repetido (linha {r + 1}) — gravado como '{chave}' para não sobrescrever o outro registro.")

        imagens: list[Imagem] = []
        for col in range(ultima_col + 1):
            cel = aba.celulas.get((r, col))
            media = leitor.imagem_da_celula(cel) if cel else None
            if not media:
                continue
            conteudo_img = leitor.ler_parte(media)
            w, h = _dimensoes(conteudo_img)
            imagens.append(Imagem(
                sha256=hashlib.sha256(conteudo_img).hexdigest(), conteudo=conteudo_img, content_type=_mime(media),
                largura=w, altura=h, origem="imagem_na_celula", celula=f"{coluna_letra(col)}{r + 1}",
                media_original=media, ordem=len(imagens)))
        for img in sorted(flutuantes_por_linha.get(r, []), key=lambda i: (i.coluna, i.ordem)):
            conteudo_img = leitor.ler_parte(img.media)
            w, h = _dimensoes(conteudo_img)
            imagens.append(Imagem(
                sha256=hashlib.sha256(conteudo_img).hexdigest(), conteudo=conteudo_img, content_type=_mime(img.media),
                largura=w, altura=h, origem="imagem_flutuante", celula=f"{coluna_letra(img.coluna)}{img.linha + 1}",
                media_original=img.media, ordem=len(imagens),
                ancora={"de": {"linha": img.linha + 1, "coluna": coluna_letra(img.coluna)},
                        "ate": {"linha": (img.linha_fim or img.linha) + 1, "coluna": coluna_letra(img.coluna_fim or img.coluna)},
                        "largura_emu": img.largura_emu, "altura_emu": img.altura_emu, "nome": img.nome,
                        "ordem_no_desenho": img.ordem}))

        itens.append(ItemImportado(
            chave=chave, linha_planilha=r + 1, oculta_na_planilha=r in aba.linhas_ocultas,
            campos=campos, cores=cores, dados_originais=dados, imagens=imagens))

    # Formatação condicional → por campo, com as linhas (1-based) de cada intervalo.
    regras: list[dict] = []
    nao_reproduzidas: list[str] = []
    for regra in sorted(aba.regras, key=lambda x: x.prioridade):
        intervalos = []
        for r1, r2, c1, c2 in regra.intervalos:
            for col in range(c1, c2 + 1):
                if col in col_para_campo:
                    intervalos.append({"campo": col_para_campo[col][0], "de": r1 + 1, "ate": r2 + 1})
        if not intervalos:
            continue
        if regra.tipo.startswith("outro:"):
            nao_reproduzidas.append(f"regra {regra.tipo} (prioridade {regra.prioridade})")
            continue
        regras.append({
            "tipo": regra.tipo, "prioridade": regra.prioridade, "intervalos": intervalos,
            "texto": regra.texto, "operador": regra.operador, "preenchimento": regra.preenchimento,
            "fonte_cor": regra.fonte_cor, "barra_cor": regra.barra_cor,
            "barra_min": regra.barra_min, "barra_max": regra.barra_max,
        })

    # Barra de dados das etapas: as 89 regras de barra da planilha são cópias
    # fragmentadas da MESMA regra (0 a 100, verde) — resultado de copiar/colar
    # linhas. Aplicamos o estilo dominante a todas as etapas, em vez de deixar
    # algumas células sem barra só por causa de fragmentação.
    contagem: dict[tuple, int] = {}
    for regra in regras:
        if regra["tipo"] != "dataBar":
            continue
        n_etapas = sum(1 for iv in regra["intervalos"] if iv["campo"] in ETAPAS)
        if n_etapas:
            k = (regra["barra_cor"], regra["barra_min"], regra["barra_max"])
            contagem[k] = contagem.get(k, 0) + n_etapas
    barra_etapas = None
    if contagem:
        cor, mn, mx = max(contagem, key=contagem.get)
        barra_etapas = {"cor": cor, "min": mn if mn is not None else 0, "max": mx if mx is not None else 100}

    indicadores = []
    for (r, c), cel in sorted(aba.celulas.items()):
        if r < linha_cab and cel.valor not in (None, "", " "):
            indicadores.append({"celula": f"{coluna_letra(c)}{r + 1}", "valor": _valor_original(leitor, cel)})

    relatorio = {
        "avisos": avisos[:300],
        "avisos_total": len(avisos),
        "linhas_ignoradas_sem_po": ignoradas_sem_po,
        "imagens_na_celula": sum(1 for i in itens for im in i.imagens if im.origem == "imagem_na_celula"),
        "imagens_flutuantes_total": len(aba.imagens_flutuantes),
        "imagens_flutuantes_vinculadas": sum(1 for i in itens for im in i.imagens if im.origem == "imagem_flutuante"),
        "imagens_flutuantes_invisiveis": flut_invisiveis,
        "imagens_flutuantes_fora_de_registro": flut_fora,
        "linhas_ocultas": sum(1 for i in itens if i.oculta_na_planilha),
        "regras_nao_reproduzidas": nao_reproduzidas,
    }
    return PlanilhaInterpretada(aba=nome_aba, colunas=colunas, itens=itens, regras=regras,
                                barra_etapas=barra_etapas, indicadores=indicadores, relatorio=relatorio)


# --- persistência ---------------------------------------------------------------

_LOTE_MIDIAS_BYTES = 2 * 1024 * 1024


def _inserir_midias(cur, lote: list[tuple]) -> None:
    cur.executemany(
        """insert into follow_up_midias (sha256, content_type, conteudo, largura, altura, tamanho)
           values (%s, %s, %s, %s, %s, %s) on conflict (sha256) do nothing""",
        lote,
    )


def importar(conteudo: bytes, nome_arquivo: str, nome_aba: str = ABA_PADRAO) -> dict:
    from psycopg.types.json import Jsonb

    planilha = interpretar(conteudo, nome_aba)
    sha_arquivo = hashlib.sha256(conteudo).hexdigest()

    with _conectar() as conn, conn.cursor() as cur:
        # Uma importação por vez (dois cliques seguidos não se atropelam).
        cur.execute("select pg_advisory_xact_lock(hashtext('follow_up_importacao'))")
        cur.execute(
            """
            insert into follow_up_importacoes
                (arquivo_nome, arquivo_sha256, arquivo_bytes, aba, linhas_lidas, inseridos, atualizados,
                 inalterados, ausentes, imagens_vinculadas, colunas, regras_formatacao, indicadores, relatorio)
            values (%s, %s, %s, %s, %s, 0, 0, 0, 0, 0, %s, %s, %s, %s)
            returning id
            """,
            (nome_arquivo, sha_arquivo, len(conteudo), planilha.aba, len(planilha.itens),
             Jsonb(planilha.colunas), Jsonb({"regras": planilha.regras, "barra_etapas": planilha.barra_etapas}),
             Jsonb(planilha.indicadores), Jsonb(planilha.relatorio)),
        )
        importacao_id = cur.fetchone()[0]

        cur.execute("select chave, id, hash_conteudo from follow_up_itens")
        existentes = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

        # Imagens: só envia as que o banco ainda não tem (reimportar o mesmo
        # arquivo não reenvia nada), em lotes de até ~2 MB — um lote único
        # com todas (~8 MB) derrubou a conexão com o Supabase no teste real.
        midias = {}
        for item in planilha.itens:
            for img in item.imagens:
                midias[img.sha256] = img
        if midias:
            cur.execute("select sha256 from follow_up_midias where sha256 = any(%s)", (list(midias),))
            ja_existem = {r[0] for r in cur.fetchall()}
            lote: list[tuple] = []
            tamanho_lote = 0
            for m in midias.values():
                if m.sha256 in ja_existem:
                    continue
                lote.append((m.sha256, m.content_type, m.conteudo, m.largura, m.altura, len(m.conteudo)))
                tamanho_lote += len(m.conteudo)
                if tamanho_lote >= _LOTE_MIDIAS_BYTES:
                    _inserir_midias(cur, lote)
                    lote, tamanho_lote = [], 0
            if lote:
                _inserir_midias(cur, lote)

        # Itens: tudo em executemany (pipeline do psycopg) — uma consulta por
        # linha seria ~635 idas e voltas entre Render (EUA) e Supabase (SP).
        colunas_sql = _COLUNAS_ITEM + ["coleta_data"]
        so_posicao: list[tuple] = []
        alterados: list[tuple] = []
        novos: list[tuple] = []
        ids_com_imagens_trocadas: list = []
        imagens_novas: list[tuple] = []
        for item in planilha.itens:
            h = item.hash_conteudo()
            valores = [item.campos.get(c) for c in colunas_sql]
            if item.chave in existentes:
                item_id, hash_antigo = existentes[item.chave]
                if hash_antigo == h:
                    so_posicao.append((item.linha_planilha, importacao_id, item_id))
                    continue
                alterados.append((*valores, item.linha_planilha, item.oculta_na_planilha, Jsonb(item.cores),
                                  Jsonb(item.dados_originais), h, importacao_id, item_id))
                ids_com_imagens_trocadas.append(item_id)
            else:
                item_id = uuid.uuid4()
                novos.append((item_id, item.chave, *valores, item.linha_planilha, item.oculta_na_planilha,
                              Jsonb(item.cores), Jsonb(item.dados_originais), h, importacao_id))
            for img in item.imagens:
                imagens_novas.append(
                    (item_id, img.sha256, img.ordem, img.origem, img.celula, img.media_original,
                     Jsonb(img.ancora) if img.ancora else None))

        if so_posicao:
            cur.executemany(
                """update follow_up_itens set linha_planilha = %s, presente_na_ultima_importacao = true,
                   importacao_id = %s where id = %s""",
                so_posicao,
            )
        if alterados:
            sets = ", ".join(f"{c} = %s" for c in colunas_sql)
            cur.executemany(
                f"""update follow_up_itens set {sets}, linha_planilha = %s, oculta_na_planilha = %s, cores = %s,
                    dados_originais = %s, hash_conteudo = %s, presente_na_ultima_importacao = true,
                    importacao_id = %s, updated_at = now() where id = %s""",
                alterados,
            )
            cur.execute("delete from follow_up_imagens where item_id = any(%s)", (ids_com_imagens_trocadas,))
        if novos:
            cols = ", ".join(colunas_sql)
            ph = ", ".join(["%s"] * len(colunas_sql))
            cur.executemany(
                f"""insert into follow_up_itens (id, chave, {cols}, linha_planilha, oculta_na_planilha, cores,
                    dados_originais, hash_conteudo, importacao_id)
                    values (%s, %s, {ph}, %s, %s, %s, %s, %s, %s)""",
                novos,
            )
        if imagens_novas:
            cur.executemany(
                """insert into follow_up_imagens (item_id, midia_sha256, ordem, origem, celula, media_original, ancora)
                   values (%s, %s, %s, %s, %s, %s, %s)""",
                imagens_novas,
            )
        inseridos, atualizados, inalterados = len(novos), len(alterados), len(so_posicao)

        chaves = [i.chave for i in planilha.itens]
        cur.execute(
            """update follow_up_itens set presente_na_ultima_importacao = false, updated_at = now()
               where presente_na_ultima_importacao and not (chave = any(%s))""",
            (chaves,),
        )
        ausentes = cur.rowcount
        cur.execute(
            "delete from follow_up_midias m where not exists (select 1 from follow_up_imagens i where i.midia_sha256 = m.sha256)"
        )
        imagens_vinculadas = sum(len(i.imagens) for i in planilha.itens)
        cur.execute(
            """update follow_up_importacoes set inseridos = %s, atualizados = %s, inalterados = %s, ausentes = %s,
               imagens_vinculadas = %s where id = %s""",
            (inseridos, atualizados, inalterados, ausentes, imagens_vinculadas, importacao_id),
        )
        conn.commit()

    return {
        "importacao_id": str(importacao_id),
        "arquivo_nome": nome_arquivo,
        "arquivo_sha256": sha_arquivo,
        "aba": planilha.aba,
        "linhas_lidas": len(planilha.itens),
        "inseridos": inseridos,
        "atualizados": atualizados,
        "inalterados": inalterados,
        "ausentes": ausentes,
        "imagens_vinculadas": imagens_vinculadas,
        "relatorio": planilha.relatorio,
    }


def _json(v):
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if hasattr(v, "is_finite"):  # Decimal
        return float(v)
    return v


def listar() -> dict:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select id, arquivo_nome, arquivo_sha256, aba, importado_em, linhas_lidas, inseridos, atualizados,
                      inalterados, ausentes, imagens_vinculadas, colunas, regras_formatacao, indicadores, relatorio
               from follow_up_importacoes order by importado_em desc limit 1"""
        )
        imp = cur.fetchone()
        colunas_sql = ["id", "chave"] + _COLUNAS_ITEM + [
            "coleta_data", "linha_planilha", "oculta_na_planilha", "cores",
            "presente_na_ultima_importacao", "updated_at"]  # dados_originais fica fora: dobra o tamanho da resposta
        cur.execute(f"select {', '.join(colunas_sql)} from follow_up_itens order by linha_planilha, chave")
        itens = [{c: _json(v) for c, v in zip(colunas_sql, row)} for row in cur.fetchall()]
        cur.execute(
            """select i.item_id, i.id, i.midia_sha256, i.ordem, i.origem, i.celula, m.largura, m.altura
               from follow_up_imagens i join follow_up_midias m on m.sha256 = i.midia_sha256
               order by i.item_id, i.ordem"""
        )
        imagens: dict[str, list] = {}
        for item_id, img_id, sha, ordem, origem, celula, w, h in cur.fetchall():
            imagens.setdefault(str(item_id), []).append(
                {"id": str(img_id), "sha256": sha, "ordem": ordem, "origem": origem, "celula": celula,
                 "largura": w, "altura": h})

    for item in itens:
        item["id"] = str(item["id"])
        item["imagens"] = imagens.get(item["id"], [])

    importacao = None
    if imp:
        importacao = {
            "id": str(imp[0]), "arquivo_nome": imp[1], "arquivo_sha256": imp[2], "aba": imp[3],
            "importado_em": imp[4].isoformat(), "linhas_lidas": imp[5], "inseridos": imp[6], "atualizados": imp[7],
            "inalterados": imp[8], "ausentes": imp[9], "imagens_vinculadas": imp[10], "colunas": imp[11],
            "regras": (imp[12] or {}).get("regras", []), "barra_etapas": (imp[12] or {}).get("barra_etapas"),
            "indicadores": imp[13], "relatorio": imp[14],
        }
    return {"importacao": importacao, "itens": itens}


def obter_midia(sha256: str) -> tuple[bytes, str] | None:
    if not re.fullmatch(r"[0-9a-f]{64}", sha256):
        return None
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select conteudo, content_type from follow_up_midias where sha256 = %s", (sha256,))
        row = cur.fetchone()
    return (bytes(row[0]), row[1]) if row else None
