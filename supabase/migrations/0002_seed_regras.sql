-- Seed de regras/parâmetros com base na planilha real de referência
-- (MAC_0573.26 - A752193 BASE - WEIR, pasta "Parametros de orçamento macfab").
-- Todos os valores aqui são os parâmetros ATUAIS da Macfab, hoje embutidos na
-- planilha Excel — ficam editáveis pela tela "Parâmetros de Orçamento" (item 11
-- da especificação), nunca hardcoded no motor de cálculo.

-- ============ Materiais de referência ============

insert into materiais (norma, tipo, densidade_kg_m3, fator_barra_redonda_kg_m, descricao) values
  ('ASTM A36', 'chapa', 7850, 6200, 'Aço carbono estrutural'),
  ('ASTM A572', 'chapa', 7850, 6200, 'Aço carbono alta resistência'),
  ('ASTM A36', 'perfil', 7850, 6200, 'Perfil estrutural laminado/soldado'),
  ('SAE 1020', 'barra', 7850, 6200, 'Barra redonda aço carbono'),
  ('AISI 304', 'chapa', 8000, 6318, 'Aço inoxidável austenítico');
  -- fator_barra_redonda_kg_m: constante prática da planilha (kg/m, D em metros).
  -- Aço carbono/1020 = 6200; inox = 6318 (proporcional à densidade: 8,00/7,85 × 6200).
  -- O motor geométrico pode recalcular via π/4 × densidade quando o material não tiver o fator cadastrado.

insert into perfis (material_id, designacao, peso_kg_m)
select id, 'W310x52', 52.0 from materiais where norma = 'ASTM A36' and tipo = 'perfil'
union all
select id, 'W250x32.7', 32.7 from materiais where norma = 'ASTM A36' and tipo = 'perfil'
union all
select id, 'W200x22.5', 22.5 from materiais where norma = 'ASTM A36' and tipo = 'perfil';

-- ============ Processos ============

insert into processos (codigo, nome, descricao) values
  ('corte', 'Corte', 'Oxicorte / Plasma / Laser'),
  ('caldeiraria', 'Caldeiraria', 'Corte, dobra, montagem, ponteamento, solda, desempeno, inspeção, traçagem, furação, acabamento, armazenagem'),
  ('jateamento_pintura_mo', 'Jateamento e Pintura (mão de obra)', 'ISO 8501-1'),
  ('usinagem_convencional', 'Usinagem Convencional', 'Torno / Furadeira / Plaina'),
  ('usinagem_cnc', 'Usinagem Mandriladora CNC', 'Mandriladora CNC 2 eixos'),
  ('usinagem_pesada', 'Usinagem Pesada Especial', '3 a 5 eixos'),
  ('solda', 'Soldagem', 'Consumíveis e gás de proteção'),
  ('pintura_material', 'Pintura (material)', 'Fundo + acabamento'),
  ('ndt', 'Ensaios Não Destrutivos', 'LP, PM, US, dimensional'),
  ('engenharia', 'Engenharia Industrial', 'Desenho/croqui para delineamento'),
  ('tratamento_termico', 'Tratamento Térmico', 'Outsourcing'),
  ('servico_externo', 'Serviço Externo (Outsourcing)', 'Conformação pesada, rebordeamento, balanceamento'),
  ('contingencia', 'Contingenciamento', 'Reserva técnica opcional'),
  ('embalagem', 'Embalagem', 'Caixa/berço/borracha'),
  ('transporte', 'Transporte', 'Frete'),
  ('energia', 'Energia Elétrica', 'Consumo médio de fabricação');

-- ============ Custos indiretos (R$/kg sobre peso líquido do equipamento) ============

insert into custos_indiretos (codigo, descricao, base_calculo, fator) values
  ('embalagem', 'Embalagem (caixa de papelão, berço de madeira, borracha)', 'peso_liquido_kg', 0.20),
  ('transporte', 'Transporte (veículo pesado)', 'peso_liquido_kg', 0.25),
  ('energia', 'Energia elétrica (consumo médio de fabricação)', 'peso_liquido_kg', 0.25);

-- ============ Produtividade de processos ============

insert into produtividade_processos (processo_id, unidade, valor, contexto)
select id, 'h/kg', 0.05, 'Fator de complexidade padrão — base estrutural soldada' from processos where codigo = 'caldeiraria'
union all
select id, 'fator_sobre_caldeiraria', 1.0/24, 'Horas de jateamento/pintura MO = horas de caldeiraria ÷ 24' from processos where codigo = 'jateamento_pintura_mo';

-- ============ Soldagem — consumíveis ============

insert into soldagem_consumiveis (material_id, processo_solda, fator_consumo_percentual, preco_kg_consumivel, preco_gas_m3)
select id, 'FCAW E71T-1 / GMAW ER70S-6 / GTAW ER70S-3 (carbono)', 0.03, 25.0, 40.0
from materiais where norma = 'ASTM A36' and tipo = 'chapa'
limit 1;
-- Regra atual: consumível = 3% do peso líquido do equipamento; gás = metade do peso do consumível.
-- Evoluir depois para cálculo geométrico de cordão (comprimento × filete × volume).

-- ============ NDT ============

insert into ndt (tipo, unidade, valor) values
  ('LP/PM/US/dimensional', 'R$/kg', 0.50);

-- ============ Engenharia, margem e demais regras configuráveis ============

insert into regras_orcamento (codigo, descricao, formula, parametros) values
  ('fator_margem_venda',
   'Fator de cálculo (markup) aplicado sobre o custo industrial para formar o preço de venda com impostos',
   'preco_venda_com_impostos = custo_industrial * (1 + fator)',
   '{"fator": 1.0}'),

  ('engenharia_por_posicao',
   'Custo de engenharia = quantidade de desenhos/posições/delineamentos × valor unitário. A quantidade hoje é definida manualmente pelo orçamentista (baixa confiança de extração automática).',
   'engenharia = quantidade_posicoes * valor_unitario',
   '{"valor_unitario": 60}'),

  ('corte_por_kg',
   'Custo de corte = peso líquido do equipamento × valor/kg (oxicorte/plasma/laser)',
   'corte = peso_liquido_kg * valor_kg',
   '{"valor_kg": 1.5}'),

  ('caldeiraria_horas_por_kg',
   'Horas de caldeiraria = peso líquido do equipamento × fator h/kg (ver produtividade_processos)',
   'horas = peso_liquido_kg * fator_h_kg',
   '{"valor_hora": 60}'),

  ('jateamento_pintura_mo_proporcao',
   'Horas de mão de obra de jateamento/pintura = horas de caldeiraria ÷ divisor',
   'horas = horas_caldeiraria / divisor',
   '{"divisor": 24, "valor_hora": 60}'),

  ('pintura_material_rendimento',
   'Litros de tinta por demão = área pintada × fator L/m². Duas demãos padrão: fundo e acabamento.',
   'litros_por_demao = area_m2 * fator_l_m2',
   '{"fator_l_m2": 0.04, "demaos": [{"tipo": "fundo", "preco_litro": 500}, {"tipo": "acabamento", "preco_litro": 450}]}'),

  ('contingenciamento',
   'Reserva técnica opcional sobre o peso líquido, hoje desligada (multiplicador 0)',
   'contingencia = peso_liquido_kg * fator_percentual * ligado',
   '{"fator_percentual": 0.0025, "ligado": 0, "valor_pagina": 150}');

-- ============ Impostos ============
-- Compra (matéria-prima e serviços de terceiros): ICMS + PIS/COFINS deduzidos do bruto para achar o custo líquido (crédito fiscal).
-- Venda: alíquota efetiva varia por cenário comercial.

insert into impostos (cenario, tipo, direcao, aliquota) values
  ('compra_padrao', 'ICMS', 'compra', 0.18),
  ('compra_padrao', 'PIS_COFINS', 'compra', 0.0925),
  ('venda_fabricacao', 'ALIQUOTA_EFETIVA', 'venda', 0.25585),   -- 16,335% ICMS + 9,25% PIS-COFINS
  ('industrializacao', 'ALIQUOTA_EFETIVA', 'venda', 0.0925),    -- 9,25% PIS-COFINS
  ('servico', 'ALIQUOTA_EFETIVA', 'venda', 0.1433);             -- 3,65% PIS-COFINS + 3% ISS + 7,68% CSLL-IRPJ
