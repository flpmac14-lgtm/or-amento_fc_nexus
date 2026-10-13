// Código do cliente no Follow up → nome (pedido do usuário). Usado na aba
// Corte e na aba Consulta.
export const CLIENTES: Record<string, string> = {
  A1: "Andritz",
  A2: "Dana/AlSN",
  W1: "WEIR",
  F2: "FTSX",
  S1: "Siemens",
};

export function rotuloCliente(codigo: string | null): string | null {
  const c = codigo?.trim().toUpperCase();
  if (!c) return null;
  return CLIENTES[c] ?? c;
}
