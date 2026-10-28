import type { Metadata } from "next";

// Nome sugerido do PDF ao "Baixar PDF" (a impressão usa o título da página).
export const metadata: Metadata = { title: "Estrutura do FC Nexus" };

export default function LayoutEstrutura({ children }: { children: React.ReactNode }) {
  return children;
}
