// Documentos — pedido do usuário (11/11/2026): pastas com nome livre e PDFs
// anexados. flpmac14 e lailto, cada um com as suas pastas. Tabelas documentos_pastas/_arquivos +
// bucket privado "documentos" (migration 0069); API em app/api/documentos.

import { EMAIL_FINANCEIRO } from "@/lib/financeiro";
import { DOMINIO_LOGIN_INTERNO } from "@/lib/loginInterno";

export const ROTA_DOCUMENTOS = "/documentos";
export const BUCKET_DOCUMENTOS = "documentos";
export const MAX_BYTES_DOCUMENTO = 50 * 1024 * 1024; // limite do bucket (plano do Supabase)

// Cada conta vê só as próprias pastas (coluna dono). 12/11/2026: lailto também
// (pedido do usuário, "pra ele também se organizar").
const PODEM_VER = new Set([EMAIL_FINANCEIRO, `lailto@${DOMINIO_LOGIN_INTERNO}`]);

export function podeVerDocumentos(email: string | null | undefined): boolean {
  return PODEM_VER.has((email ?? "").trim().toLowerCase());
}

export type PastaDocumentos = { id: string; nome: string; criado_em: string };

export type ArquivoDocumento = {
  id: string;
  pasta_id: string;
  nome: string;
  tamanho: number | null;
  criado_em: string;
};
