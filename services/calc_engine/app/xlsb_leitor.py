"""Leitor de arquivos .xlsb (Excel binário) — valores, formatação e imagens.

Pedido explícito do usuário (aba FOLLOW UP): NÃO usar uma biblioteca que
leia só os valores das células e descarte em silêncio imagens, cores e
regras. `pyxlsb`, por exemplo, só devolve valores. Aqui o pacote é lido
por dentro:

- `xl/workbook.bin`          → nome de cada aba → parte da planilha;
- `xl/sharedStrings.bin`     → textos;
- `xl/styles.bin`            → formatos numéricos (data/percentual),
                               preenchimentos, fontes e os estilos (DXF) das
                               regras de formatação condicional;
- `xl/worksheets/sheetN.bin` → células (valor em cache das fórmulas),
                               linhas ocultas, formatação condicional e o
                               índice de "imagem dentro da célula" (BrtValueMeta);
- `xl/metadata.bin` + `xl/richData/*` → liga cada célula com imagem à
                               imagem de verdade em `xl/media` (recurso
                               "Colocar na célula" do Excel);
- `xl/drawings/drawingN.xml` → imagens flutuantes da aba, com âncora.

Formato de registro (MS-XLSB): tipo em varint de até 2 bytes, tamanho em
varint de até 4 bytes, depois o payload. Só os registros necessários são
interpretados — o resto é pulado.
"""

from __future__ import annotations

import io
import posixpath
import re
import struct
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

# --- tipos de registro usados -------------------------------------------------
_ROW_HDR = 0
_CELL_BLANK = 1
_CELL_RK = 2
_CELL_ERROR = 3
_CELL_BOOL = 4
_CELL_REAL = 5
_CELL_ST = 6
_CELL_ISST = 7
_FMLA_STRING = 8
_FMLA_NUM = 9
_FMLA_BOOL = 10
_FMLA_ERROR = 11
_SST_ITEM = 19
_FONT = 43
_FMT = 44
_FILL = 45
_XF = 47
_VALUE_META = 50
_MDB = 51
_CELL_RSTRING = 62
_WB_PROP = 153
_BUNDLE_SH = 156
_BEGIN_CF = 461
_END_CF = 462
_BEGIN_CF_RULE = 463
_END_CF_RULE = 464
_BEGIN_DATABAR = 467
_CFVO = 471
_DXF = 507
_COLOR = 564
_BEGIN_FONTS = 611
_END_FONTS = 612
_BEGIN_FILLS = 603
_END_FILLS = 604
_BEGIN_CELL_XFS = 617
_END_CELL_XFS = 618
_FMD_RVB = 5003  # bloco de futureMetadata "XLRICHVALUE" → índice do rich value

_ERROS = {0x00: "#NULL!", 0x07: "#DIV/0!", 0x0F: "#VALUE!", 0x17: "#REF!", 0x1D: "#NAME?",
          0x24: "#NUM!", 0x2A: "#N/A", 0x2B: "#GETTING_DATA"}

# Templates de regra condicional (enum CFTemp do MS-XLSB) que interessam.
_CF_TEMPLATES = {0x03: "dataBar", 0x07: "uniqueValues", 0x08: "containsText",
                 0x09: "containsBlanks", 0x0A: "notContainsBlanks", 0x1B: "duplicateValues"}
_CF_TEXTO_OPERADOR = {0: "contains", 1: "notContains", 2: "beginsWith", 3: "endsWith"}

# Formatos numéricos embutidos (sem código gravado no arquivo) que são data/hora.
_FORMATOS_DATA_EMBUTIDOS = set(range(14, 23)) | {45, 46, 47}
_FORMATOS_PERCENTUAL_EMBUTIDOS = {9, 10}

_REL_NS = "{http://schemas.openxmlformats.org/package/2006/relationships}"
_R_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_XDR_NS = "{http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing}"
_A_NS = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
_RD_NS = "{http://schemas.microsoft.com/office/spreadsheetml/2017/richdata}"
_RVREL_NS = "{http://schemas.microsoft.com/office/spreadsheetml/2022/richvaluerel}"


class ArquivoXlsbInvalido(ValueError):
    pass


def registros(dados: bytes):
    """Itera (tipo, payload) sobre um stream BIFF12."""
    i, n = 0, len(dados)
    while i < n:
        tipo = dados[i]
        i += 1
        if tipo & 0x80:
            tipo = (tipo & 0x7F) | ((dados[i] & 0x7F) << 7)
            i += 1
        tamanho, desloc = 0, 0
        for _ in range(4):
            b = dados[i]
            i += 1
            tamanho |= (b & 0x7F) << desloc
            desloc += 7
            if not b & 0x80:
                break
        yield tipo, dados[i:i + tamanho]
        i += tamanho


def _u16(p: bytes, o: int) -> int:
    return struct.unpack_from("<H", p, o)[0]


def _u32(p: bytes, o: int) -> int:
    return struct.unpack_from("<I", p, o)[0]


def _texto_largo(p: bytes, o: int) -> tuple[str, int]:
    """XLWideString: u32 com nº de caracteres UTF-16 + os caracteres."""
    n = _u32(p, o)
    o += 4
    return p[o:o + 2 * n].decode("utf-16-le", errors="replace"), o + 2 * n


def _texto_largo_anulavel(p: bytes, o: int) -> tuple[str | None, int]:
    n = _u32(p, o)
    if n == 0xFFFFFFFF:
        return None, o + 4
    return _texto_largo(p, o)


def _rk(v: int) -> float | int:
    x100 = v & 1
    if v & 2:
        num: float | int = struct.unpack("<i", struct.pack("<I", v & 0xFFFFFFFC))[0] >> 2
    else:
        num = struct.unpack("<d", struct.pack("<Q", (v & 0xFFFFFFFC) << 32))[0]
    if x100:
        num = num / 100
    return num


def _cor(p: bytes, o: int) -> str | None:
    """BrtColor (8 bytes). O Excel grava o RGB já resolvido (inclusive
    para cor de tema com tonalidade) quando fValidRGB está ligado — usamos
    esse RGB direto, sem recalcular a partir do tema."""
    flags = p[o]
    if not flags & 1:
        return None
    r, g, b = p[o + 4], p[o + 5], p[o + 6]
    return f"#{r:02X}{g:02X}{b:02X}"


def _eh_formato_data(codigo: str) -> bool:
    limpo = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.|_.|\*.', "", codigo)
    limpo = limpo.split(";")[0]
    return bool(re.search(r"[dmyhsDMYHS]", limpo)) and "#" not in limpo and "0" not in limpo


def _eh_formato_percentual(codigo: str) -> bool:
    return "%" in re.sub(r'"[^"]*"|\\.', "", codigo)


def serial_para_data(serial: float, data1904: bool = False) -> date:
    base = datetime(1904, 1, 1) if data1904 else datetime(1899, 12, 30)
    return (base + timedelta(days=float(serial))).date()


def coluna_letra(col: int) -> str:
    """Índice 0-based → letra (0 → A, 26 → AA)."""
    s = ""
    col += 1
    while col:
        col, resto = divmod(col - 1, 26)
        s = chr(65 + resto) + s
    return s


@dataclass
class Estilo:
    formato: str
    eh_data: bool
    eh_percentual: bool
    preenchimento: str | None  # cor de fundo explícita da célula (#RRGGBB) ou None
    fonte_cor: str | None
    negrito: bool


@dataclass
class Celula:
    linha: int  # 0-based
    coluna: int  # 0-based
    valor: object  # str | float | int | bool | None (erro vira str "#VALUE!" etc.)
    erro: bool
    estilo: int
    valor_meta: int | None  # índice (1-based) em metadata — imagem na célula


@dataclass
class RegraCondicional:
    tipo: str  # dataBar | containsText | duplicateValues | ... | outro:<iType>/<iTemplate>
    intervalos: list[tuple[int, int, int, int]]  # (linha_ini, linha_fim, col_ini, col_fim), 0-based inclusivo
    prioridade: int
    texto: str | None = None
    operador: str | None = None
    preenchimento: str | None = None
    fonte_cor: str | None = None
    barra_cor: str | None = None
    barra_min: float | None = None
    barra_max: float | None = None


@dataclass
class ImagemFlutuante:
    media: str  # caminho da parte dentro do zip (xl/media/imageN.png)
    nome: str | None
    linha: int  # âncora "de" (0-based)
    coluna: int
    linha_fim: int | None
    coluna_fim: int | None
    largura_emu: int
    altura_emu: int
    ordem: int  # ordem no desenho (z-order)


@dataclass
class Aba:
    nome: str
    celulas: dict[tuple[int, int], Celula] = field(default_factory=dict)
    linhas_ocultas: set[int] = field(default_factory=set)
    regras: list[RegraCondicional] = field(default_factory=list)
    imagens_flutuantes: list[ImagemFlutuante] = field(default_factory=list)


class LeitorXlsb:
    def __init__(self, conteudo: bytes):
        try:
            self._zip = zipfile.ZipFile(io.BytesIO(conteudo))
        except zipfile.BadZipFile as e:
            raise ArquivoXlsbInvalido("O arquivo não é um .xlsb válido (não abriu como pacote do Excel).") from e
        nomes = set(self._zip.namelist())
        if "xl/workbook.bin" not in nomes:
            raise ArquivoXlsbInvalido("O arquivo não é um .xlsb (não tem xl/workbook.bin). Salve como Pasta de Trabalho Binária do Excel.")
        self._nomes = nomes
        self.data1904 = False
        self._abas = self._ler_workbook()
        self._strings = self._ler_strings()
        self._estilos, self._dxfs = self._ler_estilos()
        self._imagem_por_valor_meta: dict[int, str] | None = None

    # --- pacote -----------------------------------------------------------
    def ler_parte(self, caminho: str) -> bytes:
        return self._zip.read(caminho)

    def _rels(self, parte: str) -> dict[str, str]:
        pasta, nome = posixpath.split(parte)
        caminho_rels = posixpath.join(pasta, "_rels", nome + ".rels")
        if caminho_rels not in self._nomes:
            return {}
        raiz = ET.fromstring(self._zip.read(caminho_rels))
        saida = {}
        for rel in raiz.iter(f"{_REL_NS}Relationship"):
            if rel.get("TargetMode") == "External":
                continue
            alvo = rel.get("Target", "")
            alvo = alvo.lstrip("/") if alvo.startswith("/") else posixpath.normpath(posixpath.join(pasta, alvo))
            saida[rel.get("Id")] = alvo
        return saida

    # --- workbook / strings / estilos ------------------------------------
    def _ler_workbook(self) -> dict[str, str]:
        rels = self._rels("xl/workbook.bin")
        abas: dict[str, str] = {}
        for tipo, p in registros(self._zip.read("xl/workbook.bin")):
            if tipo == _WB_PROP:
                self.data1904 = bool(_u32(p, 0) & 1)
            elif tipo == _BUNDLE_SH:
                rel_id, o = _texto_largo_anulavel(p, 8)
                nome, _ = _texto_largo(p, o)
                if rel_id and rel_id in rels:
                    abas[nome] = rels[rel_id]
        return abas

    @property
    def abas(self) -> list[str]:
        return list(self._abas)

    def _ler_strings(self) -> list[str]:
        if "xl/sharedStrings.bin" not in self._nomes:
            return []
        saida = []
        for tipo, p in registros(self._zip.read("xl/sharedStrings.bin")):
            if tipo == _SST_ITEM:
                saida.append(_texto_largo(p, 1)[0])
        return saida

    def _ler_estilos(self) -> tuple[list[Estilo], list[dict]]:
        formatos: dict[int, str] = {}
        fontes: list[tuple[str | None, bool]] = []
        preenchimentos: list[str | None] = []
        xfs: list[tuple[int, int, int]] = []
        dxfs: list[dict] = []
        secao = None
        for tipo, p in registros(self._zip.read("xl/styles.bin")):
            if tipo in (_BEGIN_FONTS, _BEGIN_FILLS, _BEGIN_CELL_XFS):
                secao = tipo
            elif tipo in (_END_FONTS, _END_FILLS, _END_CELL_XFS):
                secao = None
            elif tipo == _FMT:
                formatos[_u16(p, 0)] = _texto_largo(p, 2)[0]
            elif tipo == _FONT and secao == _BEGIN_FONTS:
                negrito = _u16(p, 4) >= 700
                fontes.append((_cor(p, 12), negrito))
            elif tipo == _FILL and secao == _BEGIN_FILLS:
                padrao = _u32(p, 0)
                # só "sólido" tem cor de fundo significativa; branco puro
                # (tema 0) é o fundo padrão da planilha, não um destaque.
                cor = _cor(p, 4) if padrao == 1 else None
                preenchimentos.append(None if cor == "#FFFFFF" else cor)
            elif tipo == _XF and secao == _BEGIN_CELL_XFS:
                xfs.append((_u16(p, 2), _u16(p, 4), _u16(p, 6)))
            elif tipo == _DXF:
                dxfs.append(self._ler_dxf(p))

        estilos = []
        for i_fmt, i_fonte, i_fill in xfs:
            codigo = formatos.get(i_fmt, "General" if i_fmt == 0 else f"[embutido {i_fmt}]")
            eh_data = i_fmt in _FORMATOS_DATA_EMBUTIDOS or (i_fmt in formatos and _eh_formato_data(codigo))
            eh_pct = i_fmt in _FORMATOS_PERCENTUAL_EMBUTIDOS or (i_fmt in formatos and _eh_formato_percentual(codigo))
            fonte_cor, negrito = fontes[i_fonte] if i_fonte < len(fontes) else (None, False)
            estilos.append(Estilo(
                formato=codigo, eh_data=eh_data, eh_percentual=eh_pct,
                preenchimento=preenchimentos[i_fill] if i_fill < len(preenchimentos) else None,
                fonte_cor=None if fonte_cor == "#000000" else fonte_cor,
                negrito=negrito,
            ))
        return estilos, dxfs

    @staticmethod
    def _ler_dxf(p: bytes) -> dict:
        """BrtDXF: flags(2) reservado(2) cprops(2) + XFProps (tipo u16, cb u16, dados)."""
        n = _u16(p, 4)
        o = 6
        props: dict = {}
        for _ in range(n):
            if o + 4 > len(p):
                break
            tipo, cb = _u16(p, o), _u16(p, o + 2)
            dados_o = o + 4
            if tipo == 1:
                props["frente"] = _cor(p, dados_o)
            elif tipo == 2:
                props["fundo"] = _cor(p, dados_o)
            elif tipo == 5:
                props["fonte"] = _cor(p, dados_o)
            o += cb
        # No DXF de preenchimento sólido/padrão, a cor que aparece é a de "fundo".
        return {"preenchimento": props.get("fundo") or props.get("frente"), "fonte_cor": props.get("fonte")}

    def estilo(self, indice: int) -> Estilo | None:
        return self._estilos[indice] if 0 <= indice < len(self._estilos) else None

    # --- imagens dentro da célula ----------------------------------------
    def _mapa_imagem_na_celula(self) -> dict[int, str]:
        """valor_meta (1-based, do BrtValueMeta da célula) → parte da imagem.

        Cadeia: metadata.bin (BrtMdb[vm-1] → índice no futureMetadata
        XLRICHVALUE → rvb i) → rdrichvalue.xml (rv[i], chave
        _rvRel:LocalImageIdentifier) → richValueRel.xml (rel[k] → r:id) →
        richValueRel.xml.rels → xl/media/..."""
        if self._imagem_por_valor_meta is not None:
            return self._imagem_por_valor_meta
        mapa: dict[int, str] = {}
        self._imagem_por_valor_meta = mapa
        if "xl/metadata.bin" not in self._nomes or "xl/richData/rdrichvalue.xml" not in self._nomes:
            return mapa

        rvbs: list[int] = []
        mdbs: list[int] = []
        for tipo, p in registros(self._zip.read("xl/metadata.bin")):
            if tipo == _FMD_RVB and len(p) >= 8:
                rvbs.append(_u32(p, 4))
            elif tipo == _MDB and len(p) >= 12:
                mdbs.append(_u32(p, 8))  # 1º (e único) registro: iMdt, iMd

        estruturas = ET.fromstring(self._zip.read("xl/richData/rdrichvaluestructure.xml"))
        pos_chave_imagem: dict[int, int] = {}
        for i, s in enumerate(estruturas.findall(f"{_RD_NS}s")):
            chaves = [k.get("n") for k in s.findall(f"{_RD_NS}k")]
            if "_rvRel:LocalImageIdentifier" in chaves:
                pos_chave_imagem[i] = chaves.index("_rvRel:LocalImageIdentifier")

        valores = ET.fromstring(self._zip.read("xl/richData/rdrichvalue.xml")).findall(f"{_RD_NS}rv")
        rel_ids = [r.get(f"{_R_NS}id") for r in ET.fromstring(
            self._zip.read("xl/richData/richValueRel.xml")).findall(f"{_RVREL_NS}rel")]
        rels = self._rels("xl/richData/richValueRel.xml")

        for vm, i_md in enumerate(mdbs, start=1):
            if i_md >= len(rvbs):
                continue
            i_rv = rvbs[i_md]
            if i_rv >= len(valores):
                continue
            rv = valores[i_rv]
            pos = pos_chave_imagem.get(int(rv.get("s", "-1")))
            if pos is None:
                continue
            vs = rv.findall(f"{_RD_NS}v")
            if pos >= len(vs):
                continue
            k = int(vs[pos].text)
            if k < len(rel_ids) and rel_ids[k] in rels:
                mapa[vm] = rels[rel_ids[k]]
        return mapa

    def imagem_da_celula(self, celula: Celula) -> str | None:
        if celula.valor_meta is None:
            return None
        return self._mapa_imagem_na_celula().get(celula.valor_meta)

    # --- aba -------------------------------------------------------------
    def ler_aba(self, nome: str) -> Aba:
        if nome not in self._abas:
            raise ArquivoXlsbInvalido(
                f"Aba '{nome}' não encontrada no arquivo. Abas existentes: {', '.join(self._abas)}."
            )
        parte = self._abas[nome]
        aba = Aba(nome=nome)
        linha = -1
        valor_meta_pendente: int | None = None
        regra_atual: RegraCondicional | None = None
        intervalos_atuais: list[tuple[int, int, int, int]] = []
        cfvos: list[float | None] = []

        for tipo, p in registros(self._zip.read(parte)):
            if tipo == _ROW_HDR:
                linha = _u32(p, 0)
                # byte 11: iOutLevel(3) fCollapsed(1) fDyZero(1) → fDyZero = linha oculta
                if len(p) > 11 and p[11] & 0x10:
                    aba.linhas_ocultas.add(linha)
            elif tipo == _VALUE_META:
                valor_meta_pendente = _u32(p, 0)
            elif tipo in (_CELL_BLANK, _CELL_RK, _CELL_ERROR, _CELL_BOOL, _CELL_REAL, _CELL_ST,
                          _CELL_ISST, _FMLA_STRING, _FMLA_NUM, _FMLA_BOOL, _FMLA_ERROR, _CELL_RSTRING):
                col = _u32(p, 0)
                estilo = _u32(p, 4) & 0xFFFFFF
                valor: object = None
                erro = False
                if tipo == _CELL_RK:
                    valor = _rk(_u32(p, 8))
                elif tipo in (_CELL_REAL, _FMLA_NUM):
                    valor = struct.unpack_from("<d", p, 8)[0]
                elif tipo in (_CELL_ST, _FMLA_STRING):
                    valor = _texto_largo(p, 8)[0]
                elif tipo == _CELL_RSTRING:
                    valor = _texto_largo(p, 9)[0]
                elif tipo == _CELL_ISST:
                    i = _u32(p, 8)
                    valor = self._strings[i] if i < len(self._strings) else ""
                elif tipo in (_CELL_BOOL, _FMLA_BOOL):
                    valor = bool(p[8])
                elif tipo in (_CELL_ERROR, _FMLA_ERROR):
                    valor = _ERROS.get(p[8], "#ERRO")
                    erro = True
                aba.celulas[(linha, col)] = Celula(linha, col, valor, erro, estilo, valor_meta_pendente)
                valor_meta_pendente = None
            elif tipo == _BEGIN_CF:
                n = _u32(p, 8)
                intervalos_atuais = []
                for k in range(n):
                    o = 12 + 16 * k
                    r1, r2, c1, c2 = struct.unpack_from("<IIII", p, o)
                    intervalos_atuais.append((r1, r2, c1, c2))
            elif tipo == _END_CF:
                intervalos_atuais = []
            elif tipo == _BEGIN_CF_RULE:
                i_tipo, i_template, dxf_id, prioridade, i_param = struct.unpack_from("<IIIII", p, 0)
                texto, _ = _texto_largo_anulavel(p, 42)
                nome_tipo = _CF_TEMPLATES.get(i_template)
                if i_tipo == 4:
                    nome_tipo = "dataBar"
                if nome_tipo is None:
                    nome_tipo = f"outro:{i_tipo}/{i_template}"
                dxf = self._dxfs[dxf_id] if dxf_id != 0xFFFFFFFF and dxf_id < len(self._dxfs) else {}
                regra_atual = RegraCondicional(
                    tipo=nome_tipo, intervalos=list(intervalos_atuais), prioridade=prioridade,
                    texto=texto if nome_tipo == "containsText" else None,
                    operador=_CF_TEXTO_OPERADOR.get(i_param) if nome_tipo == "containsText" else None,
                    preenchimento=dxf.get("preenchimento"), fonte_cor=dxf.get("fonte_cor"),
                )
                cfvos = []
            elif tipo == _CFVO and regra_atual is not None:
                # BrtCFVO: iType u32 (1=num, 2=min, 3=max, ...) + numParam (double)
                i_tipo_cfvo = _u32(p, 0)
                cfvos.append(struct.unpack_from("<d", p, 4)[0] if i_tipo_cfvo == 1 else None)
            elif tipo == _COLOR and regra_atual is not None and regra_atual.tipo == "dataBar":
                regra_atual.barra_cor = regra_atual.barra_cor or _cor(p, 0)
            elif tipo == _END_CF_RULE and regra_atual is not None:
                if regra_atual.tipo == "dataBar" and len(cfvos) >= 2:
                    regra_atual.barra_min, regra_atual.barra_max = cfvos[0], cfvos[1]
                aba.regras.append(regra_atual)
                regra_atual = None

        aba.imagens_flutuantes = self._ler_desenho(parte)
        return aba

    def _ler_desenho(self, parte_aba: str) -> list[ImagemFlutuante]:
        saida: list[ImagemFlutuante] = []
        for alvo in self._rels(parte_aba).values():
            if not alvo.startswith("xl/drawings/") or not alvo.endswith(".xml"):
                continue
            rels = self._rels(alvo)
            raiz = ET.fromstring(self._zip.read(alvo))
            ordem = 0
            for ancora in list(raiz):
                tag = ancora.tag.replace(_XDR_NS, "")
                if tag not in ("twoCellAnchor", "oneCellAnchor", "absoluteAnchor"):
                    continue
                for pic in ancora.iter(f"{_XDR_NS}pic"):
                    blip = pic.find(f".//{_A_NS}blip")
                    rid = blip.get(f"{_R_NS}embed") if blip is not None else None
                    if not rid or rid not in rels:
                        continue
                    de = ancora.find(f"{_XDR_NS}from")
                    ate = ancora.find(f"{_XDR_NS}to")
                    ext = ancora.find(f"{_XDR_NS}ext")
                    if ext is None:
                        ext = pic.find(f".//{_A_NS}ext")
                    nome_el = pic.find(f".//{_XDR_NS}cNvPr")

                    def _num(el, filho):
                        return int(el.find(f"{_XDR_NS}{filho}").text) if el is not None else None

                    saida.append(ImagemFlutuante(
                        media=rels[rid],
                        nome=nome_el.get("name") if nome_el is not None else None,
                        linha=_num(de, "row") if de is not None else -1,
                        coluna=_num(de, "col") if de is not None else -1,
                        linha_fim=_num(ate, "row"),
                        coluna_fim=_num(ate, "col"),
                        largura_emu=int(ext.get("cx", 0)) if ext is not None else 0,
                        altura_emu=int(ext.get("cy", 0)) if ext is not None else 0,
                        ordem=ordem,
                    ))
                    ordem += 1
        return saida
