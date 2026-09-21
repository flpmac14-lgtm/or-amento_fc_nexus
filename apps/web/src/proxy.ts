import { NextResponse, type NextRequest } from "next/server";
import { atualizarSessaoSupabase } from "@/lib/supabase/proxy";

const ROTAS_PUBLICAS = ["/login"];

export async function proxy(request: NextRequest) {
  const { response, user } = await atualizarSessaoSupabase(request);

  const rotaPublica = ROTAS_PUBLICAS.some((rota) =>
    request.nextUrl.pathname.startsWith(rota),
  );

  if (!user && !rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("proximo", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // icon/apple-icon: rotas especiais do Next (favicon/apple-touch-icon
    // gerados via next/og, ver app/icon.tsx e app/apple-icon.tsx) — sem
    // extensão de arquivo na URL, por isso precisam de exclusão própria
    // (o filtro de extensão abaixo não pega elas). Sem isso, usuário
    // deslogado é redirecionado pra /login ao pedir o ícone, e o
    // navegador nunca mostra o favicon na tela de login.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
