-- Follow up: imagem colada/enviada pelo app — pedido explícito do usuário:
-- clicar na coluna Foto e colar (Ctrl+V) uma imagem copiada. Nova origem
-- "enviada_app" ao lado das que vieram da planilha.
alter table follow_up_imagens drop constraint follow_up_imagens_origem_check;
alter table follow_up_imagens add constraint follow_up_imagens_origem_check
  check (origem in ('imagem_na_celula', 'imagem_flutuante', 'enviada_app'));

alter table follow_up_imagens
  add column enviada_por text;
