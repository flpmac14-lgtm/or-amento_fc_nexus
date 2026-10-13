-- Recebimento — pedido explícito do usuário (13/10/2026): espelho da aba
-- "GERAL" (colunas A até X) de "J:\5 - Almoxarifado - Recebimento\ISO_SGQ\
-- Recebimento\CONTROLE DE RECEBIMENTO E ESTOQUE.xlsm", só pra consulta da
-- Qualidade, atualizado a cada 15 min (junto da tarefa da Controle de obras).
-- Mesmo formato do Material de compra (0020). RLS sem policy: só o calc_engine.

create table recebimento_linhas (
  linha_planilha int primary key,
  valores jsonb not null           -- array na ordem de recebimento_status.colunas
);

create table recebimento_status (
  id int primary key default 1 check (id = 1),
  arquivo text not null,
  aba text not null,
  colunas jsonb not null,                -- [{letra, cabecalho, campo, tipo}]
  linhas int not null,
  arquivo_sha256 text not null,
  arquivo_modificado_em timestamptz,
  ultima_alteracao_em timestamptz not null,
  ultima_verificacao_em timestamptz not null,
  ultimo_erro text,
  ultimo_erro_em timestamptz
);

alter table recebimento_linhas enable row level security;
alter table recebimento_status enable row level security;
