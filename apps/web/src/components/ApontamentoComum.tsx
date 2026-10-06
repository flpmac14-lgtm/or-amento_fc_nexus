// Peças comuns das telas de apontamento por setor (ApontamentoSetor e
// ApontamentoHistorico).
import { urlImagemFollowUp, type Apontamento } from "@/lib/api";
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

/** O que está aberto no painel: um pedido do Follow up, um serviço interno ou um serviço novo. */
export type Alvo = { tipo: "pedido" | "servico"; id: string } | { tipo: "novo" };

/** Chave do apontamento em `atuais` (id do pedido ou do serviço interno). */
export function chaveApontamento(a: Apontamento): string {
  return a.item_id ?? a.servico_id ?? "";
}

/** "Foto" do serviço interno Macfab (não tem desenho do Follow up). */
export function FotoServico({ classe }: { classe: string }) {
  return (
    <div className={`flex flex-col items-center justify-center bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 ${classe}`}>
      <span className="text-3xl">🔧</span>
      <span className="text-[10px] font-bold uppercase">interno</span>
    </div>
  );
}
