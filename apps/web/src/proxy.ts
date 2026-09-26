import { NextResponse, type NextRequest } from "next/server";
import { ACESSO_SO_FOLLOW_UP, ROTA_FOLLOW_UP, acessoSoFollowUp } from "@/lib/acesso";
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

  const soFollowUp = acessoSoFollowUp(user);

  if (user && rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = soFollowUp ? ROTA_FOLLOW_UP : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Conta restrita (app_metadata.acesso = "follow_up", ver lib/acesso.ts):
  // qualquer outra página (orçamentos, orçamentistas, APIs do Next) volta
  // pro módulo Follow up — o bloqueio é aqui no servidor, não só na tela.
  if (user && soFollowUp && !request.nextUrl.pathname.startsWith(ROTA_FOLLOW_UP)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: `Conta com acesso só ao ${ACESSO_SO_FOLLOW_UP}.` }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = ROTA_FOLLOW_UP;
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
