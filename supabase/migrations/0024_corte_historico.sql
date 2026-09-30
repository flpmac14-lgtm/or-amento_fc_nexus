-- Histórico de serviço do Corte (laser) — pedido explícito do usuário: cada
-- marcação do operador (Cortando / Finalizado / Falta material, marcar ou
-- desmarcar) vira uma linha, com quem e quando. Gravado por app/corte.py::marcar().
create table corte_historico (
  id bigint generated always as identity primary key,
  programa text not null,
  marca text not null check (marca in ('cortando', 'finalizado', 'falta_material')),
  valor boolean not null,          -- true = marcou, false = desmarcou
  por text,
  em timestamptz not null default now()
);

create index corte_historico_em_idx on corte_historico (em desc);
create index corte_historico_programa_idx on corte_historico (programa);

alter table corte_historico enable row level security;
