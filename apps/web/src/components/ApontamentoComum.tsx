// Peças comuns das telas de apontamento por setor (ApontamentoSetor e
// ApontamentoHistorico).
import { urlImagemFollowUp } from "@/lib/api";
import type { ItemFollowUp } from "@/lib/types";

/** "hoje 10:20", "ontem 16:05" ou "03/10 09:12". */
export function quando(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return `hoje ${hora}`;
  const ontem = new Date(hoje.getTime() - 86400000);
  if (d.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${hora}`;
}

/** 1ª foto do pedido no Follow up (ou "sem foto"). */
export function Foto({ item, classe }: { item: ItemFollowUp; classe: string }) {
  const img = item.imagens?.[0];
  if (!img)
    return (
      <div className={`flex items-center justify-center bg-stone-100 text-xs text-stone-400 dark:bg-slate-800 dark:text-slate-500 ${classe}`}>
        sem foto
      </div>
    );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- mídia do calc_engine, mesmo padrão do Follow up
    <img src={urlImagemFollowUp(img.sha256)} alt={item.desenho ?? item.po} loading="lazy" className={`bg-white object-contain ${classe}`} />
  );
}
