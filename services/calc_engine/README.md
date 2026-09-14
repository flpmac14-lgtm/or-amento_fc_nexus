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

As camadas 1 e 2 já existem e são independentes uma da outra — quem decide
como combiná-las (usar só a regra, só o histórico, ou uma mescla) ainda é
quem chama o motor, não o motor em si.

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

## Rodar

```bash
python -m venv .venv
./.venv/Scripts/pip install -r requirements-dev.txt   # Windows
./.venv/Scripts/python -m pytest tests/ -v
```

## Adaptador (extractor → orçamento)

`app/adapter.py` já liga os dois serviços: recebe o JSON que
`services/extractor` devolve (`ResultadoExtracao.model_dump()`), calcula o
peso de cada item da BOM pelo motor geométrico (usando a fixture de
materiais/perfis em `app/materiais_fixture.py` — placeholder para as tabelas
reais `materiais`/`perfis`/`historico_compras` do Supabase) e monta a
entrada de `app.orcamento.montar_orcamento`.

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
- `sugerir_horas_caldeiraria` ainda não está ligado ao `adapter.py`/
  `orcamento.py` — hoje as horas continuam entrando como `estimativas`
  manuais em `montar_entrada_orcamento`. Falta decidir como combinar regra
  simples + histórico (usar o histórico quando a amostra for boa? mostrar
  os dois e deixar o orçamentista escolher?).
- Área de pintura e quantidade de posições de engenharia continuam como
  `estimativas` manuais — não têm histórico equivalente ainda.
- A fixture de materiais/preços é só um ponto de partida; precisa virar
  consulta real ao Supabase (`historico_compras` para preço, `materiais`/
  `perfis` para densidade e kg/m).
- `services/extractor` já extrai BOM em tabela (`app/extraction/bom_table.py`,
  validado com desenho real da Andritz) e o adaptador já consome isso.
