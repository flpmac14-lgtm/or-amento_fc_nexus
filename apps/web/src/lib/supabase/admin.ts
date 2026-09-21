import { createClient } from "@supabase/supabase-js";

// Cliente com a service_role key — ignora Row Level Security e pode usar
// a Admin API (criar/listar usuário de autenticação). NUNCA importar
// isto num arquivo "use client": só dentro de Route Handlers/Server
// Components (ver app/api/orcamentistas/route.ts). A service_role key
// fica só como variável de ambiente do servidor (SUPABASE_SERVICE_ROLE_KEY,
// sem prefixo NEXT_PUBLIC_) — pedida ao usuário, nunca gerada/vista aqui.
export function criarClienteSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
