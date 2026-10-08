-- Follow up — pedido do usuário (08/10): tique "F.Material" (entre Coleta e
-- Obs. Felipe/Marcelo) quando o item está parado esperando chegar material
-- pra fabricar. Marcado = a linha fica vermelha; desmarcado = normal.
alter table follow_up_itens add column falta_material boolean not null default false;
