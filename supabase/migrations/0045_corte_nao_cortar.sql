-- Corte — pedido do usuário (14/10/2026): digitar X na bolinha da sequência
-- (Laser/Oxicorte) marca o programa como "não é para cortar" (X vermelho).
-- Usa ordem_por/ordem_em pra quem/quando; X e número não convivem.
alter table corte_programas add column nao_cortar boolean not null default false;
