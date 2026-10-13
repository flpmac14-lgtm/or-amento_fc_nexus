-- Apontamento da Pintura — pedido do usuário (13/10/2026): o felipe (setor de
-- pintura) aponta pelo celular, como jeferson/diego na Caldeiraria, com as
-- etapas da pintura: Iniciado, Pintura de fundo, Acabamento, Pausa, Falta
-- material, Pintura finalizada. "fundo" e "acabamento" contam como em
-- andamento (app/apontamentos_setor.py::ATIVOS).
alter table apontamentos_setor drop constraint apontamentos_setor_status_check;
alter table apontamentos_setor add constraint apontamentos_setor_status_check
  check (status in ('em_andamento', 'fundo', 'acabamento', 'pausado', 'finalizado', 'falta_material'));
