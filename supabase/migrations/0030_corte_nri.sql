-- Corte (laser) — pedido do usuário: ao apontar o programa, o operador
-- também anota o número do NRI (só números). Um NRI por programa, com quem
-- e quando gravou. Gravado por app/corte.py::salvar_nri().
alter table corte_programas
  add column nri text,
  add column nri_por text,
  add column nri_em timestamptz;
