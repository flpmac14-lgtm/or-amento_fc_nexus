-- Serviço interno Macfab no totem — pedido do usuário (16/11/2026).
-- Além da parada, o operador aponta tempo produtivo sem OP (serviço interno da fábrica),
-- escolhendo o setor: USINAGEM, CALDEIRARIA ou SOLDA (vai no campo motivo).
alter table prod_apontamentos drop constraint if exists prod_apontamentos_tipo_check;
alter table prod_apontamentos add constraint prod_apontamentos_tipo_check
  check (tipo in ('producao', 'setup', 'parada', 'interno'));

-- Parada e serviço interno não têm etapa; produção e setup sempre têm.
alter table prod_apontamentos drop constraint if exists prod_apontamentos_check;
alter table prod_apontamentos add constraint prod_apontamentos_check
  check (tipo in ('parada', 'interno') or etapa_id is not null);
