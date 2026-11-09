-- Follow up: imagem colada pelo app vira a principal (pedido do usuário 07/11/2026:
-- "quando eu mudo a imagem no follow up precisa mudar para todos, até no croqui de corte").
-- Todas as telas mostram a 1ª imagem por "ordem"; as enviadas pelo app iam pro fim.
-- Daqui pra frente o app grava na frente (ordem negativa); aqui reposiciono as já enviadas:
-- a mais recente fica em primeiro.
update follow_up_imagens i
   set ordem = r.nova
  from (
    select id, -row_number() over (partition by item_id order by created_at asc, id) as nova
      from follow_up_imagens
     where origem = 'enviada_app'
  ) r
 where r.id = i.id;
