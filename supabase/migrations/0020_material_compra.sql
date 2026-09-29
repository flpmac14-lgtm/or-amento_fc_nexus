-- Material de compra — pedido explícito do usuário: aba nova no módulo
-- Follow up, espelho da aba "MACLM" de "J:\6 - PCP\PCP-CP\MACLM.xlsx"
-- (planilha "mãe" de um projeto novo, como a Controle de obras), atualizada
-- a cada 15 min pela Tarefa Agendada "FCNexus - Sincronizar Material de compra"
-- (services/calc_engine/scripts/sincronizar_material_compra.py). Só as 22
-- colunas pedidas, na ordem pedida (ver app/material_compra.py).
-- A planilha é a fonte da verdade: quando o arquivo muda (hash), as linhas
-- são substituídas por inteiro. RLS sem policy: só o calc_engine / script.

create table material_compra_linhas (
  linha_planilha int primary key,
  valores jsonb not null           -- array na ordem de material_compra_status.colunas
);

create table material_compra_status (
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

alter table material_compra_linhas enable row level security;
alter table material_compra_status enable row level security;
