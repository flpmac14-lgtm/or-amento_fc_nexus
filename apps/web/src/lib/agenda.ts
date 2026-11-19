// Agenda pessoal — pedido do usuário (19/11/2026). Só o flpmac14 por enquanto.
// Tabela agenda_lembretes (migration 0077); API em app/api/agenda; tela em app/agenda;
// o aviso do dia aparece em qualquer tela (components/AgendaAviso.tsx, dentro do AppShell).

import { podeVerFinanceiro } from "@/lib/financeiro";

export const ROTA_AGENDA = "/agenda";

export function podeVerAgenda(email: string | null | undefined): boolean {
  return podeVerFinanceiro(email);
}

export type Lembrete = {
  id: string;
  data: string; // yyyy-mm-dd
  hora: string | null; // hh:mm[:ss]
  texto: string;
  visto_em: string | null;
  criado_em: string;
};

export function hojeIso(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const horaCurta = (h: string | null) => (h ? h.slice(0, 5) : "");

export function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Já chegou a hora de avisar (dia passado/hoje e, se tiver hora, a hora já passou)? */
export function jaVenceu(l: Lembrete, agora = new Date()): boolean {
  const hoje = hojeIso(agora);
  if (l.data < hoje) return true;
  if (l.data > hoje) return false;
  if (!l.hora) return true;
  const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  return horaCurta(l.hora) <= hhmm;
}
