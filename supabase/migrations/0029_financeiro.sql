-- Aba Financeiro — pedido explícito do usuário: os números do
-- "DashboardIndustrial" (faturamento, custos por grupo, entrada de pedidos,
-- carteira aberta e o budget) dentro do app, SÓ pra conta flpmac14.
-- O ERP (SQL Server) só existe na rede da fábrica: scripts/sincronizar_financeiro.py
-- roda nesta máquina, lê o ERP (só SELECT) e grava aqui um resumo.
-- RLS ligado e SEM policy: a chave pública (anon/authenticated) não lê nada;
-- só o servidor do site (service_role, rota /api/financeiro, que confere o
-- usuário) e o script.
create table financeiro_resumo (
  id smallint primary key default 1 check (id = 1),  -- uma linha só
  dados jsonb not null,
  gerado_em timestamptz not null default now()
);
alter table financeiro_resumo enable row level security;

-- Budget (meta de faturamento R$ e % de custo por grupo, por mês "AAAA-MM") —
-- veio do data/budget.json do DashboardIndustrial; editável na aba.
create table financeiro_budget (
  id smallint primary key default 1 check (id = 1),
  dados jsonb not null default '{"faturamento": {}, "custos_pct": {}}',
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
alter table financeiro_budget enable row level security;
