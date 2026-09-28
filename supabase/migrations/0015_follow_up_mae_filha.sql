-- Follow up passa a ser "filha" do Controle de obras — pedido explícito do
-- usuário: como na planilha (PROCV pelo PO na aba OBRAS), os pedidos ativos
-- (ST = A) da Controle de obras que ainda não estão no Follow up entram
-- sozinhos, e os campos que vêm da mãe (prazo, cliente, qtd, MAC, desenho,
-- descrição, OBS, cores, plano de pintura, ST, NF, tipagem, pesos) são
-- atualizados a cada sincronização e NÃO são editáveis no app. Os campos de
-- acompanhamento (etapas, coleta, fornecedor, orçamentos, obs. Felipe/Marcelo,
-- preço previsto) passam a ser editados no app e salvos na hora.
--
-- A importação do .xlsb da Gerencia foi desligada (sobrescreveria o que é
-- digitado no app) — os dados já importados continuam aqui.

alter table follow_up_itens
  add column origem text not null default 'importacao_gerencia'
    check (origem in ('importacao_gerencia', 'controle_obras')),
  add column mae_linha int,                    -- linha na aba OBRAS usada no último "PROCV"
  add column mae_sincronizada_em timestamptz,  -- última vez que os campos da mãe foram conferidos
  add column editado_em timestamptz,           -- última edição de campo de acompanhamento no app
  add column editado_por text;
