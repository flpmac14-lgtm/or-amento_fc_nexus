"""Aba QUALIDADE (só flpmac14) — pedido explícito do usuário: lista dos
certificados de matéria-prima da pasta do Recebimento, com NRI, descrição
do produto e tipo (tinta, insumo de solda etc.); e o sininho da aba avisa
quando um PDF é adicionado, alterado ou excluído na pasta.

De onde vem cada coluna (estudado nos PDFs em 09/10/2026):
- NRI: nome do arquivo ("NRI 26-5097.pdf"; na pasta do ultrassom vem
  invertido, "NRI 0365-23"). Metade dos PDFs é digitalizada e cada
  fornecedor tem um modelo, então NÃO se lê o conteúdo dos PDFs.
- Descrição e fornecedor: aba GERAL da planilha "CONTROLE DE RECEBIMENTO E
  ESTOQUE.xlsm" do Recebimento (uma linha por NRI) — cobre ~99,6% dos PDFs.
- Tipo: código do material (coluna SECTRA = código do ERP, GGSSxxxx) →
  grupo/subgrupo do ERP (MT_SUBGRUPO, só SELECT). Sem código, pelas
  palavras da descrição.

A pasta e o ERP só existem na rede da fábrica: roda nesta máquina (dentro do
ciclo de 15 min, sincronizar_controle_obras.py). A cada ciclo confere os
arquivos (nome, data, tamanho — é rápido); só relê a planilha e grava quando
algo mudou. Lista em qualidade_certificados, avisos em qualidade_notificacoes
(migration 0034, sem policy). O site lê pela rota /api/qualidade/certificados
(só flpmac14).

Uso: python scripts/sincronizar_certificados.py [--simular] [--forcar]
"""

import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import warnings
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")

from app.orcamentos_salvos import _conectar  # noqa: E402

RECEBIMENTO = Path(r"J:\5 - Almoxarifado - Recebimento\ISO_SGQ\Recebimento")
PASTA = RECEBIMENTO / "1. Certificados de Matéria-Prima_Ordenados pelo NRI"
PLANILHA = RECEBIMENTO / "CONTROLE DE RECEBIMENTO E ESTOQUE.xlsm"
# Pastas com um PDF por NRI. As "NRI ANO 2014…2020" juntam dezenas de NRIs
# digitalizados num arquivo só ("NRI 119-2019 ATÉ NRI 001-2019") — ficam fora.
SUBPASTAS = ["ultrasson de chapas", "_REVISAR"]

# Última lista gravada (pra comparar e gerar os avisos) — fora do git.
ESTADO = RAIZ / "sincronizar_certificados.estado.json"
# Mudança grande de uma vez (pasta renomeada, planilha reorganizada): um aviso
# só, em vez de milhares.
MAX_AVISOS = 150

# Nome curto do tipo (pedido do usuário: "tinta, insumo de solda etc.") por
# grupo+subgrupo do código do ERP. O que não está aqui usa o nome do subgrupo.
TIPOS = {
    "5001": "Chapa",
    "5002": "Tubo",
    "5003": "Barra",
    "5004": "Perfil / viga",
    "5005": "Fundido / forjado",
    "5006": "Tela / manta",
    "5007": "Grade",
    "5008": "Tinta",
    "5009": "Retalho",
    "4004": "Insumo de solda",
    "4005": "Consumível de corte",
    "4006": "Consumível de jato / pintura",
    "4008": "Lubrificante / óleo",
    "4013": "Preparação de superfície",
    "4014": "Diluente / solvente",
    "4019": "Consumível de ensaio (LP / partículas)",
    "3001": "Elemento de fixação",
    "3002": "Transmissão / rolamento",
    "3004": "Vedação",
    "3005": "Revestimento",
    "3006": "Adesivo / fita",
    "3008": "Içamento",
}

# Sem código do ERP: palavras da descrição (a primeira que bater).
PALAVRAS = [
    (r"\bTINTA|PRIMER|ESMALTE|VERNIZ|CATALISADOR|\bCPB\b|\bCPA\b|SUMATANE|MACROPOXY|WEGTHANE|INTERGARD|INTERTHANE|REVRAN", "Tinta"),
    (r"DILUENTE|SOLVENTE|THINNER|REDUTOR", "Diluente / solvente"),
    (r"ARAME|ELETRODO|VARETA|FLUXO|\bE ?7018|\bER ?70|\bE ?71T|SOLDA", "Insumo de solda"),
    (r"PENETRANTE|REVELADOR|REMOVEDOR|MAGNAFLUX|MAGNAVIS|\bWCP|SPOTCHECK|METAL-?CHEK|PHENICON|PART[IÍ]CULA", "Consumível de ensaio (LP / partículas)"),
    (r"PARAFUSO|\bPRF\b|\bPRF\.|PORCA|ARRUELA|\bARR\b|PRISIONEIRO|CHUMBADOR|BARRA ROSCADA|PINO|CHAVETA|CUPILHA|REBITE|ANEL EL", "Elemento de fixação"),
    (r"FLANGE|CURVA|\bLUVA|NIPLE|REDU[CÇ][AÃ]O|\bTEE\b|BUJ[AÃ]O|\bPLUG|\bCOLAR\b|\bCAP\b|UNI[AÃ]O|COTOVELO|V[AÁ]LVULA", "Conexão / flange"),
    (r"\bCHAPA|\bCH\b|\bCH ?#|PLACA|\bINOX|\bFERRO\b|RET[AÂ]NGULO|\bDISCO|\bTAMPO|\bCFQ\b|LAMINADO", "Chapa"),
    (r"\bTUBO", "Tubo"),
    (r"\bBARRA|TARUGO|VERGALH", "Barra"),
    (r"CANTONEIRA|\bVIGA|PERFIL|\bU ?ENRIJ|\bTRILHO|\bPUDC|EXTRUDADO", "Perfil / viga"),
    (r"ROLAMENTO|MANCAL|ENGRENAGEM|ACOPLAMENTO", "Transmissão / rolamento"),
    (r"BUCHA|BRONZE|FUNDID|FORJAD", "Fundido / forjado"),
    (r"\bCABO\b|LINGA|MANILHA|OLHAL|SAPATILHO|TALHA|\bTROLE", "Içamento"),
    (r"\bTELA|LEN[CÇ]OL|FELTRO|\bMANTA", "Tela / manta"),
    (r"ADESIVO|\bFITA|\bCOLA\b|SCOTCHRAP", "Adesivo / fita"),
    (r"[OÓ]XIDO|GRANALHA|\bJATO", "Consumível de jato / pintura"),
    (r"JUNTA|VEDA[CÇ]|GAXETA|BORRACHA|O-?RING|VITON", "Vedação"),
]


def _nri_do_nome(nome: str) -> str | None:
    """'NRI 26-5097.pdf' → '26-5097'; 'CHAPA … NRI 0365-23.pdf' → '23-0365'."""
    m = re.match(r"NRI\s*(\d{2})-(\d{3,5})", nome, re.I)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):04d}"
    m = re.search(r"NRI\D{0,4}(\d{3,4})-(\d{2})(?!\d)", nome, re.I)
    if m:
        return f"{m.group(2)}-{int(m.group(1)):04d}"
    return None


def _nri_da_planilha(v) -> str | None:
    m = re.search(r"(\d{2})-(\d{3,5})", str(v or ""))
    return f"{m.group(1)}-{int(m.group(2)):04d}" if m else None


def listar_pdfs() -> dict[str, dict]:
    """'pasta/nome.pdf' → {nome, modificado, tamanho} (pasta e subpastas por NRI)."""
    arquivos: dict[str, dict] = {}
    for sub in [""] + SUBPASTAS:
        base = PASTA / sub if sub else PASTA
        if not base.is_dir():
            continue
        with os.scandir(base) as it:
            for e in it:
                if e.is_file() and e.name.lower().endswith(".pdf"):
                    st = e.stat()
                    arquivos[f"{sub}/{e.name}" if sub else e.name] = {
                        "nome": e.name,
                        "modificado": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(timespec="seconds"),
                        "tamanho": st.st_size,
                    }
    return arquivos


def ler_planilha() -> dict[str, dict]:
    """NRI → {descricao, fornecedor, recebido, codigo} da aba GERAL."""
    import openpyxl

    # Cópia local: a planilha fica aberta no Recebimento (e na rede é lenta).
    with tempfile.TemporaryDirectory() as tmp:
        copia = Path(tmp) / "controle.xlsm"
        shutil.copyfile(PLANILHA, copia)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            wb = openpyxl.load_workbook(copia, read_only=True, data_only=True)
            ws = wb["GERAL"]
            cab = [str(c or "").strip().upper() for c in next(ws.iter_rows(max_row=1, values_only=True))]
            col = {nome: cab.index(nome) for nome in ("NRI", "SECTRA", "DESC SECTRA", "DESCRICAO", "FORNECEDOR", "DT RECEB.")}
            linhas = list(ws.iter_rows(min_row=2, values_only=True))
            wb.close()

    def valor(r, nome):
        return r[col[nome]] if col[nome] < len(r) else None

    def txt(r, nome):
        v = valor(r, nome)
        return re.sub(r"\s+", " ", str(v)).strip() if v not in (None, "") else None

    por_nri: dict[str, dict] = {}
    for r in linhas:
        nri = _nri_da_planilha(valor(r, "NRI"))
        if not nri:
            continue
        desc = txt(r, "DESCRICAO") or txt(r, "DESC SECTRA")
        codigo = txt(r, "SECTRA")
        codigo = codigo if codigo and re.fullmatch(r"\d{8}", codigo) else None
        receb = valor(r, "DT RECEB.")
        item = por_nri.setdefault(nri, {"descricao": [], "fornecedor": None, "recebido": None, "codigo": None})
        if desc and desc not in item["descricao"]:
            item["descricao"].append(desc)
        item["fornecedor"] = item["fornecedor"] or txt(r, "FORNECEDOR")
        item["codigo"] = item["codigo"] or codigo
        if isinstance(receb, datetime) and not item["recebido"]:
            item["recebido"] = receb.date().isoformat()
    return por_nri


def subgrupos_erp() -> dict[str, str]:
    """'5008' → 'TINTA, VERNIZ, …' (MT_SUBGRUPO do ERP, só SELECT)."""
    import pyodbc

    conn = pyodbc.connect(
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={os.environ['ERP_SQL_SERVER']};DATABASE={os.environ['ERP_SQL_DATABASE']};"
        f"UID={os.environ['ERP_SQL_USER']};PWD={os.environ['ERP_SQL_PASSWORD']};TrustServerCertificate=yes",
        timeout=10,
    )
    try:
        cur = conn.cursor()
        cur.execute("SELECT GRUPO, CODIGO, DESCRICAO FROM MT_SUBGRUPO")
        return {f"{g.strip()}{c.strip()}": (d or "").strip() for g, c, d in cur.fetchall()}
    finally:
        conn.close()


def tipo_de(codigo: str | None, descricao: str, subgrupos: dict[str, str]) -> str | None:
    if codigo:
        chave = codigo[:4]
        if chave in TIPOS:
            return TIPOS[chave]
        if subgrupos.get(chave):
            return subgrupos[chave].capitalize()
    texto = descricao.upper()
    for padrao, tipo in PALAVRAS:
        if re.search(padrao, texto):
            return tipo
    return None


def montar(arquivos: dict[str, dict]) -> list[dict]:
    planilha = ler_planilha()
    try:
        subgrupos = subgrupos_erp()
    except Exception as e:  # noqa: BLE001 — sem ERP, usa só os nomes fixos e as palavras
        print(f"ERP indisponível ({e}); tipo só pelos nomes fixos/palavras.")
        subgrupos = {}
    itens = []
    for caminho, arq in arquivos.items():
        nri = _nri_do_nome(arq["nome"])
        info = planilha.get(nri) if nri else None
        descricao = " / ".join(info["descricao"]) if info and info["descricao"] else None
        if not descricao:
            # Fora da planilha: o nome do arquivo é o que temos.
            descricao = re.sub(r"\.pdf$", "", arq["nome"], flags=re.I)
        itens.append({
            "nri": nri,
            "descricao": descricao,
            "tipo": tipo_de(info["codigo"] if info else None, descricao, subgrupos),
            "fornecedor": info["fornecedor"] if info else None,
            "recebido": info["recebido"] if info else None,
            "codigo": info["codigo"] if info else None,
            "arquivo": caminho,
            "modificado": arq["modificado"],
            "tamanho": arq["tamanho"],
            "na_planilha": bool(info),
        })

    def ordem(i):
        if not i["nri"]:
            return (1, 0, 0, i["arquivo"])
        ano, num = i["nri"].split("-")
        return (0, -int(ano), -int(num), i["arquivo"])

    itens.sort(key=ordem)  # mais novo primeiro; sem NRI no fim
    return itens


def _assinatura(arquivos: dict[str, dict]) -> str:
    """Muda quando a planilha ou algum PDF (nome, data, tamanho) mudou."""
    base = json.dumps(sorted((k, v["modificado"], v["tamanho"]) for k, v in arquivos.items()))
    return hashlib.sha256(f"{PLANILHA.stat().st_mtime_ns}|{base}".encode()).hexdigest()


def _avisos(antes: list[dict], depois: list[dict]) -> list[tuple]:
    """(tipo, nri, arquivo, descricao) do que entrou, mudou ou saiu da pasta."""
    a = {i["arquivo"]: i for i in antes}
    d = {i["arquivo"]: i for i in depois}
    avisos = []
    for k, i in d.items():
        if k not in a:
            avisos.append(("adicionado", i["nri"], k, i["descricao"]))
        elif (a[k].get("modificado"), a[k].get("tamanho"), a[k]["descricao"], a[k]["tipo"]) != (
            i["modificado"], i["tamanho"], i["descricao"], i["tipo"],
        ):
            avisos.append(("alterado", i["nri"], k, i["descricao"]))
    for k, i in a.items():
        if k not in d:
            avisos.append(("excluido", i["nri"], k, i["descricao"]))
    if len(avisos) > MAX_AVISOS:
        nomes = {"adicionado": "adicionados", "alterado": "alterados", "excluido": "excluídos"}
        partes = [f"{sum(1 for x in avisos if x[0] == t)} {n}" for t, n in nomes.items() if any(x[0] == t for x in avisos)]
        return [("varios", None, None, f"Mudança grande na pasta: {', '.join(partes)}.")]
    return avisos


def _ler_estado() -> dict:
    try:
        return json.loads(ESTADO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def sincronizar(simular: bool = False, forcar: bool = False) -> str | None:
    """Grava a lista e os avisos se a planilha ou algum PDF mudou (None = nada mudou)."""
    if not PASTA.is_dir() or not PLANILHA.exists():
        return None  # fora da rede da fábrica / J: desconectado
    arquivos = listar_pdfs()
    assinatura = _assinatura(arquivos)
    estado = _ler_estado()
    if not forcar and not simular and estado.get("assinatura") == assinatura:
        return None
    itens = montar(arquivos)
    sem_planilha = sum(1 for i in itens if not i["na_planilha"])
    sem_tipo = sum(1 for i in itens if not i["tipo"])
    # 1ª vez (sem lista anterior): não avisa — senão seriam 7 mil "adicionados".
    avisos = _avisos(estado["itens"], itens) if "itens" in estado else []
    resumo = f"{len(itens)} certificados ({sem_planilha} fora da planilha, {sem_tipo} sem tipo), {len(avisos)} aviso(s)"
    if simular:
        return resumo + " — simulado, nada gravado"
    agora = datetime.now(timezone.utc)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """insert into qualidade_certificados (id, dados, gerado_em) values (1, %s, %s)
               on conflict (id) do update set dados = excluded.dados, gerado_em = excluded.gerado_em""",
            (json.dumps({"itens": itens}, ensure_ascii=False), agora),
        )
        if avisos:
            cur.executemany(
                "insert into qualidade_notificacoes (tipo, nri, arquivo, descricao, criado_em) values (%s, %s, %s, %s, %s)",
                [(*a, agora) for a in avisos],
            )
    ESTADO.write_text(json.dumps({"assinatura": assinatura, "itens": itens}, ensure_ascii=False), encoding="utf-8")
    return resumo + " — gravado"


# Nome usado no ciclo de 15 min (sincronizar_controle_obras.py).
sincronizar_se_mudou = sincronizar


if __name__ == "__main__":
    print(sincronizar(simular="--simular" in sys.argv, forcar="--forcar" in sys.argv) or "sem mudança")
