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
    // icon/apple-icon/opengraph-image: rotas especiais do Next (geradas
    // via next/og, ver app/icon.tsx, app/apple-icon.tsx e
    // app/opengraph-image.tsx) — sem extensão de arquivo na URL, por isso
    // precisam de exclusão própria (o filtro de extensão abaixo não pega
    // elas). Sem isso, usuário deslogado (ex: o crawler do WhatsApp/
    // Slack gerando o preview do link) é redirecionado pra /login ao
    // pedir a imagem, e o preview nunca aparece — achado real testando o
    // link de compartilhamento.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
