export function formatarMoeda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarNumero(valor: number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

export function formatarPercentual(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return `${(valor * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function corConfianca(confianca: number): string {
  if (confianca >= 0.8) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (confianca >= 0.5) return "bg-amber-100 text-amber-800 border-amber-300";
  if (confianca > 0) return "bg-red-100 text-red-800 border-red-300";
  return "bg-zinc-100 text-zinc-500 border-zinc-300";
}

export const NOMES_PROCESSO: Record<string, string> = {
  materia_prima: "Matéria-prima",
  itens_padrao: "Itens standard",
  corte: "Corte",
  caldeiraria: "Caldeiraria",
  jateamento_pintura_mo: "Jateamento/Pintura (MO)",
  usinagem: "Usinagem",
  solda: "Solda",
  pintura_material: "Pintura (material)",
  ndt: "Ensaios NDT",
  engenharia: "Engenharia",
  embalagem: "Embalagem",
  transporte: "Transporte",
  energia: "Energia elétrica",
};
