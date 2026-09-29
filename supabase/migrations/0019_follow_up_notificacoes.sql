-- Notificações do Follow up (sininho) — pedido explícito do usuário: avisar
-- quando a sincronização de 15 min com a Controle de obras trouxer pedidos
-- novos (ST = A) ou quando um pedido for encerrado (ST deixa de ser A).
-- Gravadas por app/follow_up_mae.py::propagar(); lidas por GET /follow-up/notificacoes.
create table follow_up_notificacoes (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('novo', 'encerrado', 'reaberto')),
  item_id uuid references follow_up_itens(id) on delete cascade,
  po text not null,
  cliente text,
  descricao text,
  st_antes text,
  st_depois text,
  criado_em timestamptz not null default now()
);

create index follow_up_notificacoes_criado_idx on follow_up_notificacoes (criado_em desc);

alter table follow_up_notificacoes enable row level security;
