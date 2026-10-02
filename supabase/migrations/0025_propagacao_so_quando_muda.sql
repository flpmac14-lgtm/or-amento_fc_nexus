-- Egress do Supabase estourou o plano (alerta de 02/10/2026): a propagação
-- mãe → filha relia a mãe inteira a cada 15 min mesmo sem mudança
-- (Controle de obras ~9 MB → Follow up; Material de compra ~36 MB → Croqui).
-- Guarda o hash da mãe já propagado e quantos itens a filha tinha depois:
-- se os dois baterem, a rodada é pulada (app/follow_up_mae.py e app/croqui_corte.py).
alter table controle_obras_status
  add column propagado_sha256 text,
  add column propagado_itens integer;

alter table material_compra_status
  add column propagado_sha256 text,
  add column propagado_itens integer;
