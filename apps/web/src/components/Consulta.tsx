"use client";

// Aba Consulta — pedido explícito do usuário (13/10/2026): contas só de
// consulta (jeferson, diego), que usam o CELULAR. Bem didática, com botões
// grandes e nada pra editar:
//  - Corte: o que está sendo cortado agora e a sequência (bolinha 1º, 2º…
//    que o operador põe na aba Corte), por máquina;
//  - Pedidos: pesquisar um pedido ATIVO (ST = A) pela MAC, PO ou desenho, ou
//    tocar no cliente, e ver as informações do pedido;
//  - Coletas: um botão por data/cliente preenchidos na coluna Coleta (por
//    Felipe e Marcelo), só ativos — abre o relatório de coleta.

import { useEffect, useMemo, useState } from "react";
import { listarFollowUp, listarProgramasCorte, urlImagemFollowUp } from "@/lib/api";
import { rotuloCliente } from "@/lib/clientes";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import { ETAPAS, faltaMaterial, normalizarBusca, situacaoEtapa } from "@/lib/followUp";
import { MAQUINAS } from "@/lib/maquinaCorte";
import type { ItemFollowUp, ProgramaCorte } from "@/lib/types";
import { BarraEtapa, SeloPrazo } from "@/components/FollowUpDetalhe";

const RECARREGAR_CORTE_MS = 2 * 60 * 1000;
const LIMITE_RESULTADOS = 60;
// "Cortados" (pedido do usuário): finalizados nos últimos dias, mais recente primeiro.
const DIAS_CORTADOS = 7;
const CORTADOS_INICIAL = 5;
const TODOS = "*"; // botão "Todos" dos clientes

type Tela = "corte" | "pedidos" | "coletas";

const TELAS: { tela: Tela; icone: string; rotulo: string; dica: string }[] = [
  { tela: "corte", icone: "✂️", rotulo: "Corte", dica: "O que está cortando e a sequência" },
  { tela: "pedidos", icone: "🔎", rotulo: "Pedidos", dica: "Pesquisar MAC, PO ou desenho" },
  { tela: "coletas", icone: "🚚", rotulo: "Coletas", dica: "Relatórios de coleta" },
];

function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nomeCliente(codigo: string | null): string {
  const nome = rotuloCliente(codigo);
  if (!nome) return "Sem cliente";
  return nome === codigo?.trim().toUpperCase() ? nome : `${nome} (${codigo})`;
}

function diaDaSemana(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
}

function horaAgora(): string {
  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// --- Corte -------------------------------------------------------------------

type Destaque = "cortando" | "fila" | "falta" | "cortado" | "outro";

// Situação do programa (lupa de pesquisa mostra todos, inclusive os já cortados).
function destaqueDe(p: ProgramaCorte): Destaque {
  if (p.finalizado_em) return "cortado";
  if (p.cortando_em) return "cortando";
  if (p.ordem) return "fila";
  if (p.falta_material_em) return "falta";
  return "outro";
}

// achou: peças que bateram com a pesquisa; comMaquina: mostra Laser/Oxicorte (na pesquisa).
function CartaoPrograma({
  p,
  destaque,
  achou,
  comMaquina = false,
}: {
  p: ProgramaCorte;
  destaque: Destaque;
  achou?: string[];
  comMaquina?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const clientes = [...new Set(p.itens.map((i) => rotuloCliente(i.cliente)).filter(Boolean))].sort();
  const macs = [...new Set(p.itens.map((i) => i.mac?.trim()).filter(Boolean))].sort();
  const cores = {
    cortando: "border-amber-400 bg-amber-50 dark:bg-amber-950/30",
    fila: "border-green-600 bg-white dark:border-cyan-600 dark:bg-slate-900",
    falta: "border-red-500 bg-red-50 dark:bg-red-950/30",
    cortado: "border-green-300 bg-green-50/60 dark:border-green-900 dark:bg-green-950/20",
    outro: "border-stone-200 bg-white dark:border-slate-700 dark:bg-slate-900",
  }[destaque];
  return (
    <button
      type="button"
      onClick={() => setAberto((a) => !a)}
      className={`flex w-full flex-col gap-1 rounded-2xl border-2 p-3 text-left active:scale-[0.99] ${cores}`}
    >
      <span className="flex items-center gap-3">
        {destaque === "fila" && p.ordem ? (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-700 font-mono text-xl font-extrabold text-white dark:bg-cyan-500 dark:text-slate-950">
            {p.ordem}º
          </span>
        ) : destaque === "cortando" ? (
          <span className="flex h-12 w-12 shrink-0 animate-pulse items-center justify-center rounded-full bg-amber-400 text-xl text-stone-900">
            ▶
          </span>
        ) : destaque === "cortado" ? (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">✔</span>
        ) : destaque === "falta" ? (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-600 text-xl text-white">⚠</span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
            Programa
            {comMaquina ? ` · ${MAQUINAS.find((m) => m.maquina === p.maquina)?.rotulo ?? ""}` : ""}
            {destaque === "fila" && comMaquina ? ` · ${p.ordem}º da fila` : ""}
            {destaque === "outro" ? " · a cortar" : ""}
            {destaque === "cortando" && p.cortando_por ? ` · ${p.cortando_por} desde ${new Date(p.cortando_em!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
            {destaque === "falta" ? " · falta material" : ""}
            {destaque === "cortado" && p.finalizado_em
              ? ` · cortado ${new Date(p.finalizado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${p.finalizado_por ? ` por ${p.finalizado_por}` : ""}`
              : ""}
          </span>
          <span className="block font-mono text-3xl font-extrabold leading-tight text-stone-900 dark:text-white">{p.programa}</span>
        </span>
        <span className="shrink-0 text-right text-xs text-stone-500 dark:text-slate-400">
          <span className="block font-mono text-lg font-bold text-stone-800 dark:text-slate-200">{formatarNumero(p.pecas, 0)}</span>
          peça(s)
        </span>
      </span>
      {clientes.length > 0 && (
        <span className="text-base font-extrabold leading-tight text-green-800 dark:text-cyan-300">{clientes.join(" · ")}</span>
      )}
      {macs.length > 0 && <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">MAC {macs.join(" · ")}</span>}
      {p.nao_cortar && !p.finalizado_em && (
        <span className="self-start rounded-lg bg-red-600 px-2 py-0.5 text-sm font-extrabold text-white">✕ NÃO É PARA CORTAR</span>
      )}
      {achou && achou.length > 0 && (
        <span className="flex flex-col gap-0.5 rounded-lg bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200">
          {achou.slice(0, 4).map((a) => (
            <span key={a}>🔎 {a}</span>
          ))}
          {achou.length > 4 && <span>… e mais {achou.length - 4} peça(s)</span>}
        </span>
      )}
      <span className="text-xs text-stone-500 dark:text-slate-400">
        {p.manual ? "ainda não está na Croqui" : p.mps.join(" · ") || "—"}
      </span>
      {aberto ? (
        <span className="mt-1 flex flex-col gap-1.5 border-t border-stone-200 pt-2 dark:border-slate-700">
          {p.itens.length === 0 && <span className="text-sm text-stone-500">Sem peças listadas.</span>}
          {p.itens.map((i) => (
            <span key={i.id} className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm font-bold text-stone-900 dark:text-white">{i.desenho ?? "—"}</span>
                <span className="block truncate text-xs text-stone-600 dark:text-slate-400">{i.descricao}</span>
              </span>
              <span className="shrink-0 font-mono text-xl font-extrabold text-stone-900 dark:text-white">
                {formatarNumero(i.qtt ?? 0, 0)}
              </span>
            </span>
          ))}
          <span className="text-center text-xs text-stone-400">toque para fechar</span>
        </span>
      ) : (
        <span className="text-xs font-medium text-green-700 dark:text-cyan-400">toque para ver as peças ▾</span>
      )}
    </button>
  );
}

function TelaCorte() {
  const [programas, setProgramas] = useState<ProgramaCorte[] | null>(null);
  const [erro, setErro] = useState("");
  const [atualizado, setAtualizado] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [agora, setAgora] = useState(0); // hora da última carga (base dos "últimos 7 dias")
  const [verTodosCortados, setVerTodosCortados] = useState<Record<string, boolean>>({});
  // Lupa (pedido do usuário): achar pelo programa, MAC, pedido (PO) ou desenho e ver se já foi cortado.
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let ativo = true;
    function buscar() {
      listarProgramasCorte()
        .then((l) => {
          if (!ativo) return;
          setProgramas(l);
          setAgora(Date.now());
          setAtualizado(horaAgora());
          setErro("");
        })
        .catch((e: Error) => ativo && setErro(e.message));
    }
    buscar();
    const id = setInterval(buscar, RECARREGAR_CORTE_MS);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [recarga]);

  if (erro && !programas) return <p className="rounded-xl bg-red-50 p-4 text-red-700">{erro}</p>;
  if (!programas)
    return <p className="py-10 text-center text-stone-500">Carregando… (o servidor pode levar até 1 minuto para acordar)</p>;

  const termo = normalizarBusca(busca);
  const resultados = termo
    ? programas
        .map((p) => {
          const achou = p.itens
            .filter((i) => [i.mac, i.pedido, i.desenho].some((v) => normalizarBusca(String(v ?? "")).includes(termo)))
            .map((i) => [i.desenho, i.pedido && `PO ${i.pedido}`, i.mac && `MAC ${i.mac}`].filter(Boolean).join(" · "));
          return { p, achou, peloNumero: p.programa.startsWith(termo) };
        })
        .filter((r) => r.peloNumero || r.achou.length > 0)
        .sort((a, b) => Number(b.peloNumero) - Number(a.peloNumero) || Number(b.p.programa) - Number(a.p.programa))
    : [];
  const abertos = programas.filter((p) => !p.finalizado_em);
  const limiteCortados = agora - DIAS_CORTADOS * 86400000;
  const cortadosRecentes = programas
    .filter((p) => p.finalizado_em && new Date(p.finalizado_em).getTime() >= limiteCortados)
    .sort((a, b) => b.finalizado_em!.localeCompare(a.finalizado_em!));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-slate-400">
        <span>Atualiza sozinho a cada 2 min · última às {atualizado}</span>
        <button
          type="button"
          onClick={() => setRecarga((r) => r + 1)}
          className="rounded-full border-2 border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 dark:border-slate-600 dark:text-slate-200"
        >
          ↻ Atualizar
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔎 Programa, MAC, pedido ou desenho"
          autoComplete="off"
          enterKeyHint="search"
          aria-label="Pesquisar no corte"
          className="h-14 min-w-0 flex-1 rounded-2xl border-2 border-stone-300 bg-white px-4 text-lg font-semibold text-stone-900 outline-none focus:border-green-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
        />
        {busca && (
          <button
            type="button"
            onClick={() => setBusca("")}
            aria-label="Limpar"
            className="h-14 w-14 shrink-0 rounded-2xl border-2 border-stone-300 text-xl text-stone-600 dark:border-slate-600 dark:text-slate-300"
          >
            ✕
          </button>
        )}
      </div>
      {termo ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-stone-700 dark:text-slate-300">
            {resultados.length === 0
              ? "Nenhum programa encontrado. O projetista pode ainda não ter feito o programa."
              : resultados.length > LIMITE_RESULTADOS
                ? `Mostrando ${LIMITE_RESULTADOS} de ${resultados.length} programas — digite mais para achar mais rápido.`
                : `${resultados.length} programa(s)`}
          </p>
          {resultados.slice(0, LIMITE_RESULTADOS).map(({ p, achou }) => (
            <CartaoPrograma key={p.programa} p={p} destaque={destaqueDe(p)} achou={achou} comMaquina />
          ))}
        </div>
      ) : (
      MAQUINAS.map((m) => {
        const daMaquina = abertos.filter((p) => p.maquina === m.maquina);
        const cortando = daMaquina.filter((p) => p.cortando_em);
        const fila = daMaquina.filter((p) => !p.cortando_em && p.ordem).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
        const falta = daMaquina.filter((p) => !p.cortando_em && !p.ordem && p.falta_material_em);
        const cortados = cortadosRecentes.filter((p) => p.maquina === m.maquina);
        const mostrarCortados = verTodosCortados[m.maquina] ? cortados : cortados.slice(0, CORTADOS_INICIAL);
        const cortadosHoje = cortados.filter(
          (p) => new Date(p.finalizado_em!).toDateString() === new Date(agora).toDateString(),
        ).length;
        return (
          <section key={m.maquina} className={`flex flex-col gap-3 rounded-2xl border-2 ${m.borda} bg-white/60 p-3 dark:bg-slate-900/30`}>
            <h2 className={`text-2xl font-extrabold ${m.titulo}`}>
              {m.icone} {m.rotulo}
            </h2>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">▶ Cortando agora</h3>
              {cortando.length === 0 ? (
                <p className="rounded-xl bg-stone-100 p-3 text-center text-sm text-stone-500 dark:bg-slate-800 dark:text-slate-400">
                  Nada cortando agora.
                </p>
              ) : (
                cortando.map((p) => <CartaoPrograma key={p.programa} p={p} destaque="cortando" />)
              )}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-green-800 dark:text-cyan-300">
                🔢 Próximos (sequência de corte)
              </h3>
              {fila.length === 0 ? (
                <p className="rounded-xl bg-stone-100 p-3 text-center text-sm text-stone-500 dark:bg-slate-800 dark:text-slate-400">
                  O operador ainda não definiu a sequência.
                </p>
              ) : (
                fila.map((p) => <CartaoPrograma key={p.programa} p={p} destaque="fila" />)
              )}
            </div>

            {falta.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wide text-red-700 dark:text-red-400">⚠ Falta material</h3>
                {falta.map((p) => (
                  <CartaoPrograma key={p.programa} p={p} destaque="falta" />
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-green-700 dark:text-green-400">
                ✔ Cortados{" "}
                <span className="font-normal normal-case text-stone-500 dark:text-slate-400">
                  — hoje {cortadosHoje} · últimos {DIAS_CORTADOS} dias {cortados.length}
                </span>
              </h3>
              {cortados.length === 0 ? (
                <p className="rounded-xl bg-stone-100 p-3 text-center text-sm text-stone-500 dark:bg-slate-800 dark:text-slate-400">
                  Nenhum programa cortado nos últimos {DIAS_CORTADOS} dias.
                </p>
              ) : (
                <>
                  {mostrarCortados.map((p) => (
                    <CartaoPrograma key={p.programa} p={p} destaque="cortado" />
                  ))}
                  {cortados.length > CORTADOS_INICIAL && (
                    <button
                      type="button"
                      onClick={() => setVerTodosCortados((v) => ({ ...v, [m.maquina]: !v[m.maquina] }))}
                      className="rounded-xl border-2 border-dashed border-green-500 py-2 text-sm font-bold text-green-700 dark:text-green-400"
                    >
                      {verTodosCortados[m.maquina]
                        ? "Mostrar menos ▴"
                        : `Ver todos os ${cortados.length} cortados ▾`}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        );
      }))}
    </div>
  );
}

// --- Pedidos -----------------------------------------------------------------

function CartaoPedido({ i }: { i: ItemFollowUp }) {
  const [aberto, setAberto] = useState(false);
  const foto = i.imagens[0];
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-stone-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <button type="button" onClick={() => setAberto((a) => !a)} className="flex gap-3 text-left">
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine
          <img
            src={urlImagemFollowUp(foto.sha256)}
            alt=""
            className="h-16 w-20 shrink-0 rounded-lg border border-stone-200 bg-white object-contain dark:border-slate-700"
          />
        ) : (
          <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xs text-stone-400 dark:bg-slate-800">
            sem foto
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-base font-extrabold text-stone-900 dark:text-white">{i.po}</span>
          <span className="block text-sm font-bold text-green-800 dark:text-cyan-300">
            {nomeCliente(i.cliente)}
            {i.mac ? ` · MAC ${i.mac}` : ""}
          </span>
          <span className="block truncate text-xs text-stone-600 dark:text-slate-400">
            {i.desenho ? `${i.desenho} · ` : ""}
            {i.descricao}
          </span>
        </span>
      </button>
      <div className="flex flex-wrap items-center gap-1.5">
        <SeloPrazo prazo={i.prazo_contratual} />
        {i.status && (
          <span className="rounded border border-stone-300 px-2 py-0.5 text-xs font-semibold text-stone-800 dark:border-slate-600 dark:text-slate-200">
            {i.status}
          </span>
        )}
        {faltaMaterial(i) && <span className="rounded bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Falta material</span>}
        {(i.coleta_data || i.coleta) && (
          <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
            🚚 Coleta {i.coleta_data ? formatarDataBr(i.coleta_data) : i.coleta}
          </span>
        )}
      </div>
      {aberto ? (
        <div className="flex flex-col gap-2 border-t border-stone-200 pt-2 text-sm dark:border-slate-700">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <Info rotulo="Quantidade" valor={i.quantidade != null ? formatarNumero(i.quantidade, 0) : null} />
            <Info rotulo="Peso total" valor={i.peso_total != null ? `${formatarNumero(i.peso_total, 2)} kg` : null} />
            <Info rotulo="Desenho" valor={i.desenho} />
            <Info rotulo="Tipagem" valor={i.tipagem} />
            <Info rotulo="Pintura" valor={[i.cor2, i.cor_2, i.plano_pintura].filter(Boolean).join(" · ") || null} />
            <Info rotulo="Fornecedor" valor={i.fornecedor} />
          </dl>
          <Info rotulo="Descrição" valor={i.descricao} />
          {i.obs_felipe_marcelo && <Info rotulo="Obs. Felipe / Marcelo" valor={i.obs_felipe_marcelo} />}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">Etapas</p>
            <div className="grid grid-cols-4 gap-1.5">
              {ETAPAS.map((e) => (
                <div key={e.campo} className="flex flex-col gap-0.5">
                  <span className="text-center text-[10px] font-bold text-stone-500 dark:text-slate-400">{e.rotulo}</span>
                  <BarraEtapa
                    valor={i[e.campo]}
                    cor={situacaoEtapa(i[e.campo]) === "concluida" ? "#16a34a" : "#f59e0b"}
                    compacta
                  />
                </div>
              ))}
            </div>
          </div>
          {i.imagens.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {i.imagens.map((im) => (
                <a key={im.sha256} href={urlImagemFollowUp(im.sha256)} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- imagem servida pelo calc_engine */}
                  <img
                    src={urlImagemFollowUp(im.sha256)}
                    alt=""
                    className="h-32 w-auto rounded-lg border border-stone-200 bg-white object-contain dark:border-slate-700"
                  />
                </a>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setAberto(false)} className="text-center text-xs text-stone-400">
            fechar ▴
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAberto(true)} className="text-left text-xs font-medium text-green-700 dark:text-cyan-400">
          toque para ver tudo do pedido ▾
        </button>
      )}
    </div>
  );
}

function Info({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">{rotulo}</dt>
      <dd className="break-words text-stone-900 dark:text-slate-100">{valor || "—"}</dd>
    </div>
  );
}

function TelaPedidos({ ativos }: { ativos: ItemFollowUp[] }) {
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState<string | null>(null);
  const porCliente = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of ativos) m.set(i.cliente ?? "", (m.get(i.cliente ?? "") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ativos]);
  const resultado = useMemo(() => {
    const termo = normalizarBusca(busca);
    let l = ativos;
    if (cliente !== null && cliente !== TODOS) l = l.filter((i) => (i.cliente ?? "") === cliente);
    if (termo)
      l = l.filter((i) => [i.po, i.mac, i.desenho].some((v) => normalizarBusca(String(v ?? "")).includes(termo)));
    // Prazo mais perto primeiro.
    return [...l].sort((a, b) => (a.prazo_contratual ?? "9999").localeCompare(b.prazo_contratual ?? "9999"));
  }, [ativos, busca, cliente]);
  const procurando = !!busca.trim() || cliente !== null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Digite a MAC, o PO ou o desenho"
          autoComplete="off"
          enterKeyHint="search"
          className="h-14 min-w-0 flex-1 rounded-2xl border-2 border-stone-300 bg-white px-4 text-lg font-semibold text-stone-900 outline-none focus:border-green-600 dark:border-slate-600 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
        />
        {procurando && (
          <button
            type="button"
            onClick={() => {
              setBusca("");
              setCliente(null);
            }}
            aria-label="Limpar"
            className="h-14 w-14 shrink-0 rounded-2xl border-2 border-stone-300 text-xl text-stone-600 dark:border-slate-600 dark:text-slate-300"
          >
            ✕
          </button>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
          Pedidos ativos por cliente — toque para ver
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setCliente(cliente === TODOS ? null : TODOS)}
            className={`rounded-2xl border-2 p-3 text-left ${
              cliente === TODOS
                ? "border-green-600 bg-green-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                : "border-stone-300 bg-white text-stone-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            }`}
          >
            <span className="block text-sm font-bold">Todos</span>
            <span className="font-mono text-2xl font-extrabold">{ativos.length}</span>
          </button>
          {porCliente.map(([c, n]) => (
            <button
              key={c}
              type="button"
              onClick={() => setCliente(cliente === c ? null : c)}
              className={`rounded-2xl border-2 p-3 text-left ${
                cliente === c
                  ? "border-green-600 bg-green-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                  : "border-stone-300 bg-white text-stone-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              }`}
            >
              <span className="block truncate text-sm font-bold">{nomeCliente(c || null)}</span>
              <span className="font-mono text-2xl font-extrabold">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {procurando && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-stone-700 dark:text-slate-300">
            {resultado.length === 0
              ? "Nenhum pedido ativo encontrado."
              : resultado.length > LIMITE_RESULTADOS
                ? `Mostrando ${LIMITE_RESULTADOS} de ${resultado.length} pedidos — digite mais para achar mais rápido.`
                : `${resultado.length} pedido(s)`}
          </p>
          {resultado.slice(0, LIMITE_RESULTADOS).map((i) => (
            <CartaoPedido key={i.id} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Coletas -----------------------------------------------------------------

interface DiaDeColeta {
  data: string;
  clientes: [string, { n: number; pecas: number; peso: number }][];
}

function linkColeta(data: string, cliente?: string) {
  const qs = new URLSearchParams({ data, ativos: "1" });
  if (cliente) qs.set("cliente", cliente);
  return `/follow-up/coleta?${qs}`;
}

function DiaColeta({ d, h, passado }: { d: DiaDeColeta; h: string; passado?: boolean }) {
  const total = d.clientes.reduce((s, [, c]) => s + c.n, 0);
  return (
    <section
      className={`flex flex-col gap-2 rounded-2xl border-2 p-3 ${
        passado
          ? "border-stone-200 bg-stone-50 opacity-75 dark:border-slate-700 dark:bg-slate-900/40"
          : d.data === h
            ? "border-green-600 bg-green-50 dark:border-cyan-500 dark:bg-cyan-950/30"
            : "border-sky-300 bg-white dark:border-sky-800 dark:bg-slate-900"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-2xl font-extrabold text-stone-900 dark:text-white">
          {formatarDataBr(d.data)}
          {d.data === h && <span className="ml-2 rounded bg-green-600 px-2 py-0.5 align-middle text-xs text-white">HOJE</span>}
        </h3>
        <span className="text-sm capitalize text-stone-500 dark:text-slate-400">{diaDaSemana(d.data)}</span>
      </div>
      {d.clientes.map(([c, info]) => (
        <a
          key={c}
          href={linkColeta(d.data, c || undefined)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-2 rounded-xl border-2 border-sky-500 bg-sky-50 px-3 py-3 active:scale-[0.99] dark:bg-sky-950/40"
        >
          <span className="min-w-0">
            <span className="block truncate text-lg font-extrabold text-sky-900 dark:text-sky-200">{nomeCliente(c || null)}</span>
            <span className="block text-xs text-sky-800/80 dark:text-sky-300/80">
              {info.n} pedido(s) · {formatarNumero(info.pecas, 0)} peça(s) · {formatarNumero(info.peso, 0)} kg
            </span>
          </span>
          <span className="shrink-0 text-sm font-bold text-sky-700 dark:text-sky-300">📄 Abrir ›</span>
        </a>
      ))}
      {d.clientes.length > 1 && (
        <a
          href={linkColeta(d.data)}
          target="_blank"
          rel="noreferrer"
          className="rounded-xl border-2 border-dashed border-sky-400 px-3 py-2 text-center text-sm font-bold text-sky-800 dark:text-sky-300"
        >
          📄 Todos os clientes do dia ({total} pedidos)
        </a>
      )}
    </section>
  );
}


function TelaColetas({ ativos }: { ativos: ItemFollowUp[] }) {
  const dias = useMemo((): DiaDeColeta[] => {
    const m = new Map<string, Map<string, { n: number; pecas: number; peso: number }>>();
    for (const i of ativos) {
      if (!i.coleta_data) continue;
      const doDia = m.get(i.coleta_data) ?? new Map();
      m.set(i.coleta_data, doDia);
      const c = doDia.get(i.cliente ?? "") ?? { n: 0, pecas: 0, peso: 0 };
      c.n++;
      c.pecas += i.quantidade ?? 0;
      c.peso += i.peso_total ?? 0;
      doDia.set(i.cliente ?? "", c);
    }
    return [...m.entries()].map(([data, clientes]) => ({
      data,
      clientes: [...clientes.entries()].sort((a, b) => b[1].n - a[1].n),
    }));
  }, [ativos]);
  const h = hoje();
  const proximas = dias.filter((d) => d.data >= h).sort((a, b) => a.data.localeCompare(b.data));
  const anteriores = dias.filter((d) => d.data < h).sort((a, b) => b.data.localeCompare(a.data));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-stone-600 dark:text-slate-400">
        Coletas marcadas pelo Felipe e pelo Marcelo (só pedidos ativos). Toque no cliente para abrir o relatório.
      </p>
      {proximas.length === 0 && (
        <p className="rounded-xl bg-stone-100 p-4 text-center text-stone-500 dark:bg-slate-800 dark:text-slate-400">
          Nenhuma coleta marcada de hoje em diante.
        </p>
      )}
      {proximas.map((d) => (
        <DiaColeta key={d.data} d={d} h={h} />
      ))}
      {anteriores.length > 0 && (
        <details className="rounded-2xl border border-stone-200 p-2 dark:border-slate-700">
          <summary className="cursor-pointer px-1 py-1 text-sm font-semibold text-stone-600 dark:text-slate-400">
            Coletas de dias anteriores ({anteriores.length})
          </summary>
          <div className="mt-2 flex flex-col gap-3">
            {anteriores.map((d) => (
              <DiaColeta key={d.data} d={d} h={h} passado />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// --- Tela ----------------------------------------------------------------------

// soColetas: aba "Coletas" da Qualidade — só essa tela, sem os 3 botões.
// semCorte: felipe (Pintura) não vê a tela Corte — pedido do usuário (13/10/2026).
export default function Consulta({
  inicial = "corte",
  soColetas = false,
  semCorte = false,
}: {
  inicial?: Tela;
  soColetas?: boolean;
  semCorte?: boolean;
}) {
  const [tela, setTela] = useState<Tela>(inicial);
  // Follow up: carrega só quando abre Pedidos/Coletas (é grande — ver
  // memória do egress do Supabase); recarrega no botão "Atualizar".
  const [ativos, setAtivos] = useState<ItemFollowUp[] | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [atualizado, setAtualizado] = useState("");

  // Abrindo direto em Pedidos/Coletas: já carrega o Follow up.
  useEffect(() => {
    if (inicial !== "corte") carregarFollowUp();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na 1ª vez
  }, []);

  function carregarFollowUp() {
    setCarregando(true);
    setErro("");
    listarFollowUp()
      .then((r) => {
        setAtivos(r.itens.filter((i) => i.st === "A"));
        setAtualizado(horaAgora());
      })
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }

  function abrir(t: Tela) {
    setTela(t);
    if (t !== "corte" && !ativos && !carregando) carregarFollowUp();
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
      <div className={soColetas ? "hidden" : `grid ${semCorte ? "grid-cols-2" : "grid-cols-3"} gap-2`}>
        {TELAS.filter((t) => !semCorte || t.tela !== "corte").map((t) => (
          <button
            key={t.tela}
            type="button"
            onClick={() => abrir(t.tela)}
            className={`flex flex-col items-center gap-0.5 rounded-2xl border-2 px-1 py-3 active:scale-[0.97] ${
              tela === t.tela
                ? "border-green-600 bg-green-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                : "border-stone-300 bg-white text-stone-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            }`}
          >
            <span className="text-3xl leading-none">{t.icone}</span>
            <span className="text-base font-extrabold">{t.rotulo}</span>
            <span className={`text-center text-[10px] leading-tight ${tela === t.tela ? "text-white/90" : "text-stone-500 dark:text-slate-400"}`}>
              {t.dica}
            </span>
          </button>
        ))}
      </div>

      {tela === "corte" ? (
        <TelaCorte />
      ) : erro ? (
        <div className="flex flex-col gap-2 rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {erro}
          <button type="button" onClick={carregarFollowUp} className="rounded-lg bg-red-600 px-3 py-2 font-bold text-white">
            Tentar de novo
          </button>
        </div>
      ) : !ativos ? (
        <p className="py-10 text-center text-stone-500">Carregando pedidos… (o servidor pode levar até 1 minuto para acordar)</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs text-stone-500 dark:text-slate-400">
            <span>
              {ativos.length} pedidos ativos · carregado às {atualizado}
            </span>
            <button
              type="button"
              onClick={carregarFollowUp}
              disabled={carregando}
              className="rounded-full border-2 border-stone-300 px-3 py-1.5 text-sm font-semibold text-stone-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200"
            >
              {carregando ? "Atualizando…" : "↻ Atualizar"}
            </button>
          </div>
          {tela === "pedidos" ? <TelaPedidos ativos={ativos} /> : <TelaColetas ativos={ativos} />}
        </>
      )}
    </div>
  );
}
