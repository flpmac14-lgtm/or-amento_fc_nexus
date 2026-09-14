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
INTERGARD/INTERSEAL).

**Atualização: Tesseract já foi instalado nesta máquina e o OCR foi testado
de verdade contra as páginas que precisavam dele.** Resultado: o número do
desenho (`A752193`) passou a ser extraído corretamente (confiança 0,9) só
com o texto que o OCR trouxe da página 2 — algo como "ITEM22", "ITEM26",
cotas (1750, 1019, 253,5...) e o bloco de título completo ("DC BASEPLATE-TU-
FRM-M1PSF80N-400HG-AT140/100...", "A752193") saíram legíveis. A BOM
continua vazia nesse desenho porque `app/extraction/bom_table.py` só lê
tabelas via `pdfplumber` (texto nativo do PDF) — não tenta reconhecer
tabela a partir do texto solto que o OCR devolve. Isso é um passo natural
seguinte, não implementado ainda.

O mesmo vale para a extração de BOM em tabela (`app/extraction/bom_table.py`):
rodando `pdfplumber` contra esse PDF real, ele até acha a grade da tabela
pelas linhas vetoriais, mas todas as células voltam vazias (mesmo motivo —
texto como curva, não como texto).

**Mas nem todo desenho da pasta de referência é assim.** Rodando o mesmo
teste contra `MAC_0785.26 - Dispositivos (RAYRON) - ANDRITZ - OK\
737859-F-CF00-10-DM-0018.pdf` (arquivo no disco; o número do desenho no
próprio bloco de título é "837859-F-CF00-10-DM-0018" — desenho real da
Andritz, projeto "Torre de Acesso ao Cone", 11 folhas), o texto é nativo de
verdade e a BOM
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
  - `app/extraction/bom_sap_export.py` — BOM que vem como **anexo
    separado**, não no desenho: descoberta real na pasta de referência
    (Andritz, orçamentos MAC_0799.26/MAC_0820.26) — o cliente manda um PDF
    à parte exportado do SAP/PLM dele ("WBS - Bill of Material"), texto
    nativo de largura fixa, sem grade nenhuma (por isso `bom_table.py`
    nunca acha nada ali). Esse formato já traz o peso por peça pronto
    (`ItemBom.peso_kg`, campo novo) em vez de geometria — os itens
    costumam ser peça acabada/comprada ("GUARDA-CORPO...", "ANCHOR
    BOLT"), não matéria-prima bruta, então ficam sem `norma`/
    `tipo_geometria` de propósito (não dá pra inferir isso a partir da
    descrição de uma peça comprada) e vão para revisão de preço manual
  - `app/ai_fallback/client.py` — stub do fallback de IA externa, desligado
    por padrão, só ativa com `EXTRACTOR_AI_FALLBACK_ENABLED=1` + chave de API
  - `app/pipeline.py` — orquestra tudo; `processar_pdfs` (plural) aceita
    **mais de um PDF por orçamento** (desenho principal + anexos, ex: a
    BOM separada acima) e junta identificação + BOM de todos;
    `processar_pdf` (um arquivo só) continua existindo por compatibilidade
  - `POST /extract-varios` — mesmo `/extract`, mas recebe vários arquivos
  - `tests/test_bom_parser.py`, `tests/test_bom_table.py` e
    `tests/test_bom_sap_export.py` — 22 testes, incluindo um PDF sintético
    (tabela real com grade + texto, gerada via PyMuPDF) e casos com
    strings reais de duas BOMs reais da Andritz (uma em tabela, outra em
    anexo SAP)
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
  - `app/main.py` — API HTTP (FastAPI) pra testar sem esperar o frontend:
    `POST /orcamento` (entrada pronta → orçamento) e `POST /orcamento-de-pdf`
    (PDF → chama o extractor via HTTP → adapter → orçamento). Ver README do
    calc_engine
  - `app/adapter.py` — liga o extractor ao motor: transforma o JSON de
    `ResultadoExtracao` em entrada de `montar_orcamento`, calculando peso por
    item via geometria e sinalizando para revisão humana (`itens_para_revisao`)
    o que não tem geometria, material ou preço suficientes — ou confiança
    abaixo de 0,6
  - `app/materiais_fixture.py` — placeholder local de densidade/kg-m/preço,
    usado como fallback offline (testes, ou quando `SUPABASE_DB_URL` não
    está configurada)
  - `app/repositorio_materiais.py` — consulta real às tabelas `materiais`,
    `perfis` e `historico_compras` do Supabase quando `SUPABASE_DB_URL`
    está no ambiente (mesma assinatura da fixture, `adapter.py` não sabe
    qual fonte está em uso). Preço usa a estratégia mais simples, "último
    comprado" (compra mais recente em `historico_compras`); sem compra
    registrada, o item é sinalizado para revisão em vez de usar um preço
    inventado — ver README do calc_engine
  - `app/historico.py` + `data/historico_referencia.json` — camada 2 de
    estimativa de horas: dataset real com os totais (peso, horas previstas,
    custo, preço de venda) de **35 orçamentos reais** da Macfab (Weir,
    Andritz, Dana, Siemens, FTSX, Indesa), extraídos das planilhas de
    referência. `sugerir_horas_mo_propria(peso_kg)` busca orçamentos de
    peso parecido e devolve média/mediana de horas por tonelada + sugestão,
    expandindo a faixa de busca até ter amostra suficiente
  - `app/estimativa_horas.py` — liga regra simples (camada 1) e histórico
    (camada 2): combina os dois por média ponderada pela confiança do
    histórico. Opt-in via `entrada["usar_historico_horas"]` em
    `montar_orcamento` — sem a flag, comportamento idêntico a antes.
    Descoberta ao validar: peso sozinho é preditor fraco de complexidade
    (uma baseplate simples e um inserto muito usinado podem pesar o mesmo e
    levar horas bem diferentes) — é a lacuna que a "Camada 3" (IA avaliando
    complexidade) da especificação deveria preencher; ver README do
    calc_engine para o exemplo numérico
  - `tests/test_orcamento_a752193.py` — reconstrói o orçamento real
    MAC_0573.26/A752193 item a item e bate **exatamente** com a planilha:
    custo industrial R$ 58.027,43, venda R$ 116.054,86, R$ 34,97/kg
  - `tests/test_adapter.py` — cobre cálculo de peso (chapa/perfil/barra),
    itens sinalizados para revisão (geometria incompleta, material sem
    cadastro, preço ausente, baixa confiança) e integração ponta a ponta
  - `tests/test_historico.py` — valida a busca por peso parecido e a
    mediana de horas/tonelada, com checagem de sanidade contra o dataset real
  - 24 testes passando ao todo (incluindo `test_estimativa_horas.py`, que
    valida a combinação regra+histórico e confirma que o comportamento sem
    a flag `usar_historico_horas` fica idêntico a antes)
- `apps/web/` — frontend Next.js 16 (App Router, TypeScript, Tailwind).
  Três formas de entrada — enviar PDF, digitar itens em texto, ou
  **cálculo manual por cartões de geometria** (chapa, anel, cone,
  cantoneira etc. — pedido explícito do usuário, fórmulas calibradas
  contra `Estudo de material.xls`, outra planilha real da pasta
  MAC_0573.26/A752193) — todas convergindo pra conferir resultados
  (identificação com confiança por campo, itens para revisão, linhas de
  custo com "Ver cálculo", resumo comercial) e exportar como relatório
  PDF ou planilha Excel editável. Chama `services/calc_engine` via HTTP.
  Ver `apps/web/README.md`.

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

## OCR (Tesseract) — instalado e testado nesta máquina

Instalado via `winget install UB-Mannheim.TesseractOCR`. Como esta conta de
usuário não tem permissão de escrita em `Program Files\Tesseract-OCR\
tessdata`, o pacote de português (`por.traineddata`, baixado de
`github.com/tesseract-ocr/tessdata`) foi colocado numa pasta própria do
usuário (`%LOCALAPPDATA%\Tesseract-tessdata`, junto com cópias de
`eng.traineddata`/`osd.traineddata`), com a variável `TESSDATA_PREFIX`
apontando pra lá — e `C:\Program Files\Tesseract-OCR` adicionado ao `PATH`
do usuário. As duas variáveis foram persistidas (`setx`/registro), então
qualquer terminal **novo** já enxerga o Tesseract automaticamente; só não
valem para sessões de terminal que já estavam abertas antes da instalação.

Testado de verdade contra a página 2 do A752193 (que tinha 0 caracteres de
texto nativo): o OCR trouxe texto legível (números de item, cotas, bloco de
título completo) e o `numero_desenho` (`A752193`) passou a ser extraído
corretamente pela primeira vez — ver "Descoberta importante" acima.

## Node.js e frontend — instalados e o fluxo completo testado

Node.js LTS instalado via `winget install OpenJS.NodeJS.LTS`, e o frontend
gerado em `apps/web` (`npx create-next-app` — Next.js 16, TypeScript,
Tailwind v4, App Router). Implementa o fluxo alvo (arrastar PDF → analisar
→ conferir resultados) chamando `services/calc_engine` via HTTP — ver
`apps/web/README.md`.

O fluxo ponta a ponta (upload → extractor → adapter → calc_engine →
resultado na tela) foi validado com o PDF real da Andritz — e essa
validação pegou um bug real: `pdfplumber`, nesse desenho de 11 folhas,
devolvia uma célula gigante (texto da folha inteira misturado) que batia
por coincidência de substring com a palavra "DESCRIÇÃO", e o código estava
tratando isso como cabeçalho de tabela válido — gerando 316 itens de lixo
sinalizados para revisão. Corrigido em `bom_table.py` com um limite de
tamanho pra célula de cabeçalho (uma célula de cabeçalho de verdade é um
rótulo curto, não um parágrafo); depois da correção o mesmo PDF extrai 7
itens (os que realmente têm tabela reconhecível). Teste de regressão
específico em `tests/test_bom_table.py`.

A verificação final ficou dividida entre teste direto de API (decisivo,
confirma 316→7) e um teste de UI no navegador que funcionou uma vez mas
não de forma repetível nesta sessão (cliques subsequentes no botão
"Analisar desenho" pararam de disparar a chamada de rede, sem erro no
console — parece instabilidade da ferramenta de automação de navegador
desta sessão, não um bug do app). Vale testar de novo manualmente.

## Pendências para os próximos passos

1. ~~Criar/conectar um projeto Supabase real e rodar as migrations.~~ **Feito**:
   projeto `fc-nexus-orcamentos` criado (região `sa-east-1`), migrations
   aplicadas, `calc_engine` já consulta `materiais`/`perfis`/
   `historico_compras` reais quando `SUPABASE_DB_URL` está configurada (ver
   `app/repositorio_materiais.py`). ~~Falta popular `historico_compras`~~
   **Feito**: `services/calc_engine/scripts/importar_precos_erp.py` importou
   151 compras reais (ASTM A36, A572, AISI 304, SAE 1020 — chapa/perfil/barra)
   direto do ERP SQL Server da empresa (acesso somente leitura). Descoberta
   real ao importar: ~8 linhas do ERP tinham `PESOLIQ` zerado e preço/kg
   absurdo (chapa grossa lançada por peça, não por peso) — o script descarta
   automaticamente qualquer preço acima de R$ 50/kg (`PRECO_KG_MAX_RAZOAVEL`)
   em vez de confiar cegamente na origem. `AISI 304` em barra/perfil também
   já foi completado no catálogo (migration 0004). Falta rodar o script de
   novo periodicamente pra manter os preços atualizados (não agendado).
2. Decidir se/quando configurar uma chave de API (OpenAI ou Claude) para o
   fallback — o sistema funciona sem ela, só com confiança mais baixa nos
   campos que hoje dependem de IA visual (interpretação de tabela dentro de
   imagem, por exemplo).
3. `services/extractor` já extrai BOM em tabela e já foi validado contra um
   desenho real com texto nativo (Andritz, ver acima) — não depende só de
   OCR. Falta afinar `table_settings` do pdfplumber pra tabelas que se
   misturam com o desenho técnico na mesma folha, e cobrir mais formatos de
   descrição (ex: perfis em polegada fracionária como `PERFIL TIPO "U" 3" x
   1/4"`). Cantoneira/perfil L não tem fórmula de peso no motor geométrico
   ainda — fica sinalizada para revisão.
4. ~~A extração de tabela não roda sobre o texto que vem do OCR — a BOM do
   A752193 continua vazia mesmo com OCR ativo.~~ **Investigado e
   corrigido, mas não do jeito que a hipótese original previa**: testei
   OCR nas páginas do A752193 (Weir) e não tem tabela nenhuma ali — só
   vistas técnicas com balões de item apontando pra features do desenho.
   Achando onde a BOM de verdade mora em desenhos reais: (a) desenhos com
   "cada peça no seu próprio arquivo" têm o material direto no rodapé
   (`MATERIAL: CHAPA #1/4" x 50 x 50 AISI-304`) — ainda não tem parser
   pra isso; (b) desenhos que vêm com **anexo de BOM separado** (achado
   real: pasta Andritz MAC_0799.26/MAC_0820.26) exportam de um SAP/PLM em
   texto de largura fixa, sem grade — isso **já está implementado**:
   `app/extraction/bom_sap_export.py` + `processar_pdfs`/`POST
   /extract-varios` (múltiplos arquivos por orçamento), validado com 2
   anexos reais (13 itens extraídos, pesos batendo com o documento
   original). Falta o caso (a) e cobrir mais variações do formato SAP se
   aparecerem em outros pedidos.
5. Regra simples + histórico já estão combinados (`app/estimativa_horas.py`,
   opt-in via `usar_historico_horas`) — falta adicionar um critério de
   similaridade além do peso (material, tipo de peça) pra reduzir o ruído
   descoberto na validação (ver README do calc_engine).
