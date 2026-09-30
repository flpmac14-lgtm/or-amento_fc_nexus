-- Croqui de corte — pedido explícito do usuário: "filha" do Material de
-- compra (aba MACLM, ver 0020), como o Follow up é filha da Controle de obras.
-- Importada uma vez da aba "Croqui 2" de
-- "J:\3 - Projetos\GR_PROJETO\Corte\Croqui de corte rev 01.1.xlsb"; depois
-- disso quem edita é o app.
--
-- Chave = Pedido (= PO+IT+POS da MACLM). Fixas (PROCV na planilha, travadas
-- no app, atualizadas pela mãe a cada 15 min): mac, descricao, desenho, mp,
-- l, pos, qt, qt_1, qtt, un. Editáveis: status, projetista, n_programa,
-- observacao — status "Fazendo" grava dt_fazendo, "Feito" grava dt_feito.
-- Pedidos ST = A novos da mãe entram sozinhos (app/croqui_corte.py).
create table croqui_corte_itens (
  id uuid primary key default gen_random_uuid(),
  pedido text not null,
  mac text,
  descricao text,
  desenho text,
  mp text,
  l text,
  pos text,
  qt numeric,
  qt_1 numeric,
  qtt numeric,
  un text,
  status text,
  projetista text,
  n_programa text,
  observacao text,
  dt_fazendo timestamptz,
  dt_feito timestamptz,
  linha_planilha int not null,           -- ordem (linha na Croqui 2; novos entram no fim)
  origem text not null check (origem in ('importacao_croqui', 'material_compra')),
  mae_sincronizada_em timestamptz,
  editado_em timestamptz,
  editado_por text,
  created_at timestamptz not null default now()
);

-- Não é unique: a planilha tem 1 pedido repetido (N17082-12.005).
create index croqui_corte_itens_pedido_idx on croqui_corte_itens (upper(pedido));
create index croqui_corte_itens_linha_idx on croqui_corte_itens (linha_planilha);

alter table croqui_corte_itens enable row level security;
