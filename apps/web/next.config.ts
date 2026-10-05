import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só no `next dev`: deixa abrir o site local pelo celular na rede da
  // empresa (http://192.168.2.53:3000) pra testar telas mobile.
  allowedDevOrigins: ["192.168.2.53"],
};

export default nextConfig;
