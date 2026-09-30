"use client";

// Atalho F4 = limpar os filtros da aba aberta do módulo Follow up — pedido
// explícito do usuário. O ModuloFollowUp escuta a tecla e avisa qual aba está
// visível (as outras continuam montadas, escondidas, e não devem ser limpas).

import { useEffect, useRef } from "react";

export const EVENTO_LIMPAR_FILTROS = "fcnexus:limpar-filtros";

export function pedirLimparFiltros(aba: string) {
  window.dispatchEvent(new CustomEvent(EVENTO_LIMPAR_FILTROS, { detail: aba }));
}

export function useLimparComF4(aba: string, limpar: () => void) {
  const atual = useRef(limpar);
  useEffect(() => {
    atual.current = limpar;
  });
  useEffect(() => {
    function ouvir(e: Event) {
      if ((e as CustomEvent<string>).detail === aba) atual.current();
    }
    window.addEventListener(EVENTO_LIMPAR_FILTROS, ouvir);
    return () => window.removeEventListener(EVENTO_LIMPAR_FILTROS, ouvir);
  }, [aba]);
}
