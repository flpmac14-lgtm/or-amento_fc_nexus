-- Agenda pessoal — pedido do usuário (19/11/2026): clicar num dia do
-- calendário e deixar um lembrete simples e objetivo; no dia (e na hora, se
-- tiver) o app avisa. Só o flpmac14 por enquanto; cada linha tem dono (e-mail).
-- RLS ligado e SEM policy: só /api/agenda lê e grava (confere o login).
create table agenda_lembretes (
  id uuid primary key default gen_random_uuid(),
  dono text not null,                     -- e-mail da conta
  data date not null,
  hora time,                              -- opcional: avisa a partir dessa hora
  texto text not null,
  visto_em timestamptz,                   -- "OK" no aviso: não avisa mais
  criado_em timestamptz not null default now()
);
create index agenda_lembretes_dono_idx on agenda_lembretes (dono, data);
alter table agenda_lembretes enable row level security;
