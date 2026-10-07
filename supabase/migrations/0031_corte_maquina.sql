-- Corte — pedido do usuário: programa com 4 algarismos é do Laser, com 3 é
-- do Oxicorte; mas às vezes um corta o do outro, então o operador pode trocar.
-- maquina vazia = vale a regra dos algarismos (app/corte.py::maquina_padrao).
alter table corte_programas
  add column maquina text check (maquina in ('laser', 'oxicorte')),
  add column maquina_por text,
  add column maquina_em timestamptz;
