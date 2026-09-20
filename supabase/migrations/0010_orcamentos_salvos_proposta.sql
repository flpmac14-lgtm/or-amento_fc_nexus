-- Aba "PROPOSTA" (pedido explícito do usuário: reproduzir o modelo oficial
-- de proposta comercial da Macfab dentro do orçamento) — mesmo padrão já
-- usado por `estado_manual`/`relatorio_tecnico`: um jsonb flexível
-- vinculado ao orçamento salvo, sem tabela nova. Guarda só o que é
-- ESPECÍFICO da proposta (título do serviço, contato, itens de preço,
-- checkboxes de escopo/exclusões, textos com override) — tudo que já
-- existe no orçamento (MAC/nome, cliente, revisão, condição de pagamento,
-- peso, valor) continua vindo de `resultado`/`identificacao_cliente`, não
-- duplicado aqui (ver PropostaConfig em apps/web/src/lib/types.ts).
alter table orcamentos_salvos
  add column proposta jsonb;
