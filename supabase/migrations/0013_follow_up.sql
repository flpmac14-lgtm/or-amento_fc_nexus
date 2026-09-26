-- Aba FOLLOW UP — pedido explícito do usuário: transformar a aba "Gerencia"
-- da planilha "Gerenciamento de obras ativas.xlsb" num módulo nativo do app.
-- O Excel continua sendo a FONTE de atualização (botão "Importar /
-- Atualizar Follow Up"), mas depois de importado o app não depende mais
-- dele: tudo fica aqui.
--
-- Quem lê/escreve é só o calc_engine (conexão direta ao Postgres, que
-- ignora RLS). RLS fica LIGADO e sem policy de propósito: assim essas
-- tabelas não ficam expostas pela API REST pública do Supabase (chave anon).

-- Cada importação feita (histórico + regras de formatação daquela versão).
create table follow_up_importacoes (
  id uuid primary key default gen_random_uuid(),
  arquivo_nome text not null,
  arquivo_sha256 text not null,     -- identifica o arquivo exato importado
  arquivo_bytes bigint not null,
  aba text not null,
  importado_em timestamptz not null default now(),
  linhas_lidas int not null,
  inseridos int not null,
  atualizados int not null,
  inalterados int not null,
  ausentes int not null,            -- estavam no app, não vieram nesta planilha
  imagens_vinculadas int not null,
  colunas jsonb not null,           -- [{campo, cabecalho, letra, formato}]
  regras_formatacao jsonb not null, -- formatação condicional da aba, como veio do Excel
  indicadores jsonb not null,       -- células acima do cabeçalho (ex.: "Peso Total" = SUBTOTAL)
  relatorio jsonb not null          -- avisos, imagens flutuantes ignoradas e por quê, etc.
);

create index follow_up_importacoes_data_idx on follow_up_importacoes (importado_em desc);

-- Um registro por linha da aba Gerencia. Chave = PO (é a chave que a
-- própria planilha usa: todas as colunas vêm de PROCV pelo PO na aba OBRAS,
-- e há regra de "valores duplicados" pintando PO repetido de vermelho).
-- PO + MAC + DESENHO também é único nos dados atuais, mas MAC/DESENHO
-- mudam quando a aba OBRAS muda — usar só o PO evita duplicar o registro.
create table follow_up_itens (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  -- Identificação (códigos sempre como texto: não perdem zeros/formatação)
  po text not null,
  cliente text,
  quantidade numeric,
  mac text,
  desenho text,
  descricao text,
  -- Prazo
  prazo_contratual date,
  coleta text,          -- como aparece na planilha (data dd/mm/aaaa ou texto livre, ex.: "Falta o sensor")
  coleta_data date,     -- preenchido só quando COLETA é data
  status text,          -- texto exato da planilha (fórmula calculada pelo Excel)
  -- Etapas de produção (0–100, como na planilha; null = célula vazia)
  eng numeric,
  cor numeric,
  mon numeric,
  sol numeric,
  usi numeric,
  dob numeric,
  jat numeric,
  pin numeric,
  -- Pintura
  cor2 text,
  cor_2 text,
  plano_pintura text,
  -- Comercial / terceiros
  fornecedor text,
  orcamento_terceirizado_unid numeric,
  orcamento_custo_macfab_unid numeric,
  preco_previsto numeric,
  -- Observações
  obs_felipe_marcelo text,
  obs_alisson text,
  -- Expedição / documentação
  st text,
  nf text,
  tipagem text,
  -- Peso
  peso_unid numeric,
  peso_total numeric,
  ano int,
  -- Fidelidade à planilha
  linha_planilha int not null,            -- linha na última importação (as regras condicionais usam isso)
  oculta_na_planilha boolean not null,    -- linha escondida pela segmentação (ex.: ST = E)
  cores jsonb not null default '{}',      -- cor de fundo/fonte manual por campo
  dados_originais jsonb not null,         -- {cabeçalho: valor} exatamente como lido
  hash_conteudo text not null,            -- detecta se o registro mudou entre importações
  presente_na_ultima_importacao boolean not null default true,
  importacao_id uuid references follow_up_importacoes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index follow_up_itens_prazo_idx on follow_up_itens (prazo_contratual);

-- Conteúdo das imagens, deduplicado pelo hash (a mesma foto usada em mais
-- de uma linha é guardada uma vez só). São pequenas (média ~17 KB).
create table follow_up_midias (
  sha256 text primary key,
  content_type text not null,
  conteudo bytea not null,
  largura int,
  altura int,
  tamanho int not null,
  created_at timestamptz not null default now()
);

-- Vínculo imagem ↔ registro, com a origem e a posição original no Excel.
create table follow_up_imagens (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references follow_up_itens(id) on delete cascade,
  midia_sha256 text not null references follow_up_midias(sha256),
  ordem int not null,
  origem text not null check (origem in ('imagem_na_celula', 'imagem_flutuante')),
  celula text,               -- ex.: "A3" (imagem dentro da célula) ou célula da âncora
  media_original text,       -- ex.: "xl/media/image117.png"
  ancora jsonb,              -- linha/coluna de/até, tamanho em EMU (imagens flutuantes)
  created_at timestamptz not null default now()
);

create index follow_up_imagens_item_idx on follow_up_imagens (item_id);

alter table follow_up_importacoes enable row level security;
alter table follow_up_itens enable row level security;
alter table follow_up_midias enable row level security;
alter table follow_up_imagens enable row level security;
