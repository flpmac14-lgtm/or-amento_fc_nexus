"""Jornada Macfab (app/jornada.py): seg–sex 7:30–17:17, almoço 12–13."""

from datetime import datetime

from app.jornada import FUSO, minutos_uteis


def d(dia, h, m=0):
    return datetime(2026, 10, dia, h, m, tzinfo=FUSO)  # 05/10/2026 = segunda


def test_mesmo_turno():
    assert minutos_uteis(d(5, 8), d(5, 9, 30)) == 90


def test_almoco_nao_conta():
    assert minutos_uteis(d(5, 11), d(5, 14)) == 120


def test_dia_inteiro():
    assert minutos_uteis(d(5, 0), d(5, 23)) == 8 * 60 + 47


def test_vira_a_noite():
    # 16:00 → 17:17 (77) + 7:30 → 8:00 (30)
    assert minutos_uteis(d(5, 16), d(6, 8)) == 107


def test_fim_de_semana_nao_conta():
    # sexta 09/10 16:17 → segunda 12/10 8:30 = 60 + 60
    assert minutos_uteis(d(9, 16, 17), d(12, 8, 30)) == 120


def test_invertido_ou_fora_do_horario():
    assert minutos_uteis(d(5, 9), d(5, 8)) == 0
    assert minutos_uteis(d(5, 18), d(5, 23)) == 0
    assert minutos_uteis(d(10, 8), d(11, 17)) == 0  # sábado e domingo
