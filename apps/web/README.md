# apps/web (placeholder)

Frontend Next.js do FC Nexus Orçamento Industrial IA — ainda não gerado
porque esta máquina não tem Node.js instalado (`node`/`npm` não encontrados
em nenhum PATH nem instalação padrão do Windows).

## Para desbloquear

1. Instalar Node.js LTS (ex: `winget install OpenJS.NodeJS.LTS`).
2. Rodar dentro de `apps/web`:
   ```
   npx create-next-app@latest . --typescript --tailwind --app --eslint
   ```
3. Telas mínimas do fluxo alvo (ver README raiz do projeto):
   - Upload de PDF (drag-and-drop) → chama `POST /extract` do serviço em
     `services/extractor`.
   - Tela de conferência: mostra cada campo extraído com seu nível de
     confiança; campos abaixo do limiar ficam destacados para revisão manual.
   - Tela de orçamento: BOM com peso/custo calculado, processos detectados,
     "Ver cálculo" por linha, e resumo comercial (custo industrial, impostos,
     margem, preço de venda, R$/kg).
4. Conectar ao mesmo projeto Supabase usado pelo schema em `supabase/migrations/`.
