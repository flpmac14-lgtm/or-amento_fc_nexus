-- Calendário de apontamento — pedido do usuário (13/11/2026): sub-aba em Ordens
-- de produção com um calendário; clicar numa data e marcar como feriado faz o
-- apontamento NÃO contar as horas daquele dia (igual sábado/domingo).
-- Vale pro cálculo de horas do apontamento (totem, OPs, chão de fábrica…);
-- os horários de início/fim gravados não mudam, só a soma.
-- RLS ligado e SEM policy: só /api/follow-up/producao lê e grava (gravar =
-- podePlanejarOP, flpmac14 e marcelo/PCP), igual ao 0065.
create table prod_feriados (
  data date primary key,
  descricao text,
  criado_por text,
  criado_em timestamptz not null default now()
);
alter table prod_feriados enable row level security;
