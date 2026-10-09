"""Tipo de certificado (aba QUALIDADE / Backup Recebimento) — pedido explícito
do usuário: saber se o PDF é relatório de ultrassom, LP, partículas
magnéticas, certificado de material etc.

Não está no nome nem na planilha, então lê o conteúdo: texto do PDF
(pypdfium2) e, quando é digitalizado ou o texto embutido é ilegível (fonte
quebrada), OCR local com o Tesseract (por+eng) nas primeiras páginas, com
correção de rotação. Nada vai pra IA/API (custo zero). O nome do arquivo
também conta.

Resultado em cache local (classificar_certificados.cache.json, fora do git):
caminho+data+tamanho → sha256 do conteúdo → tipos. O mesmo PDF nas duas
pastas (principal e backup) só é lido uma vez. Roda pela tarefa agendada
"FCNexus - Classificar certificados" (a cada 15 min, ~13 min por execução,
em paralelo com metade dos núcleos).

Uso: python scripts/classificar_certificados.py [--teste pasta] [--minutos N]
"""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CACHE = RAIZ / "classificar_certificados.cache.json"
TESSERACT = os.environ.get("TESSERACT_CMD", r"C:\Program Files\Tesseract-OCR\tesseract.exe")
PAGINAS_TEXTO = 4  # PDF com texto: lê até 4 páginas
PAGINAS_OCR = 2  # digitalizado: OCR só nas 2 primeiras (é o que custa tempo)
MIN_TEXTO = 80
# Muda quando as regras mudam: o cache guarda o texto? Não — guarda os tipos;
# então trocar a versão reclassifica tudo na próxima passada.
VERSAO_REGRAS = 2

# (tipo, padrão no texto sem acento e em maiúsculas). Um PDF pode ter vários
# (ex.: certificado da usina + relatório de ultrassom no mesmo arquivo).
TIPOS_CERTIFICADO = [
    ("Ultrassom", r"ULTRA[ -]?S+O[MN]|ULTRASONIC|ULTRASOUND|ULTRA-SONIC"),
    ("Líquido penetrante (LP)",
     r"(RELATORIO|ENSAIO|EXAME|INSPECAO|REPORT|EXAMINATION) (DE |POR |OF |BY )?(LIQUIDOS? PENETRANTES?|PENETRANT)"
     r"|PENETRANT (TEST(ING)?|EXAMINATION|INSPECTION) REPORT"),
    ("Partículas magnéticas",
     r"(RELATORIO|ENSAIO|EXAME|INSPECAO|REPORT|EXAMINATION) (DE |POR |OF |BY )?(PARTICULAS? MAGNETICAS?|MAGNETIC PARTICLE)"
     r"|MAGNETIC PARTICLE (TEST(ING)?|EXAMINATION|INSPECTION) REPORT"),
    ("Radiografia", r"(RELATORIO|REPORT)\W{0,3}(DE |OF )?(ENSAIO |EXAME )?RADIOGRAF|RADIOGRAPHIC (TEST(ING)? |EXAMINATION )?REPORT"),
    ("Tratamento térmico",
     r"(RELATORIO|CERTIFICADO|REGISTRO|GRAFICO) DE TRATAMENTO TERMICO|HEAT TREATMENT (REPORT|CERTIFICATE|CHART)|ALIVIO DE TENSO"),
    ("Dimensional", r"RELATORIO (DE INSPECAO )?DIMENSIONAL|DIMENSIONAL (INSPECTION )?REPORT"),
    # "Proof load" de parafuso é ensaio do certificado de material, não laudo de içamento.
    ("Laudo de carga (içamento)", r"CARGA DE TRABALHO|CARGA MINIMA DE RUPTURA|WORKING LOAD LIMIT|\bWLL\b"),
]
# Certificado de material (usina): vários sinais diferentes.
SINAIS_MATERIAL = [
    r"COMPOSICAO QUIMICA|ANALISE QUIMICA|CHEMICAL (COMPOSITION|ANALYSIS)",
    r"\b10204\b|\b3\.1\b|MILL TEST|INSPECTION CERTIFICATE",
    r"ESCOAMENTO|\bYIELD",
    r"TRACAO|TENSILE|RESISTENCIA MECANICA|MECHANICAL PROPERT|PROPRIEDADES? MECANICAS?",
    r"ALONGAMENTO|ELONGATION",
    r"CORRIDA|\bHEAT\b",
    r"\bC ?%|\bMN\b|CARBONO",
    r"CERTIFICADO DE QUALIDADE|QUALITY CERTIFICATE|CERTIFICADO DE INSPECAO",
]
ANALISE = (r"CERTIFICADO DE ANALISE|CERTIFICATE OF (ANALYSIS|CONFORMANCE|CONFORMITY)|CERTIFICADO DE CONFORMIDADE"
           r"|LOTE.{0,80}(VALIDADE|VALIDITY)|(VALIDADE|VALIDITY).{0,80}LOTE")
MATERIAL = "Certificado de material (usina)"
ANALISE_TIPO = "Certificado de análise (tinta / consumível)"
QUALIDADE_GENERICO = "Certificado de qualidade"
NAO_IDENTIFICADO = "Não identificado"
PALAVRAS_COMUNS = r"\b(DE|DA|DO|THE|AND|OF|CERTIFICADO|CERTIFICATE|DATA|DATE|CLIENTE|CUSTOMER|NORMA|LOTE|PRODUTO|QUALIDADE)\b"


def _normalizar(t: str) -> str:
    t = unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", t.upper())


def _palavras(texto: str) -> int:
    return len(re.findall(PALAVRAS_COMUNS, _normalizar(texto)))


def legivel(texto: str) -> bool:
    """Texto de verdade (e não fonte quebrada / OCR torto): tem palavras comuns."""
    return _palavras(texto) >= 4


def tipos_do_texto(texto: str, nome: str = "") -> list[str]:
    alvo = _normalizar(f"{nome} {texto}")
    tipos = [t for t, p in TIPOS_CERTIFICADO if re.search(p, alvo)]
    sinais = sum(1 for p in SINAIS_MATERIAL if re.search(p, alvo))
    analise = bool(re.search(ANALISE, alvo))
    if sinais >= 3 and not (analise and sinais < 5):
        tipos.append(MATERIAL)
    elif analise:
        tipos.append(ANALISE_TIPO)
    elif sinais >= 2 and not tipos:
        tipos.append(MATERIAL)
    elif not tipos and re.search(r"CERTIFICAD|CERTIFICATE", alvo):
        tipos.append(QUALIDADE_GENERICO)
    return tipos or [NAO_IDENTIFICADO]


def _tesseract(*args: str) -> str:
    r = subprocess.run([TESSERACT, *args], capture_output=True, timeout=180,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    return r.stdout.decode("utf-8", "ignore")


def _ocr(img, caminho: str) -> str:
    """OCR; se sair ilegível, descobre a rotação (OSD) e tenta de novo."""
    img.save(caminho)
    texto = _tesseract(caminho, "stdout", "-l", "por+eng", "--psm", "3")
    if legivel(texto):
        return texto
    osd = _tesseract(caminho, "stdout", "--psm", "0")
    m = re.search(r"Rotate: (\d+)", osd)
    angulos = [int(m.group(1))] if m and int(m.group(1)) else [90, 180, 270]
    melhor = texto
    for ang in angulos:
        img.rotate(-ang, expand=True).save(caminho)
        t = _tesseract(caminho, "stdout", "-l", "por+eng", "--psm", "3")
        if _palavras(t) > _palavras(melhor):
            melhor = t
        if legivel(melhor):
            break
    return melhor


def ler_texto(conteudo: bytes) -> tuple[str, bool]:
    """(texto, usou_ocr) das primeiras páginas."""
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(conteudo)
    try:
        n = len(pdf)
        texto = "\n".join(pdf[i].get_textpage().get_text_range() for i in range(min(n, PAGINAS_TEXTO)))
        if len(re.sub(r"\s", "", texto)) >= MIN_TEXTO and legivel(texto):
            return texto, False
        # Digitalizado ou texto embutido ilegível (fonte quebrada): OCR.
        partes = []
        with tempfile.TemporaryDirectory() as tmp:
            for i in range(min(n, PAGINAS_OCR)):
                img = pdf[i].render(scale=200 / 72).to_pil().convert("L")
                partes.append(_ocr(img, os.path.join(tmp, f"p{i}.png")))
        return "\n".join(partes), True
    finally:
        pdf.close()


def classificar_arquivo(caminho: str) -> dict:
    """Roda em outro processo: lê, tira o sha256 e classifica."""
    conteudo = Path(caminho).read_bytes()
    sha = hashlib.sha256(conteudo).hexdigest()
    try:
        texto, ocr = ler_texto(conteudo)
        return {"sha": sha, "tipos": tipos_do_texto(texto, Path(caminho).name), "ocr": ocr}
    except Exception as e:  # noqa: BLE001 — PDF corrompido/protegido: classifica só pelo nome
        return {"sha": sha, "tipos": tipos_do_texto("", Path(caminho).name), "ocr": False, "erro": str(e)[:200]}


def ler_cache() -> dict:
    try:
        c = json.loads(CACHE.read_text(encoding="utf-8"))
        if c.get("versao") == VERSAO_REGRAS:
            return {"versao": VERSAO_REGRAS, "arquivos": c.get("arquivos", {}), "conteudos": c.get("conteudos", {})}
    except (OSError, ValueError):
        pass
    return {"versao": VERSAO_REGRAS, "arquivos": {}, "conteudos": {}}


def gravar_cache(cache: dict) -> None:
    tmp = CACHE.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, CACHE)


def chave_arquivo(caminho: Path, mtime: float, tamanho: int) -> str:
    return f"{caminho}|{int(mtime)}|{tamanho}"


def tipos_do_cache(cache: dict, caminho: Path, mtime: float, tamanho: int) -> list[str] | None:
    sha = cache["arquivos"].get(chave_arquivo(caminho, mtime, tamanho))
    return cache["conteudos"].get(sha) if sha else None


def classificar_pendentes(arquivos: list[tuple[Path, float, int]], minutos: float = 13,
                          processos: int | None = None) -> int:
    """Classifica o que não está no cache, até o tempo acabar. Devolve quantos fez."""
    cache = ler_cache()
    pendentes = [a for a in arquivos if chave_arquivo(*a) not in cache["arquivos"]]
    if not pendentes:
        return 0
    fim = time.monotonic() + minutos * 60
    feitos = 0
    processos = processos or max(2, (os.cpu_count() or 4) // 2)  # deixa metade da máquina livre
    fila = iter(pendentes)
    with ProcessPoolExecutor(max_workers=processos) as ex:
        rodando = {}
        for a in fila:
            rodando[ex.submit(classificar_arquivo, str(a[0]))] = a
            if len(rodando) >= processos * 2:
                break
        while rodando:
            pronto = next(as_completed(rodando))
            a = rodando.pop(pronto)
            try:
                r = pronto.result()
                cache["arquivos"][chave_arquivo(*a)] = r["sha"]
                cache["conteudos"][r["sha"]] = r["tipos"]
                feitos += 1
            except Exception as e:  # noqa: BLE001 — J: caiu no meio, arquivo sumiu…
                print(f"falhou {a[0].name}: {e}", flush=True)
            if feitos and feitos % 50 == 0:
                gravar_cache(cache)
            if time.monotonic() < fim:
                prox = next(fila, None)
                if prox:
                    rodando[ex.submit(classificar_arquivo, str(prox[0]))] = prox
    gravar_cache(cache)
    return feitos


if __name__ == "__main__":
    if "--teste" in sys.argv:
        pasta = Path(sys.argv[sys.argv.index("--teste") + 1])
        t = time.time()
        for f in sorted(pasta.glob("*.pdf")):
            r = classificar_arquivo(str(f))
            print(f"{'OCR' if r['ocr'] else 'txt'} {', '.join(r['tipos']):60} {f.name[:70]}")
        print(f"{time.time() - t:.0f} s")
        sys.exit(0)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from sincronizar_certificados import todos_os_pdfs  # noqa: E402

    import msvcrt

    # Uma execução por vez (a tarefa de 15 min não pode atropelar uma passada longa):
    # as duas gravariam o mesmo cache.
    trava = open(RAIZ / "classificar_certificados.lock", "w")
    try:
        msvcrt.locking(trava.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        print(f"{time.strftime('%d/%m %H:%M:%S')} outra classificação em andamento — saindo", flush=True)
        sys.exit(0)
    minutos = float(sys.argv[sys.argv.index("--minutos") + 1]) if "--minutos" in sys.argv else 13
    feitos = classificar_pendentes(todos_os_pdfs(), minutos=minutos)
    print(f"{time.strftime('%d/%m %H:%M:%S')} {feitos} PDF(s) classificados", flush=True)
