-- Totem: fluxo produtivo / improdutivo — pedido do usuário (13/11/2026).
-- - Peças conformes (qtde, já existia) + não conformes (qtde_refugo) com o
--   código/motivo do refugo (PR_OPPERDAMOTIVO do Sectra + lista padrão do FC Nexus).
-- - fim_tipo 'parcial': o operador apontou quantidade e continuou produzindo
--   (fecha o trecho e abre outro igual na hora).
-- - retoma_ap_id: na parada aberta a partir de um produtivo, aponta pro trecho
--   produtivo que foi pausado — na próxima vez que ele bipar o crachá o totem
--   oferece "retomar a mesma obra" (e pede a quantidade, se ainda não informou).
alter table prod_apontamentos add column if not exists qtde_refugo numeric;
alter table prod_apontamentos add column if not exists motivo_refugo text;
alter table prod_apontamentos add column if not exists retoma_ap_id uuid references prod_apontamentos(id) on delete set null;
alter table prod_apontamentos drop constraint if exists prod_apontamentos_fim_tipo_check;
alter table prod_apontamentos add constraint prod_apontamentos_fim_tipo_check
  check (fim_tipo in ('pausa', 'fim', 'troca', 'correcao', 'parcial'));
