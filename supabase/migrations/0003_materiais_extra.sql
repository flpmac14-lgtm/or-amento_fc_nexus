-- Completa combinações norma+tipo que aparecem em compras reais (ver
-- consulta FN_NFEITENS/FN_NFE do ERP, CFOP de compra, 2026) mas ainda não
-- tinham linha em `materiais`. Não é dado novo: reaproveita a
-- densidade/fator já cadastrados para a mesma norma em outro tipo — ASTM
-- A36 já tem chapa e perfil com 7850/6200, só faltava barra; ASTM A572 já
-- tem chapa com 7850/6200, só faltava perfil.

insert into materiais (norma, tipo, densidade_kg_m3, fator_barra_redonda_kg_m, descricao) values
  ('ASTM A36', 'barra', 7850, 6200, 'Barra redonda aço carbono estrutural'),
  ('ASTM A572', 'perfil', 7850, 6200, 'Perfil laminado/soldado aço alta resistência');
