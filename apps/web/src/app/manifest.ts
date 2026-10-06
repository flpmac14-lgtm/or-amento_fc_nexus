import type { MetadataRoute } from "next";

// App instalável (PWA) — pedido do usuário: mandar um link pro celular de um
// usuário e ele "baixar" o FC Nexus pra tela inicial (ícone FC, abre em tela
// cheia, sem barra do navegador). Página com o passo a passo: /instalar.
// Ícones: app/icone-app/[tamanho]/route.tsx (mesmo logo FC do menu).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FC Nexus — Macfab",
    short_name: "FC Nexus",
    description: "Orçamentos, Follow up, produção e apontamentos da Macfab",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0b1626",
    theme_color: "#14213a",
    lang: "pt-BR",
    icons: [
      { src: "/icone-app/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icone-app/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icone-app/512?maskable=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
