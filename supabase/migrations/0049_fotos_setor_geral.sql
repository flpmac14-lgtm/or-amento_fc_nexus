-- Foto geral — pedido do usuário (16/10/2026): além das fotos por pedido
-- (0048), uma aba "Foto geral" pra registrar fotos de qualidade sem pedido
-- do Follow up (ex.: condição da cabine, calibração do medidor de camada).
-- item_id vazio = foto geral do setor.
alter table fotos_setor alter column item_id drop not null;

create index fotos_setor_geral_idx on fotos_setor (setor, em desc) where item_id is null;
