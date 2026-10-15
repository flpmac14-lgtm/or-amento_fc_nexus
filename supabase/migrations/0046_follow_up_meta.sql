-- Follow up — pedido do usuário (15/10/2026): a coluna META da Controle de
-- obras (aba OBRAS) vem pro Follow up pelo PROCV do PO, como os outros campos
-- da mãe; aparece logo depois da Obs. Felipe / Marcelo.
alter table follow_up_itens add column if not exists meta date;
