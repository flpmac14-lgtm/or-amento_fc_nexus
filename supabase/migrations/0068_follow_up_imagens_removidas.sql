-- Follow up: remover QUALQUER imagem pelo app, inclusive a que veio da planilha
-- (pedido do usuário 11/11/2026: "não dá opção de remover o primeiro").
-- A imagem da planilha é reimportada a cada sync (15 min) quando a linha muda;
-- aqui fica guardado o que foi removido, pra a sync não trazer de volta.
create table follow_up_imagens_removidas (
  item_id uuid not null references follow_up_itens (id) on delete cascade,
  midia_sha256 text not null,
  removida_por text,
  removida_em timestamptz not null default now(),
  primary key (item_id, midia_sha256)
);
alter table follow_up_imagens_removidas enable row level security;
