-- Apontamento por setor (Usinagem) — pedidos do usuário:
--   1) status "Pausado": o operador para um pedido pra começar outra coisa;
--   2) "Serviço interno Macfab": usinagem pra uso próprio (manutenção,
--      ferramental, dispositivos...), sem pedido no Follow up — vira um
--      serviço em servicos_internos e o apontamento aponta pra ele;
--   3) apontar de uma vez vários pedidos ativos com o mesmo desenho (sem
--      mudança no banco: uma linha por pedido).
-- Gravado por app/apontamentos_setor.py.
alter table apontamentos_setor drop constraint apontamentos_setor_status_check;
alter table apontamentos_setor add constraint apontamentos_setor_status_check
  check (status in ('em_andamento', 'pausado', 'finalizado', 'falta_material'));

create table servicos_internos (
  id uuid primary key default gen_random_uuid(),
  setor text not null,               -- 'usinagem'
  descricao text not null,           -- o que está sendo feito (ex.: "Eixo da calandra")
  quantidade integer,                -- peças (opcional)
  por text,                          -- login de quem criou (ex.: saymon)
  em timestamptz not null default now()
);
create index servicos_internos_setor_idx on servicos_internos (setor, em desc);
alter table servicos_internos enable row level security;

-- Cada apontamento é OU de um pedido do Follow up OU de um serviço interno.
alter table apontamentos_setor alter column item_id drop not null;
alter table apontamentos_setor add column servico_id uuid references servicos_internos(id) on delete cascade;
alter table apontamentos_setor add constraint apontamentos_setor_alvo_check
  check ((item_id is null) <> (servico_id is null));
create index apontamentos_setor_servico_idx on apontamentos_setor (setor, servico_id, em desc);
