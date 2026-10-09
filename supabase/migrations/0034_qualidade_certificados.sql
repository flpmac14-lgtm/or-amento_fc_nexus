-- Aba QUALIDADE — pedido explícito do usuário (SÓ a conta flpmac14): lista dos
-- certificados de matéria-prima da pasta do Recebimento (NRI, descrição, tipo)
-- e sininho quando um PDF é adicionado, alterado ou excluído na pasta.
-- A pasta (J:) e o ERP só existem na rede da fábrica:
-- scripts/sincronizar_certificados.py roda nesta máquina e grava aqui.
-- RLS ligado e SEM policy (igual ao Financeiro): a chave pública não lê nada;
-- só a rota /api/qualidade/certificados (confere o usuário, service_role) e o script.
create table qualidade_certificados (
  id smallint primary key default 1 check (id = 1),  -- uma linha só: a lista inteira
  dados jsonb not null,
  gerado_em timestamptz not null default now()
);
alter table qualidade_certificados enable row level security;

create table qualidade_notificacoes (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('adicionado', 'alterado', 'excluido', 'varios')),
  nri text,
  arquivo text,
  descricao text,
  criado_em timestamptz not null default now()
);
create index qualidade_notificacoes_criado_idx on qualidade_notificacoes (criado_em desc);
alter table qualidade_notificacoes enable row level security;
