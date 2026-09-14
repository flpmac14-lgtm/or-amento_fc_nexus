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
- A combinação regra+histórico ainda usa só peso como critério de
  similaridade — falta considerar material/tipo de peça (ver "Descoberta"
  acima), o que é literalmente a "Camada 3" da especificação.
- Área de pintura e quantidade de posições de engenharia continuam como
  `estimativas` manuais — não têm histórico equivalente ainda.
- A fixture de materiais/preços é só um ponto de partida; precisa virar
  consulta real ao Supabase (`historico_compras` para preço, `materiais`/
  `perfis` para densidade e kg/m).
- `services/extractor` já extrai BOM em tabela (`app/extraction/bom_table.py`,
  validado com desenho real da Andritz) e o adaptador já consome isso.
