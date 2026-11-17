-- Pintura — entradas e saídas de tinta pelo celular do felipe (pedido do
-- usuário, 17/11/2026). A planilha original (PCP-Pintura-Estoque.xlsx) segue
-- só sendo lida a cada 15 min (0074); o estoque do app = planilha + estes
-- movimentos, e o script de 15 min grava uma planilha NOVA e organizada no J:
-- ("PCP-Pintura-Estoque (FC Nexus).xlsx"). Gravado por app/pintura_movimentos.py.

create table pintura_movimentos (
  id uuid primary key default gen_random_uuid(),
  seq bigserial unique,                    -- sequencial do lançamento
  tipo text not null check (tipo in ('entrada', 'saida')),
  item text not null,                      -- 'P:<IT da planilha>' ou 'N:<id da entrada>'
  it text,                                 -- nº do IT (entrada nova: continua a numeração)
  fabricante text,
  produto text,
  cor text,
  un_a text,
  qt_a numeric not null default 0,         -- saída: quanto saiu do componente A
  lote_a text,
  venc_a date,
  un_b text,
  qt_b numeric not null default 0,
  lote_b text,
  venc_b date,
  local text,
  mac text,                                -- obra em que foi usada / para a qual chegou (opcional)
  obs text,
  por text,                                -- login de quem lançou
  em timestamptz not null default now(),
  excluido_em timestamptz,
  excluido_por text
);
create index pintura_movimentos_item_idx on pintura_movimentos (item) where excluido_em is null;

-- Fotos tiradas depois do lançamento (imagem em follow_up_midias, por hash).
create table pintura_fotos (
  id uuid primary key default gen_random_uuid(),
  movimento_id uuid not null references pintura_movimentos(id) on delete cascade,
  midia_sha256 text not null references follow_up_midias(sha256),
  por text,
  em timestamptz not null default now()
);
create index pintura_fotos_mov_idx on pintura_fotos (movimento_id);

-- Leitura do plano de pintura pela IA: 1 vez por texto de plano (cache eterno).
create table pintura_planos_ia (
  hash text primary key,                   -- sha256 do texto normalizado
  plano text not null,
  resultado jsonb not null,                -- {sem_pintura, tintas: [{produto, cor, micras, demaos}]}
  modelo text,
  em timestamptz not null default now()
);

alter table pintura_movimentos enable row level security;
alter table pintura_fotos enable row level security;
alter table pintura_planos_ia enable row level security;
