"use client";

import { useEffect, useState } from "react";
import { buscarPrecosMercado } from "@/lib/api";
import { normalizarBusca } from "@/lib/busca";
import { formatarDataBr, formatarNumero } from "@/lib/format";
import type { PrecosMercadoLista } from "@/lib/types";

function formatarDataHoraBr(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

export default function ReferenciaPrecosMP() {
  const [dados, setDados] = useState<PrecosMercadoLista | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState("");

  function buscar() {
    buscarPrecosMercado()
      .then(setDados)
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar a referência de preços."))
      .finally(() => setCarregando(false));
  }

  function verificarAgora() {
    setCarregando(true);
    setErro("");
    buscar();
  }

  useEffect(() => {
    buscar();
  }, []);

  const termosBusca = normalizarBusca(filtro).split(" ").filter(Boolean);
  const linhas = (dados?.compras ?? []).filter((c) => {
    if (termosBusca.length === 0) return true;
    const alvo = normalizarBusca(
      `${c.codigo} ${c.material} ${c.descricao} ${c.unidade} ${c.fornecedor} ${c.obra}`,
    );
    return termosBusca.every((termo) => alvo.includes(termo));
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm">
        <p className="text-slate-300">
          Planilha de compras completa, sincronizada do histórico real de aquisições — os preços
          de chapa por norma/espessura pré-preenchem &quot;Preço por kg&quot; nos cartões de
          cálculo, do jeito que a densidade já é pré-preenchida pelo material. Sempre editável na
          hora do cálculo; isto aqui é só o histórico de referência, com todas as linhas da
          planilha (qualquer material, qualquer unidade).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
          <span>
            Arquivo:{" "}
            {dados?.arquivo_encontrado ? (
              <span className="text-slate-400">{dados.caminho}</span>
            ) : (
              <span className="text-red-400">não encontrado ({dados?.caminho ?? "…"})</span>
            )}
          </span>
          <span>{dados?.total_referencias ?? 0} linhas da planilha</span>
          <span>Sincronizado em: {formatarDataHoraBr(dados?.sincronizado_em ?? null)}</span>
          <button
            type="button"
            onClick={verificarAgora}
            disabled={carregando}
            className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:border-cyan-500 hover:text-cyan-300 disabled:opacity-50"
          >
            {carregando ? "Verificando…" : "Verificar atualização agora"}
          </button>
        </div>
      </div>

      {erro && <p className="text-sm text-red-400">{erro}</p>}

      <input
        type="text"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="filtrar por código, material, descrição, unidade, fornecedor ou obra…"
        className="w-full max-w-md rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-cyan-500"
      />

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Material</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Preço unit.</th>
              <th className="px-3 py-2">Unidade</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2">Obra</th>
              <th className="px-3 py-2">Data da compra</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {linhas.map((c, i) => (
              <tr key={`${c.codigo}-${c.data_compra}-${i}`} className="text-slate-200">
                <td className="px-3 py-2 font-mono text-slate-400">{c.codigo || "—"}</td>
                <td className="px-3 py-2 text-slate-400">{c.material || "—"}</td>
                <td className="px-3 py-2">{c.descricao}</td>
                <td className="px-3 py-2 font-mono text-cyan-300">R$ {formatarNumero(c.preco_unitario, 2)}</td>
                <td className="px-3 py-2 text-slate-400">{c.unidade || "—"}</td>
                <td className="px-3 py-2 text-slate-400">{c.fornecedor || "—"}</td>
                <td className="px-3 py-2 text-slate-400">{c.obra || "—"}</td>
                <td className="px-3 py-2 text-slate-400">{formatarDataBr(c.data_compra)}</td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                  {carregando ? "Carregando…" : "Nenhuma referência encontrada."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
