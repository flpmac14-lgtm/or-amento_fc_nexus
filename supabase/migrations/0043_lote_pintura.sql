-- Lote da Pintura — pedido do usuário (14/10/2026): igual ao NRI do Corte
-- (um por programa), o felipe anota o lote da pintura de cada pedido do
-- Follow up ao apontar. Genérica por setor (só a Pintura usa por enquanto).
-- Um lote por pedido e setor; vazio apaga. Gravado por app/apontamentos_setor.py.
create table lotes_setor (
  setor text not null,
  item_id uuid not null references follow_up_itens(id) on delete cascade,
  lote text not null,
  por text,                          -- login de quem gravou (ex.: felipe)
  em timestamptz not null default now(),
  primary key (setor, item_id)
);

create index lotes_setor_em_idx on lotes_setor (em desc);

alter table lotes_setor enable row level security;
