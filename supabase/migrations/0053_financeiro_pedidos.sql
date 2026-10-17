-- Aba Financeiro → Pedidos — pedido do usuário (17/10/2026): os pedidos de
-- venda do ERP (VE_PEDIDO / VE_PEDIDOITENS desde 2024, consulta SQL passada
-- pelo usuário), um item por linha. Separado do financeiro_resumo pra o painel
-- não carregar ~6 mil linhas toda vez: a aba Pedidos busca só quando abre.
-- Gravado por scripts/sincronizar_financeiro.py::sincronizar_pedidos (ciclo de
-- 15 min, só quando muda). RLS ligado e SEM policy, igual ao 0029: só o
-- servidor do site (rota /api/financeiro/pedidos, que confere o usuário).
create table financeiro_pedidos (
  id smallint primary key default 1 check (id = 1),  -- uma linha só
  dados jsonb not null,
  gerado_em timestamptz not null default now()
);
alter table financeiro_pedidos enable row level security;
