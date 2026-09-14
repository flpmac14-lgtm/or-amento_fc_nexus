# apps/web

Frontend do FC Nexus Orçamento Industrial I.A. — Next.js 16 (App Router,
TypeScript, Tailwind v4), gerado com `create-next-app`.

## Tela implementada

`src/app/page.tsx` (client component) implementa o fluxo alvo da
especificação: **Enviar desenho (PDF) ou digitar itens → Analisar →
Conferir resultados → Relatório/Excel**. Paleta dark navy + ciano fixa
(não depende de `prefers-color-scheme`) — pedida explicitamente pelo
usuário a partir de uma referência visual.

- `src/components/FormularioUpload.tsx` — duas abas: **Enviar desenho
  (PDF)** (drag-and-drop) ou **Digitar itens** (textarea, um item por
  linha — `CHAPA CxLxE`, `BARRA REDONDA DxC`, `PERFIL designação
  comprimento C`, norma/qtd opcionais; ver
  `services/extractor/app/extraction/bom_texto_manual.py` pro parser).
  Mais campos opcionais de estimativa (peso, área de pintura, posições de
  engenharia, cenário comercial, usar histórico Macfab).
- `src/components/ResultadoOrcamento.tsx` — identificação extraída (com
  badge de confiança por campo), itens sinalizados para revisão, linhas de
  custo por processo com "Ver cálculo" expandível (mostra a memória de
  cálculo vinda do motor), e o resumo comercial.
- `src/components/RelatorioImpressao.tsx` — versão do resultado pronta
  pra impressão/PDF (fica oculta na tela, só aparece via CSS de
  impressão), com a memória de cálculo de cada linha sempre expandida.
  Botão "Relatório (PDF)" no header chama `window.print()` nativo — sem
  lib nova, usuário salva como PDF pelo diálogo do próprio navegador.
- Botão "Excel (editável)" no header chama `POST /orcamento/excel` (ver
  README do calc_engine) e baixa uma planilha `.xlsx` com fórmulas de
  verdade (não valores fixos) — peso e taxas por processo ficam em
  células editáveis, mudar um parâmetro recalcula tudo dentro do Excel.
- `src/lib/api.ts` — chama `POST {NEXT_PUBLIC_CALC_ENGINE_URL}/orcamento-de-pdf`
  ou `/orcamento-de-texto` (default `http://localhost:8002`), que por sua
  vez chama `services/extractor` via HTTP e roda `services/calc_engine`.
  A resposta inclui a `entrada` já adaptada, guardada no estado da página
  só pra poder pedir o Excel depois sem re-extrair nada. Ver
  `services/calc_engine/README.md`.

## Rodar

Precisa dos dois serviços Python rodando também (`services/extractor` na
porta 8001, `services/calc_engine` na porta 8002 — ambos com CORS liberado
para `http://localhost:3000`):

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## O que ainda falta aqui

- Não há: lista de orçamentos salvos, edição manual dos itens sinalizados
  para revisão (upload/texto e relatório/Excel já existem), autenticação,
  nem conexão direta do frontend com Supabase (quem fala com o banco é o
  `calc_engine`).
- Upload de múltiplos arquivos (desenho + anexo de BOM separada) já existe
  no backend (`POST /extract-varios`, `anexos=` em `/orcamento-de-pdf`),
  mas a tela ainda só deixa escolher um arquivo por vez.
- O upload → orçamento é síncrono numa chamada só; para desenhos grandes
  (o exemplo real da Andritz com 11 folhas levou alguns segundos) vale
  considerar um estado de progresso mais granular no futuro.
