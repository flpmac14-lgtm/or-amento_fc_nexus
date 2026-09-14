# calc_engine

Motor de cálculo determinístico do FC Nexus. Recebe dados já
extraídos/estimados de um orçamento (peso, geometria, área de pintura,
horas de usinagem, quantidade de posições de engenharia) e devolve peso,
custo por processo, custo industrial e preço de venda — cada linha com sua
memória de cálculo ("Ver cálculo").

**Este módulo não decide sozinho quantas horas uma peça vai levar** — isso é
o problema em três camadas descrito na especificação (regra simples aqui;
histórico Macfab e ajuste por IA entram numa camada de estimativa futura,
fora deste motor). As funções aqui só fazem a conta a partir de números já
decididos.

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
- Horas de caldeiraria/usinagem, área de pintura e quantidade de posições de
  engenharia continuam como `estimativas` manuais — a camada de estimativa
  por histórico/IA (item 5 da especificação) ainda não existe.
- A fixture de materiais/preços é só um ponto de partida; precisa virar
  consulta real ao Supabase (`historico_compras` para preço, `materiais`/
  `perfis` para densidade e kg/m).
- `services/extractor` ainda não extrai a BOM em tabela de verdade (`bom`
  sempre volta vazio hoje) — o adaptador já está pronto para quando isso
  existir.
