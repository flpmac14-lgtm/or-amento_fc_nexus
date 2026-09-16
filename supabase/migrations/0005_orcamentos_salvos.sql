-- Persistência da aba "Orçamentos salvos" do frontend — pedido explícito
-- do usuário: botão "Salvar orçamento" + lista pra reabrir/editar depois,
-- e "Novo orçamento" pra limpar a tela.
--
-- Não reusa as tabelas normalizadas `orcamentos`/`orcamento_itens`
-- (0001_init.sql) — aquelas modelam item a item com material_id/perfil_id
-- por FK, pensadas pro fluxo de extração de desenho. O cálculo manual (e o
-- resultado que a tela mostra) já tem seu próprio formato flexível — a
-- `entrada` que o calc_engine devolve e reconsome pro Excel editável — e
-- forçar isso num schema normalizado exigiria um adapter novo sem
-- ganho real agora. Aqui é só um jsonb com o que a tela precisa pra
-- redesenhar o resultado e (quando `origem = 'manual'`) a lista de itens
-- editável de onde o usuário parou.
create table orcamentos_salvos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  origem text not null check (origem in ('manual', 'pdf', 'texto')),
  resultado jsonb not null,       -- RespostaOrcamentoDePdf completo (o que ResultadoOrcamento.tsx exibe)
  estado_manual jsonb,             -- {itens, itensComerciais, cenarioComercial, corteValorKg, posicaoNum, itemNum} — só quando origem='manual'
  estado_texto jsonb,              -- {texto, estimativas} — só quando origem='texto' (fluxo hoje sem tela própria, reservado)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index orcamentos_salvos_updated_at_idx on orcamentos_salvos (updated_at desc);
