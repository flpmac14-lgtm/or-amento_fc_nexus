-- Relatório de coleta "com Nota fiscal" — pedido do usuário (20/10/2026): a NF
-- de cada pedido e o dia de emissão, vindos do ERP (FN_NFS / FN_NFSITENS pelo
-- PEDCOMPRA + PEDCOMPRAITEM). Só número da nota e data (sem valores).
-- Gravado por scripts/sincronizar_financeiro.py::sincronizar_notas_pedido
-- (ciclo de 15 min, só quando muda). RLS ligado e SEM policy, igual ao 0029:
-- quem lê é a rota /api/follow-up/notas-fiscais (confere o login).
create table follow_up_notas_fiscais (
  id smallint primary key default 1 check (id = 1),  -- uma linha só
  dados jsonb not null,  -- {"po": {"4501690746-010": [["8039", "2026-10-16"]]}, "nf": {"8039": "2026-10-16"}}
  gerado_em timestamptz not null default now()
);
alter table follow_up_notas_fiscais enable row level security;
