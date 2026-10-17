// Relatório semanal de desempenho do Data book (app/follow-up/databook-semanal) —
// pedido do usuário (17/10/2026): o botão é só pro flpmac14 e o lailto.
import { EMAIL_FINANCEIRO } from "@/lib/financeiro";
import { DOMINIO_LOGIN_INTERNO } from "@/lib/loginInterno";

const PODEM_VER = new Set([EMAIL_FINANCEIRO, `lailto@${DOMINIO_LOGIN_INTERNO}`]);

export function podeVerRelatorioSemanal(email: string | null | undefined): boolean {
  return PODEM_VER.has((email ?? "").trim().toLowerCase());
}
