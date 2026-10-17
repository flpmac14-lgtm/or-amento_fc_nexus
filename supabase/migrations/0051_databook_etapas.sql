-- Apontamento do Data book por etapa — pedido do usuário (17/10/2026): igual à
-- Usinagem/Pintura, pelo celular e no computador. Cada etapa tem Início e
-- Finalizado: Relatório de caldeiraria, Relatório de usinagem, Relatório de
-- solda, Relatório de pintura, Rastreabilidade, Montando book e Fim de book.
-- Uma linha por toque (histórico completo); a situação de cada etapa = o último
-- início/fim não desfeito. Rastreabilidade, Montando book e Fim de book também
-- atualizam o ST.BOOK como antes (app/databook_etapas.py).
create table databook_etapas (
  id bigserial primary key,
  item_id uuid not null references databook_itens(id) on delete cascade,
  etapa text not null,                       -- ex.: "rel_solda"
  acao text not null check (acao in ('inicio', 'fim')),
  observacao text,
  por text,                                  -- login de quem apontou
  em timestamptz not null default now(),
  desfeito boolean not null default false    -- 🗑 apontado errado
);

create index databook_etapas_item_idx on databook_etapas (item_id, em);
create index databook_etapas_em_idx on databook_etapas (em desc);

alter table databook_etapas enable row level security;
