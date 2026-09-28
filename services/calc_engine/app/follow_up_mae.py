"""Follow up como "filha" do Controle de obras (a "mãe").

Pedido explícito do usuário — reproduz o que a planilha faz com PROCV pelo
PO na aba OBRAS (ver supabase/migrations/0015_follow_up_mae_filha.sql):

- `propagar()`: roda a cada sincronização da Controle de obras (script
  agendado de 15 min). Atualiza nos itens do Follow up os campos que vêm da
  mãe (PROCV = primeira linha da aba OBRAS com aquele PO) e cria os pedidos
  com ST = "A" que ainda não estão no Follow up, no fim da lista. Itens cujo
  PO sumiu da mãe ficam como estão (o PROCV daria #N/D; guardamos o último
  valor conhecido).
- `editar()`: grava na hora um campo de acompanhamento digitado no app
  (etapas, coleta, fornecedor, orçamentos, obs. Felipe/Marcelo, preço
  previsto). Campos da mãe são recusados — não são editáveis.
- `calcular_status()`: a mesma fórmula da coluna Status da aba Gerencia.
"""

from __future__ import annotations

import re
import uuid
from datetime import date, datetime, timezone

from app.follow_up import ETAPAS, carregar_itens
from app.orcamentos_salvos import _conectar

# campo do Follow up → (campo da mãe em controle_obras_status.colunas, tipo)
CAMPOS_MAE: dict[str, tuple[str, str]] = {
    "prazo_contratual": ("pz_c", "data"),
    "cliente": ("cl", "texto"),
    "quantidade": ("qt", "numero"),
    "mac": ("mac", "texto"),
    "desenho": ("desenho", "texto"),
    "descricao": ("descricao", "texto"),
    "obs_alisson": ("obs", "texto"),
    "cor2": ("cor", "texto"),
    "cor_2": ("cor3", "texto"),
    "plano_pintura": ("ppu", "texto"),
    "st": ("st", "texto"),
    "nf": ("nf", "texto"),
    "tipagem": ("tipar", "texto"),
    "peso_unid": ("kg_pc", "numero"),
    "peso_total": ("kg_tot", "numero"),
}

# Campos de acompanhamento — os únicos editáveis no app.
CAMPOS_EDITAVEIS: dict[str, str] = {
    **{e: "etapa" for e in ETAPAS},
    "coleta": "coleta",
    "fornecedor": "texto",
    "orcamento_terceirizado_unid": "numero",
    "orcamento_custo_macfab_unid": "numero",
    "obs_felipe_marcelo": "texto",
    "preco_previsto": "numero",
}

_NOMES_ETAPAS = {"eng": "Engenharia", "cor": "Corte", "mon": "Montagem", "sol": "Solda",
                 "usi": "Usinagem", "dob": "Dobra", "jat": "Jato", "pin": "Pintura"}


class CampoNaoEditavel(ValueError):
    pass


def calcular_status(etapas: dict) -> str:
    """=SE(CONT.SE(I:P;100)=8;"Pronto";"Falta "&<etapas ≠ 100, separadas por ", ">)"""
    faltando = [_NOMES_ETAPAS[e] for e in ETAPAS if _num(etapas.get(e)) != 100]
    return "Pronto" if not faltando else "Falta " + ", ".join(faltando)


def _num(v):
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# --- conversão dos valores da mãe --------------------------------------------

def _valor_mae(v, tipo: str):
    if v is None or v == "":
        return None
    eh_data = isinstance(v, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", v)
    if tipo == "data":
        return date.fromisoformat(v) if eh_data else None
    if tipo == "numero":
        if isinstance(v, bool):
            return None
        if isinstance(v, (int, float)):
            return float(v)
        return _numero_br(str(v))
    # texto / código: nunca como número (não perde zero nem vira "7972.0")
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if eh_data:
        return date.fromisoformat(v).strftime("%d/%m/%Y")
    return str(v)


def _numero_br(s: str):
    s = s.strip().replace("R$", "").replace("%", "").strip()
    if not s:
        return None
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})*(,\d+)?|-?\d+(,\d+)?", s):
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def _igual(a, b) -> bool:
    if a is None or b is None:
        return a is None and b is None
    if isinstance(a, (int, float)) or hasattr(a, "is_finite"):
        try:
            return abs(float(a) - float(b)) < 1e-9
        except (TypeError, ValueError):
            return False
    return str(a) == str(b)


# --- propagação mãe → filha ---------------------------------------------------

def propagar() -> dict:
    agora = datetime.now(timezone.utc)
    with _conectar() as conn, conn.cursor() as cur:
        cur.execute("select pg_advisory_xact_lock(hashtext('follow_up_mae'))")
        cur.execute("select colunas from controle_obras_status where id = 1")
        st = cur.fetchone()
        if not st:
            return {"atualizados": 0, "novos": 0, "motivo": "Controle de obras ainda não sincronizado"}
        indice = {c["campo"]: i for i, c in enumerate(st[0]) if c.get("campo")}
        faltando = [m for m, _ in CAMPOS_MAE.values() if m not in indice] + ([] if "po" in indice else ["po"])
        if faltando:
            raise ValueError(f"Colunas da Controle de obras não encontradas: {', '.join(faltando)}")

        # PROCV exato: primeira linha com o PO (sem diferenciar maiúsculas).
        cur.execute("select linha_planilha, valores from controle_obras_linhas order by linha_planilha")
        mae: dict[str, tuple[int, list]] = {}
        for linha, valores in cur.fetchall():
            po = valores[indice["po"]]
            if po is None or str(po).strip() == "":
                continue
            mae.setdefault(_valor_mae(po, "texto").upper(), (linha, valores))

        campos = list(CAMPOS_MAE)
        cur.execute(f"select id, po, {', '.join(campos)}, ano from follow_up_itens")
        existentes = cur.fetchall()
        pos_existentes = {str(r[1]).upper() for r in existentes}

        atualizacoes = []
        for row in existentes:
            item_id, po, atuais, ano_atual = row[0], row[1], row[2:-1], row[-1]
            achado = mae.get(str(po).upper())
            if not achado:
                continue
            linha, valores = achado
            novos = [_valor_mae(valores[indice[m]], t) for m, t in CAMPOS_MAE.values()]
            prazo = novos[campos.index("prazo_contratual")]
            ano = prazo.year if prazo else ano_atual
            if all(_igual(a, b) for a, b in zip(atuais, novos)) and ano == ano_atual:
                continue
            atualizacoes.append((*novos, ano, linha, agora, item_id))

        if atualizacoes:
            sets = ", ".join(f"{c} = %s" for c in campos)
            cur.executemany(
                f"""update follow_up_itens set {sets}, ano = %s, mae_linha = %s, mae_sincronizada_em = %s,
                    updated_at = now() where id = %s""",
                atualizacoes,
            )

        # Pedidos ativos da mãe que ainda não estão no Follow up → entram no fim.
        cur.execute("select coalesce(max(linha_planilha), 2) from follow_up_itens")
        proxima_linha = cur.fetchone()[0] + 1
        status_vazio = calcular_status({})
        inseridos = []
        for po_upper, (linha, valores) in mae.items():  # dict mantém a ordem da planilha
            if po_upper in pos_existentes or _valor_mae(valores[indice["st"]], "texto") != "A":
                continue
            novos = [_valor_mae(valores[indice[m]], t) for m, t in CAMPOS_MAE.values()]
            prazo = novos[campos.index("prazo_contratual")]
            po = _valor_mae(valores[indice["po"]], "texto")
            inseridos.append((uuid.uuid4(), po, po, *novos, prazo.year if prazo else None, status_vazio,
                              proxima_linha, linha, agora))
            proxima_linha += 1
        if inseridos:
            cur.executemany(
                f"""insert into follow_up_itens (id, chave, po, {', '.join(campos)}, ano, status, linha_planilha,
                        mae_linha, mae_sincronizada_em, origem, oculta_na_planilha, cores, dados_originais,
                        hash_conteudo)
                    values (%s, %s, %s, {', '.join(['%s'] * len(campos))}, %s, %s, %s, %s, %s,
                            'controle_obras', false, '{{}}', '{{}}', '')""",
                inseridos,
            )
        conn.commit()
    return {"atualizados": len(atualizacoes), "novos": len(inseridos)}


# --- edição no app ------------------------------------------------------------

def _converter_edicao(campo: str, valor):
    tipo = CAMPOS_EDITAVEIS[campo]
    if valor is None or (isinstance(valor, str) and valor.strip() == ""):
        return None
    if tipo == "etapa":
        n = valor if isinstance(valor, (int, float)) and not isinstance(valor, bool) else _numero_br(str(valor))
        if n is None or not 0 <= float(n) <= 100:
            raise ValueError(f"{campo.upper()}: informe um percentual de 0 a 100.")
        return float(n)
    if tipo == "numero":
        n = valor if isinstance(valor, (int, float)) and not isinstance(valor, bool) else _numero_br(str(valor))
        if n is None:
            raise ValueError(f"{campo}: valor numérico inválido ('{valor}').")
        return float(n)
    return str(valor).strip()


def editar(item_id: str, alteracoes: dict, editado_por: str | None = None) -> dict | None:
    if not alteracoes:
        raise ValueError("Nada para salvar.")
    bloqueados = [c for c in alteracoes if c not in CAMPOS_EDITAVEIS]
    if bloqueados:
        raise CampoNaoEditavel(
            f"Campo(s) não editável(is) no app: {', '.join(bloqueados)} — vêm da Controle de obras ou são calculados."
        )
    valores = {c: _converter_edicao(c, v) for c, v in alteracoes.items()}
    if "coleta" in valores:
        m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", valores["coleta"] or "")
        coleta_data = None
        if m:
            d, mes, a = (int(x) for x in m.groups())
            try:
                coleta_data = date(a + 2000 if a < 100 else a, mes, d)
                valores["coleta"] = coleta_data.strftime("%d/%m/%Y")
            except ValueError:
                coleta_data = None
        valores["coleta_data"] = coleta_data

    with _conectar() as conn, conn.cursor() as cur:
        cur.execute(f"select {', '.join(ETAPAS)} from follow_up_itens where id = %s for update", (item_id,))
        row = cur.fetchone()
        if not row:
            return None
        if any(e in valores for e in ETAPAS):
            etapas = dict(zip(ETAPAS, row))
            etapas.update({e: valores[e] for e in ETAPAS if e in valores})
            valores["status"] = calcular_status(etapas)
        sets = ", ".join(f"{c} = %s" for c in valores)
        cur.execute(
            f"update follow_up_itens set {sets}, editado_em = now(), editado_por = %s, updated_at = now() where id = %s",
            (*valores.values(), editado_por, item_id),
        )
        item = carregar_itens(cur, item_id)[0]
        conn.commit()
    return item
