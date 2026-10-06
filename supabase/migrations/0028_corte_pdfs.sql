-- PDFs dos programas de corte — pedido explícito do usuário: como no Excel,
-- o nº do programa (Croqui de corte / Corte) abre o PDF do programa.
-- Os PDFs ficam no J: (rede da fábrica); scripts/sincronizar_pdfs_corte.py
-- sobe os novos/alterados pro bucket privado "programas-corte" (nome do
-- objeto = sha256 do conteúdo) e grava aqui o índice nome → programas.
-- Ver app/corte_pdfs.py.
create table corte_pdfs (
  nome text primary key,             -- nome do arquivo na pasta (ex.: 16,0mm-573.26-NC939.pdf)
  programas text[] not null,         -- nºs de programa tirados do nome (ex.: {939})
  caminho text not null,             -- objeto no bucket programas-corte (<sha256>.pdf)
  tamanho bigint not null,
  modificado_em timestamptz not null, -- data do arquivo na pasta
  sincronizado_em timestamptz not null default now()
);
create index corte_pdfs_programas_idx on corte_pdfs using gin (programas);
alter table corte_pdfs enable row level security;

insert into storage.buckets (id, name, public) values ('programas-corte', 'programas-corte', false)
  on conflict (id) do nothing;

-- Qualquer usuário logado do app pode abrir (link assinado); só o script
-- (service_role) grava.
create policy "programas-corte leitura logado" on storage.objects
  for select to authenticated using (bucket_id = 'programas-corte');
