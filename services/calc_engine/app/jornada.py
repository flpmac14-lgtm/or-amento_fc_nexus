"""Jornada de trabalho da Macfab — pedido explícito do usuário: todo cálculo
de hora/duração conta só o horário de trabalho: segunda a sexta, das 7:30 às
17:17, com almoço das 12:00 às 13:00 (8h47 úteis por dia). Noite, almoço e
fim de semana não contam. Espelho no front: apps/web/src/lib/jornada.ts.
"""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

FUSO = timezone(timedelta(hours=-3))
# Turnos do dia (início, fim), sem o almoço.
TURNOS = ((time(7, 30), time(12, 0)), (time(13, 0), time(17, 17)))
DIAS_UTEIS = {0, 1, 2, 3, 4}  # segunda a sexta


def minutos_uteis(ini: datetime, fim: datetime) -> int:
    """Minutos de jornada entre `ini` e `fim` (0 se fim <= ini)."""
    if ini.tzinfo is None:
        ini = ini.replace(tzinfo=FUSO)
    if fim.tzinfo is None:
        fim = fim.replace(tzinfo=FUSO)
    ini, fim = ini.astimezone(FUSO), fim.astimezone(FUSO)
    if fim <= ini:
        return 0
    total = 0.0
    dia = ini.date()
    while dia <= fim.date():
        if dia.weekday() in DIAS_UTEIS:
            for a, b in TURNOS:
                t0 = max(ini, datetime.combine(dia, a, tzinfo=FUSO))
                t1 = min(fim, datetime.combine(dia, b, tzinfo=FUSO))
                if t1 > t0:
                    total += (t1 - t0).total_seconds()
        dia += timedelta(days=1)
    return round(total / 60)
