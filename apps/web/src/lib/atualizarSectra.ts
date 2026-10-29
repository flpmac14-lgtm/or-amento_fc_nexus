// Botão "Atualizar do Sectra" (aba Financeiro → Pedido - ativo e Entrada de
// pedidos) — pedido do usuário (29/10/2026, migration 0063): o site pede, o
// vigia da máquina da Macfab (scripts/servir_certificados.py) lê o ERP e marca
// atendido_em. Espera até 2 min; devolve false se ninguém atendeu.
export async function atualizarPedidosSectra(passo: (texto: string) => void): Promise<boolean> {
  passo("Pedindo ao Sectra…");
  const r = await fetch("/api/financeiro/pedidos", { method: "POST" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.erro ?? `Falha ao pedir (${r.status}).`);
  const pedido: string = j.pedido_em;
  passo("Lendo o Sectra…");
  for (let t = 0; t < 40; t++) {
    await new Promise((ok) => setTimeout(ok, 3000));
    const e = await fetch("/api/financeiro/pedidos?estado=1", { cache: "no-store" }).then((x) => x.json());
    if (e.atendido_em && Date.parse(e.atendido_em) >= Date.parse(pedido)) return true;
  }
  return false;
}

export const AVISO_SEM_RESPOSTA = "O computador da Macfab não respondeu agora — os dados atualizam sozinhos a cada 15 min.";
