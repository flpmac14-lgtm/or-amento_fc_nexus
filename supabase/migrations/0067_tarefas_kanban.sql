-- Tarefas (Kanban pessoal) — pedido do usuário (09/11/2026): quadro A fazer /
-- Em andamento / Concluído pra organizar as próprias tarefas, aba principal só
-- do flpmac14. Cada linha é de um dono (e-mail), pronto pra abrir pra outras
-- contas no futuro sem mudar a tabela.
-- RLS ligado e SEM policy: só /api/tarefas lê e grava (confere o login).
create table tarefas_kanban (
  id uuid primary key default gen_random_uuid(),
  dono text not null,                                  -- e-mail da conta
  titulo text not null,
  descricao text,
  coluna text not null default 'a_fazer' check (coluna in ('a_fazer', 'em_andamento', 'concluido')),
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta')),
  prazo date,
  ordem double precision not null default 0,           -- posição dentro da coluna (menor = em cima)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create index tarefas_kanban_dono_idx on tarefas_kanban (dono, coluna, ordem);
alter table tarefas_kanban enable row level security;
