-- Aba Funcionários + Solicitação de hora extra — pedido do usuário (26/10/2026):
-- só os nomes da planilha CONTROLE ACORDO SABADOS TRABALHADOS 17 E 24 OUTUBRO.xlsx
-- (aba Controle). O usuário (flpmac14), o Jeferson e o Diego escolhem nomes, dias
-- e horário, e sai o relatório em PDF (/follow-up/hora-extra?n=). RLS ligado e SEM
-- policy: quem lê e grava é a rota /api/follow-up/hora-extra (confere o login).
create table funcionarios (
  id serial primary key,
  nome text not null unique,
  ativo boolean not null default true
);
alter table funcionarios enable row level security;

create table horas_extras (
  numero serial primary key,                -- nº da solicitação (vai no PDF)
  criado_em timestamptz not null default now(),
  criado_por text not null,                 -- e-mail de quem pediu
  solicitante text not null,                -- nome que aparece no PDF
  funcionarios text[] not null,             -- nomes (cópia: o PDF não muda se a lista mudar)
  dias jsonb not null,                      -- [{"data": "2026-10-31", "inicio": "07:00", "fim": "15:00"}]
  motivo text
);
alter table horas_extras enable row level security;

insert into funcionarios (nome) values
  ('LEANDRO DIAS SOARES'),
  ('ADEILDO RODRIGUES'),
  ('ALISSON DIEGO SILVA DANTAS'),
  ('ANA JULIA VIEIRA'),
  ('ANDRÉ CARDOSO NUNES DE OLIVEIRA'),
  ('ANGELA MARIA DA SILVA FERREIRA'),
  ('ANTONIO LAERTE PIAPINI'),
  ('ANTONIO MARCOS DE SANTANA CARDOSO'),
  ('BENIVALDO VASCONCELOS DA SILVA'),
  ('BRITO DONISETE STROZI'),
  ('BRUNO APARECIDO PESSOA'),
  ('BRUNO BATISTA PEREIRA'),
  ('CARLOS EDUARDO TAVARES CASASSOLA'),
  ('CARLOS JUSTINIANO DOS SANTOS'),
  ('DEIVID JOSÉ RAMOS'),
  ('DIEGO FIUZA RUAS'),
  ('ELIAS MENDES DA SILVA'),
  ('FABIO RICARDO DE FREITAS'),
  ('FELIPE ANTUNES DA SILVA'),
  ('GECIVAL SOUZA RAMOS DE JESUS'),
  ('JHONATAN DIAS SIMÕES'),
  ('JOÃO PEDRO OLIVEIRA RIOS'),
  ('JONA AZEVEDO DE OLIVEIRA'),
  ('JOSÉ ALVES DE OLIVEIRA'),
  ('LAILTO DE ANDRADE'),
  ('LEANDRO DA SILVA AUGUSTO'),
  ('LUCAS AZEVEDO DE OLIVEIRA'),
  ('LUIS CESAR DA SILVA BELISARIO'),
  ('MARCELO BRITO STROZI'),
  ('MARCOS EDUARDO DA SILVA NOGUEIRA'),
  ('MATEUS HENRIQUE DIAS'),
  ('NICHOLAS DANIEL DE SOUZA'),
  ('NORIVAL HONORIO DE ASSIS JUNIOR'),
  ('PAULO ANTONIO SILVERIO'),
  ('PEDRO HENRIQUE DA SILVA VIEIRA'),
  ('PEDRO PAULO OLIVEIRA RIOS'),
  ('REGIVALDO APARECIDO DA SILVA FONTES'),
  ('RENILSON FERREIRA DA SILVA'),
  ('ROBERTO DE CASTRO'),
  ('ROBSON DE OLIVEIRA'),
  ('RUAN PABLO RIBEIRO LOPES'),
  ('VALDEMIR FERNANDO DONADONA'),
  ('VANDERSON FERREIRA VILELA'),
  ('JEFERSON DIAS OLIVEIRA'),
  ('VITOR GABRIEL DE ALMEIDA DA SILVA'),
  ('JULIO CESAR DA SILVA'),
  ('SAYMON S OLIVEIRA SOUZA'),
  ('FELIPE SOUSA DO NASCIMENTO'),
  ('JOÃO GANZELLA'),
  ('VALDIR BALBINO'),
  ('ALAN DIAS'),
  ('GUILHERME DA SILVA LIMA');
