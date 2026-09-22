// Supabase Auth exige um e-mail (sintaticamente válido) por baixo dos
// panos — pedido explícito do usuário: orçamentista usa só um "login"
// simples (sem @, sem precisar de e-mail de verdade). Solução padrão pra
// isso: gerar um e-mail interno fixo (login@fcnexus.local) sem expor esse
// detalhe na tela.
//
// O admin (conta real, com e-mail de verdade) continua funcionando igual:
// se o valor digitado já tem "@", tratamos como e-mail de verdade e não
// mexemos nele — só logins sem "@" ganham o domínio interno.
export const DOMINIO_LOGIN_INTERNO = "fcnexus.local";

export function loginParaEmail(loginOuEmail: string): string {
  const valor = loginOuEmail.trim().toLowerCase();
  return valor.includes("@") ? valor : `${valor}@${DOMINIO_LOGIN_INTERNO}`;
}

// Inverso — usado só pra EXIBIÇÃO (lista de contas cadastradas): esconde
// o domínio interno de quem só tem login, mas mantém o e-mail de verdade
// visível pra quem tem (ex: o admin).
export function emailParaLogin(email: string): string {
  const sufixo = `@${DOMINIO_LOGIN_INTERNO}`;
  return email.toLowerCase().endsWith(sufixo) ? email.slice(0, -sufixo.length) : email;
}
