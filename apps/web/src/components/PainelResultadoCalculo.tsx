interface LinhaResultado {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}

interface Props {
  linhas: LinhaResultado[];
  custoLabel: string;
  custoValor: string;
  nota?: string;
}

export default function PainelResultadoCalculo({ linhas, custoLabel, custoValor, nota }: Props) {
  return (
    <div className="mt-4 rounded-lg border border-cyan-500/30 bg-slate-950/60 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-400">Resultado</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        {linhas.map((l) => (
          <div key={l.rotulo}>
            <dt className="text-xs text-slate-500">{l.rotulo}</dt>
            <dd className={`font-mono ${l.destaque ? "font-semibold text-cyan-300" : "text-slate-100"}`}>{l.valor}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 border-t border-slate-800 pt-2">
        <span className="text-xs text-slate-500">{custoLabel}</span>
        <p className="text-lg font-semibold text-cyan-300">{custoValor}</p>
      </div>
      {nota && <p className="mt-2 text-xs text-slate-500">{nota}</p>}
    </div>
  );
}
