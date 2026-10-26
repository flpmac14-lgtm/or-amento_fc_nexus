"use client";

// Relatório "Solicitação de hora extra" — pedido do usuário (26/10/2026): folha
// A4 pra imprimir / salvar em PDF (Ctrl+P) e assinar. Vem da aba Funcionários
// (components/FuncionariosHoraExtra.tsx). Fica sob /follow-up, então o Jeferson
// e o Diego (perfil consulta) também abrem. Parâmetro: ?n=<nº da solicitação>.

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { formatarDataBr } from "@/lib/format";
import { diaDaSemana, formatarHoras, minutosDaSolicitacao, minutosDoDia, type SolicitacaoHoraExtra } from "@/lib/horaExtra";

function Assinatura({ rotulo, nome }: { rotulo: string; nome?: string }) {
  return (
    <div className="flex flex-col items-center pt-10">
      <div className="w-full border-t border-stone-700" />
      <p className="mt-1 text-[10px] font-semibold">{rotulo}</p>
      {nome && <p className="text-[9px] text-stone-600">{nome}</p>}
    </div>
  );
}

function Relatorio() {
  const params = useSearchParams();
  const n = params.get("n") ?? "";
  const [s, setS] = useState<SolicitacaoHoraExtra | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    fetch(`/api/follow-up/hora-extra?n=${encodeURIComponent(n)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro ?? `Erro ${r.status}`);
        if (ativo) setS(j.solicitacao);
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [n]);

  useEffect(() => {
    if (s) document.title = `Solicitação de hora extra nº ${s.numero}`; // nome sugerido do PDF
  }, [s]);

  if (!n) return <p className="p-8 text-red-600">Informe o número da solicitação.</p>;
  if (erro) return <p className="p-8 text-red-600">{erro}</p>;
  if (!s) return <p className="p-8 text-stone-500">Carregando solicitação…</p>;

  const porPessoa = minutosDaSolicitacao(s.dias);
  const criado = new Date(s.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="min-h-screen bg-stone-200 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-3 print:hidden">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-bold text-white hover:bg-green-600">
          Imprimir / Salvar PDF
        </button>
        <button
          type="button"
          onClick={() => window.close()}
          className="rounded-lg border border-stone-400 bg-white px-4 py-2 text-sm text-stone-700 hover:bg-stone-100"
        >
          Fechar
        </button>
      </div>

      <main className="mx-auto flex max-w-[210mm] flex-col gap-3 bg-white p-[12mm] text-stone-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between gap-4 border-b-4 border-blue-800 pb-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-800">FC Nexus · Macfab</p>
            <h1 className="text-xl font-bold">Solicitação de hora extra</h1>
          </div>
          <div className="text-right">
            <p className="font-mono text-lg font-extrabold">Nº {s.numero}</p>
            <p className="text-[10px] text-stone-500">Emitida em {criado}</p>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded border border-stone-300 p-2">
            <p className="text-[8px] uppercase tracking-wide text-stone-500">Solicitante</p>
            <p className="font-bold">{s.solicitante}</p>
          </div>
          <div className="rounded border border-stone-300 p-2">
            <p className="text-[8px] uppercase tracking-wide text-stone-500">Funcionários</p>
            <p className="font-bold">{s.funcionarios.length}</p>
          </div>
          <div className="rounded border border-stone-300 p-2">
            <p className="text-[8px] uppercase tracking-wide text-stone-500">Horas por pessoa · total</p>
            <p className="font-bold">
              {formatarHoras(porPessoa)} · {formatarHoras(porPessoa * s.funcionarios.length)}
            </p>
          </div>
        </div>

        {s.motivo && (
          <p className="rounded border-l-4 border-blue-700 bg-blue-50 px-2 py-1.5 text-[11px]" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
            <strong>Motivo:</strong> {s.motivo}
          </p>
        )}

        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-stone-700">Dias e horário</h2>
          <table className="mt-1 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b-2 border-stone-400 text-left text-[9px] uppercase text-stone-500">
                <th className="py-1 pr-2">Data</th>
                <th className="pr-2">Dia</th>
                <th className="pr-2">Início</th>
                <th className="pr-2">Fim</th>
                <th className="text-right">Horas</th>
              </tr>
            </thead>
            <tbody>
              {s.dias.map((d, i) => (
                <tr key={i} className="border-b border-stone-200">
                  <td className="py-1 pr-2 font-mono font-semibold">{formatarDataBr(d.data)}</td>
                  <td className="pr-2">{diaDaSemana(d.data)}</td>
                  <td className="pr-2 font-mono">{d.inicio}</td>
                  <td className="pr-2 font-mono">{d.fim}</td>
                  <td className="text-right font-mono font-bold">{formatarHoras(minutosDoDia(d))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-0.5 text-[8px] text-stone-500">Almoço (12:00–13:00) descontado das horas.</p>
        </section>

        <section>
          <h2 className="text-[10px] font-bold uppercase tracking-wide text-stone-700">Funcionários</h2>
          <table className="mt-1 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b-2 border-stone-400 text-left text-[9px] uppercase text-stone-500">
                <th className="w-8 py-1 pr-2">#</th>
                <th className="pr-2">Nome</th>
                <th className="w-16 pr-2 text-right">Horas</th>
                <th className="w-[60mm]">Assinatura do funcionário</th>
              </tr>
            </thead>
            <tbody>
              {s.funcionarios.map((f, i) => (
                <tr key={f} className="break-inside-avoid border-b border-stone-200">
                  <td className="py-2 pr-2 text-stone-500">{i + 1}</td>
                  <td className="pr-2 font-semibold">{f}</td>
                  <td className="pr-2 text-right font-mono">{formatarHoras(porPessoa)}</td>
                  <td className="border-b border-stone-400" />
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-4 grid break-inside-avoid grid-cols-3 gap-6">
          <Assinatura rotulo="Solicitante" nome={s.solicitante} />
          <Assinatura rotulo="Aprovação (Diretoria)" />
          <Assinatura rotulo="Recursos Humanos" />
        </section>
      </main>
    </div>
  );
}

export default function PaginaHoraExtra() {
  return (
    <Suspense fallback={<p className="p-8 text-stone-500">Carregando…</p>}>
      <Relatorio />
    </Suspense>
  );
}
