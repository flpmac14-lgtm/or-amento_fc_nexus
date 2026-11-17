-- Pintura — scanner do "quadradinho" (DataMatrix GS1) das latas (pedido do
-- usuário, 17/11/2026). O quadradinho da WEG traz GTIN (01), lote (10),
-- código do produto WEG (240) e às vezes fabricação (11) e validade (16/17),
-- mas NÃO traz nome nem cor. O app aprende "código -> produto" na primeira
-- entrada daquele código e, dali em diante, preenche sozinho (sem IA).

create table pintura_codigos (
  codigo text primary key,          -- código WEG (AI 240) ou, sem ele, o GTIN (AI 01)
  gtin text,
  produto text not null,
  fabricante text,
  cor text,
  componente text check (componente in ('A', 'B')),
  un text,
  por text,
  em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table pintura_codigos enable row level security;

alter table pintura_movimentos add column codigo_a text, add column codigo_b text;
