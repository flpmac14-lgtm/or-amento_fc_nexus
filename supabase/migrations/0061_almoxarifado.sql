-- Almoxarifado (leandro) — pedido do usuário (28/10/2026): digitar a MAC ou o
-- pedido e ver tudo o que o Compras pensou (a lista mãe do projeto = Material
-- de compra / MACLM, os pedidos de compra do Sectra e os itens do Follow up),
-- ir conferindo o que chegou e tirar foto do que chegou, como na Pintura.
-- Quem lê e grava é a rota /api/follow-up/almoxarifado (confere o login);
-- RLS ligado e SEM policy, igual ao 0054/0058.

-- Um "chegou" por linha conferida. chave:
--   "ml:<PO+IT+POS>|<CODIGO>" = linha da lista mãe (MACLM);
--   "pc:<nº do pedido de compra>"  = pedido de compra do Sectra;
--   "fu:<id do item do Follow up>" = peça do Follow up (terceirizado).
create table almox_conferencia (
  chave text primary key,
  mac text not null,           -- "723.26"
  observacao text,
  por text,                    -- login de quem conferiu
  em timestamptz not null default now()
);
create index almox_conferencia_mac_idx on almox_conferencia (mac);
alter table almox_conferencia enable row level security;

-- Fotos do que chegou (a imagem fica em follow_up_midias, por hash, igual às
-- fotos do Follow up e da Pintura). chave = a mesma da conferência; vazia =
-- foto geral da MAC.
create table almox_fotos (
  id uuid primary key default gen_random_uuid(),
  mac text not null,
  chave text,
  rotulo text,                 -- ex.: "PC 8769 · BRASVEDA" (pra mostrar sem recalcular)
  midia_sha256 text not null references follow_up_midias(sha256),
  observacao text,
  por text,
  em timestamptz not null default now()
);
create index almox_fotos_mac_idx on almox_fotos (mac, em desc);
alter table almox_fotos enable row level security;
