-- Data book — pedido do usuário (13/10/2026): a Qualidade pode excluir um
-- ST.BOOK marcado errado. Excluir desfaz a última troca de ST.BOOK ainda não
-- desfeita (volta pro status anterior e recalcula início/finalização pelo
-- histórico); a troca desfeita fica marcada aqui e a exclusão vira uma linha
-- 'st_book_excluido' no registro (app/databook.py::excluir_status).
alter table databook_historico add column desfeito boolean not null default false;
