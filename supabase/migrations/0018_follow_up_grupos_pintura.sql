-- Grupos de pintura do Follow up — pedido explícito do usuário: pedidos com
-- o mesmo Plano de pintura + COR2 + COR-2 ganham a mesma cor de destaque, e
-- botões no cabeçalho filtram cada grupo. Esta é a "tabela oculta de
-- referência": cada combinação recebe um número uma vez só (a cor sai do
-- número no app), então a cor de um grupo nunca muda.
create table follow_up_grupos_pintura (
  indice integer generated always as identity primary key,
  chave text not null unique,       -- plano|cor2|cor_2 normalizados (maiúsculas, espaços simples)
  plano_pintura text,
  cor2 text,
  cor_2 text,
  created_at timestamptz not null default now()
);

alter table follow_up_grupos_pintura enable row level security;
