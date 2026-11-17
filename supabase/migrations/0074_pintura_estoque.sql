-- Pintura — pedido do usuário (17/11/2026): aba principal "Pintura" no menu,
-- espelho de "J:\6 - PCP\PCP-Pintura\PCP-Pintura-Estoque.xlsx" (abas Estoque e
-- Tinta), atualizado a cada 15 min junto da tarefa da Controle de obras.
-- A planilha é a fonte da verdade: quando o arquivo muda (hash), as linhas são
-- regravadas por inteiro. RLS sem policy: só o calc_engine lê/grava.

create table pintura_linhas (
  aba text not null,               -- 'estoque' | 'tinta'
  linha_planilha int not null,
  valores jsonb not null,          -- array na ordem de pintura_status.colunas->aba
  primary key (aba, linha_planilha)
);

create table pintura_status (
  id int primary key default 1 check (id = 1),
  arquivo text not null,
  colunas jsonb not null,          -- {estoque: [{letra, cabecalho, campo, tipo}], tinta: [...]}
  linhas jsonb not null,           -- {estoque: n, tinta: n}
  arquivo_sha256 text not null,
  arquivo_modificado_em timestamptz,
  ultima_alteracao_em timestamptz not null,
  ultima_verificacao_em timestamptz not null,
  ultimo_erro text,
  ultimo_erro_em timestamptz
);

alter table pintura_linhas enable row level security;
alter table pintura_status enable row level security;
