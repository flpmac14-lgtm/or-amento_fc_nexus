import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só no `next dev`: deixa abrir o site local pelo celular na rede da
  // empresa (http://192.168.2.53:3000) pra testar telas mobile.
  allowedDevOrigins: ["192.168.2.53"],
  // Formulário público do Canal de Escuta (QR code impresso) — pedido do
  // usuário (26/10/2026): página estática em public/canal-de-escuta/, aberta
  // sem login (proxy.ts). Os relatos vão pra tela /canal-escuta.
  async rewrites() {
    return [{ source: "/canal-de-escuta", destination: "/canal-de-escuta/index.html" }];
  },
};

export default nextConfig;
