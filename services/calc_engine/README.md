# calc_engine

Motor de cálculo determinístico do FC Nexus. Recebe dados já
extraídos/estimados de um orçamento (peso, geometria, área de pintura,
horas de usinagem, quantidade de posições de engenharia) e devolve peso,
custo por processo, custo industrial e preço de venda — cada linha com sua
memória de cálculo ("Ver cálculo").

**Este módulo não decide sozinho quantas horas uma peça vai levar** — isso é
o problema em três camadas descrito na especificação:

1. Regra industrial simples (`app/processos.py` — peso × fator h/kg)
2. Histórico Macfab (`app/historico.py` — mediana de horas/tonelada de
   orçamentos passados com peso parecido)
3. Ajuste por IA avaliando complexidade geométrica (ainda não existe)

As camadas 1 e 2 já existem e já estão combinadas (`app/estimativa_horas.py`,
opt-in via `usar_historico_horas` — ver seção abaixo).

## Validação

`tests/test_orcamento_a752193.py` reconstrói o orçamento real
MAC_0573.26/A752193 (Weir) item a item e confere que o motor bate
**exatamente** com os totais da planilha de referência:

- Custo industrial: R$ 58.027,43
- Preço de venda (c/ impostos): R$ 116.054,86
- Preço de venda (s/ impostos): R$ 86.362,23
- R$/kg: R$ 34,97

`tests/test_geometria.py` valida as fórmulas de peso (chapa retangular,
chapa circular, barra redonda, perfil, tubo redondo) contra os exemplos
numéricos que a própria planilha de referência traz como folha de consulta.

## Histórico (camada 2 de estimativa de horas)

`app/historico.py` + `data/historico_referencia.json` — dataset real com os
totais consolidados (peso, horas previstas, custo industrial, preço de
venda) de **35 orçamentos reais** da Macfab (Weir, Andritz, Dana, Siemens,
FTSX, Indesa — pasta `Parametros de orçamento macfab`), cobrindo peças de
0,14 kg a quase 11 toneladas.

`sugerir_horas_caldeiraria(peso_liquido_kg)` busca orçamentos com peso
parecido (expande a faixa de busca até achar pelo menos 3 amostras — 0,5t,
depois 1t, 2t, 5t) e devolve média, mediana, a amostra usada e uma sugestão
de horas para o peso informado, com nível de confiança conforme o tamanho
da amostra e a largura da faixa. `tests/test_historico.py` valida a lógica
com dados sintéticos e confere que consultar o peso do A752193 (3319 kg)
encontra o próprio orçamento no dataset real.

Em produção este dataset deve ser substituído por consulta à tabela
`historico_realizado` do Supabase (que também guarda orçado × realizado por
processo, não só o total do orçamento).

## Combinando regra simples + histórico

`app/estimativa_horas.py` define a regra de combinação (antes deixada em
aberto): **média ponderada pela confiança do histórico**, não um corte
abrupto —

```
horas_final = confiança_histórico × horas_histórico
            + (1 − confiança_histórico) × horas_regra_simples
```

Fica opt-in: `montar_orcamento(entrada)` só usa essa combinação quando
`entrada["usar_historico_horas"] = True` (via `adapter.py`,
`estimativas["usar_historico_horas"]`). Sem essa flag, o comportamento é
idêntico ao de antes — é por isso que `test_orcamento_a752193.py` continua
batendo exatamente com a planilha sem precisar saber que o histórico existe.

**Descoberta ao validar com o dataset real**: peso sozinho é um preditor
fraco de complexidade. Consultando o peso do A752193 (3319 kg, baseplate
soldada simples, 52 h/ton na realidade), a amostra de peso parecido também
traz um inserto de moinho fortemente usinado (229 h/ton) e uma plataforma
complexa (322 h/ton) — peso semelhante, trabalho bem diferente. A mediana
dessa amostra pequena puxa a sugestão bem acima do valor real. Isso não é
um bug: é a lacuna que a "Camada 3" da especificação (IA avaliando
complexidade geométrica — quantidade de peças, soldas, tolerâncias) deveria
preencher. A confiança aqui reflete tamanho/largura da amostra, não a
qualidade da similaridade — por isso o resultado da combinação pode
legitimamente ficar longe da regra simples quando a amostra é pequena ou
heterogênea, e por isso a combinação nunca ignora a regra simples por
completo (só pondera).

## Rodar

```bash
python -m venv .venv
./.venv/Scripts/pip install -r requirements-dev.txt   # Windows
./.venv/Scripts/python -m pytest tests/ -v
```

## Adaptador (extractor → orçamento)

`app/adapter.py` já liga os dois serviços: recebe o JSON que
`services/extractor` devolve (`ResultadoExtracao.model_dump()`), calcula o
peso de cada item da BOM pelo motor geométrico (usando
`app/repositorio_materiais.py` — consulta real às tabelas `materiais`,
`perfis` e `historico_compras` do Supabase quando `SUPABASE_DB_URL` está no
ambiente, com fallback pra fixture local em `app/materiais_fixture.py`
quando não está) e monta a entrada de `app.orcamento.montar_orcamento`.

Os dois serviços continuam desacoplados de propósito: o adaptador só lê o
dict JSON, nunca importa os modelos Pydantic do extractor — é o mesmo
contrato que valeria numa chamada HTTP real entre eles.

Itens que não têm geometria suficiente, material não cadastrado, ou preço/kg
não cadastrado **não entram silenciosamente no custo** — vão para
`itens_para_revisao` com um motivo específico, para a tela de conferência
prevista na especificação (item 89-91 do README raiz: usuário só revisa o
que o sistema não conseguiu resolver sozinho). Itens com confiança abaixo de
0,6 entram no custo mas também ficam sinalizados.

O que ainda falta:
- A combinação regra+histórico ainda usa só peso como critério de
  similaridade — falta considerar material/tipo de peça (ver "Descoberta"
  acima), o que é literalmente a "Camada 3" da especificação.
- Área de pintura e quantidade de posições de engenharia continuam como
  `estimativas` manuais — não têm histórico equivalente ainda.
- A consulta real ao Supabase já existe (`app/repositorio_materiais.py`) e
  `historico_compras` já tem 151 compras reais importadas do ERP da empresa
  (`scripts/importar_precos_erp.py`, ver seção abaixo). Preço hoje é só a
  estratégia "último comprado"; falta média das últimas 3 compras, média
  30/60/90 dias e fornecedor preferencial.
- `services/extractor` já extrai BOM em tabela (`app/extraction/bom_table.py`,
  validado com desenho real da Andritz) e o adaptador já consome isso.

## Banco real (Supabase)

Copie `.env.example` para `.env` e preencha `SUPABASE_DB_URL` com a
connection string do projeto (Project Settings → Database → Connection
string, modo "Transaction pooler"). Sem essa variável, o motor usa a
fixture local (`app/materiais_fixture.py`) — é o mesmo comportamento de
antes, os testes continuam rodando sem precisar de banco nenhum.

## Importar preços reais do ERP (`scripts/importar_precos_erp.py`)

Importa histórico de compra real (SQL Server, tabelas `FN_NFEITENS`/
`FN_NFE`/`FN_FORNECEDORES`) pra `historico_compras`. Acesso **somente
leitura** ao ERP — o script nunca escreve lá, só lê e grava no Supabase
(`historico_compras` e, por upsert, `fornecedores`; nunca cria linha nova
em `materiais` — norma+tipo sem cadastro fica reportada, não inventada).

```bash
./.venv/Scripts/python scripts/importar_precos_erp.py --dry-run   # só mostra o que faria
./.venv/Scripts/python scripts/importar_precos_erp.py             # importa de verdade
```

Idempotente (não duplica ao rodar de novo) e filtra preço/kg acima de
R$ 50 (`PRECO_KG_MAX_RAZOAVEL`) — descoberta real: algumas chapas grossas
foram lançadas no ERP com `PESOLIQ` zerado e o valor por peça inteira
aparecendo como se fosse R$/kg (ex: R$ 24.175/kg), erro de unidade na
origem, não um preço real. Credenciais do ERP em `.env`
(`ERP_SQL_SERVER`/`ERP_SQL_DATABASE`/`ERP_SQL_USER`/`ERP_SQL_PASSWORD`) —
ver `.env.example`.

## API HTTP (`app/main.py`)

Pra poder testar sem esperar o frontend (Node.js ainda não instalado):

```bash
./.venv/Scripts/uvicorn app.main:app --port 8002
```

- `GET /health`
- `POST /orcamento` — recebe a entrada já pronta (o dict que
  `montar_orcamento` espera) e devolve o orçamento calculado. Uso direto do
  motor, sem passar por PDF nenhum.
- `POST /orcamento-de-pdf` — recebe um PDF, chama `services/extractor` via
  HTTP (configurável por `EXTRACTOR_URL`, default `http://localhost:8001`,
  então o extractor precisa estar rodando também), monta a entrada com
  `adapter.py` e calcula o orçamento. Parâmetros opcionais no form:
  `peso_liquido_kg`, `area_pintura_m2`, `quantidade_posicoes_engenharia`,
  `cenario_comercial`, `usar_historico_horas`. Aceita `anexos` (lista de
  arquivos) pra BOM em anexo separado — ver README do extractor.
- `POST /orcamento-de-texto` — igual, mas a BOM vem digitada manualmente
  (form field `texto`, um item por linha) em vez de vir de um PDF — ver
  `services/extractor/app/extraction/bom_texto_manual.py` pro formato de
  linha aceito. Útil quando o orçamentista já sabe os itens de cabeça.
- `POST /orcamento/excel` — mesma entrada de `/orcamento`, devolve uma
  planilha `.xlsx` **editável** em vez de JSON (`app/excel_export.py`):
  peso, taxas por processo e alíquotas ficam em células próprias na aba
  "Parâmetros"; as outras abas usam fórmula (não valor fixo), então mudar
  um parâmetro recalcula tudo dentro do próprio Excel. Validado batendo
  exato (2 casas decimais) com o motor Python em dois cenários reais —
  achado no processo: `app/processos.py` arredonda as horas de
  caldeiraria pra 2 casas ANTES de repassar pro cálculo do jateamento/
  pintura, então a fórmula do Excel replica esse arredondamento
  intermediário com `ROUND(...)` (sem isso, a diferença era pequena mas
  real, ~R$0,01 em alguns casos).

`/orcamento-de-pdf` e `/orcamento-de-texto` devolvem, junto com o
orçamento, a `entrada` já adaptada (o mesmo formato que `/orcamento` e
`/orcamento/excel` esperam) — é assim que o frontend pede o Excel depois
sem precisar re-extrair nada.

Abra `http://localhost:8002/docs` (Swagger UI) pra testar pelo navegador —
"Try it out" em `/orcamento-de-pdf` aceita upload de arquivo direto na tela.

Essa combinação num endpoint só é uma conveniência de demonstração local —
em produção a orquestração PDF → extração → orçamento provavelmente mora no
backend do app principal (Next.js/Supabase), não aqui; os dois serviços
continuam desacoplados de propósito (conversam por HTTP, não por import
direto — inclusive porque os dois usam o nome de pacote `app` internamente,
então nunca devem rodar no mesmo processo Python).
