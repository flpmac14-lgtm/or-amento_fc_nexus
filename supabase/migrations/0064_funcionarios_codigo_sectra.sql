-- Aba Funcionários — pedido do usuário (05/11/2026): cadastrar a lista de
-- funcionários do Sectra (RH_FUNCIONARIO, banco INDUSTRIAL) com o código de
-- cada um. Quem já estava (planilha do acordo dos sábados) ganha o código;
-- quem só existe no Sectra entra. Nomes que diferem um pouco entre os dois
-- (Carlos Eduardo, Gecival, João Pedro) ficam com o nome da planilha — o do
-- Sectra do Gecival tem erro de digitação ("RFAMOS"). Os 12 que não estão no
-- Sectra continuam, sem código. O código 1 do Sectra ("APONTAMENTO") não é pessoa.
alter table funcionarios add column codigo_sectra int unique;

create temp table sectra (codigo int, nome text) on commit drop;
insert into sectra values
  (2, 'ADEILDO RODRIGUES'),
  (3, 'ALISSON DIEGO SILVA DANTAS'),
  (4, 'ANDRÉ CARDOSO NUNES DE OLIVEIRA'),
  (5, 'ANTONIO LAERTE PIAPINI'),
  (6, 'ANTONIO MARCOS DE SANTANA CARDOSO'),
  (7, 'BENIVALDO VASCONCELOS DA SILVA'),
  (8, 'BRITO DONISETE STROZI'),
  (9, 'BRUNO APARECIDO PESSOA'),
  (10, 'BRUNO BATISTA PEREIRA'),
  (11, 'CARLOS EDUARDO TAVARES CASASSOLA'),
  (12, 'CARLOS JUSTINIANO DOS SANTOS'),
  (13, 'DEIVID JOSÉ RAMOS'),
  (14, 'DIEGO FIUZA RUAS'),
  (15, 'ELIAS MENDES DA SILVA'),
  (16, 'FABIO RICARDO DE FREITAS'),
  (17, 'FELIPE ANTUNES DA SILVA'),
  (18, 'GECIVAL SOUZA RAMOS DE JESUS'),
  (19, 'JHONATAN DIAS SIMÕES'),
  (20, 'JOÃO PEDRO OLIVEIRA RIOS'),
  (21, 'JONA AZEVEDO DE OLIVEIRA'),
  (22, 'JOSÉ ALVES DE OLIVEIRA'),
  (23, 'LEANDRO DA SILVA AUGUSTO'),
  (24, 'LUCAS AZEVEDO DE OLIVEIRA'),
  (25, 'LUIS CESAR DA SILVA BELISARIO'),
  (26, 'MARCELO BRITO STROZI'),
  (27, 'MARCOS EDUARDO DA SILVA NOGUEIRA'),
  (28, 'MARTA RAIMUNDA GOMES'),
  (29, 'MATEUS HENRIQUE DIAS'),
  (30, 'NICHOLAS DANIEL DE SOUZA'),
  (31, 'NORIVAL HONORIO DE ASSIS JUNIOR'),
  (32, 'PAULO ANTONIO SILVERIO'),
  (33, 'PEDRO PAULO OLIVEIRA RIOS'),
  (34, 'REGIVALDO APARECIDO DA SILVA FONTES'),
  (35, 'RENILSON FERREIRA DA SILVA'),
  (36, 'ROBERTO DE CASTRO'),
  (37, 'ROBSON DE OLIVEIRA'),
  (38, 'RUAN PABLO RIBEIRO LOPES'),
  (39, 'VALDEMIR FERNANDO DONADONA'),
  (40, 'VANDERSON FERREIRA VILELA'),
  (41, 'LEANDRO DIAS SOARES');

update funcionarios f set codigo_sectra = s.codigo from sectra s where f.nome = s.nome;
insert into funcionarios (nome, codigo_sectra)
  select s.nome, s.codigo from sectra s where not exists (select 1 from funcionarios f where f.nome = s.nome);
