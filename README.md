# FC Nexus — Orçamento Industrial I.A.

Sistema que recebe desenhos técnicos em PDF e devolve uma análise completa
de fabricação, custo industrial e preço sugerido de venda — sem exigir que
o orçamentista preencha manualmente matéria-prima, peso, horas, pintura,
solda etc. O usuário só revisa os itens que o sistema classificar com
confiança baixa.

## Regra central do projeto

**A IA nunca calcula peso, custo, hora ou preço.** Ela só interpreta o
desenho e devolve dados estruturados com um nível de confiança por campo.
Todo cálculo é feito por fórmulas determinísticas do motor matemático do
próprio sistema, usando dados cadastrados (preços, produtividade, custos/hora,
impostos) e histórico real de produção. Isso é o que torna o orçamento
auditável: cada valor final deve poder mostrar "Ver cálculo" com a memória
exata de como chegou naquele número.

## Arquitetura híbrida (grátis primeiro, IA como fallback)

```
PDF
 └─ Camada 1: texto nativo (PyMuPDF)
      └─ Camada 2: OCR local (Tesseract) nas páginas sem texto suficiente
           └─ Camada 3: heurísticas/regex → JSON estruturado + confiança por campo
                └─ confiança suficiente? ── sim → motor de cálculo
                                        └── não → IA externa (OpenAI/Claude) SOMENTE
                                                  como complemento pontual, nunca
                                                  para calcular valores finais
```

OpenAI/Claude **não são chamados em todo orçamento** — só quando o pipeline
local fica com confiança baixa em campos essenciais. A arquitetura também
deixa aberto o caminho para um modelo multimodal local/open-source no futuro,
eliminando de vez o custo de API por orçamento.

Ver memória do projeto: decisão registrada em
`arquitetura_hibrida_ia_fallback` para detalhes e justificativa.

## Descoberta importante já validada com um desenho real

Testado contra `A752193_0 - 4501690746-10 e 20.pdf` (desenho real da Macfab,
cliente Weir, MAC_573.26): a folha principal do PDF tem o texto desenhado
como curvas vetoriais, não como texto extraível — `PyMuPDF.get_text()` volta
quase vazio mesmo com a folha cheia de anotações visíveis. Ou seja, **o OCR
não é um fallback raro, é essencial** para a maioria dos desenhos reais desta
carteira. O pipeline já foi desenhado para verificar densidade de texto por
página (não só "existe algum texto no PDF?") e mandar cada página fraca para
OCR individualmente.

No mesmo teste, o que já é extraível sem OCR nesta folha (texto nativo puro):
pedido/PO (`4501690746-10, 4501690746-20`), código do equipamento
(`MAC_573.26`) e a especificação de pintura (`ESP. TOTAL: 225um`, demãos
INTERGARD/INTERSEAL). Número do desenho, revisão e BOM dependem de OCR nas
outras páginas — ainda não testado ponta a ponta porque o binário do
Tesseract não está instalado nesta máquina (ver "Pendências").

O mesmo vale para a extração de BOM em tabela (`app/extraction/bom_table.py`):
rodando `pdfplumber` contra esse PDF real, ele até acha a grade da tabela
pelas linhas vetoriais, mas todas as células voltam vazias (mesmo motivo —
texto como curva, não como texto).

**Mas nem todo desenho da pasta de referência é assim.** Rodando o mesmo
teste contra `MAC_0785.26 - Dispositivos (RAYRON) - ANDRITZ - OK\
837859-F-CF00-10-DM-0018.pdf` (desenho real da Andritz, projeto "Torre de
Acesso ao Cone", 11 folhas), o texto é nativo de verdade e a BOM
("LISTA DE MATERIAL") aparece com dados reais — confirma que a extração de
tabela funciona em produção para desenhos que não dependem de OCR. Duas
descobertas desse teste real:
1. `pdfplumber` com configuração padrão às vezes junta a folha inteira numa
   única célula gigante quando a grade da tabela se mistura com as linhas
   do desenho técnico — funciona bem só quando a BOM tem sua própria grade
   limpa (algumas folhas do mesmo PDF têm isso, outras não). Ajustar
   `table_settings` fica para uma próxima iteração.
2. Nesse formato de BOM não existem colunas separadas de espessura/largura/
   diâmetro — a forma vem embutida no texto da própria descrição (ex:
   `"CHAPA 6 x 80"`, `"BARRA Ø25"`, `"CANTONEIRA 76,2 x 4,8"`,
   `"CHAPA (150 x 150 x 3mm)"`). `bom_table.py` agora reconhece esses
   padrões reais como um fallback quando não há coluna dedicada — exceto
   cantoneira/perfil L, que ainda não tem fórmula de peso no motor
   geométrico e por isso fica sinalizada para revisão em vez de forçada
   num tipo que não é (`"Tipo de geometria 'cantoneira' ainda não suportado
   pelo motor de cálculo"`).

## O que já existe neste repositório

- `supabase/migrations/0001_init.sql` — schema completo (materiais, perfis,
  chapas, fornecedores, histórico de compras, máquinas, custos/hora,
  processos, produtividade, consumíveis de solda, tintas, rendimentos de
  pintura, tratamentos, NDT, custos indiretos, regras de orçamento, impostos,
  clientes, orçamentos, itens, processos do orçamento, histórico realizado).
- `supabase/migrations/0002_seed_regras.sql` — parâmetros **reais** extraídos
  da planilha de referência da Macfab (`FAB ORÇ - WEIR - MAC_0573.26 A752193
  BASE - R0.xlsx`), incluindo as fórmulas exatas hoje usadas:
  - Corte = peso líquido × R$ 1,50/kg
  - Caldeiraria = peso líquido × 0,05 h/kg × R$ 60/h
  - Jateamento/pintura (MO) = horas de caldeiraria ÷ 24 × R$ 60/h
  - Solda: consumível = 3% do peso líquido × R$ 25/kg; gás = metade do peso
    do consumível × R$ 40
  - Pintura (material): litros por demão = área × 0,04 L/m² (fundo R$500/L,
    acabamento R$450/L)
  - NDT = peso líquido × R$ 0,50/kg
  - Engenharia = quantidade de posições/desenhos (hoje manual) × R$ 60
  - Embalagem = peso líquido × R$ 0,20/kg; Transporte = × R$ 0,25/kg;
    Energia = × R$ 0,25/kg
  - Fator de margem (markup) = 100% sobre o custo industrial (configurável)
  - Alíquota efetiva de venda por cenário: fabricação 25,585%, industrialização
    9,25%, serviço 14,33%
  - Impostos de compra: ICMS 18% + PIS/COFINS 9,25% deduzidos do bruto
- `services/extractor/` — serviço Python (FastAPI) do pipeline híbrido acima:
  - `app/extraction/text_extract.py` — texto nativo via PyMuPDF + detecção de
    densidade por página
  - `app/extraction/ocr.py` — OCR via Tesseract (com verificação de binário
    disponível, degrada com segurança se não instalado)
  - `app/extraction/bom_parser.py` — heurísticas de regex calibradas com o
    desenho real (norma ASTM/AISI, perfil W, PO, código de equipamento,
    especificação de pintura, indicação MACHINED)
  - `app/extraction/bom_table.py` — extração da lista de materiais (BOM) como
    tabela via pdfplumber: mapeia cabeçalhos em português OU inglês (desenhos
    de clientes como Weir/Andritz costumam vir em inglês) para os campos
    canônicos do `ItemBom`, infere `tipo_geometria` (chapa retangular,
    circular, barra redonda, perfil) a partir das colunas presentes, e
    **descarta tabelas sem cabeçalho reconhecível** em vez de adivinhar
    itens sem base — ver limite abaixo
  - `app/ai_fallback/client.py` — stub do fallback de IA externa, desligado
    por padrão, só ativa com `EXTRACTOR_AI_FALLBACK_ENABLED=1` + chave de API
  - `app/pipeline.py` — orquestra tudo e calcula confiança geral
  - `tests/test_bom_parser.py` e `tests/test_bom_table.py` — 17 testes,
    incluindo um PDF sintético (tabela real com grade + texto, gerada via
    PyMuPDF) e casos com strings reais de uma BOM real da Andritz
- `services/calc_engine/` — motor de cálculo determinístico (peso, custo por
  processo, custo industrial, impostos e preço de venda), lendo os mesmos
  parâmetros semeados acima:
  - `app/geometria.py` — peso de chapa retangular/circular, barra redonda,
    perfil e tubo redondo; validado contra os exemplos numéricos da própria
    planilha de referência
  - `app/processos.py` — uma função por processo (corte, caldeiraria,
    jateamento/pintura MO, usinagem, solda, pintura material, NDT,
    engenharia, embalagem, transporte, energia), cada uma devolvendo valor
    bruto, líquido e memória de cálculo
  - `app/comercial.py` — margem, alíquota por cenário, preço de venda com/sem
    impostos, R$/kg
  - `app/orcamento.py` — orquestra tudo
  - `app/adapter.py` — liga o extractor ao motor: transforma o JSON de
    `ResultadoExtracao` em entrada de `montar_orcamento`, calculando peso por
    item via geometria e sinalizando para revisão humana (`itens_para_revisao`)
    o que não tem geometria, material ou preço suficientes — ou confiança
    abaixo de 0,6
  - `app/materiais_fixture.py` — placeholder local de densidade/kg-m/preço
    (substituir por consulta real a `materiais`/`perfis`/`historico_compras`)
  - `tests/test_orcamento_a752193.py` — reconstrói o orçamento real
    MAC_0573.26/A752193 item a item e bate **exatamente** com a planilha:
    custo industrial R$ 58.027,43, venda R$ 116.054,86, R$ 34,97/kg
  - `tests/test_adapter.py` — cobre cálculo de peso (chapa/perfil/barra),
    itens sinalizados para revisão (geometria incompleta, material sem
    cadastro, preço ausente, baixa confiança) e integração ponta a ponta
  - 13 testes passando ao todo
- `apps/web/` — ainda não gerado (Node.js não está instalado nesta máquina);
  ver `apps/web/README.md` para os próximos passos.

## Bibliotecas (todas gratuitas/open source)

| Finalidade              | Biblioteca            |
|--------------------------|------------------------|
| Ler PDF vetorial          | PyMuPDF (fitz)         |
| Extrair tabelas/textos    | pdfplumber             |
| Manipular PDF             | pypdf                  |
| OCR                       | Tesseract (pytesseract)|
| Imagem/desenho            | OpenCV                 |
| Cálculos                  | Python / NumPy         |
| Manipulação de dados      | Pandas                 |
| Excel (leitura de referência) | openpyxl           |
| Banco                     | Supabase/PostgreSQL    |
| IA local futuramente      | modelo multimodal open-source |

## Como rodar o serviço de extração

```bash
cd services/extractor
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt   # Windows
./.venv/Scripts/python -m pytest tests/ -q
./.venv/Scripts/uvicorn app.main:app --reload --port 8001
```

`POST http://localhost:8001/extract` com um PDF em `multipart/form-data`
(campo `file`) devolve o JSON estruturado com confiança por campo.

## Pendências para os próximos passos

1. **Instalar Tesseract OCR** nesta máquina (ou no ambiente de deploy) para
   testar o pipeline ponta a ponta nas páginas que dependem de OCR.
2. **Instalar Node.js** para gerar o frontend Next.js (`apps/web`).
3. **Criar/conectar um projeto Supabase real** e rodar as migrations.
4. Decidir se/quando configurar uma chave de API (OpenAI ou Claude) para o
   fallback — o sistema funciona sem ela, só com confiança mais baixa nos
   campos que hoje dependem de OCR/IA visual (BOM completo, dimensões gerais,
   revisão em folhas sem texto nativo).
5. `services/extractor` já extrai BOM em tabela e já foi validado contra um
   desenho real com texto nativo (Andritz, ver acima) — não depende só de
   OCR. Falta afinar `table_settings` do pdfplumber pra tabelas que se
   misturam com o desenho técnico na mesma folha, e cobrir mais formatos de
   descrição (ex: perfis em polegada fracionária como `PERFIL TIPO "U" 3" x
   1/4"`). Cantoneira/perfil L não tem fórmula de peso no motor geométrico
   ainda — fica sinalizada para revisão. Falta também a camada de
   estimativa de horas por histórico (peso/material/complexidade similares
   → horas medianas de orçamentos passados) e trocar a fixture de
   materiais/preços por consulta real ao Supabase.
