-- Aba "Backup Recebimento" — pedido explícito do usuário: mesma lista da aba
-- QUALIDADE, mas da pasta "BACKUP RECEBIMENTO 20260828", também sincronizada
-- (com sininho e download do PDF). Uma linha por pasta em qualidade_certificados
-- (1 = principal, 2 = backup) e a coluna "fonte" nos avisos e nos pedidos de PDF.
alter table qualidade_certificados drop constraint if exists qualidade_certificados_id_check;
alter table qualidade_certificados add constraint qualidade_certificados_id_check check (id in (1, 2));

alter table qualidade_notificacoes
  add column fonte text not null default 'principal' check (fonte in ('principal', 'backup'));

alter table qualidade_pdf_pedidos
  add column fonte text not null default 'principal' check (fonte in ('principal', 'backup'));
