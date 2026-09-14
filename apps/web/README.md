# apps/web

Frontend do FC Nexus Orçamento Industrial I.A. — Next.js 16 (App Router,
TypeScript, Tailwind v4), gerado com `create-next-app`.

## Tela implementada

`src/app/page.tsx` (client component) implementa o fluxo alvo da
especificação: **Arrastar PDF → Analisar desenho → Conferir resultados**.

- `src/components/FormularioUpload.tsx` — drag-and-drop de PDF + campos
  opcionais de estimativa (peso, área de pintura, posições de engenharia,
  cenário comercial, usar histórico Macfab).
- `src/components/ResultadoOrcamento.tsx` — identificação extraída (com
  badge de confiança por campo), itens sinalizados para revisão, linhas de
  custo por processo com "Ver cálculo" expandível (mostra a memória de
  cálculo vinda do motor), e o resumo comercial.
- `src/lib/api.ts` — chama `POST {NEXT_PUBLIC_CALC_ENGINE_URL}/orcamento-de-pdf`
  (default `http://localhost:8002`), que por sua vez chama
  `services/extractor` via HTTP e roda `services/calc_engine`. Ver
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

- Só a tela de upload/análise existe. Não há: lista de orçamentos salvos,
  edição manual dos itens sinalizados para revisão, geração de PDF/proposta
  comercial, autenticação, nem conexão com Supabase (hoje os dois backends
  usam fixtures locais).
- O upload → orçamento é síncrono numa chamada só; para desenhos grandes
  (o exemplo real da Andritz com 11 folhas levou alguns segundos) vale
  considerar um estado de progresso mais granular no futuro.
