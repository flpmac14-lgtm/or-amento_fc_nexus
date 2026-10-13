-- Data book — pedido explícito do usuário (13/10/2026): "filha" da Controle
-- de obras (como o Follow up), trazida da aba "Geral Data book" de
-- "J:\6 - PCP\Controle de databook.xlsm". Importada uma vez; depois quem
-- preenche é o app (Qualidade: ana, carol, pedro).
--
-- Chave = PO (coluna C). Fixas (PROCV D:O + META na planilha, travadas no
-- app, atualizadas pela mãe a cada 15 min): cliente, st, quantidade, desenho,
-- descricao, revisao, mac, cor1, cor2, plano_pintura, prazo_contratual, nf,
-- meta. Editáveis: st_book (lista PRONTO / FAZENDO / SEM BOOK / Vazio /
-- Pronto Aguardando Coleta) e observacao (coluna Q). D.FINALIZAÇÃO e
-- AUTOR(A) (A/B) = quando e quem pôs o ST.BOOK como pronto.
-- Pedidos ST = A da mãe que ainda não estão aqui entram sozinhos (no fim) e
-- vão pro sininho — app/databook.py.
create table databook_itens (
  id uuid primary key default gen_random_uuid(),
  po text not null,
  cliente text,
  st text,
  quantidade numeric,
  desenho text,
  descricao text,
  revisao text,
  mac text,
  cor1 text,
  cor2 text,
  plano_pintura text,
  prazo_contratual date,
  nf text,
  meta text,
  st_book text,
  observacao text,
  finalizado_em timestamptz,          -- D.FINALIZAÇÃO
  finalizado_por text,                -- AUTOR(A)
  linha_planilha int not null,        -- ordem (linha na planilha; novos entram no fim)
  origem text not null check (origem in ('importacao_planilha', 'controle_obras')),
  mae_linha int,
  mae_sincronizada_em timestamptz,
  editado_em timestamptz,
  editado_por text,
  created_at timestamptz not null default now()
);

-- Não é unique: a planilha tem 36 PO repetidos.
create index databook_itens_po_idx on databook_itens (upper(po));
create index databook_itens_linha_idx on databook_itens (linha_planilha);

-- Sininho: pedido novo que entrou, pedido que saiu de ativo (entregue → fazer o
-- book) ou voltou a ativo.
create table databook_notificacoes (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('novo', 'encerrado', 'reaberto')),
  item_id uuid references databook_itens(id) on delete cascade,
  po text,
  cliente text,
  descricao text,
  st_antes text,
  st_depois text,
  criado_em timestamptz not null default now()
);
create index databook_notificacoes_criado_idx on databook_notificacoes (criado_em desc);

-- Estado da propagação (egress, igual 0025): só relê a mãe quando ela mudou.
create table databook_status (
  id int primary key default 1 check (id = 1),
  propagado_sha256 text,
  propagado_itens int
);

alter table databook_itens enable row level security;
alter table databook_notificacoes enable row level security;
alter table databook_status enable row level security;
