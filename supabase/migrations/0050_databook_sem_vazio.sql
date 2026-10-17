-- Data book — pedido do usuário (17/10/2026): o status "Vazio" escrito sai.
-- Todos os pedidos com ST.BOOK "Vazio" (qualquer maiúscula/minúscula) ficam
-- sem status (null). Cada um ganha uma linha no registro (databook_historico)
-- pra dar pra ver de onde veio.
insert into databook_historico (item_id, campo, de, para, por, em)
select id, 'st_book', st_book, null, 'limpeza Vazio', now()
from databook_itens
where lower(trim(st_book)) = 'vazio';

update databook_itens
set st_book = null
where lower(trim(st_book)) = 'vazio';
