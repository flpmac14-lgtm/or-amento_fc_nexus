-- Histórico de compras COMPLETO (qualquer item: tinta, parafuso, porca,
-- consumível, matéria-prima etc.) — pedido explícito do usuário: a aba
-- "Referência de preços" não deve ficar restrita a chapa/barra/perfil
-- estrutural (isso continua em `historico_compras`, ligado a `materiais`
-- porque precisa de densidade cadastrada pro cálculo de peso).
--
-- Este aqui é só uma cópia fiel do item de compra do ERP, sem exigir
-- catálogo de engenharia — por isso `descricao`/`unidade`/`fornecedor`
-- ficam como texto livre, do jeito que o ERP registrou.
--
-- Chave natural (nfe_codigo, nfe_seq) = a nota fiscal + o item dentro
-- dela, no próprio ERP — garante reimportação idempotente sem precisar
-- comparar preço/data/fornecedor manualmente.
create table historico_compras_geral (
  id uuid primary key default gen_random_uuid(),
  nfe_codigo bigint not null,
  nfe_seq int not null,
  codigo_item text,
  descricao text not null,
  preco_unitario numeric not null,
  unidade text not null,
  fornecedor text,
  obra text,
  data_compra date not null,
  created_at timestamptz not null default now(),
  unique (nfe_codigo, nfe_seq)
);

create index on historico_compras_geral (data_compra desc);
