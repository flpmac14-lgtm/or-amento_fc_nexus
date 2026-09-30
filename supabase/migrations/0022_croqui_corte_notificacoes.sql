-- Sininho da Croqui de corte — pedido explícito do usuário: mesmo critério do
-- Follow up; quando o Material de compra trouxer pedido novo ativo (ST = A),
-- avisar. Gravadas por app/croqui_corte.py::propagar().
create table croqui_corte_notificacoes (
  id bigint generated always as identity primary key,
  tipo text not null default 'novo' check (tipo in ('novo')),
  item_id uuid references croqui_corte_itens(id) on delete cascade,
  pedido text not null,
  mac text,
  descricao text,
  criado_em timestamptz not null default now()
);

create index croqui_corte_notificacoes_criado_idx on croqui_corte_notificacoes (criado_em desc);

alter table croqui_corte_notificacoes enable row level security;
