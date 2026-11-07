-- Ordens de produção + apontamento por totem — pedido do usuário (07/11/2026):
-- o PCP clica num pedido do Follow up, escolhe as etapas (operações / centros
-- produtivos cadastrados no Sectra) e gera a OP; nos totens da fábrica o
-- operador digita o nº do crachá do Sectra e aponta início / pausa / fim de
-- cada etapa.
--
-- O Sectra (ERP) é só leitura (regra combinada): os cadastros vêm de lá a cada
-- 15 min (scripts/sincronizar_producao.py → prod_cadastros) e as OPs e
-- apontamentos ficam aqui. Quem lê e grava é a rota /api/follow-up/producao
-- (confere o login); RLS ligado e SEM policy, igual ao 0054/0058/0061.

-- Espelho dos cadastros do Sectra, um JSON por tipo:
--   operadores (RH_FUNCIONARIO + RH_FUNCIONARIOCRACHA: código, nome, apelido, crachá — nada de dado pessoal),
--   centros (PR_CENTROPROD), operacoes (PR_OPERACAO), roteiros_padrao (PR_ROTEIROPADRAO + ITENS),
--   roteiros_desenho (PR_DESENHO + PR_DESENHOROTEIROOPCAO + PR_DESENHOROTEIRO), motivos (PR_TPINATIVO).
create table prod_cadastros (
  id text primary key,
  dados jsonb not null,
  gerado_em timestamptz not null default now()
);
alter table prod_cadastros enable row level security;

-- Ordem de produção (numeração própria do FC Nexus, não é a do Sectra).
create table prod_ops (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  item_id uuid references follow_up_itens(id) on delete set null,  -- pedido do Follow up de origem
  po text,
  mac text,
  cliente text,
  desenho text,
  descricao text,
  quantidade numeric not null check (quantidade > 0),
  prazo date,
  prioridade smallint not null default 2 check (prioridade between 1 and 3),  -- 1 urgente, 2 normal, 3 baixa
  -- aguardando = criada, ainda não foi pra fábrica; liberada = em produção (aparece no totem);
  -- encerrada = todas as etapas concluídas (ou encerrada pelo PCP); cancelada.
  status text not null default 'aguardando' check (status in ('aguardando', 'liberada', 'encerrada', 'cancelada')),
  roteiro_origem text,            -- "Roteiro do desenho 10010386", "Roteiro padrão 1 - BASES USINADAS", "Manual"
  observacao text,
  criado_por text,
  criado_em timestamptz not null default now(),
  liberado_por text,
  liberado_em timestamptz,
  encerrado_em timestamptz,
  cancelado_motivo text
);
create index prod_ops_status_idx on prod_ops (status, prioridade, prazo);
create index prod_ops_item_idx on prod_ops (item_id);
alter table prod_ops enable row level security;

-- Etapas (roteiro) da OP, na ordem da posição (10, 20, 30…), igual ao Sectra.
create table prod_op_etapas (
  id uuid primary key default gen_random_uuid(),
  op_id uuid not null references prod_ops(id) on delete cascade,
  posicao int not null,
  operacao text,                  -- código PR_OPERACAO ("00.90")
  operacao_desc text,             -- "USINAGEM"
  centro text,                    -- código PR_CENTROPROD ("UC", "FRD01")
  centro_desc text,               -- "USINAGEM CONVENCIONAL"
  descricao text,                 -- instrução da etapa
  hr_preparo numeric not null default 0,   -- horas previstas de preparação (setup)
  hr_unitario numeric not null default 0,  -- horas previstas por peça
  qtde_produzida numeric not null default 0,
  concluido_em timestamptz,
  concluido_por text,
  unique (op_id, posicao)
);
create index prod_op_etapas_op_idx on prod_op_etapas (op_id, posicao);
alter table prod_op_etapas enable row level security;

-- Apontamentos do totem. tipo: producao | setup (preparação) | parada (sem OP:
-- falta de material, aguardando engenharia…). fim nulo = em aberto.
create table prod_apontamentos (
  id uuid primary key default gen_random_uuid(),
  op_id uuid references prod_ops(id) on delete cascade,
  etapa_id uuid references prod_op_etapas(id) on delete cascade,
  operador_codigo int not null,   -- RH_FUNCIONARIO.CODIGO do Sectra
  operador_nome text,
  cracha text,
  tipo text not null check (tipo in ('producao', 'setup', 'parada')),
  motivo text,                    -- parada: motivo; pausa: motivo da pausa
  inicio timestamptz not null default now(),
  fim timestamptz,
  fim_tipo text check (fim_tipo in ('pausa', 'fim', 'troca', 'correcao')),
  qtde numeric,                   -- peças boas apontadas ao fechar
  encerrou_etapa boolean not null default false,
  observacao text,
  origem text,                    -- login do totem / quem lançou
  check (tipo = 'parada' or etapa_id is not null)
);
-- Um operador só tem um apontamento aberto por vez.
create unique index prod_apontamentos_aberto_idx on prod_apontamentos (operador_codigo) where fim is null;
create index prod_apontamentos_etapa_idx on prod_apontamentos (etapa_id);
create index prod_apontamentos_op_idx on prod_apontamentos (op_id);
create index prod_apontamentos_inicio_idx on prod_apontamentos (inicio desc);
alter table prod_apontamentos enable row level security;
