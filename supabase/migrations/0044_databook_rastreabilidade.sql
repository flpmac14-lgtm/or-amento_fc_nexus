-- Rastreabilidade no Data book — pedido do usuário (14/10/2026): não faz
-- parte do book, mas a Qualidade também aponta. ST.BOOK ganha
-- "RASTREABILIDADE" (grava o início) e "RASTREABILIDADE FINALIZADA" (grava a
-- finalização), em colunas próprias — não mexem no início/finalização do book.
-- Gravado por app/databook.py::_salvar (e recalculado no "Excluir status").
alter table databook_itens
  add column rastreab_inicio_em timestamptz,
  add column rastreab_inicio_por text,
  add column rastreab_fim_em timestamptz,
  add column rastreab_fim_por text;
