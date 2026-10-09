import { NextResponse, type NextRequest } from "next/server";
import { ACESSO_SO_FOLLOW_UP, ROTA_FOLLOW_UP, ROTA_VISAO_GERAL, acessoSoFollowUp, podeVerQualidade } from "@/lib/acesso";
import { ehEmailAdmin } from "@/lib/admin";
import { ROTA_FINANCEIRO, podeVerFinanceiro } from "@/lib/financeiro";
import { atualizarSessaoSupabase } from "@/lib/supabase/proxy";

// /instalar, manifesto e ícones do app instalável (PWA): públicos — o celular
// lê antes de qualquer login (ver app/manifest.ts e app/instalar/page.tsx).
const ROTAS_PUBLICAS = ["/login", "/instalar", "/manifest.webmanifest", "/icone-app"];

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

  // Logado abrindo o /login → vai pra sua tela inicial. As outras rotas
  // públicas (instalar, manifesto, ícones do app) valem pra todos, logado ou
  // não, inclusive conta restrita (o celular busca o manifesto já logado).
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = soFollowUp ? ROTA_FOLLOW_UP : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (rotaPublica) return response;

  // Visão Geral: só o admin (ADMIN_EMAILS) e a conta marcelo (acesso
  // "follow_up") — pedido do usuário. Os demais voltam pra sua tela inicial.
  if (user && request.nextUrl.pathname.startsWith(ROTA_VISAO_GERAL)) {
    if (ehEmailAdmin(user.email) || user.app_metadata?.acesso === ACESSO_SO_FOLLOW_UP) return response;
    const url = request.nextUrl.clone();
    url.pathname = soFollowUp ? ROTA_FOLLOW_UP : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Financeiro: SÓ a conta flpmac14 — pedido explícito do usuário (os dados
  // também são conferidos em app/api/financeiro/route.ts).
  if (user && request.nextUrl.pathname.startsWith(ROTA_FINANCEIRO) && !podeVerFinanceiro(user.email)) {
    const url = request.nextUrl.clone();
    url.pathname = soFollowUp ? ROTA_FOLLOW_UP : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Conta restrita (app_metadata.acesso = "follow_up", ver lib/acesso.ts):
  // qualquer outra página (orçamentos, orçamentistas, APIs do Next) volta
  // pro módulo Follow up — o bloqueio é aqui no servidor, não só na tela.
  // Exceção: as rotas da aba QUALIDADE pro perfil "qualidade" (a rota confere de novo).
  const apiQualidade = request.nextUrl.pathname.startsWith("/api/qualidade/") && podeVerQualidade(user);
  if (user && soFollowUp && !apiQualidade && !request.nextUrl.pathname.startsWith(ROTA_FOLLOW_UP)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ erro: `Conta com acesso restrito (${user.app_metadata?.acesso ?? ACESSO_SO_FOLLOW_UP}).` }, { status: 403 });
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
    // .mjs: public/pdf.worker.min.mjs (PDF.js da tela "Montar data book") — conta
    // restrita também precisa carregar.
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mjs)$).*)",
  ],
};
