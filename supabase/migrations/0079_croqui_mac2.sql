-- Croqui de corte — coluna MAC2 (pedido do usuário, 25/11/2026): puxar também
-- a MAC2 (coluna K da MACLM) e mostrar do lado da Mac (MAC1).
alter table croqui_corte_itens add column if not exists mac2 text;
