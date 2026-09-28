-- Registro diário do Follow up — pedido explícito do usuário: no card de
-- cada item, ir anotando o que aconteceu no dia, formando o histórico do
-- pedido (aparece só no card e no relatório do item).
create table follow_up_registros (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references follow_up_itens(id) on delete cascade,
  data date not null,          -- dia a que o registro se refere (padrão: hoje)
  texto text not null check (length(trim(texto)) > 0),
  autor text,                  -- login de quem registrou
  created_at timestamptz not null default now()
);

create index follow_up_registros_item_idx on follow_up_registros (item_id, data desc, created_at desc);

alter table follow_up_registros enable row level security;
