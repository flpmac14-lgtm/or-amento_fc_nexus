"""Pintura — entradas/saídas de tinta pelo app e "vai ter tinta?" (pedido do
usuário, 17/11/2026; migration 0075).

- Estoque do app = linhas da aba Estoque da planilha original (espelho de 15 min,
  app/pintura_estoque.py) + entradas lançadas no app (cada uma vira uma linha
  nova, com IT sequencial) − saídas (por componente A/B, em latas).
  A planilha original NUNCA é gravada; o script de 15 min gera uma planilha nova
  e organizada (app/pintura_planilha.py).
- "Vai ter tinta?": cruza os pedidos ativos da Controle de obras/Follow up
  (Cor 1, Cor 2, Plano de pintura) com o estoque. O plano é texto livre, então a
  IA lê cada texto de plano UMA vez (cache em pintura_planos_ia) e o cruzamento é
  conta local. Sem chave de IA, cruza só pela cor.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.orcamentos_salvos import _conectar

_BRASILIA = timezone(timedelta(hours=-3))
TEXTO_MAX = 300
LOTE_IA = 8  # planos por chamada à IA (lote grande volta 503 com frequência)
UNIDADES = ("GL", "LA", "BD", "QT", "L", "KG")


# ---------------------------------------------------------------- normalização

def _sem_acento(s) -> str:
    return unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()


def norm_produto(s) -> str:
    t = _sem_acento(s)
    t = re.sub(r"\bn\s*-?\s*(\d{4})\b", r"n\1", t)  # norma Petrobras: "N-2680" = "N2680"
    t = re.sub(r"(\d)([a-z])", r"\1 \2", t)  # "670HS" = "670 HS"
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


_GENERICAS = {"epoxi", "epoxy", "pu", "primer", "tinta", "acabamento", "fundo", "de", "da", "do", "com", "e", "a",
              "base", "bicomponente", "alto", "solidos", "hs", "cor", "parte", "interna", "externa", "interno",
              "externo", "um", "demao", "demaos", "total"}


def _tokens_distintos(s: str) -> set[str]:
    return {t for t in norm_produto(s).split() if t not in _GENERICAS and (len(t) >= 3 or any(c.isdigit() for c in t))}


# Cor por extenso (como a IA às vezes devolve) -> sigla usada na planilha.
_SIGLAS_COR = {"preto": "pt", "preta": "pt", "cinza": "cz", "amarelo": "am", "amarela": "am", "azul": "az",
               "branco": "br", "branca": "br", "vermelho": "vm", "vermelha": "vm", "laranja": "lr", "verde": "vd",
               "aluminio": "al", "marrom": "mr"}


def norm_cor(s) -> str:
    t = _sem_acento(s)
    t = re.sub(r"(\d)[,.]0\b", r"\1", t)  # "N1,0" = "N1"
    t = re.sub(r"(\d)([a-z])", r"\1 \2", t)  # "5Y" = "5 Y"
    t = re.sub(r"[^a-z0-9]+", " ", t).split()
    t = [_SIGLAS_COR.get(x, x) for x in t if x not in ("m", "munsell")]  # "AM-M. 5 Y 8/12" = "AM 5 Y 8/12"
    return " ".join(t)


def _codigo_cor(n: str) -> str:
    """Parte com número da cor (sem a sigla AM/CZ/AZ...): 'cz ral 7035' -> 'ral 7035'."""
    t = n.split()
    if t and t[0].isalpha() and len(t[0]) <= 3 and len(t) > 1:
        t = t[1:]
    return " ".join(t) if any(c.isdigit() for c in " ".join(t)) else ""


def cor_significativa(c) -> bool:
    """Tem cara de cor: sigla conhecida (CZ, AM, RAL...) ou código com número."""
    n = norm_cor(c)
    return bool(n) and (any(ch.isdigit() for ch in n) or n.split()[0] in set(_SIGLAS_COR.values()) | {"ral"})


def cor_bate(a, b) -> bool:
    na, nb = norm_cor(a), norm_cor(b)
    if not na or not nb:
        return False
    if na == nb:
        return True
    ca, cb = _codigo_cor(na), _codigo_cor(nb)
    return bool(ca) and ca == cb


def produto_bate(pedido, estoque_produto, estoque_petrobras=None) -> bool:
    """Todas as palavras "distintivas" do produto pedido estão no produto do estoque."""
    p = _tokens_distintos(pedido)
    if not p:
        return False
    alvo = _tokens_distintos(estoque_produto) | _tokens_distintos(estoque_petrobras or "")
    return p <= alvo


def _num(v) -> float:
    if isinstance(v, (int, float, Decimal)):
        return float(v)
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return 0.0


def _iso(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


# ---------------------------------------------------------------- estoque

def _base_planilha(cur) -> tuple[list[dict], dict[str, dict]]:
    """Linhas da aba Estoque (espelho) como dicionários por campo + catálogo por produto."""
    cur.execute("select colunas from pintura_status where id = 1")
    st = cur.fetchone()
    if not st:
        return [], {}
    colunas = st[0]
    cur.execute("select aba, linha_planilha, valores from pintura_linhas order by aba, linha_planilha")
    base, catalogo = [], {}
    for aba, n, valores in cur.fetchall():
        campos = [c["campo"] for c in colunas.get(aba, [])]
        v = dict(zip(campos, valores))
        if aba == "estoque":
            base.append({"linha": n, **v})
        elif aba == "tinta" and v.get("produto_cpa"):
            catalogo.setdefault(norm_produto(v["produto_cpa"]), v)
    return base, catalogo


def _movimentos(cur) -> list[dict]:
    cur.execute(
        """select id, seq, tipo, item, it, fabricante, produto, cor, un_a, qt_a, lote_a, venc_a, un_b, qt_b,
                  lote_b, venc_b, local, mac, obs, por, em
           from pintura_movimentos where excluido_em is null order by seq"""
    )
    nomes = [d.name for d in cur.description]
    movs = [dict(zip(nomes, r)) for r in cur.fetchall()]
    cur.execute(
        """select f.id, f.movimento_id, f.midia_sha256, f.por, f.em from pintura_fotos f
           join pintura_movimentos m on m.id = f.movimento_id where m.excluido_em is null order by f.em"""
    )
    fotos: dict = {}
    for fid, mid, sha, por, em in cur.fetchall():
        fotos.setdefault(mid, []).append({"id": str(fid), "sha256": sha, "por": por, "em": em.isoformat()})
    for m in movs:
        m["fotos"] = fotos.get(m["id"], [])
    return movs


def _chave_base(linha: dict) -> str:
    it = linha.get("it")
    return f"P:{it}" if it not in (None, "") else f"P:L{linha['linha']}"


def _montar_estoque(base: list[dict], catalogo: dict, movs: list[dict]) -> list[dict]:
    itens: dict[str, dict] = {}
    for b in base:
        chave = _chave_base(b)
        itens[chave] = {
            "chave": chave, "origem": "planilha", "linha": b["linha"], "it": b.get("it"),
            "fabricante": b.get("fabr"), "produto": b.get("produto_a"), "cor": b.get("cor_a"),
            "un_a": b.get("un_a"), "qt_inicial_a": _num(b.get("qt_a")), "lote_a": b.get("lote"), "venc_a": b.get("venc_a"),
            "produto_b": b.get("produto_b"), "un_b": b.get("un_b"), "qt_inicial_b": _num(b.get("qt_b")),
            "lote_b": b.get("lote_b"), "venc_b": b.get("venc_b"), "local": b.get("local"), "tipo": b.get("tipo"),
            "diluente": b.get("diluente"), "petrobras": b.get("petrobras"), "mac": b.get("mac"),
            "saida_a": 0.0, "saida_b": 0.0, "entrada_em": None, "entrada_por": None,
        }
    for m in movs:
        if m["tipo"] == "entrada":
            chave = f"N:{m['id']}"
            cat = catalogo.get(norm_produto(m["produto"])) or {}
            itens[chave] = {
                "chave": chave, "origem": "app", "linha": None, "it": m["it"], "fabricante": m["fabricante"] or cat.get("fabricante"),
                "produto": m["produto"], "cor": m["cor"], "un_a": m["un_a"], "qt_inicial_a": _num(m["qt_a"]),
                "lote_a": m["lote_a"], "venc_a": _iso(m["venc_a"]), "produto_b": cat.get("produto_cpb"), "un_b": m["un_b"],
                "qt_inicial_b": _num(m["qt_b"]), "lote_b": m["lote_b"], "venc_b": _iso(m["venc_b"]), "local": m["local"],
                "tipo": cat.get("tipo"), "diluente": cat.get("diluente"), "petrobras": cat.get("petrobras"), "mac": m["mac"],
                "saida_a": 0.0, "saida_b": 0.0, "entrada_em": m["em"].isoformat(), "entrada_por": m["por"],
                "movimento_id": str(m["id"]), "seq": m["seq"], "fotos": m["fotos"], "obs": m["obs"],
            }
    for m in movs:
        if m["tipo"] == "saida" and m["item"] in itens:
            itens[m["item"]]["saida_a"] += _num(m["qt_a"])
            itens[m["item"]]["saida_b"] += _num(m["qt_b"])
    lista = list(itens.values())
    for i in lista:
        i["qt_a"] = round(i["qt_inicial_a"] - i["saida_a"], 3)
        i["qt_b"] = round(i["qt_inicial_b"] - i["saida_b"], 3)
    return lista


def estoque_atual() -> dict:
    with _conectar() as conn, conn.cursor() as cur:
        base, catalogo = _base_planilha(cur)
        movs = _movimentos(cur)
    return {"estoque": _montar_estoque(base, catalogo, movs), "movimentos": [_mov_json(m) for m in reversed(movs)]}


def _mov_json(m: dict) -> dict:
    return {k: (str(v) if k == "id" else _num(v) if k in ("qt_a", "qt_b") else _iso(v)) for k, v in m.items()}


# ---------------------------------------------------------------- lançamentos

def _texto(v, nome: str, obrigatorio: bool = False) -> str | None:
    t = re.sub(r"\s+", " ", str(v or "")).strip() or None
    if obrigatorio and not t:
        raise ValueError(f"Informe {nome}.")
    if t and len(t) > TEXTO_MAX:
        raise ValueError(f"{nome.capitalize()} muito longo (máximo {TEXTO_MAX} caracteres).")
    return t


def _qt(v, nome: str) -> float:
    if v in (None, ""):
        return 0.0
    q = _num(v)
    if q < 0 or q > 10000:
        raise ValueError(f"Quantidade {nome} inválida.")
    return round(q, 3)


def _data(v, nome: str) -> date | None:
    if not v:
        return None
    s = str(v)
    if re.fullmatch(r"\d{4}-\d{2}", s):  # vencimento só mês/ano (input month) = dia 01
        s += "-01"
    try:
        return date.fromisoformat(s[:10])
    except ValueError:
        raise ValueError(f"Data de {nome} inválida.")


def registrar(dados: dict) -> dict:
    tipo = dados.get("tipo")
    por = _texto(dados.get("por"), "quem lançou")
    if tipo == "entrada":
        produto = _texto(dados.get("produto"), "o produto", obrigatorio=True)
        qa, qb = _qt(dados.get("qt_a"), "A"), _qt(dados.get("qt_b"), "B")
        if qa <= 0 and qb <= 0:
            raise ValueError("Informe a quantidade que chegou.")
        un_a = (_texto(dados.get("un_a"), "a unidade") or "GL").upper()
        un_b = (_texto(dados.get("un_b"), "a unidade") or un_a).upper()
        with _conectar() as conn, conn.cursor() as cur:
            cur.execute("select pg_advisory_xact_lock(hashtext('pintura_it'))")
            # IT continua a numeração: maior IT da planilha ou do app + 1.
            cur.execute(
                """select greatest(
                     coalesce((select max((valores->>0)::numeric) from pintura_linhas
                               where aba = 'estoque' and (valores->>0) ~ '^[0-9]+(\\.0+)?$'), 0),
                     coalesce((select max(it::numeric) from pintura_movimentos
                               where tipo = 'entrada' and it ~ '^[0-9]+$'), 0))"""
            )
            it = str(int(cur.fetchone()[0] or 0) + 1)
            cur.execute(
                """insert into pintura_movimentos
                     (tipo, item, it, fabricante, produto, cor, un_a, qt_a, lote_a, venc_a, un_b, qt_b, lote_b, venc_b,
                      local, mac, obs, por)
                   values ('entrada', 'N:pendente', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   returning id""",
                (it, _texto(dados.get("fabricante"), "o fabricante"), produto, _texto(dados.get("cor"), "a cor"),
                 un_a, qa, _texto(dados.get("lote_a"), "o lote A"), _data(dados.get("venc_a"), "vencimento A"),
                 un_b, qb, _texto(dados.get("lote_b"), "o lote B"), _data(dados.get("venc_b"), "vencimento B"),
                 _texto(dados.get("local"), "o local"), _texto(dados.get("mac"), "a MAC"), _texto(dados.get("obs"), "a observação"), por),
            )
            mid = cur.fetchone()[0]
            cur.execute("update pintura_movimentos set item = %s where id = %s", (f"N:{mid}", mid))
            # Scanner do quadradinho: guarda o código de cada lata e aprende "código -> produto".
            fab, cor = _texto(dados.get("fabricante"), "o fabricante"), _texto(dados.get("cor"), "a cor")
            for comp, un in (("a", un_a), ("b", un_b)):
                cod = _texto(dados.get(f"codigo_{comp}"), "o código")
                if not cod:
                    continue
                cur.execute(f"update pintura_movimentos set codigo_{comp} = %s where id = %s", (cod, mid))
                cur.execute(
                    """insert into pintura_codigos (codigo, gtin, produto, fabricante, cor, componente, un, por)
                       values (%s, %s, %s, %s, %s, %s, %s, %s)
                       on conflict (codigo) do update set gtin = coalesce(excluded.gtin, pintura_codigos.gtin),
                         produto = excluded.produto, fabricante = excluded.fabricante, cor = excluded.cor,
                         componente = excluded.componente, un = excluded.un, por = excluded.por, atualizado_em = now()""",
                    (cod, _texto(dados.get(f"gtin_{comp}"), "o GTIN"), produto, fab, cor, comp.upper(), un, por),
                )
            conn.commit()
        return {"id": str(mid), "it": it}
    if tipo == "saida":
        item = _texto(dados.get("item"), "a tinta", obrigatorio=True)
        qa, qb = _qt(dados.get("qt_a"), "A"), _qt(dados.get("qt_b"), "B")
        if qa <= 0 and qb <= 0:
            raise ValueError("Informe quanto saiu.")
        atual = next((i for i in estoque_atual()["estoque"] if i["chave"] == item), None)
        if not atual:
            raise ValueError("Tinta não encontrada no estoque (a planilha pode ter mudado). Atualize a tela.")
        with _conectar() as conn, conn.cursor() as cur:
            cur.execute(
                """insert into pintura_movimentos (tipo, item, it, fabricante, produto, cor, un_a, qt_a, lote_a,
                     un_b, qt_b, lote_b, local, mac, obs, por)
                   values ('saida', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) returning id""",
                (item, str(atual["it"]) if atual["it"] is not None else None, atual["fabricante"], atual["produto"],
                 atual["cor"], atual["un_a"], qa, atual["lote_a"], atual["un_b"], qb, atual["lote_b"], atual["local"],
                 _texto(dados.get("mac"), "a MAC"), _texto(dados.get("obs"), "a observação"), por),
            )
            mid = cur.fetchone()[0]
            conn.commit()
        return {"id": str(mid), "saldo_a": round(atual["qt_a"] - qa, 3), "saldo_b": round(atual["qt_b"] - qb, 3)}
    raise ValueError("Tipo de lançamento inválido.")


def buscar_codigos(codigos: list[str]) -> dict:
    """O que o app já aprendeu de cada código lido no quadradinho (código WEG ou GTIN)."""
    codigos = [c for c in codigos if c][:10]
    if not codigos:
        return {}
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select codigo, gtin, produto, fabricante, cor, componente, un from pintura_codigos
               where codigo = any(%s) or gtin = any(%s)""",
            (codigos, codigos),
        )
        nomes = [d.name for d in cur.description]
        linhas = [dict(zip(nomes, r)) for r in cur.fetchall()]
    saida = {}
    for c in codigos:
        achado = next((l for l in linhas if l["codigo"] == c), None) or next((l for l in linhas if l["gtin"] == c), None)
        if achado:
            saida[c] = achado
    return saida


def excluir(movimento_id: str, por: str | None) -> bool:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """update pintura_movimentos set excluido_em = now(), excluido_por = %s
               where id = %s and excluido_em is null returning tipo, item""",
            (por, movimento_id),
        )
        r = cur.fetchone()
        if r and r[0] == "entrada":  # saídas daquela entrada perdem o sentido
            cur.execute(
                """update pintura_movimentos set excluido_em = now(), excluido_por = %s
                   where tipo = 'saida' and item = %s and excluido_em is null""",
                (por, r[1]),
            )
        conn.commit()
    return bool(r)


def adicionar_foto(movimento_id: str, conteudo: bytes, por: str | None) -> dict | None:
    from app.follow_up_mae import preparar_imagem

    dados, content_type, largura, altura = preparar_imagem(conteudo)
    sha = hashlib.sha256(dados).hexdigest()
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select 1 from pintura_movimentos where id = %s and excluido_em is null", (movimento_id,))
        if not cur.fetchone():
            return None
        cur.execute(
            """insert into follow_up_midias (sha256, content_type, conteudo, largura, altura, tamanho)
               values (%s, %s, %s, %s, %s, %s) on conflict (sha256) do nothing""",
            (sha, content_type, dados, largura, altura, len(dados)),
        )
        cur.execute(
            "insert into pintura_fotos (movimento_id, midia_sha256, por) values (%s, %s, %s) returning id, em",
            (movimento_id, sha, por),
        )
        fid, em = cur.fetchone()
        conn.commit()
    return {"id": str(fid), "sha256": sha, "por": por, "em": em.isoformat()}


def remover_foto(foto_id: str) -> bool:
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("delete from pintura_fotos where id = %s returning midia_sha256", (foto_id,))
        r = cur.fetchone()
        if r:
            cur.execute(
                """delete from follow_up_midias m where sha256 = %s
                   and not exists (select 1 from follow_up_imagens i where i.midia_sha256 = m.sha256)
                   and not exists (select 1 from fotos_setor f where f.midia_sha256 = m.sha256)
                   and not exists (select 1 from follow_up_imagens_removidas r where r.midia_sha256 = m.sha256)
                   and not exists (select 1 from pintura_fotos p where p.midia_sha256 = m.sha256)""",
                (r[0],),
            )
        conn.commit()
    return bool(r)


# ---------------------------------------------------------------- IA dos planos

def _sem_pintura_obvio(plano: str) -> bool:
    n = norm_cor(plano)
    return n in ("", "sp", "s p", "sem pintura", "nao pintar", "na")


def hash_plano(plano: str) -> str:
    return hashlib.sha256(re.sub(r"\s+", " ", str(plano or "")).strip().casefold().encode()).hexdigest()


_PROMPT = (
    "Você recebe planos de pintura industrial (texto livre de pedidos de caldeiraria). Para CADA plano, liste as "
    "tintas que ele pede, na ordem das demãos: produto comercial (ex.: 'WEGPOXI ERD 322', 'INTERSEAL 670 HS', "
    "'Epoxi N2680' quando só houver a norma Petrobras), cor no padrão curto (ex.: 'CZ-M. N6,5', 'AM-M. 5 Y 8/12', "
    "'CZ-RAL 7035'; null se não houver) e micras por demão (número; null se não houver). Se for interno/externo, "
    "liste as duas. sem_pintura=true quando não é pintura (só VCI, papel, 'SP', óleo protetivo etc.). "
    "Não invente produto: se o plano só tem norma/procedimento sem tinta, devolva tintas vazio."
)


def _chamar_ia(planos: list[str]) -> list[dict]:
    """Uma chamada só pra vários planos (saída JSON estruturada). Gemini, via REST."""
    import httpx

    chave = os.environ["GOOGLE_API_KEY"]
    modelo = os.environ.get("PINTURA_IA_MODELO", "gemini-3.5-flash-lite")
    entrada = "\n".join(f"{i}: {p}" for i, p in enumerate(planos))
    corpo = {
        "systemInstruction": {"parts": [{"text": _PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": entrada}]}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "OBJECT",
                "properties": {"planos": {"type": "ARRAY", "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "INTEGER"},
                        "sem_pintura": {"type": "BOOLEAN"},
                        "tintas": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
                            "produto": {"type": "STRING"},
                            "cor": {"type": "STRING", "nullable": True},
                            "micras": {"type": "NUMBER", "nullable": True},
                        }, "required": ["produto"]}},
                    },
                    "required": ["id", "sem_pintura", "tintas"],
                }}},
                "required": ["planos"],
            },
        },
    }
    import time

    # 503/429 = Gemini sobrecarregado (passageiro): tenta de novo algumas vezes;
    # se não der, o próximo ciclo de 15 min tenta outra vez (nada fica no cache).
    for tentativa in range(4):
        r = httpx.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent",
            headers={"x-goog-api-key": chave}, json=corpo, timeout=120,
        )
        if r.status_code not in (429, 500, 503) or tentativa == 3:
            break
        time.sleep(10 * (tentativa + 1))
    r.raise_for_status()
    texto = r.json()["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(texto)["planos"]


def planos_ativos(cur) -> list[str]:
    cur.execute(
        """select distinct plano_pintura from follow_up_itens
           where st = 'A' and coalesce(pin, 0) < 100 and coalesce(trim(plano_pintura), '') <> ''"""
    )
    return [r[0] for r in cur.fetchall()]


def analisar_planos_novos(maximo: int = 60) -> str | None:
    """Lê com a IA só os planos que ainda não estão no cache. Sem GOOGLE_API_KEY, não faz nada."""
    from psycopg.types.json import Jsonb

    with _conectar() as conn, conn.cursor() as cur:
        planos = planos_ativos(cur)
        cur.execute("select hash from pintura_planos_ia")
        feitos = {r[0] for r in cur.fetchall()}
        novos = {}
        for p in planos:
            h = hash_plano(p)
            if h not in feitos and h not in novos:
                novos[h] = p
        if not novos:
            return None
        obvios = {h: p for h, p in novos.items() if _sem_pintura_obvio(p)}
        for h, p in obvios.items():
            cur.execute("insert into pintura_planos_ia (hash, plano, resultado, modelo) values (%s, %s, %s, 'regra') "
                        "on conflict do nothing", (h, p, Jsonb({"sem_pintura": True, "tintas": []})))
        conn.commit()
        resto = [(h, p) for h, p in novos.items() if h not in obvios][:maximo]
        if not resto or not os.environ.get("GOOGLE_API_KEY"):
            return f"{len(obvios)} plano(s) sem pintura" + (f", {len(resto)} aguardando IA (sem chave)" if resto else "")
        modelo = os.environ.get("PINTURA_IA_MODELO", "gemini-3.5-flash-lite")
        gravados = chamadas = falhas = 0
        # Lotes pequenos: o pedido com ~76 planos de uma vez voltava 503 (17/11/2026).
        # Cada lote é gravado assim que volta; se um falhar, o próximo ciclo continua dali.
        for ini in range(0, len(resto), LOTE_IA):
            lote = resto[ini:ini + LOTE_IA]
            try:
                respostas = {r["id"]: r for r in _chamar_ia([p for _, p in lote])}
            except Exception:  # noqa: BLE001 — Gemini sobrecarregado: segue com os outros lotes
                falhas += 1
                if falhas >= 2:
                    break
                continue
            chamadas += 1
            for i, (h, p) in enumerate(lote):
                r = respostas.get(i)
                if r is None:
                    continue
                res = {"sem_pintura": bool(r.get("sem_pintura")),
                       "tintas": [{"produto": t.get("produto"), "cor": t.get("cor"), "micras": t.get("micras")}
                                  for t in r.get("tintas") or [] if t.get("produto")]}
                cur.execute("insert into pintura_planos_ia (hash, plano, resultado, modelo) values (%s, %s, %s, %s) "
                            "on conflict do nothing", (h, p, Jsonb(res), modelo))
                gravados += 1
            conn.commit()
    return (f"IA leu {gravados} plano(s) novo(s) em {chamadas} chamada(s)" + (f", {len(obvios)} sem pintura" if obvios else "")
            + (f", {falhas} lote(s) com Gemini sobrecarregado (tenta no próximo ciclo)" if falhas else ""))


# ---------------------------------------------------------------- vai ter tinta?

def _cor_valida(c) -> str | None:
    c = str(c or "").strip()
    return None if _sem_pintura_obvio(c) else c


def necessidade() -> dict:
    with _conectar() as conn, conn.cursor() as cur:
        base, catalogo = _base_planilha(cur)
        estoque = _montar_estoque(base, catalogo, _movimentos(cur))
        cur.execute(
            """select po, mac, cliente, descricao, peso_total, prazo_contratual, pin, cor2, cor_2, plano_pintura
               from follow_up_itens where st = 'A' and coalesce(pin, 0) < 100"""
        )
        pedidos = cur.fetchall()
        cur.execute("select hash, resultado from pintura_planos_ia")
        ia = {h: r for h, r in cur.fetchall()}

    grupos: dict[tuple, dict] = {}
    sem_ia = 0
    for po, mac, cliente, descr, peso, prazo, pin, cor1, cor2, plano in pedidos:
        pedido = {"po": po, "mac": mac, "cliente": cliente, "descricao": descr, "peso_total": _num(peso),
                  "prazo": _iso(prazo), "pin": _num(pin)}
        res = ia.get(hash_plano(plano)) if plano and str(plano).strip() else None
        precisa: list[dict] = []
        if res and res.get("sem_pintura"):
            continue
        if res and res.get("tintas"):
            cores = [c for c in (_cor_valida(cor1), _cor_valida(cor2)) if c]
            for t in res["tintas"]:
                precisa.append({"produto": t["produto"], "cor": t.get("cor") or (cores[0] if len(cores) == 1 else None),
                                "micras": t.get("micras")})
        else:
            if plano and str(plano).strip() and not _sem_pintura_obvio(plano):
                sem_ia += 1
            for c in (_cor_valida(cor1), _cor_valida(cor2)):
                if c:
                    precisa.append({"produto": None, "cor": c, "micras": None})
        for n in precisa:
            chave = (norm_produto(n["produto"]) if n["produto"] else "", norm_cor(n["cor"]) if n["cor"] else "")
            g = grupos.setdefault(chave, {"produto": n["produto"], "cor": n["cor"], "micras": set(), "pedidos": [],
                                          "planos": set()})
            if n["micras"]:
                g["micras"].add(n["micras"])
            if plano:
                g["planos"].add(str(plano))
            if not any(p["po"] == po for p in g["pedidos"]):
                g["pedidos"].append(pedido)

    hoje = date.today().isoformat()
    saida = []
    for g in grupos.values():
        achados = []
        for i in estoque:
            if g["produto"]:
                if not produto_bate(g["produto"], i["produto"] or "", i.get("petrobras")):
                    continue
                if cor_significativa(g["cor"]) and i["cor"] and not cor_bate(g["cor"], i["cor"]):
                    continue
            elif not cor_bate(g["cor"], i["cor"]):
                continue
            achados.append(i)
        com_saldo = [i for i in achados if i["qt_a"] > 0 or i["qt_b"] > 0]
        validos = [i for i in com_saldo if not (i.get("venc_a") and str(i["venc_a"])[:10] < hoje)]
        situacao = "tem" if validos else "vencida" if com_saldo else "zerada" if achados else "nao_tem"
        saida.append({
            "produto": g["produto"], "cor": g["cor"], "micras": sorted(g["micras"]),
            "planos": sorted(g["planos"])[:5], "pedidos": sorted(g["pedidos"], key=lambda p: p["prazo"] or "9999"),
            "peso_total": round(sum(p["peso_total"] for p in g["pedidos"]), 1),
            "situacao": situacao,
            "saldo_a": round(sum(i["qt_a"] for i in com_saldo), 2),
            "estoque": [{k: i.get(k) for k in ("chave", "it", "produto", "cor", "lote_a", "venc_a", "qt_a", "qt_b",
                                               "un_a", "local")} for i in achados],
        })
    ordem = {"nao_tem": 0, "zerada": 1, "vencida": 2, "tem": 3}
    saida.sort(key=lambda g: (ordem[g["situacao"]], g["pedidos"][0]["prazo"] or "9999" if g["pedidos"] else "9999"))
    return {"grupos": saida, "pedidos": len(pedidos), "planos_sem_ia": sem_ia, "planos_lidos": len(ia)}
