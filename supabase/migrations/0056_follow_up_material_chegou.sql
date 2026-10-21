-- Follow up — pedido do usuário (21/10/2026): tique "M.Chegou" ao lado do
-- F.Material, marcado quando o material chega do fornecedor. Com o tique, a
-- linha deixa de ficar vermelha (o F.Material fica marcado como histórico).
alter table follow_up_itens add column material_chegou boolean not null default false;
