import { useEffect, useState } from "react";
import { buscarCatalogoGeometria, buscarMateriais } from "./api";
import type { CatalogoGeometria, MaterialCatalogo } from "./types";

// Extraído de CalculoManual.tsx pra ser reaproveitado por qualquer tela
// que precise abrir um cartão de geometria (ex.: PainelItensOrcamento,
// que edita o item de matéria-prima direto na aba "Itens do orçamento",
// sem precisar trocar pra "Cálculo manual").
export function useCatalogoGeometria(onErro: (mensagem: string) => void) {
  const [catalogo, setCatalogo] = useState<CatalogoGeometria | null>(null);
  const [materiais, setMateriais] = useState<MaterialCatalogo[]>([]);

  useEffect(() => {
    buscarCatalogoGeometria()
      .then(setCatalogo)
      .catch((e) => onErro(e instanceof Error ? e.message : "Erro ao carregar os tipos de geometria."));
    buscarMateriais()
      .then(setMateriais)
      .catch((e) => onErro(e instanceof Error ? e.message : "Erro ao carregar a biblioteca de materiais."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { catalogo, materiais };
}
