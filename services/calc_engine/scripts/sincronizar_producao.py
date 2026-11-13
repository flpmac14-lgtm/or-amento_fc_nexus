"""Ordens de produção / totem de apontamento — pedido do usuário (07/11/2026).

Traz do Sectra (ERP, só SELECT — regra combinada) os cadastros que a tela de
OP e o totem usam e grava em prod_cadastros (migration 0065), um JSON por tipo:

- operadores: RH_FUNCIONARIO + RH_FUNCIONARIOCRACHA (código, nome, apelido,
  crachá, ativo). Só isso — nada de documento, endereço ou salário.
- centros: PR_CENTROPROD (máquinas / postos, com a árvore pelo NIVEL).
- operacoes: PR_OPERACAO (00.10 PCP … 02.10 INSPEÇÃO).
- roteiros_padrao: PR_ROTEIROPADRAO + PR_ROTEIROPADRAOITENS.
- roteiros_desenho: roteiro de cada desenho cadastrado (PR_DESENHO →
  PR_DESENHOROTEIROOPCAO.LISTAENG = PR_DESENHO.CODIGO → PR_DESENHOROTEIRO),
  achado pelo nº do desenho do Sectra ou pelo código da peça do cliente (CODPECCLI).
- motivos: PR_TPINATIVO (motivos de parada) + PR_TPHORA (tipos de hora).
- motivos_refugo: PR_OPPERDAMOTIVO (código + motivo do refugo / não conforme no totem).

Roda dentro de sincronizar_controle_obras.py (15 min); só grava o que mudou
(hash por tipo em sincronizar_producao.estado, fora do git).
Uso manual: python scripts/sincronizar_producao.py [--simular]
"""

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "scripts"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(RAIZ / ".env")

from app.orcamentos_salvos import _conectar  # noqa: E402
from sincronizar_financeiro import _conectar_erp  # noqa: E402

ESTADO = RAIZ / "sincronizar_producao.estado"


def _t(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _n(v) -> float:
    try:
        return round(float(v or 0), 4)
    except (TypeError, ValueError):
        return 0.0


def _i(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def montar() -> dict[str, object]:
    with _conectar_erp() as erp:
        cur = erp.cursor()

        cur.execute(
            """SELECT F.CODIGO, F.NOME, F.APELIDO, F.CKATIVO, F.CENTROPROD,
                      (SELECT TOP 1 C.CRACHA FROM RH_FUNCIONARIOCRACHA C
                        WHERE C.FUNCIONARIO = F.CODIGO ORDER BY C.DTINICIO DESC, C.CODIGO DESC) AS CRACHA
               FROM RH_FUNCIONARIO F ORDER BY F.CODIGO"""
        )
        operadores = []
        for cod, nome, apelido, ativo, centro, cracha in cur.fetchall():
            nome = _t(nome)
            # Código 1 "APONTAMENTO" é usuário técnico do Sectra, não é gente.
            if not nome or nome.upper() == "APONTAMENTO":
                continue
            operadores.append(
                {
                    "codigo": int(cod),
                    "nome": nome,
                    "apelido": _t(apelido) or nome.split()[0],
                    "cracha": _t(cracha) or str(int(cod)),
                    "ativo": (ativo or "S").strip().upper() == "S",
                    "centro": _t(centro),
                }
            )

        cur.execute("SELECT CODIGO, DESCRICAO, NIVEL, NIVELPAI, CKATIVO FROM PR_CENTROPROD ORDER BY NIVEL, CODIGO")
        centros = [
            {"codigo": _t(c), "descricao": _t(d), "nivel": _t(nv), "pai": _t(p), "ativo": (a or "S").strip().upper() == "S"}
            for c, d, nv, p, a in cur.fetchall()
            if _t(c)
        ]

        cur.execute("SELECT CODIGO, DESCRICAO FROM PR_OPERACAO ORDER BY CODIGO")
        operacoes = [{"codigo": _t(c), "descricao": _t(d)} for c, d in cur.fetchall() if _t(c)]

        def etapas(sql: str, chave) -> dict:
            cur.execute(sql)
            por: dict = {}
            for k, pos, op, centro, desc, prep, unit in cur.fetchall():
                por.setdefault(chave(k), []).append(
                    {
                        "posicao": _i(pos) or 0,
                        "operacao": _t(op),
                        "centro": _t(centro),
                        "descricao": _t(desc),
                        "hr_preparo": _n(prep),
                        "hr_unitario": _n(unit),
                    }
                )
            for lista in por.values():
                lista.sort(key=lambda e: e["posicao"])
            return por

        itens_padrao = etapas(
            """SELECT ROTEIROPADRAO, POSICAO, OPERACAO, CENTROPROD, CAST(DESCRICAO AS varchar(max)), HRPREPAROD, HRUNITARIOD
               FROM PR_ROTEIROPADRAOITENS""",
            lambda k: int(k),
        )
        cur.execute("SELECT CODIGO, DESCRICAO, CKATIVO FROM PR_ROTEIROPADRAO ORDER BY CODIGO")
        roteiros_padrao = [
            {"codigo": int(c), "descricao": _t(d), "etapas": itens_padrao.get(int(c), [])}
            for c, d, a in cur.fetchall()
            if (a or "S").strip().upper() == "S"
        ]

        itens_desenho = etapas(
            """SELECT DESENHOROTEIROOPCAO, POSICAO, OPERACAO, CENTROPROD, CAST(DESCRICAO AS varchar(max)), HRPREPAROD, HRUNITARIOD
               FROM PR_DESENHOROTEIRO""",
            lambda k: int(k),
        )
        cur.execute(
            """SELECT D.DESENHO, D.CODPECCLI, D.DESCRICAO, D.OBRA, O.CODIGO, O.DESCRICAO, O.CKPADRAO
               FROM PR_DESENHOROTEIROOPCAO O JOIN PR_DESENHO D ON D.CODIGO = O.LISTAENG
               ORDER BY D.DESENHO, CASE WHEN O.CKPADRAO = 'S' THEN 0 ELSE 1 END, O.CODIGO"""
        )
        roteiros_desenho = []
        for des, cli, desc, obra, opcao, nome, padrao in cur.fetchall():
            et = itens_desenho.get(int(opcao), [])
            if not et:
                continue
            roteiros_desenho.append(
                {
                    "desenho": _t(des),
                    "cod_cliente": _t(cli),
                    "descricao": _t(desc),
                    "obra": _t(obra),
                    "opcao": int(opcao),
                    "nome": _t(nome),
                    "padrao": (padrao or "").strip().upper() == "S",
                    "etapas": et,
                }
            )

        cur.execute("SELECT CODIGO, DESCRICAO FROM PR_TPINATIVO WHERE ISNULL(CKATIVO, 'S') = 'S' ORDER BY CODIGO")
        motivos = [_t(d) for _c, d in cur.fetchall() if _t(d)]

        cur.execute("SELECT CODIGO, DESCRICAO FROM PR_OPPERDAMOTIVO WHERE ISNULL(CKATIVO, 'S') = 'S' ORDER BY CODIGO")
        motivos_refugo = [{"codigo": str(int(c)), "descricao": _t(d)} for c, d in cur.fetchall() if _t(d)]

    return {
        "operadores": operadores,
        "centros": centros,
        "operacoes": operacoes,
        "roteiros_padrao": roteiros_padrao,
        "roteiros_desenho": roteiros_desenho,
        "motivos": motivos,
        "motivos_refugo": motivos_refugo,
    }


def sincronizar(simular: bool = False) -> str | None:
    """Grava os cadastros que mudaram (None = nada mudou)."""
    dados = montar()
    estado: dict = {}
    if ESTADO.exists():
        try:
            estado = json.loads(ESTADO.read_text(encoding="utf-8"))
        except ValueError:
            estado = {}
    mudou = {}
    for k, v in dados.items():
        texto = json.dumps(v, ensure_ascii=False, sort_keys=True)
        h = hashlib.sha256(texto.encode()).hexdigest()
        if estado.get(k) != h:
            mudou[k] = (texto, h)
    resumo = ", ".join(f"{k} ({len(dados[k])})" for k in mudou)  # type: ignore[arg-type]
    if simular or not mudou:
        return resumo or None if not simular else (resumo or "nada mudou")
    agora = datetime.now(timezone.utc)
    with _conectar() as conn, conn.cursor() as cur:
        for k, (texto, _h) in mudou.items():
            cur.execute(
                """insert into prod_cadastros (id, dados, gerado_em) values (%s, %s, %s)
                   on conflict (id) do update set dados = excluded.dados, gerado_em = excluded.gerado_em""",
                (k, texto, agora),
            )
        conn.commit()
    for k, (_t2, h) in mudou.items():
        estado[k] = h
    ESTADO.write_text(json.dumps(estado), encoding="utf-8")
    return resumo


if __name__ == "__main__":
    print(sincronizar(simular="--simular" in sys.argv))
