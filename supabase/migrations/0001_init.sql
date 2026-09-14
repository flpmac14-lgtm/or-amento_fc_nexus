-- FC Nexus Orçamento Industrial IA — schema inicial
-- Cobre: catálogo de materiais/preços, regras de processo, orçamentos e histórico realizado.

create extension if not exists "pgcrypto";

-- ============ Cadastros básicos ============

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  created_at timestamptz not null default now()
);

create table fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  preferencial boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ Materiais e preços ============

create table materiais (
  id uuid primary key default gen_random_uuid(),
  norma text not null,                 -- ex: ASTM A36, ASTM A572
  tipo text not null,                  -- chapa, perfil, barra, tubo
  densidade_kg_m3 numeric not null default 7850,
  fator_barra_redonda_kg_m numeric,    -- constante prática (kg/m com D em metros) usada na planilha atual para barra redonda; senão o motor geométrico usa π/4 × densidade
  descricao text,
  created_at timestamptz not null default now()
);

create table perfis (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references materiais(id),
  designacao text not null,            -- ex: W310x52
  peso_kg_m numeric not null,
  created_at timestamptz not null default now()
);

create table chapas (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references materiais(id),
  espessura_mm numeric not null,
  created_at timestamptz not null default now()
);

create table historico_compras (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references materiais(id),
  fornecedor_id uuid references fornecedores(id),
  preco_kg numeric not null,
  data_compra date not null,
  nota_fiscal text,
  created_at timestamptz not null default now()
);

-- ============ Processos, máquinas e produtividade ============

create table maquinas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                  -- ex: Mandriladora CNC
  tipo text,                            -- caldeiraria, usinagem, pintura...
  created_at timestamptz not null default now()
);

create table custos_hora (
  id uuid primary key default gen_random_uuid(),
  maquina_id uuid references maquinas(id),
  processo text,
  valor_hora numeric not null,
  vigencia_inicio date not null default current_date,
  created_at timestamptz not null default now()
);

create table processos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,          -- corte, caldeiraria, solda, usinagem, jateamento, pintura, ndt, inspecao, engenharia...
  nome text not null,
  descricao text
);

create table produtividade_processos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid references processos(id),
  unidade text not null,                -- kg/h, m2/h, h/kg, h/un
  valor numeric not null,
  contexto text,                        -- ex: "chapa carbono", "perfil W", "complexidade alta"
  created_at timestamptz not null default now()
);

create table soldagem_consumiveis (
  id uuid primary key default gen_random_uuid(),
  material_id uuid references materiais(id),
  processo_solda text,                  -- MIG, TIG, eletrodo revestido...
  fator_consumo_percentual numeric,     -- ex: 0.03 = 3% do peso da peça
  preco_kg_consumivel numeric,
  preco_gas_m3 numeric,
  created_at timestamptz not null default now()
);

create table tintas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text,                            -- fundo, intermediaria, acabamento
  preco_litro numeric not null,
  created_at timestamptz not null default now()
);

create table rendimentos_pintura (
  id uuid primary key default gen_random_uuid(),
  tinta_id uuid references tintas(id),
  rendimento_m2_litro numeric not null,
  espessura_um numeric,
  perda_percentual numeric not null default 0.1,
  created_at timestamptz not null default now()
);

create table tratamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                   -- tratamento térmico, galvanização...
  unidade text,                          -- R$/kg, R$/peça
  valor numeric not null,
  fornecedor_id uuid references fornecedores(id),
  created_at timestamptz not null default now()
);

create table ndt (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                    -- LP, PM, US, dimensional...
  unidade text not null,                 -- R$/kg, R$/ponto, R$/m
  valor numeric not null,
  created_at timestamptz not null default now()
);

create table custos_indiretos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,           -- embalagem, transporte, energia
  descricao text,
  base_calculo text not null,             -- ex: "peso_kg", "custo_industrial"
  fator numeric not null,                 -- ex: 0.20 (R$/kg) ou percentual
  created_at timestamptz not null default now()
);

create table regras_orcamento (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,            -- ex: engenharia_por_posicao, margem_padrao
  descricao text,
  formula text,                            -- descrição textual da fórmula
  parametros jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table impostos (
  id uuid primary key default gen_random_uuid(),
  cenario text not null,                  -- venda_fabricacao, industrializacao, servico
  tipo text not null,                     -- ICMS, PIS, COFINS, ISS, credito_fiscal
  direcao text not null,                  -- compra, venda
  aliquota numeric not null,
  created_at timestamptz not null default now()
);

-- ============ Orçamentos ============

create table orcamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id),
  numero_desenho text,
  revisao text,
  descricao text,
  pedido_po text,
  quantidade integer not null default 1,
  peso_liquido_kg numeric,
  peso_bruto_kg numeric,
  complexidade text,
  cenario_comercial text,                  -- venda_fabricacao, industrializacao, servico
  status text not null default 'rascunho',
  confianca_geral numeric,
  dados_extraidos jsonb,                    -- JSON estruturado devolvido pelo serviço de extração
  custo_industrial numeric,
  impostos_total numeric,
  margem numeric,
  preco_venda numeric,
  preco_venda_kg numeric,
  arquivo_pdf_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references orcamentos(id) on delete cascade,
  item_numero text,
  descricao text,
  tipo_geometria text,                      -- chapa_retangular, chapa_circular, barra_redonda, perfil...
  material_id uuid references materiais(id),
  perfil_id uuid references perfis(id),
  quantidade numeric not null default 1,
  dimensoes jsonb,                           -- {comprimento_mm, largura_mm, espessura_mm, diametro_mm, ...}
  peso_unitario_kg numeric,
  peso_total_kg numeric,
  aproveitamento_percentual numeric,
  peso_compra_kg numeric,
  preco_kg numeric,
  custo_material numeric,
  usinado boolean not null default false,
  confianca numeric,
  created_at timestamptz not null default now()
);

create table orcamento_processos (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid not null references orcamentos(id) on delete cascade,
  processo_id uuid references processos(id),
  detectado_automaticamente boolean not null default true,
  horas_estimadas numeric,
  valor_hora numeric,
  custo numeric,
  memoria_calculo jsonb,                     -- detalhe auditável para o "Ver cálculo"
  confianca numeric,
  created_at timestamptz not null default now()
);

-- ============ Aprendizado com histórico realizado ============

create table historico_realizado (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid references orcamentos(id),
  processo_id uuid references processos(id),
  horas_orcadas numeric,
  horas_realizadas numeric,
  desvio_percentual numeric,
  observacoes text,
  created_at timestamptz not null default now()
);

create index on historico_compras (material_id, data_compra desc);
create index on orcamento_itens (orcamento_id);
create index on orcamento_processos (orcamento_id);
create index on historico_realizado (processo_id);
