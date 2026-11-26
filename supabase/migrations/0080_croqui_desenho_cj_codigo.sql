-- Croqui de corte — colunas DesenhoCJ (S) e CODIGO (X) da MACLM, do lado do
-- Desenho (pedido do usuário, 26/11/2026).
alter table croqui_corte_itens add column if not exists desenho_cj text;
alter table croqui_corte_itens add column if not exists codigo text;
