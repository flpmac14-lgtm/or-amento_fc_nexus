import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente Supabase autenticado como o usuário da sessão atual — pra usar
 * dentro de Route Handlers/Server Components (lê o cookie de sessão via
 * next/headers). Sujeito a Row Level Security normalmente (diferente do
 * admin.ts, que ignora RLS). */
export async function criarClienteSupabaseServidor() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Route Handler só lê a sessão aqui (não precisa renovar cookie
          // — quem faz isso é o proxy.ts em toda navegação de página).
        },
      },
    },
  );
}
