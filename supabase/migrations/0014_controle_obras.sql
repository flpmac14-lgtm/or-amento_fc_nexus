-- Controle de obras — pedido explícito do usuário: espelho da aba "OBRAS"
-- (colunas H até AB) da planilha "J:\6 - PCP\Controle de obras.xlsm",
-- atualizado automaticamente a cada 15 min por uma Tarefa Agendada nesta
-- máquina (services/calc_engine/scripts/sincronizar_controle_obras.py) —
-- o arquivo fica no servidor local da empresa, o Render não enxerga o J:.
--
-- A planilha é a fonte da verdade: a cada alteração do arquivo (hash
-- diferente) as linhas são substituídas por inteiro. Não há dado editado no
-- app pra preservar, e o PO se repete no histórico (não serve de chave).
--
-- RLS ligado sem policy (igual 0013): só o calc_engine / script acessam.

create table controle_obras_linhas (
  linha_planilha int primary key,  -- linha na aba OBRAS
  valores jsonb not null           -- array na ordem de controle_obras_status.colunas
);

-- Uma linha só (id = 1): estado da última sincronização.
create table controle_obras_status (
  id int primary key default 1 check (id = 1),
  arquivo text not null,
  aba text not null,
  intervalo text not null,               -- ex.: "H:AB"
  colunas jsonb not null,                -- [{letra, cabecalho, campo, tipo}]
  linhas int not null,
  arquivo_sha256 text not null,
  arquivo_modificado_em timestamptz,     -- data do arquivo no J:
  ultima_alteracao_em timestamptz not null,  -- quando os dados mudaram no app
  ultima_verificacao_em timestamptz not null,
  ultimo_erro text,
  ultimo_erro_em timestamptz
);

alter table controle_obras_linhas enable row level security;
alter table controle_obras_status enable row level security;
