// Jornada de trabalho da Macfab — pedido explícito do usuário: todo cálculo
// de hora/duração conta só o horário de trabalho: segunda a sexta, das 7:30
// às 17:17, com almoço das 12:00 às 13:00. Noite, almoço e fim de semana não
// contam. Espelho do backend: services/calc_engine/app/jornada.py.
// Usa o horário local do aparelho (Brasília na fábrica).

// Turnos do dia em minutos desde 0h (sem o almoço).
const TURNOS: [number, number][] = [
  [7 * 60 + 30, 12 * 60],
  [13 * 60, 17 * 60 + 17],
];

/** Minutos de jornada entre `ini` e `fim` (0 se fim <= ini). */
export function minutosUteis(ini: Date | string, fim: Date | string = new Date()): number {
  const a = new Date(ini).getTime();
  const b = new Date(fim).getTime();
  if (!(b > a)) return 0;
  let total = 0;
  const dia = new Date(a);
  dia.setHours(0, 0, 0, 0);
  while (dia.getTime() <= b) {
    const sem = dia.getDay();
    if (sem >= 1 && sem <= 5) {
      for (const [t0, t1] of TURNOS) {
        const ini0 = new Date(dia);
        ini0.setMinutes(t0);
        const fim0 = new Date(dia);
        fim0.setMinutes(t1);
        const x = Math.max(a, ini0.getTime());
        const y = Math.min(b, fim0.getTime());
        if (y > x) total += y - x;
      }
    }
    dia.setDate(dia.getDate() + 1);
  }
  return Math.round(total / 60000);
}
