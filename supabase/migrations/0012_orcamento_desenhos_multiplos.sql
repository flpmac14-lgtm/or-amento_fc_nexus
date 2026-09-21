-- Múltiplos desenhos por orçamento (pedido explícito do usuário: "ou até
-- mais que 1") — antes só dava pra anexar 1 PDF (colunas
-- desenho_storage_path/desenho_nome_arquivo em orcamentos_salvos, ver
-- 0011_desenho_anexado.sql). Essas colunas ficam paradas aqui (não
-- apagamos dado de produção), mas o app passa a usar só esta tabela nova
-- daqui pra frente — cada anexo é uma linha independente, sem limite de
-- quantidade.
create table orcamento_desenhos (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references orcamentos_salvos(id) on delete cascade,
  storage_path text not null,
  nome_arquivo text not null,
  created_at timestamptz not null default now()
);

create index on orcamento_desenhos (orcamento_id);

-- Migra o único anexo que já existia (se houver) pra não perder dado.
insert into orcamento_desenhos (orcamento_id, storage_path, nome_arquivo, created_at)
select id, desenho_storage_path, desenho_nome_arquivo, updated_at
from orcamentos_salvos
where desenho_storage_path is not null;
