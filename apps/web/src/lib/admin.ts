/** E-mails com permissão de cadastrar/gerenciar orçamentistas — lista
 * separada por vírgula em ADMIN_EMAILS (variável de ambiente só do
 * servidor). Pedido explícito do usuário: só o admin cadastra conta
 * nova, ninguém se cadastra sozinho. */
export function ehEmailAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}
