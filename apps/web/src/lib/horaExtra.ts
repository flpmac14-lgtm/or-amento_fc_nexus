// Solicitação de hora extra — pedido do usuário (26/10/2026): ele (flpmac14),
// o Jeferson e o Diego escolhem os funcionários (só os nomes da planilha
// CONTROLE ACORDO SABADOS TRABALHADOS, tabela funcionarios — migration 0059),
// os dias e de que hora até que hora, e sai o relatório em PDF
// (/follow-up/hora-extra?n=). Tela: components/FuncionariosHoraExtra.tsx.

export interface DiaHoraExtra {
  data: string; // "2026-10-31"
  inicio: string; // "07:00"
  fim: string; // "15:00"
}

export interface SolicitacaoHoraExtra {
  numero: number;
  criado_em: string;
  criado_por: string;
  solicitante: string;
  funcionarios: string[];
  dias: DiaHoraExtra[];
  motivo: string | null;
}

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function diaValido(d: Partial<DiaHoraExtra> | null | undefined): d is DiaHoraExtra {
  return !!d && RE_DATA.test(d.data ?? "") && RE_HORA.test(d.inicio ?? "") && RE_HORA.test(d.fim ?? "") && d.inicio !== d.fim;
}

function emMinutos(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

// Almoço (12:00–13:00) não conta — igual à planilha do acordo dos sábados:
// 7:00–15:00 = 7 horas, 7:00–12:00 = 5 horas. Fim antes do início = vira a noite.
const ALMOCO = [12 * 60, 13 * 60] as const;

export function minutosDoDia(d: DiaHoraExtra): number {
  const ini = emMinutos(d.inicio);
  let fim = emMinutos(d.fim);
  if (fim <= ini) fim += 24 * 60;
  const almoco = Math.max(0, Math.min(fim, ALMOCO[1]) - Math.max(ini, ALMOCO[0]));
  return fim - ini - almoco;
}

export function minutosDaSolicitacao(dias: DiaHoraExtra[]): number {
  return dias.reduce((s, d) => s + minutosDoDia(d), 0);
}

/** 450 → "7h30"; 420 → "7h". */
export function formatarHoras(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export function diaDaSemana(data: string): string {
  const [a, m, d] = data.split("-").map(Number);
  return DIAS_SEMANA[new Date(a, m - 1, d).getDay()];
}

// Nome de quem pede, no PDF (login → nome da planilha).
const NOMES_SOLICITANTE: Record<string, string> = {
  "flpmac14@gmail.com": "FELIPE SOUSA DO NASCIMENTO",
  jeferson: "JEFERSON DIAS OLIVEIRA",
  diego: "DIEGO FIUZA RUAS",
};

export function nomeSolicitante(login: string): string {
  return NOMES_SOLICITANTE[login.toLowerCase()] ?? login.toUpperCase();
}
