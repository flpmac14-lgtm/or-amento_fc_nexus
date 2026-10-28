-- Fornecedores — pedido do usuário (28/10/2026): aba "Fornecedores" pro
-- almoxarifado (leandro), da planilha J:\6 - PCP\PCP-Fornecedor\FORNECEDOR.xlsx
-- (aba FN = cadastro, aba FM = nome de cada código de grupo), organizada por
-- grupos e fácil de pesquisar (telefone, e-mail, contato, endereço).
-- Gravada por services/calc_engine/app/fornecedores.py (junto do ciclo de 15 min
-- do Material de compra), só quando o arquivo muda. Uma linha só (jsonb). A tabela "fornecedores" (0001) é outra: a dos orçamentos.
-- RLS ligado e SEM policy: quem lê é a rota /api/follow-up/fornecedores.
create table fornecedores_planilha (
  id smallint primary key default 1 check (id = 1),
  dados jsonb not null,               -- {"fornecedores": [...], "grupos": {...}}
  arquivo text,
  arquivo_sha256 text,
  arquivo_modificado_em timestamptz,
  gerado_em timestamptz not null default now()
);
alter table fornecedores_planilha enable row level security;
