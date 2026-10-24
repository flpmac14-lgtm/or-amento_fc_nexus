-- Coluna "Compra / Retorno" do Follow up — pedido do usuário (24/10/2026): de
-- cada item terceirizado, o pedido de compra no Sectra (ERP), a nossa remessa
-- e as notas de entrada (serviço / retorno) que o Financeiro já lançou. O
-- vínculo é pelo nº do desenho escrito nos textos do ERP (ver
-- scripts/sincronizar_financeiro.py::sincronizar_compras, ciclo de 15 min, só
-- grava quando muda). Só número, data, fornecedor, quantidade e status (sem
-- valores). RLS ligado e SEM policy, igual ao 0054: quem lê é a rota
-- /api/follow-up/compras (confere o login).
create table follow_up_compras (
  id smallint primary key default 1 check (id = 1),  -- uma linha só
  dados jsonb not null,  -- {"<id do item>": {"pc": [...], "rem": [...], "ent": [...]}}
  gerado_em timestamptz not null default now()
);
alter table follow_up_compras enable row level security;
