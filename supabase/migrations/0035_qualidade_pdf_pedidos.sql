-- Aba QUALIDADE — pedido explícito do usuário: baixar o PDF do certificado
-- (pra montar data book), escolhendo a pasta. Os ~7 mil PDFs (4,4 GB) só
-- existem no J: da fábrica e não cabem no Storage, então é SOB DEMANDA:
-- o site grava o pedido aqui (rota /api/qualidade/pdf, só flpmac14), o vigia
-- scripts/servir_certificados.py (nesta máquina) sobe só aquele PDF pro bucket
-- privado "certificados" e marca "pronto"; o site baixa por URL assinada.
-- O vigia apaga do bucket o que tem mais de 3 dias.
-- RLS ligado e SEM policy: só a service_role (rota e vigia) lê/grava.
create table qualidade_pdf_pedidos (
  id bigint generated always as identity primary key,
  arquivo text not null,        -- caminho relativo na pasta de certificados
  modificado text,              -- data do PDF quando foi pedido (reaproveita só se igual)
  status text not null default 'pendente' check (status in ('pendente', 'pronto', 'erro', 'apagado')),
  objeto text,                  -- <sha256>.pdf no bucket "certificados"
  erro text,
  pedido_em timestamptz not null default now(),
  pronto_em timestamptz
);
create index qualidade_pdf_pedidos_status_idx on qualidade_pdf_pedidos (status, pedido_em);
alter table qualidade_pdf_pedidos enable row level security;

insert into storage.buckets (id, name, public) values ('certificados', 'certificados', false)
  on conflict (id) do nothing;
