// Documentos — pedido do usuário (11/11/2026): pastas com nome livre e PDFs
// anexados. Só o flpmac14 por enquanto. Tabelas documentos_pastas/_arquivos +
// bucket privado "documentos" (migration 0069); API em app/api/documentos.

import { podeVerFinanceiro } from "@/lib/financeiro";

export const ROTA_DOCUMENTOS = "/documentos";
export const BUCKET_DOCUMENTOS = "documentos";
export const MAX_BYTES_DOCUMENTO = 50 * 1024 * 1024; // limite do bucket (plano do Supabase)

export function podeVerDocumentos(email: string | null | undefined): boolean {
  return podeVerFinanceiro(email);
}

export type PastaDocumentos = { id: string; nome: string; criado_em: string };

export type ArquivoDocumento = {
  id: string;
  pasta_id: string;
  nome: string;
  tamanho: number | null;
  criado_em: string;
};
