-- Corte — pedido do usuário: número sequencial de corte em cada programa
-- (bolinha no canto do cartão: 1 = 1º, 2 = 2º…) pro operador saber a ordem.
-- ordem vazia = sem ordem definida.
alter table corte_programas
  add column ordem integer check (ordem between 1 and 999),
  add column ordem_por text,
  add column ordem_em timestamptz;
