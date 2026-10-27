-- Canal de Escuta do Colaborador — pedido do usuário (26/10/2026): os relatos
-- anônimos do formulário público (macfab.com.br/canal-de-escuta) chegam aqui e
-- aparecem na tela /canal-escuta (só o flpmac14). De propósito NÃO guarda IP,
-- e-mail nem horário do envio — só a data —, como o formulário promete.
-- RLS ligado e SEM policy: quem grava é /api/publico/canal-escuta e quem lê e
-- altera é /api/canal-escuta (confere o login).
create table canal_escuta_relatos (
  numero serial primary key,
  data date not null,                        -- dia do envio (horário de Brasília), sem hora
  setor text,
  assuntos text[] not null default '{}',     -- "Outro: <texto>" quando marcou Outro
  frequencia text,
  impactos text[] not null default '{}',
  relato text not null,
  onde text,
  sugestao text,
  -- Tratativa do RH
  status text not null default 'Novo' check (status in ('Novo', 'Em análise', 'Concluído', 'Arquivado')),
  observacoes_rh text,
  atualizado_em timestamptz,
  atualizado_por text                        -- e-mail de quem mudou status/observação
);
create index canal_escuta_relatos_data_idx on canal_escuta_relatos (data desc);
alter table canal_escuta_relatos enable row level security;
