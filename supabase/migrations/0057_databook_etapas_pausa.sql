-- Data book — apontamento por etapa (0051): opção Pausar além de Início e
-- Finalizado — pedido do usuário (21/10/2026). Etapa pausada volta com
-- "Retomar" (um novo 'inicio' depois da pausa continua o mesmo ciclo) e o
-- tempo parado não conta no ⏱.
alter table databook_etapas drop constraint databook_etapas_acao_check;
alter table databook_etapas add constraint databook_etapas_acao_check check (acao in ('inicio', 'pausa', 'fim'));
