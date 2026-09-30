-- Corte (laser) — pedido explícito do usuário: aba "Corte" onde o operador
-- do laser acha o programa (Nº do programa da Croqui de corte) e marca, com
-- um toque, Cortando / Finalizado / Falta material. Uma linha por programa;
-- as peças vêm da Croqui de corte (app/corte.py).
create table corte_programas (
  programa text primary key,
  cortando_em timestamptz,
  cortando_por text,
  finalizado_em timestamptz,
  finalizado_por text,
  falta_material_em timestamptz,
  falta_material_por text,
  atualizado_em timestamptz not null default now()
);

alter table corte_programas enable row level security;
