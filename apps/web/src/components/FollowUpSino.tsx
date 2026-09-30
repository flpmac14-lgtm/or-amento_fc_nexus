"use client";

// Sininho do Follow up — pedido explícito do usuário: avisar quando a
// sincronização de 15 min com a Controle de obras trouxer pedidos novos ou
// encerrar pedidos (ST deixa de ser A), mostrando os POs. "Visto" é por
// navegador (localStorage): o número some depois que a lista é aberta.

import { useEffect, useRef, useState } from "react";
import { listarNotificacoesFollowUp } from "@/lib/api";
import type { NotificacaoFollowUp } from "@/lib/types";

const RECARREGAR_A_CADA_MS = 5 * 60 * 1000;
const CHAVE_VISTO_PADRAO = "fcnexus.followup.notificacoes.vistoAte";

const ROTULO = {
  novo: { texto: "Novo", classe: "bg-green-600 text-white" },
  encerrado: { texto: "Encerrado", classe: "bg-stone-600 text-white" },
  reaberto: { texto: "Reaberto", classe: "bg-amber-500 text-white" },
} as const;

function lerVisto(chave: string): number {
  try {
    return Number(localStorage.getItem(chave) ?? 0) || 0;
  } catch {
    return 0;
  }
}

// semFoto/onColarFoto: pedido do usuário — o pedido novo já entra sozinho no
// Follow up; daqui ele só cola a foto (abre a janela de colar imagem direto).
// Também serve pra Croqui de corte (pedido do usuário: mesmo critério) —
// carregar/chaveVisto/titulo/dica trocam a fonte e os textos.
export default function FollowUpSino({
  onAbrirItem,
  semFoto,
  onColarFoto,
  carregar = listarNotificacoesFollowUp,
  chaveVisto = CHAVE_VISTO_PADRAO,
  titulo = "Notificações da Controle de obras",
  dica = "Pedidos novos e encerrados na Controle de obras (atualiza a cada 15 min)",
  vazio = "Nenhuma ainda. Aparecem aqui os pedidos novos e encerrados a cada atualização (15 min).",
}: {
  onAbrirItem: (itemId: string) => void;
  semFoto?: (itemId: string) => boolean;
  onColarFoto?: (itemId: string) => void;
  carregar?: () => Promise<NotificacaoFollowUp[]>;
  chaveVisto?: string;
  titulo?: string;
  dica?: string;
  vazio?: string;
}) {
  const [lista, setLista] = useState<NotificacaoFollowUp[]>([]);
  const [vistoAte, setVistoAte] = useState(0); // conta o número vermelho
  const [destaqueAte, setDestaqueAte] = useState(0); // destaca, na lista aberta, o que era novo
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ativo = true;
    let primeira = true;
    function buscar() {
      carregar()
        .then((l) => {
          if (!ativo) return;
          if (primeira) setVistoAte(lerVisto(chaveVisto)); // localStorage só existe no navegador
          primeira = false;
          setLista(l);
        })
        .catch(() => {}); // sininho não atrapalha a tela se falhar
    }
    buscar();
    const id = setInterval(buscar, RECARREGAR_A_CADA_MS);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [carregar, chaveVisto]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node))
        setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const naoVistas = lista.filter((n) => n.id > vistoAte).length;

  function alternar() {
    if (!aberto && lista.length) {
      const maior = Math.max(...lista.map((n) => n.id));
      try {
        localStorage.setItem(chaveVisto, String(maior));
      } catch {
        // sem localStorage: o número volta na próxima visita
      }
      setDestaqueAte(vistoAte);
      setVistoAte(maior);
    }
    setAberto((a) => !a);
  }

  // Agrupa por rodada de sincronização (mesmo minuto).
  const grupos: { quando: string; itens: NotificacaoFollowUp[] }[] = [];
  for (const n of lista) {
    const quando = new Date(n.criado_em).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
    const g = grupos[grupos.length - 1];
    if (g && g.quando === quando) g.itens.push(n);
    else grupos.push({ quando, itens: [n] });
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={alternar}
        title={dica}
        aria-label="Notificações"
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-stone-700 dark:text-slate-200 hover:border-green-600 dark:hover:border-cyan-500"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {naoVistas > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">
            {naoVistas > 99 ? "99+" : naoVistas}
          </span>
        )}
      </button>
      {aberto && (
        <div className="absolute right-0 top-11 z-[58] max-h-[70vh] w-[26rem] max-w-[90vw] overflow-auto rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
          <p className="sticky top-0 border-b border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-bold text-stone-900 dark:text-white">
            {titulo}
          </p>
          {lista.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-stone-500 dark:text-slate-400">
              {vazio}
            </p>
          ) : (
            grupos.map((g) => (
              <div
                key={g.quando}
                className="border-b border-stone-100 dark:border-slate-800"
              >
                <p className="bg-stone-50 dark:bg-slate-950/60 px-3 py-1 text-[11px] font-medium text-stone-500 dark:text-slate-400">
                  {g.quando}
                </p>
                {g.itens.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-center gap-1 pr-2 ${n.id > destaqueAte ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={!n.item_id}
                      onClick={() => {
                        if (!n.item_id) return;
                        onAbrirItem(n.item_id);
                        setAberto(false);
                      }}
                      title="Abrir o card do pedido"
                      className="flex min-w-0 flex-1 items-start gap-2 px-3 py-1.5 text-left hover:bg-green-50 dark:hover:bg-cyan-950/30"
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${ROTULO[n.tipo].classe}`}
                      >
                        {ROTULO[n.tipo].texto}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-mono text-xs font-semibold text-stone-900 dark:text-white">
                          {n.po}
                        </span>
                        {n.cliente && (
                          <span className="ml-1.5 text-xs text-stone-500 dark:text-slate-400">
                            {n.cliente}
                          </span>
                        )}
                        <span className="block truncate text-xs text-stone-600 dark:text-slate-400">
                          {n.descricao}
                        </span>
                      </span>
                    </button>
                    {n.tipo === "novo" && n.item_id && semFoto && onColarFoto && semFoto(n.item_id) && (
                      <button
                        type="button"
                        onClick={() => {
                          onColarFoto?.(n.item_id!);
                          setAberto(false);
                        }}
                        title="Colar a foto deste pedido (Ctrl+V)"
                        className="shrink-0 rounded border border-dashed border-green-600/60 dark:border-cyan-500/60 px-2 py-1 text-[11px] font-medium text-green-700 dark:text-cyan-300 hover:bg-green-50 dark:hover:bg-cyan-950/30"
                      >
                        + Colar foto
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
