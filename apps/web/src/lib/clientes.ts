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

// Nos relatórios de coleta e de carga, o nome como o usuário pediu (19/10/2026),
// junto do código: "A1 · Andritz".
const NOMES_RELATORIO: Record<string, string> = { ...CLIENTES, A2: "ALSN (Dana)", W1: "Weir" };
export function nomeClienteRelatorio(codigo: string): string {
  const nome = NOMES_RELATORIO[codigo.trim().toUpperCase()];
  return nome ? `${codigo} · ${nome}` : codigo;
}
