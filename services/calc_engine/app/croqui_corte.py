"""Croqui de corte — "filha" do Material de compra (ver
supabase/migrations/0021_croqui_corte.sql), como o Follow up é filha da
Controle de obras (app/follow_up_mae.py).

Pedido explícito do usuário:
- importar os dados já registrados na aba "Croqui 2" de
  "J:\\3 - Projetos\\GR_PROJETO\\Corte\\Croqui de corte rev 01.1.xlsb";
- colunas fixas (PROCV pelo Pedido = PO+IT+POS da MACLM, não editáveis):
  Mac, Descrição, Desenho, MP, L, Pos, QT, QT_1, QTT, UN;
- editáveis: Status, Projetista, Nº do programa, Observação. Status
  "Fazendo" grava data e hora em Dt.Fazendo; "Feito" grava em Dt.Feito.

Análise da planilha real (30/09/2026) que definiu as regras:
- 11.485 linhas; 11.335 pedidos existem na MACLM, 148 são lançamentos
  manuais (ex.: "MAC080.25.24") — ficam como estão, sem mãe.
- Dos 3.195 itens ST = A da MACLM, só os 27 mais novos não estavam na
  Croqui 2 → a regra de entrada é a mesma do Follow up: ST = A.
- Todas as fixas batem com a MACLM (Mac = MAC1), menos Desenho em 154
  linhas: quando o DESENHO da mãe está vazio a planilha usa o DesenhoCJ
  (86) ou guarda um valor antigo (68) — por isso desenho = DESENHO, senão
  DesenhoCJ, senão o que já estava.
- PROCV de célula vazia devolve 0 na planilha: 0 em campo de texto = vazio.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.orcamentos_salvos import _conectar

ABA = "Croqui 2"
FUSO = ZoneInfo("America/Sao_Paulo")

FIXOS_TEXTO = ["mac", "descricao", "desenho", "mp", "l", "pos", "un"]
FIXOS_NUMERO = ["qt", "qt_1", "qtt"]
FIXOS = ["mac", "descricao", "desenho", "mp", "l", "pos", "qt", "qt_1", "qtt", "un"]
EDITAVEIS = ["status", "projetista", "n_programa", "observacao"]

# Colunas da Croqui 2 (0-based): A Pedido ... Q UN
_COLUNAS_PLANILHA = {
    "pedido": 0, "mac": 1, "descricao": 2, "desenho": 3, "mp": 4, "l": 5, "pos": 6, "status": 7,
    "projetista": 8, "n_programa": 9, "observacao": 10, "dt_fazendo": 11, "dt_feito": 12,
    "qt": 13, "qt_1": 14, "qtt": 15, "un": 16,
}

# Grafias da planilha → uma só (as cores/regras da planilha já tratam assim).
# "Terceirizado" — pedido do usuário (30/09); "Corte Manual" — pedido do usuário (01/10).
STATUS = ["Fazendo", "Feito", "Sem Corte", "Estoque", "Terceirizado", "Corte Manual", "Aguardando revisão"]
_PROJETISTAS = {"joao": "João", "honorio": "Honório"}
# Validação de dados (pedido do usuário, como no Excel): só esses projetistas.
PROJETISTAS = ["João", "Honório"]


def _chave(texto) -> str:
    s = unicodedata.normalize("NFKD", str(texto or "")).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s).strip().casefold()


_STATUS_POR_CHAVE = {_chave(s): s for s in STATUS}


def _texto(v) -> str | None:
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        if v == 0:
            return None  # PROCV de célula vazia
        return str(int(v)) if float(v).is_integer() else str(v)
    s = str(v).replace("\x00", "").strip()
    return s or None


def _numero(v) -> float | None:
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    try:
        return float(str(v).replace(",", ".")) if v not in (None, "") else None
    except ValueError:
        return None


def normalizar_status(v) -> str | None:
    s = _texto(v)
    return _STATUS_POR_CHAVE.get(_chave(s), s) if s else None


def normalizar_projetista(v) -> str | None:
    s = _texto(v)
    return _PROJETISTAS.get(_chave(s), s) if s else None


def validar_projetista(v) -> str | None:
    """Pra gravação no app: só João ou Honório (ou vazio)."""
    p = normalizar_projetista(v)
    if p is not None and p not in PROJETISTAS:
        raise ValueError(f"Projetista inválido: '{p}'. Use {' ou '.join(PROJETISTAS)}.")
    return p


def _serial_para_datahora(v) -> datetime | None:
    if not isinstance(v, (int, float)) or v <= 0:
        return None
    local = datetime(1899, 12, 30) + timedelta(days=float(v))
    return local.replace(microsecond=0, tzinfo=FUSO)


# --- importação da planilha (uma vez) -----------------------------------------

def ler_planilha(conteudo: bytes) -> list[dict]:
    from app.xlsb_leitor import LeitorXlsb

    leitor = LeitorXlsb(conteudo)
    nome = next((a for a in leitor.abas if a.strip().casefold() == ABA.casefold()), None)
    if not nome:
        raise ValueError(f"Aba '{ABA}' não encontrada. Abas: {', '.join(leitor.abas)}")
    aba = leitor.ler_aba(nome)
    cab = [_chave(aba.celulas[(0, c)].valor) if (0, c) in aba.celulas else "" for c in range(17)]
    if cab[0] != "pedido" or cab[7] != "status":
        raise ValueError(f"Cabeçalho da aba {ABA} mudou (esperava Pedido em A e Status em H): {cab}")
    ultima = max((l for l, _ in aba.celulas), default=0)
    itens = []
    for linha in range(1, ultima + 1):
        def v(campo):
            cel = aba.celulas.get((linha, _COLUNAS_PLANILHA[campo]))
            return None if cel is None or cel.erro else cel.valor
        pedido = _texto(v("pedido"))
        if not pedido:
            continue
        item = {"pedido": pedido, "linha_planilha": linha + 1}
        for c in FIXOS_TEXTO:
            item[c] = _texto(v(c))
        for c in FIXOS_NUMERO:
            item[c] = _numero(v(c))
        item["status"] = normalizar_status(v("status"))
        item["projetista"] = normalizar_projetista(v("projetista"))
        item["n_programa"] = _texto(v("n_programa"))
        item["observacao"] = _texto(v("observacao"))
        item["dt_fazendo"] = _serial_para_datahora(v("dt_fazendo"))
        item["dt_feito"] = _serial_para_datahora(v("dt_feito"))
        itens.append(item)
    return itens


_COLUNAS_ITEM = ["pedido", *FIXOS, *EDITAVEIS, "dt_fazendo", "dt_feito", "linha_planilha"]


def importar(conteudo: bytes, forcar: bool = False) -> dict:
    itens = ler_planilha(conteudo)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select pg_advisory_xact_lock(hashtext('croqui_corte'))")
        cur.execute("select count(*) from croqui_corte_itens")
        if cur.fetchone()[0] and not forcar:
            raise ValueError("A Croqui de corte já foi importada — use --forcar para apagar e importar de novo.")
        cur.execute("delete from croqui_corte_itens")
        with cur.copy(f"copy croqui_corte_itens ({', '.join(_COLUNAS_ITEM)}, origem) from stdin") as copia:
            for i in itens:
                copia.write_row([i[c] for c in _COLUNAS_ITEM] + ["importacao_croqui"])
        conn.commit()
    return {"importados": len(itens)}


# --- propagação mãe (Material de compra) → filha ------------------------------

def _mae(cur) -> tuple[dict[str, list], dict[str, int], list[str]] | None:
    cur.execute("select colunas from material_compra_status where id = 1")
    st = cur.fetchone()
    if not st:
        return None
    ix = {c["campo"]: i for i, c in enumerate(st[0])}
    cur.execute("select valores from material_compra_linhas order by linha_planilha")
    mae: dict[str, list] = {}
    ordem: list[str] = []
    for (valores,) in cur.fetchall():
        chave = _texto(valores[ix["po_it_pos"]])
        if chave and chave.upper() not in mae:
            mae[chave.upper()] = valores
            ordem.append(chave.upper())
    return mae, ix, ordem


def _fixos_da_mae(valores: list, ix: dict[str, int], desenho_atual: str | None) -> dict:
    m = lambda c: valores[ix[c]]  # noqa: E731
    return {
        "mac": _texto(m("mac1")), "descricao": _texto(m("descricao")),
        "desenho": _texto(m("desenho")) or _texto(m("desenho_cj")) or desenho_atual,
        "mp": _texto(m("mp")), "l": _texto(m("l")), "pos": _texto(m("pos")),
        "qt": _numero(m("qt")), "qt_1": _numero(m("qt_1")), "qtt": _numero(m("qtt")), "un": _texto(m("un")),
    }


def _igual(a, b) -> bool:
    if isinstance(a, (int, float)) or hasattr(a, "is_finite") or isinstance(b, (int, float)):
        try:
            return (a is None and b is None) or (a is not None and b is not None and abs(float(a) - float(b)) < 1e-9)
        except (TypeError, ValueError):
            return False
    return a == b


def propagar() -> dict:
    """Leva as fixas da mãe pros itens e cria os pedidos ST = A novos (no fim)."""
    agora = datetime.now(timezone.utc)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select pg_advisory_xact_lock(hashtext('croqui_corte'))")
        cur.execute("select count(*) from croqui_corte_itens")
        if not cur.fetchone()[0]:
            return {"atualizados": 0, "novos": 0, "motivo": "Croqui de corte ainda não importada"}
        dados = _mae(cur)
        if not dados:
            return {"atualizados": 0, "novos": 0, "motivo": "Material de compra ainda não sincronizado"}
        mae, ix, ordem = dados

        cur.execute(f"select id, pedido, {', '.join(FIXOS)} from croqui_corte_itens")
        existentes = cur.fetchall()
        pedidos = {str(r[1]).upper() for r in existentes}
        atualizacoes = []
        for row in existentes:
            valores = mae.get(str(row[1]).upper())
            if not valores:
                continue
            atuais = dict(zip(FIXOS, row[2:]))
            novos = _fixos_da_mae(valores, ix, atuais["desenho"])
            if all(_igual(atuais[c], novos[c]) for c in FIXOS):
                continue
            atualizacoes.append([novos[c] for c in FIXOS] + [agora, row[0]])
        if atualizacoes:
            cur.executemany(
                f"update croqui_corte_itens set {', '.join(f'{c} = %s' for c in FIXOS)}, mae_sincronizada_em = %s "
                "where id = %s",
                atualizacoes,
            )

        cur.execute("select coalesce(max(linha_planilha), 1) from croqui_corte_itens")
        proxima = cur.fetchone()[0] + 1
        inseridos = []
        notificacoes = []  # sininho (migration 0022): só pedidos novos ativos
        for chave in ordem:
            valores = mae[chave]
            if chave in pedidos or _texto(valores[ix["st"]]) != "A":
                continue
            novos = _fixos_da_mae(valores, ix, None)
            novo_id = uuid.uuid4()
            pedido = _texto(valores[ix["po_it_pos"]])
            inseridos.append([novo_id, pedido] + [novos[c] for c in FIXOS] + [proxima, agora])
            notificacoes.append((novo_id, pedido, novos["mac"], novos["descricao"]))
            proxima += 1
        if inseridos:
            cur.executemany(
                f"""insert into croqui_corte_itens (id, pedido, {', '.join(FIXOS)}, linha_planilha, mae_sincronizada_em, origem)
                    values (%s, %s, {', '.join(['%s'] * len(FIXOS))}, %s, %s, 'material_compra')""",
                inseridos,
            )
            cur.executemany(
                "insert into croqui_corte_notificacoes (item_id, pedido, mac, descricao) values (%s, %s, %s, %s)",
                notificacoes,
            )
        conn.commit()
    return {"atualizados": len(atualizacoes), "novos": len(inseridos)}


# --- leitura / edição no app --------------------------------------------------

_COLUNAS_LISTA = ["id", "pedido", *FIXOS, *EDITAVEIS, "dt_fazendo", "dt_feito", "linha_planilha", "origem",
                  "editado_em", "editado_por", "created_at"]


def _json(v):
    if isinstance(v, datetime):
        return v.isoformat()
    if hasattr(v, "is_finite"):  # Decimal
        f = float(v)
        return int(f) if f.is_integer() else f
    return v


def _carregar(cur, item_id: str | None = None) -> list[dict]:
    filtro, params = ("where id = %s", (item_id,)) if item_id else ("", ())
    cur.execute(f"select {', '.join(_COLUNAS_LISTA)} from croqui_corte_itens {filtro} order by linha_planilha, pedido",
                params)
    itens = [{c: _json(v) for c, v in zip(_COLUNAS_LISTA, row)} for row in cur.fetchall()]
    for i in itens:
        i["id"] = str(i["id"])
    return itens


def listar() -> dict:
    with _conectar() as conn, conn.cursor() as cur:
        itens = _carregar(cur)
    return {"itens": itens, "status_opcoes": STATUS, "projetista_opcoes": PROJETISTAS}


def listar_notificacoes(limite: int = 200) -> list[dict]:
    """Sininho: pedidos novos ativos que a mãe trouxe (mais recentes primeiro)."""
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            """select id, tipo, item_id, pedido, mac, descricao, criado_em from croqui_corte_notificacoes
               order by criado_em desc, id desc limit %s""",
            (max(1, min(limite, 1000)),),
        )
        return [
            {"id": r[0], "tipo": r[1], "item_id": str(r[2]) if r[2] else None, "pedido": r[3], "mac": r[4],
             "descricao": r[5], "criado_em": r[6].isoformat()}
            for r in cur.fetchall()
        ]


class CampoNaoEditavel(ValueError):
    pass


def _normalizar_alteracoes(alteracoes: dict) -> dict:
    normal = {}
    for campo, valor in alteracoes.items():
        if campo not in EDITAVEIS:
            raise CampoNaoEditavel(f"'{campo}' vem do Material de compra (PROCV) e não é editável.")
        if campo == "status":
            normal[campo] = normalizar_status(valor)
        elif campo == "projetista":
            normal[campo] = validar_projetista(valor)
        else:
            normal[campo] = _texto(valor)
    if not normal:
        raise ValueError("Nada para salvar.")
    return normal


def editar_lote(ids: list[str], alteracoes: dict, editado_por: str | None = None) -> list[dict]:
    """Mesmo valor em várias linhas de uma vez — "puxar" como no Excel (pedido
    do usuário). Status virando Fazendo/Feito grava a data e hora só nas
    linhas em que o status mudou."""
    normal = _normalizar_alteracoes(alteracoes)
    ids = [str(i) for i in ids][:5000]
    if not ids:
        return []
    sets, valores = [], []
    for campo, valor in normal.items():
        sets.append(f"{campo} = %s")
        valores.append(valor)
    novo_status = normal.get("status", "__sem")
    if novo_status in ("Fazendo", "Feito"):
        coluna = "dt_fazendo" if novo_status == "Fazendo" else "dt_feito"
        sets.append(f"{coluna} = case when status is distinct from %s then now() else {coluna} end")
        valores.append(novo_status)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(
            f"update croqui_corte_itens set {', '.join(sets)}, editado_em = now(), editado_por = %s "
            "where id = any(%s::uuid[])",
            (*valores, editado_por, ids),
        )
        conn.commit()
        cur.execute(f"select {', '.join(_COLUNAS_LISTA)} from croqui_corte_itens where id = any(%s::uuid[])", (ids,))
        itens = [{c: _json(v) for c, v in zip(_COLUNAS_LISTA, row)} for row in cur.fetchall()]
    for i in itens:
        i["id"] = str(i["id"])
    return itens


def editar(item_id: str, alteracoes: dict, editado_por: str | None = None) -> dict | None:
    """Salva os campos editáveis. Status virando Fazendo/Feito grava a data e hora."""
    sets, valores = [], []
    for campo, valor in alteracoes.items():
        if campo not in EDITAVEIS:
            raise CampoNaoEditavel(f"'{campo}' vem do Material de compra (PROCV) e não é editável.")
        if campo == "status":
            valor = normalizar_status(valor)
        elif campo == "projetista":
            valor = validar_projetista(valor)
        else:
            valor = _texto(valor)
        sets.append(f"{campo} = %s")
        valores.append(valor)
    if not sets:
        raise ValueError("Nada para salvar.")
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select status from croqui_corte_itens where id = %s for update", (item_id,))
        atual = cur.fetchone()
        if not atual:
            return None
        if "status" in alteracoes:
            novo = normalizar_status(alteracoes["status"])
            if novo != atual[0] and novo in ("Fazendo", "Feito"):
                sets.append(f"{'dt_fazendo' if novo == 'Fazendo' else 'dt_feito'} = now()")
        cur.execute(
            f"update croqui_corte_itens set {', '.join(sets)}, editado_em = now(), editado_por = %s where id = %s",
            (*valores, editado_por, item_id),
        )
        conn.commit()
        itens = _carregar(cur, item_id)
    return itens[0] if itens else None
