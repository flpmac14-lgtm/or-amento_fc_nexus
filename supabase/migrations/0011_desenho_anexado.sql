-- "Anexar desenho" — pedido explícito do usuário: o PDF usado pra extrair
-- a lista de materiais pode ficar vinculado ao orçamento salvo, mas SÓ
-- quando o usuário clicar em "Anexar desenho" (nunca automático na
-- extração). Na lista "Orçamentos salvos" isso vira um ícone
-- vermelho/cinza indicando se aquele orçamento tem desenho anexado.
--
-- Bucket privado (não público) — só usuários autenticados (é o único tipo
-- de usuário desse app, login obrigatório) leem/escrevem, via policy
-- abaixo. Path de cada arquivo: "<orcamento_id>/<timestamp>-<nome>".
insert into storage.buckets (id, name, public)
values ('desenhos-anexados', 'desenhos-anexados', false)
on conflict (id) do nothing;

create policy "authenticated_rw_desenhos_anexados" on storage.objects
  for all
  using (bucket_id = 'desenhos-anexados' and auth.role() = 'authenticated')
  with check (bucket_id = 'desenhos-anexados' and auth.role() = 'authenticated');

alter table orcamentos_salvos
  add column desenho_storage_path text,
  add column desenho_nome_arquivo text;
