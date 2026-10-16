-- Fotos de qualidade por setor — pedido do usuário (16/10/2026): o felipe
-- (Pintura) tira foto pelo celular, dentro do app, dos registros de qualidade
-- de cada pedido do Follow up (medição de espessura/micragem, aderência,
-- rugosidade...) e ela já fica salva, pra Qualidade e o resto do pessoal ver.
-- A imagem fica em follow_up_midias (mesmo armazenamento das fotos do Follow
-- up, por hash); aqui só o vínculo com o pedido, o tipo e quem tirou.
-- Gravado por app/apontamentos_setor.py.
create table fotos_setor (
  id uuid primary key default gen_random_uuid(),
  setor text not null,
  item_id uuid not null references follow_up_itens(id) on delete cascade,
  midia_sha256 text not null references follow_up_midias(sha256),
  tipo text not null,                -- ex.: "Espessura de camada (micragem)"
  observacao text,                   -- ex.: "Fundo 120 µm"
  por text,                          -- login de quem tirou (ex.: felipe)
  em timestamptz not null default now()
);

create index fotos_setor_item_idx on fotos_setor (setor, item_id);
create index fotos_setor_em_idx on fotos_setor (setor, em desc);

alter table fotos_setor enable row level security;
