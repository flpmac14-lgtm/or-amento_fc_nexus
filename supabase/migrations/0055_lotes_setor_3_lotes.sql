-- Lote da Pintura com 3 lotes — pedido do usuário (20/10/2026): ao apontar,
-- o pintor preenche Lote 1, Lote 2 e Lote 3 (mesma folha do relatório de
-- coleta, que já tem N° Lote 1/2/3). "lote" continua sendo o Lote 1.
alter table lotes_setor alter column lote drop not null;
alter table lotes_setor add column lote2 text;
alter table lotes_setor add column lote3 text;
