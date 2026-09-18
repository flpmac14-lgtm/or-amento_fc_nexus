-- Corrige o desenho de historico_compras_geral (0007): a query SQL que a
-- Macfab já usa (relatório "Sectra") não guarda cada transação — ela
-- deduplica pro ÚLTIMO preço por (MATERIAL, UNIDADE) via
-- ROW_NUMBER() OVER (PARTITION BY NI.MATERIAL, NI.UNIDADE
--                     ORDER BY DTLANCAMENTO DESC, NFE DESC) = 1.
-- Troca a chave de idempotência de (nfe_codigo, nfe_seq) — que fazia esta
-- tabela crescer como log de transações — para (material_codigo, unidade),
-- pra bater exatamente com essa lógica: cada sync faz upsert do preço mais
-- recente conhecido por material, sem acumular histórico de transação.
alter table historico_compras_geral
  add column material_codigo text,
  drop constraint historico_compras_geral_nfe_codigo_nfe_seq_key,
  add constraint historico_compras_geral_material_unidade_key unique (material_codigo, unidade),
  drop column nfe_seq;
