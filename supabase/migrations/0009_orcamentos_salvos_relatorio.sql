-- Relatório técnico completo por IA (ver app/ai_fallback/relatorio_tecnico.py)
-- pode ser salvo junto do orçamento — pedido explícito do usuário, pra não
-- perder o estudo gerado quando reabre o orçamento depois. Texto solto
-- (Markdown), não jsonb: não é dado estruturado, é só o relatório pra leitura.
alter table orcamentos_salvos
  add column relatorio_tecnico text;
