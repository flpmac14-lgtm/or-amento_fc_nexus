-- Aba Financeiro → Pedido - ativo: botão "Atualizar" lê o Sectra na hora —
-- pedido do usuário (29/10/2026). O site grava pedir_atualizacao_em; o vigia
-- desta máquina (scripts/servir_certificados.py, sempre rodando) lê o ERP,
-- grava financeiro_pedidos e marca atendido_em.
alter table financeiro_pedidos
  add column if not exists pedir_atualizacao_em timestamptz,
  add column if not exists atendido_em timestamptz;
