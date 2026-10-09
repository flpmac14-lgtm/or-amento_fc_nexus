// "JWT issued at future" (07/10 no Financeiro, 09/10 na QUALIDADE): o token que
// o Supabase gera na hora às vezes sai uns instantes à frente do relógio do
// banco — erro passageiro. Espera e tenta de novo em vez de mostrar o erro.
// Só pra consultas do servidor (service_role) — ver app/api/qualidade/*.

export function erroPassageiro(msg: string | undefined | null): boolean {
  return !!msg && /issued at future|future|nbf|not yet valid/i.test(msg);
}

/** Roda a consulta e repete (até 4 vezes, com espera crescente) se o erro for passageiro. */
export async function comRetentativa<T extends { error: { message: string } | null }>(
  consulta: () => PromiseLike<T>,
): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    const r = await consulta();
    if (!erroPassageiro(r.error?.message) || tentativa >= 4) return r;
    await new Promise((res) => setTimeout(res, 700 * tentativa));
  }
}
