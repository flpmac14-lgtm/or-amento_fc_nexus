-- Documentos — pedido do usuário (11/11/2026): aba principal onde ele cria
-- pastas (dá o nome) e anexa/tira documentos PDF. Só o flpmac14 por enquanto;
-- cada linha tem dono (e-mail) pra abrir pra outras contas sem mudar a tabela.
-- RLS ligado e SEM policy: só /api/documentos lê e grava (confere o login).
-- Os PDFs ficam no bucket privado "documentos" (caminho <pasta_id>/<uuid>.pdf).
create table documentos_pastas (
  id uuid primary key default gen_random_uuid(),
  dono text not null,
  nome text not null,
  criado_em timestamptz not null default now()
);
create index documentos_pastas_dono_idx on documentos_pastas (dono, nome);
alter table documentos_pastas enable row level security;

create table documentos_arquivos (
  id uuid primary key default gen_random_uuid(),
  pasta_id uuid not null references documentos_pastas (id) on delete cascade,
  dono text not null,
  nome text not null,          -- nome original do arquivo
  objeto text not null unique, -- caminho no bucket
  tamanho bigint,
  criado_em timestamptz not null default now()
);
create index documentos_arquivos_pasta_idx on documentos_arquivos (pasta_id, nome);
alter table documentos_arquivos enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documentos', 'documentos', false, 52428800, array['application/pdf'])
  on conflict (id) do nothing;
