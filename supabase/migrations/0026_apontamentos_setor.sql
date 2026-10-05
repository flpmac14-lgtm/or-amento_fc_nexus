-- Apontamento por setor no Follow up — pedido explícito do usuário: o líder
-- da Usinagem (conta saymon) acha o pedido pelo celular e aponta, com um
-- toque, Usinando / Fim de usinagem / Falta material, qual operador está
-- fazendo + observação opcional.
-- Genérica por setor (coluna "setor") pra depois servir a Solda, Montagem...
-- sem tabela nova. Cada apontamento é uma linha (histórico completo); a
-- situação atual do pedido no setor = o último apontamento.
-- Gravado por app/apontamentos_setor.py.
create table apontamentos_setor (
  id bigint generated always as identity primary key,
  setor text not null,               -- 'usinagem' (outros setores no futuro)
  item_id uuid not null references follow_up_itens(id) on delete cascade,
  status text not null check (status in ('em_andamento', 'finalizado', 'falta_material')),
  operador text,                     -- quem está operando (ex.: Cesar), escolhido pelo líder
  observacao text,
  por text,                          -- login de quem apontou (ex.: saymon)
  em timestamptz not null default now()
);

create index apontamentos_setor_item_idx on apontamentos_setor (setor, item_id, em desc);
create index apontamentos_setor_em_idx on apontamentos_setor (setor, em desc);

alter table apontamentos_setor enable row level security;
