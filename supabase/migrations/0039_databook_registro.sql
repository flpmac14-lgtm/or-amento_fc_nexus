-- Data book — pedido do usuário (13/10/2026), "assim como o projeto" (Croqui
-- de corte): ST.BOOK FAZENDO grava o início (quando e quem), PRONTO já grava a
-- finalização (0038); campo "falta" pra Qualidade anotar o que está faltando
-- pra finalizar o book; e histórico de cada mudança (quem, quando, de → para).
alter table databook_itens
  add column fazendo_em timestamptz,
  add column fazendo_por text,
  add column falta text;

create table databook_historico (
  id bigint generated always as identity primary key,
  item_id uuid not null references databook_itens(id) on delete cascade,
  campo text not null,               -- st_book / falta / observacao
  de text,
  para text,
  por text,
  em timestamptz not null default now()
);
create index databook_historico_item_idx on databook_historico (item_id, em desc);

alter table databook_historico enable row level security;
