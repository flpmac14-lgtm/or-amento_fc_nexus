-- Roteiros padrão do FC Nexus — pedido do usuário (13/11/2026): "um recurso de
-- Roteiro padrão onde eu montaria um roteiro padrão e desse a opção de salvar,
-- exemplo Roteiro padrão Base etc". O PCP monta a sequência de etapas
-- (operação + centro produtivo do Sectra + instrução + horas) uma vez, dá um
-- nome e reaproveita na Nova OP. Os roteiros padrão do Sectra continuam vindo
-- do sync (prod_cadastros.roteiros_padrao, só leitura); estes são nossos.
-- RLS ligado e SEM policy: só /api/follow-up/producao lê e grava (confere o login;
-- gravar = podePlanejarOP, flpmac14 e marcelo/PCP), igual ao 0065.
create table prod_roteiros_padrao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  observacao text,
  -- [{posicao, operacao, centro, descricao, hr_preparo, hr_unitario}] na ordem da posição
  etapas jsonb not null default '[]'::jsonb,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
create unique index prod_roteiros_padrao_nome_idx on prod_roteiros_padrao (lower(nome));
alter table prod_roteiros_padrao enable row level security;
