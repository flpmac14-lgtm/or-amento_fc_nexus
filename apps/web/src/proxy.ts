import { NextResponse, type NextRequest } from "next/server";
import { ACESSO_SO_FOLLOW_UP, ROTA_FOLLOW_UP, ROTA_REGISTRO, ROTA_VISAO_GERAL, acessoSoFollowUp, podeVerQualidade, podeVerRegistro } from "@/lib/acesso";
import { ehEmailAdmin } from "@/lib/admin";
import { ROTA_FINANCEIRO, perfilFinanceiro, perfilFinanceiroConsulta, podeAbrirFinanceiro, podeVerFinanceiro } from "@/lib/financeiro";
import { atualizarSessaoSupabase } from "@/lib/supabase/proxy";

// /instalar, manifesto e ícones do app instalável (PWA): públicos — o celular
// lê antes de qualquer login (ver app/manifest.ts e app/instalar/page.tsx).
// /canal-de-escuta: formulário anônimo dos colaboradores (QR code impresso,
// public/canal-de-escuta/) — não confundir com /canal-escuta, a tela do admin.
// /api/publico/: onde esse formulário grava, sem login (app/api/publico/canal-escuta).
const ROTAS_PUBLICAS = ["/login", "/instalar", "/manifest.webmanifest", "/icone-app", "/canal-de-escuta", "/api/publico/"];

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

  // Vendas (página "/" de orçamentos) — pedido do usuário (17/10/2026): só a
  // conta flpmac14 abre; as outras contas de acesso total vão pro Follow up.
  const semVendas = !podeVerFinanceiro(user?.email);
  const soFollowUp = acessoSoFollowUp(user) || (!!user && semVendas && request.nextUrl.pathname === "/");
  // Perfil "financeiro" (gabriele): preso em /financeiro — pedido do usuário.
  const soFinanceiro = perfilFinanceiro(user);

  // Logado abrindo o /login → vai pra sua tela inicial. As outras rotas
  // públicas (instalar, manifesto, ícones do app) valem pra todos, logado ou
  // não, inclusive conta restrita (o celular busca o manifesto já logado).
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    // Tela inicial do flpmac14 = Visão Geral (vendas ficou secundário — pedido do usuário, 22/10/2026).
    url.pathname = soFinanceiro ? ROTA_FINANCEIRO : soFollowUp || semVendas ? ROTA_FOLLOW_UP : ROTA_VISAO_GERAL;
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (rotaPublica) return response;

  // Perfil "financeiro": só a página e os dados do Financeiro; o resto volta pra lá.
  if (user && soFinanceiro) {
    const caminho = request.nextUrl.pathname;
    if (caminho.startsWith(ROTA_FINANCEIRO) || caminho.startsWith("/api/financeiro")) return response;
    // luana (financeiro_consulta): a aba Coletas abre o relatório de coleta (só olhar).
    if (
      perfilFinanceiroConsulta(user) &&
      (caminho === "/follow-up/coleta" || (caminho === "/api/follow-up/notas-fiscais" && request.method === "GET"))
    )
      return response;
    if (caminho.startsWith("/api/")) {
      return NextResponse.json({ erro: "Conta com acesso restrito (financeiro)." }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = ROTA_FINANCEIRO;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Visão Geral: só o admin (ADMIN_EMAILS) e a conta marcelo (acesso
  // "follow_up") — pedido do usuário. Os demais voltam pra sua tela inicial.
  if (user && request.nextUrl.pathname.startsWith(ROTA_VISAO_GERAL)) {
    if (ehEmailAdmin(user.email) || user.app_metadata?.acesso === ACESSO_SO_FOLLOW_UP) return response;
    const url = request.nextUrl.clone();
    url.pathname = soFollowUp || semVendas ? ROTA_FOLLOW_UP : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Financeiro: a conta flpmac14 e o perfil "financeiro" — pedido explícito do
  // usuário (os dados também são conferidos em app/api/financeiro/route.ts).
  if (user && request.nextUrl.pathname.startsWith(ROTA_FINANCEIRO) && !podeAbrirFinanceiro(user)) {
    const url = request.nextUrl.clone();
    url.pathname = soFollowUp || semVendas ? ROTA_FOLLOW_UP : ROTA_VISAO_GERAL;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Conta restrita (app_metadata.acesso = "follow_up", ver lib/acesso.ts):
  // qualquer outra página (orçamentos, orçamentistas, APIs do Next) volta
  // pro módulo Follow up — o bloqueio é aqui no servidor, não só na tela.
  // Exceção: as rotas da aba QUALIDADE pro perfil "qualidade" (a rota confere de novo).
  // E o painel /registro pro marcelo (podeVerRegistro — pedido do usuário, 19/10/2026).
  const apiQualidade = request.nextUrl.pathname.startsWith("/api/qualidade/") && podeVerQualidade(user);
  const registro = request.nextUrl.pathname.startsWith(ROTA_REGISTRO) && podeVerRegistro(user);
  // NF de cada pedido do relatório de coleta "com Nota fiscal" (a rota confere o login).
  const apiFollowUp = request.nextUrl.pathname.startsWith("/api/follow-up/");
  if (user && soFollowUp && !apiQualidade && !registro && !apiFollowUp && !request.nextUrl.pathname.startsWith(ROTA_FOLLOW_UP)) {
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
