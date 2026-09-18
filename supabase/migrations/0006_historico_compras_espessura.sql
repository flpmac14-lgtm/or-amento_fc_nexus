-- Referência de preço/kg (tela "Referência de preços" + auto-preenchimento
-- do cartão de chapa) deixa de depender da planilha local
-- (`dados-locais/Lista sectra de material.xlsx`, só existe na máquina que
-- sincroniza o OneDrive) e passa a ler direto de `historico_compras` — já
-- alimentada pelo ERP via scripts/importar_precos_erp.py. Funciona igual
-- local e hospedado, porque é banco compartilhado.
--
-- `historico_compras` guardava só material_id/preco_kg/data — sem
-- espessura, não dá pra distinguir preço de chapa #3,00 vs #6,35 da mesma
-- norma. `descricao_original` fica pra auditoria (ver a descrição exata
-- que veio do ERP, útil quando o preço parecer estranho).
alter table historico_compras
  add column espessura_mm numeric,
  add column descricao_original text;

comment on column historico_compras.espessura_mm is
  'Só preenchido pra tipo=chapa (extraído de "CHAPA #<espessura> <norma>"); null pros demais tipos.';
