"use client";

// Aba Corte (laser) — pedido explícito do usuário: o operador do corte a
// laser acha o programa pelo número (o "Nº do programa" que o projetista
// põe na Croqui de corte) e marca com UM TOQUE: Cortando, Finalizado ou
// Falta material. Tem que ser fácil até no celular, com o mínimo de
// digitação: teclado numérico, botões grandes, programas recentes em
// "cartões" pra só tocar. Quem marcou e quando fica gravado (app/corte.py).
// Programa manual (pedido do usuário): se o número ainda não está na Croqui
// de corte, o operador lança e marca assim mesmo; quando o projetista puser
// o número na Croqui, as peças se juntam sozinhas (mesmo número).

import { useEffect, useMemo, useRef, useState } from "react";
import { listarProgramasCorte, marcarProgramaCorte, salvarNriCorte } from "@/lib/api";
import { formatarNumero } from "@/lib/format";
import { emailParaLogin } from "@/lib/loginInterno";
import { criarClienteSupabaseNavegador } from "@/lib/supabase/client";
import type { MarcaCorte, ProgramaCorte } from "@/lib/types";
import CorteHistorico from "@/components/CorteHistorico";
import { NumeroPrograma, usePdfsCorte } from "@/components/PdfPrograma";
import { useLimparComF4 } from "@/lib/atalhoLimpar";

const RECARREGAR_A_CADA_MS = 2 * 60 * 1000;
// "Recentes" = liberados pelo projetista nos últimos dias e ainda não finalizados.
const DIAS_RECENTES = 30;

type Filtro = "recentes" | "cortando" | "falta" | "finalizados" | "todos";

const MARCAS: {
  marca: MarcaCorte;
  rotulo: string;
  icone: string;
  ligado: string;
  desligado: string;
}[] = [
  {
    marca: "cortando",
    rotulo: "Cortando",
    icone: "▶",
    ligado: "bg-amber-400 text-stone-900 border-amber-500",
    desligado: "border-amber-400 text-amber-700 dark:text-amber-300",
  },
  {
    marca: "finalizado",
    rotulo: "Finalizado",
    icone: "✔",
    ligado: "bg-green-600 text-white border-green-700",
    desligado: "border-green-600 text-green-700 dark:text-green-400",
  },
  {
    marca: "falta_material",
    rotulo: "Falta material",
    icone: "⚠",
    ligado: "bg-red-600 text-white border-red-700",
    desligado: "border-red-500 text-red-600 dark:text-red-400",
  },
];

function programaManual(programa: string): ProgramaCorte {
  return {
    programa,
    itens: [],
    liberado_em: null,
    manual: true,
    mps: [],
    pecas: 0,
    projetistas: [],
    cortando_em: null,
    cortando_por: null,
    finalizado_em: null,
    finalizado_por: null,
    falta_material_em: null,
    falta_material_por: null,
    nri: null,
    nri_por: null,
    nri_em: null,
  };
}

function situacao(p: ProgramaCorte): { texto: string; classe: string } {
  if (p.finalizado_em)
    return { texto: "Finalizado", classe: "bg-green-600 text-white" };
  if (p.falta_material_em)
    return { texto: "Falta material", classe: "bg-red-600 text-white" };
  if (p.cortando_em)
    return { texto: "Cortando", classe: "bg-amber-400 text-stone-900" };
  return {
    texto: "A cortar",
    classe: "bg-stone-200 text-stone-700 dark:bg-slate-700 dark:text-slate-200",
  };
}

function quando(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// comHistorico: a aba "Histórico de serviço" (pedido do usuário) — pra quem
// acompanha; o operador (perfil corte) fica só com os programas.
export default function Corte({
  comHistorico = true,
}: {
  comHistorico?: boolean;
}) {
  // PDF do programa na pasta de corte (pedido do usuário) — components/PdfPrograma.tsx.
  const { pdfsDe, abrir: abrirPdf } = usePdfsCorte();
  // Pedido do usuário: quem está apontando dá duplo clique no programa pra ver
  // o PDF. Com PDF, 1 clique abre o programa só depois de um instante (dá
  // tempo do 2º clique); sem PDF, abre na hora como antes.
  const esperaClique = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cliqueCartao(programa: string, detalhe: number) {
    if (!pdfsDe(programa).length) return setAbertoNum(programa);
    if (esperaClique.current) clearTimeout(esperaClique.current);
    if (detalhe > 1) return; // 2º clique: quem age é o onDoubleClick
    esperaClique.current = setTimeout(() => {
      esperaClique.current = null;
      setAbertoNum(programa);
    }, 280);
  }
  function duploCliqueCartao(programa: string) {
    if (esperaClique.current) clearTimeout(esperaClique.current);
    esperaClique.current = null;
    abrirPdf(programa);
  }
  const [tela, setTela] = useState<"programas" | "historico">("programas");
  const [salvo, setSalvo] = useState("");
  const [programas, setProgramas] = useState<ProgramaCorte[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [usuario, setUsuario] = useState<string | null>(null);
  const [numero, setNumero] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("recentes");
  const [abertoNum, setAbertoNum] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<MarcaCorte | null>(null);
  const [agora, setAgora] = useState(0);
  // NRI (pedido do usuário): anotado no apontamento; grava no "Salvar".
  const [nri, setNri] = useState("");

  useEffect(() => {
    let ativo = true;
    function buscar() {
      listarProgramasCorte()
        .then((l) => {
          if (!ativo) return;
          setProgramas(l);
          setAgora(Date.now());
          setErro("");
        })
        .catch((e: Error) => ativo && setErro(e.message))
        .finally(() => ativo && setCarregando(false));
    }
    buscar();
    const id = setInterval(buscar, RECARREGAR_A_CADA_MS);
    criarClienteSupabaseNavegador()
      .auth.getUser()
      .then(
        ({ data }) =>
          ativo &&
          data.user?.email &&
          setUsuario(emailParaLogin(data.user.email)),
      );
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, []);

  const porNumero = useMemo(
    () => new Map(programas.map((p) => [p.programa, p])),
    [programas],
  );
  const aberto = abertoNum ? (porNumero.get(abertoNum) ?? null) : null;
  const nriSalvo = aberto?.nri ?? "";
  // Ao abrir outro programa (ou o NRI gravado mudar), o campo começa com o NRI já gravado.
  const [nriDe, setNriDe] = useState("");
  const chaveNri = `${abertoNum ?? ""}|${nriSalvo}`;
  if (nriDe !== chaveNri) {
    setNriDe(chaveNri);
    setNri(nriSalvo);
  }

  const contagem = useMemo(() => {
    const limite = agora - DIAS_RECENTES * 86400000;
    const c = {
      recentes: 0,
      cortando: 0,
      falta: 0,
      finalizados: 0,
      todos: programas.length,
    };
    for (const p of programas) {
      if (p.finalizado_em) c.finalizados++;
      else {
        if (p.cortando_em) c.cortando++;
        if (p.falta_material_em) c.falta++;
        if (
          p.cortando_em ||
          p.falta_material_em ||
          p.manual ||
          (p.liberado_em && new Date(p.liberado_em).getTime() >= limite)
        )
          c.recentes++;
      }
    }
    return c;
  }, [programas, agora]);

  const lista = useMemo(() => {
    if (numero)
      return programas
        .filter((p) => p.programa.startsWith(numero))
        .slice(0, 60);
    const limite = agora - DIAS_RECENTES * 86400000;
    return programas.filter((p) => {
      if (filtro === "todos") return true;
      if (filtro === "finalizados") return !!p.finalizado_em;
      if (p.finalizado_em) return false;
      if (filtro === "cortando") return !!p.cortando_em;
      if (filtro === "falta") return !!p.falta_material_em;
      return (
        !!p.cortando_em ||
        !!p.falta_material_em ||
        p.manual ||
        (!!p.liberado_em && new Date(p.liberado_em).getTime() >= limite)
      );
    });
  }, [programas, numero, filtro, agora]);

  function digitar(valor: string) {
    const so = valor.replace(/\D/g, "");
    setNumero(so);
    // Número completo (nenhum outro programa começa com ele): abre direto.
    if (
      so &&
      porNumero.has(so) &&
      !programas.some((p) => p.programa !== so && p.programa.startsWith(so))
    )
      setAbertoNum(so);
  }

  // "Salvar" — pedido do usuário: cada toque já grava; aqui confere com o
  // servidor, avisa e fecha o painel.
  async function salvarEFechar(numeroProg: string) {
    setSalvando("cortando");
    setErro("");
    try {
      if (nri !== nriSalvo) await salvarNriCorte(numeroProg, nri, usuario);
      const l = await listarProgramasCorte();
      setProgramas(l);
      setSalvo(
        `✓ Programa ${numeroProg} salvo às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
      );
      setAbertoNum(null);
      setNumero("");
      setTimeout(() => setSalvo(""), 4000);
    } catch (e) {
      setErro(`Não consegui confirmar com o servidor: ${(e as Error).message}`);
    } finally {
      setSalvando(null);
    }
  }

  // Número que ainda não existe: cria só na tela; grava no servidor ao marcar.
  function lancarManual(n: string) {
    if (!porNumero.has(n)) setProgramas((l) => [programaManual(n), ...l]);
    setAbertoNum(n);
  }

  useLimparComF4("corte", () => {
    setNumero("");
    setFiltro("recentes");
  });

  async function marcar(p: ProgramaCorte, marca: MarcaCorte) {
    const valor = !p[`${marca}_em`];
    setSalvando(marca);
    setErro("");
    try {
      const atualizado = await marcarProgramaCorte(
        p.programa,
        marca,
        valor,
        usuario,
      );
      setProgramas((l) =>
        l.map((x) => (x.programa === atualizado.programa ? atualizado : x)),
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
      {comHistorico && (
        <div className="flex w-fit gap-1 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-1 text-sm">
          {(
            [
              ["programas", "Programas"],
              ["historico", "Histórico de serviço"],
            ] as const
          ).map(([t, r]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTela(t)}
              className={`rounded-md px-4 py-1.5 font-medium ${
                tela === t
                  ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950"
                  : "text-stone-600 dark:text-slate-400"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}
      {tela === "historico" ? (
        <CorteHistorico />
      ) : (
        <>
          {salvo && (
            <div className="rounded-xl border-2 border-green-600 bg-green-50 dark:bg-green-950/40 p-3 text-center text-lg font-bold text-green-700 dark:text-green-300">
              {salvo}
            </div>
          )}
          <div className="rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-3 sm:p-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">
                Nº do programa
              </span>
              <div className="flex gap-2">
                <input
                  value={numero}
                  onChange={(e) => digitar(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && numero)
                      if (porNumero.has(numero)) setAbertoNum(numero);
                      else lancarManual(numero);
                  }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="Digite o número"
                  className="h-16 min-w-0 flex-1 rounded-xl border-2 border-stone-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-4 font-mono text-3xl font-bold text-stone-900 dark:text-white outline-none focus:border-green-600 dark:focus:border-cyan-400"
                />
                {numero && (
                  <button
                    type="button"
                    onClick={() => setNumero("")}
                    aria-label="Limpar"
                    className="h-16 w-16 shrink-0 rounded-xl border-2 border-stone-300 dark:border-slate-600 text-2xl text-stone-600 dark:text-slate-300"
                  >
                    ✕
                  </button>
                )}
              </div>
            </label>
            {!numero && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {(
                  [
                    ["recentes", `Para cortar (${contagem.recentes})`],
                    ["cortando", `Cortando (${contagem.cortando})`],
                    ["falta", `Falta material (${contagem.falta})`],
                    ["finalizados", `Finalizados (${contagem.finalizados})`],
                    ["todos", `Todos (${contagem.todos})`],
                  ] as [Filtro, string][]
                ).map(([f, rotulo]) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFiltro(f)}
                    className={`shrink-0 rounded-full border-2 px-4 py-2 text-sm font-semibold ${
                      filtro === f
                        ? "border-green-600 bg-green-600 text-white dark:border-cyan-500 dark:bg-cyan-600"
                        : "border-stone-300 text-stone-700 dark:border-slate-600 dark:text-slate-300"
                    }`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>

          {erro && (
            <div className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-700 dark:text-red-300">
              {erro}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {lista.map((p) => {
              const s = situacao(p);
              return (
                <button
                  key={p.programa}
                  type="button"
                  onClick={(e) => cliqueCartao(p.programa, e.detail)}
                  onDoubleClick={() => duploCliqueCartao(p.programa)}
                  title={pdfsDe(p.programa).length ? "Toque para apontar · duplo clique abre o PDF" : undefined}
                  className="flex flex-col gap-1 rounded-xl border-2 border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-left active:scale-[0.98] hover:border-green-600 dark:hover:border-cyan-500"
                >
                  <span className="font-mono text-3xl font-bold text-stone-900 dark:text-white">
                    <NumeroPrograma programa={p.programa} />
                  </span>
                  <span className="flex flex-wrap gap-1">
                    <span
                      className={`w-fit rounded px-2 py-0.5 text-xs font-bold ${s.classe}`}
                    >
                      {s.texto}
                    </span>
                    {p.nri && (
                      <span className="w-fit rounded border border-stone-400 px-2 py-0.5 font-mono text-xs font-bold text-stone-700 dark:border-slate-500 dark:text-slate-200">
                        NRI {p.nri}
                      </span>
                    )}
                    {p.manual && (
                      <span className="w-fit rounded border border-sky-500 px-2 py-0.5 text-xs font-bold text-sky-700 dark:text-sky-300">
                        Manual
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-stone-600 dark:text-slate-400">
                    {p.manual ? "ainda não está na Croqui" : p.mps.join(" · ") || "—"}
                  </span>
                  <span className="text-xs text-stone-500 dark:text-slate-500">
                    {formatarNumero(p.pecas, 0)} peça(s) · {p.itens.length}{" "}
                    item(ns)
                  </span>
                </button>
              );
            })}
          </div>
          {numero && !porNumero.has(numero) && !carregando && (
            <button
              type="button"
              onClick={() => lancarManual(numero)}
              className="mx-auto flex w-full max-w-md flex-col items-center gap-1 rounded-2xl border-4 border-dashed border-sky-500 bg-sky-50 px-4 py-4 text-sky-800 active:scale-[0.98] dark:bg-sky-950/40 dark:text-sky-200"
            >
              <span className="text-2xl font-extrabold">+ Lançar programa {numero} manualmente</span>
              <span className="text-xs">
                Ainda não está na Croqui de corte. Marque o status agora; as peças aparecem quando o projetista colocar o número lá.
              </span>
            </button>
          )}
          {lista.length === 0 && (
            <p className="py-10 text-center text-stone-500 dark:text-slate-400">
              {carregando
                ? "Carregando… (o servidor pode levar até 1 minuto para acordar)"
                : numero
                  ? `Nenhum programa começando com ${numero}.`
                  : "Nenhum programa aqui."}
            </p>
          )}
        </>
      )}

      {aberto && (
        <div
          className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/60 sm:items-center sm:p-4"
          onClick={() => setAbertoNum(null)}
        >
          <div
            className="flex h-full w-full flex-col overflow-y-auto bg-stone-50 dark:bg-slate-950 sm:h-auto sm:max-h-[92vh] sm:max-w-3xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-stone-200 dark:border-slate-800 bg-stone-50 dark:bg-slate-950 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-slate-400">
                  Programa
                </p>
                <p
                  className="font-mono text-5xl font-extrabold leading-none text-stone-900 dark:text-white"
                  onDoubleClick={() => abrirPdf(aberto.programa)}
                  title={pdfsDe(aberto.programa).length ? "Duplo clique abre o PDF" : undefined}
                >
                  <NumeroPrograma programa={aberto.programa} />
                </p>
                {pdfsDe(aberto.programa).length > 0 && (
                  <button
                    type="button"
                    onClick={() => abrirPdf(aberto.programa)}
                    className="mt-2 rounded-xl border-2 border-blue-600 bg-blue-50 px-4 py-2 text-lg font-bold text-blue-700 active:scale-[0.98] dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-300"
                  >
                    📄 Abrir PDF do programa
                  </button>
                )}
                {aberto.manual ? (
                  <p className="mt-2 max-w-md rounded-lg border border-sky-400 bg-sky-50 px-2 py-1 text-sm text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                    <strong>Lançado manualmente</strong> — ainda não está na Croqui de corte. Quando o projetista colocar esse
                    número lá, as peças aparecem aqui sozinhas.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-stone-700 dark:text-slate-300">
                    <strong>{aberto.mps.join(" · ") || "—"}</strong>
                  </p>
                )}
                <p className="text-sm text-stone-600 dark:text-slate-400">
                  {formatarNumero(aberto.pecas, 0)} peça(s) ·{" "}
                  {aberto.itens.length} item(ns)
                  {aberto.projetistas.length > 0 &&
                    ` · projetista ${aberto.projetistas.join(", ")}`}
                  {aberto.liberado_em &&
                    ` · liberado ${quando(aberto.liberado_em)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbertoNum(null)}
                className="h-14 shrink-0 rounded-xl border-2 border-stone-300 dark:border-slate-600 px-4 text-lg font-semibold text-stone-700 dark:text-slate-200"
              >
                ✕ Fechar
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
              {MARCAS.map((m) => {
                const ligado = !!aberto[`${m.marca}_em`];
                const por = aberto[`${m.marca}_por`];
                return (
                  <button
                    key={m.marca}
                    type="button"
                    disabled={salvando !== null}
                    onClick={() => marcar(aberto, m.marca)}
                    className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-2xl border-4 px-3 py-3 text-2xl font-extrabold transition active:scale-[0.97] disabled:opacity-60 ${
                      ligado
                        ? m.ligado
                        : `bg-white dark:bg-slate-900 ${m.desligado}`
                    }`}
                  >
                    <span>
                      {ligado ? "☑" : "☐"} {m.icone} {m.rotulo}
                    </span>
                    <span className="text-xs font-medium opacity-90">
                      {salvando === m.marca
                        ? "salvando…"
                        : ligado
                          ? `${por ?? ""} · ${quando(aberto[`${m.marca}_em`])}`
                          : "toque para marcar"}
                    </span>
                  </button>
                );
              })}
            </div>

            <label className="flex flex-col gap-1 px-4 pb-3">
              <span className="text-sm font-semibold text-stone-700 dark:text-slate-300">
                Nº do NRI
                {aberto.nri && aberto.nri_por && (
                  <span className="ml-2 font-normal text-stone-500 dark:text-slate-500">
                    gravado por {aberto.nri_por} · {quando(aberto.nri_em)}
                  </span>
                )}
              </span>
              <input
                value={nri}
                onChange={(e) => setNri(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && salvando === null) salvarEFechar(aberto.programa);
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder="Digite o número do NRI"
                className="h-20 w-full rounded-2xl border-4 border-stone-300 dark:border-slate-600 bg-white dark:bg-slate-950 px-4 font-mono text-4xl font-bold text-stone-900 dark:text-white outline-none focus:border-green-600 dark:focus:border-cyan-400"
              />
            </label>

            <div className="px-4 pb-3">
              <button
                type="button"
                disabled={salvando !== null}
                onClick={() => salvarEFechar(aberto.programa)}
                className="h-16 w-full rounded-2xl bg-green-700 text-2xl font-extrabold text-white active:scale-[0.98] disabled:opacity-60 dark:bg-cyan-600"
              >
                💾 Salvar
              </button>
            </div>

            <div className="flex flex-col gap-2 px-4 pb-6">
              <p className="text-sm font-semibold text-stone-700 dark:text-slate-300">
                Peças do programa
              </p>
              {aberto.itens.map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-lg font-bold text-stone-900 dark:text-white">
                      {i.desenho ?? "—"}
                    </p>
                    <p className="truncate text-sm text-stone-700 dark:text-slate-300">
                      {i.descricao}
                    </p>
                    <p className="truncate text-xs text-stone-500 dark:text-slate-500">
                      {i.pedido} · {i.mp ?? "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-3xl font-extrabold text-stone-900 dark:text-white">
                      {formatarNumero(i.qtt ?? 0, 0)}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-slate-500">
                      {i.un ?? "PÇ"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
