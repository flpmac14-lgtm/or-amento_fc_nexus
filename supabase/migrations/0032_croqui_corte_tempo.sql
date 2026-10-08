-- Croqui de corte — pedido do usuário (08/10): mapear quanto tempo o
-- projetista ficou "Fazendo" até "Feito" ou até "Pausado", e o João / Honório
-- poderem corrigir (ou apagar) o dia e a hora dessas marcações.
--
-- dt_pausado: status "Pausado" grava a hora (como Fazendo/Feito).
-- tempo_anterior_min: minutos de jornada já feitos antes do último "Fazendo"
--   (Fazendo → Pausado → Fazendo soma o trecho aqui e recomeça dt_fazendo).
-- Tempo total = tempo_anterior_min + jornada(dt_fazendo → fim), fim = agora
-- (Fazendo), dt_pausado (Pausado, ou Feito vindo de Pausado) ou dt_feito.
alter table croqui_corte_itens
  add column dt_pausado timestamptz,
  add column tempo_anterior_min int not null default 0;

-- Os que já estão Pausado (desde 07/10) não tinham a hora: usa a última edição.
update croqui_corte_itens set dt_pausado = editado_em where status = 'Pausado' and editado_em is not null;
