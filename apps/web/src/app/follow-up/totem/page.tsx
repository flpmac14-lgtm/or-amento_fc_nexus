"use client";

// Totem de apontamento — tela cheia, sem o menu do app (pedido do usuário,
// 07/11/2026). A conta "totem" (lib/acesso.ts) fica presa aqui pelo proxy.ts.
import TotemApontamento from "@/components/TotemApontamento";

export default function PaginaTotem() {
  return <TotemApontamento />;
}
