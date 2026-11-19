// Croqui de corte — peças comuns à planilha (components/CroquiCorte.tsx) e ao
// modo Apontar (components/CroquiApontar.tsx).

import { macBase } from "@/lib/almoxarifado";
import { minutosUteis } from "@/lib/jornada";
import type { ImagemFollowUp, ItemCroquiCorte } from "@/lib/types";

// Cores da formatação condicional da planilha (Status).
export const COR_STATUS: Record<string, string> = {
  "Sem Corte": "#44B3E1",
  Fazendo: "#FFFF00",
  Pausado: "#FFC000",
  Feito: "#DAF2D0",
  Terceirizado: "#C4A7E7",
  "Corte Manual": "#F8CBAD",
  "Aguardando revisão": "#FF0000",
};

// Foto de referência (pedido do usuário, 04/11/2026): a imagem do Follow up —
// da peça (PO = Pedido sem a posição), senão do desenho, senão da obra (MAC).
export type FotosRef = { grupos: ImagemFollowUp[][]; po: Record<string, number>; desenho: Record<string, number>; mac: Record<string, number> };
export function fotosDe(f: FotosRef | null, i: ItemCroquiCorte): ImagemFollowUp[] {
  if (!f) return [];
  const po = (i.pedido ?? "").trim().toUpperCase().replace(/\.[^.]*$/, "");
  const g = f.po[po] ?? f.desenho[(i.desenho ?? "").trim().toUpperCase()] ?? f.mac[macBase(i.mac)];
  return g === undefined ? [] : f.grupos[g] ?? [];
}

// Minutos de jornada trabalhados: etapas antes do último Fazendo + o trecho
// atual, que termina agora (Fazendo), no Pausado (Pausado, ou Feito depois de
// pausar) ou no Feito. Mesma regra de app/croqui_corte.py (migration 0032).
export function tempoMin(item: ItemCroquiCorte, agora: Date = new Date()): number | null {
  const anterior = item.tempo_anterior_min ?? 0;
  if (!item.dt_fazendo) return anterior || null;
  let fim: string | Date | null = null;
  if (item.status === "Fazendo") fim = agora;
  else if (item.status === "Pausado") fim = item.dt_pausado;
  else if (item.status === "Feito") fim = item.dt_pausado ?? item.dt_feito;
  if (!fim) return anterior || null;
  return anterior + minutosUteis(item.dt_fazendo, fim);
}
