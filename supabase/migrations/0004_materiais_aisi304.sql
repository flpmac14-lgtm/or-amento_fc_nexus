-- Completa AISI 304 em barra e perfil — mesma densidade/fator já
-- cadastrados pra AISI 304 chapa (8000 kg/m3, fator 6318), não é dado
-- novo. Desbloqueia compras reais do ERP (2-3 registros cada) que já
-- existem mas ficavam sem material_id pra associar.

insert into materiais (norma, tipo, densidade_kg_m3, fator_barra_redonda_kg_m, descricao) values
  ('AISI 304', 'barra', 8000, 6318, 'Barra redonda aço inoxidável austenítico'),
  ('AISI 304', 'perfil', 8000, 6318, 'Perfil/cantoneira aço inoxidável austenítico');
