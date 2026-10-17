-- Data book — apontamento por etapa (0051): liga o apontamento à troca de
-- ST.BOOK que ele fez (Rastreabilidade / Montando book / Fim de book), pra o
-- 🗑 Excluir voltar o ST.BOOK mesmo depois de a hora ter sido editada.
alter table databook_etapas add column st_historico_id bigint;
