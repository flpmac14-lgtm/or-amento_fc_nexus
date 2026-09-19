"use client";

interface Props {
  posicaoNum: number;
  itemNum: number;
  setPosicaoNum: (n: number) => void;
  setItemNum: (n: number) => void;
}

export default function SeletorPosicaoItem({ posicaoNum, itemNum, setPosicaoNum, setItemNum }: Props) {
  return (
    <>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-stone-600 dark:text-slate-400">Posição</span>
        <input
          type="number"
          min={1}
          value={posicaoNum}
          onChange={(e) => setPosicaoNum(Number(e.target.value) || 1)}
          className="w-16 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        <span className="text-stone-600 dark:text-slate-400">Item</span>
        <input
          type="number"
          min={1}
          value={itemNum}
          onChange={(e) => setItemNum(Number(e.target.value) || 1)}
          className="w-16 rounded-md border border-stone-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm text-stone-900 dark:text-slate-100 outline-none focus:border-green-600 dark:focus:border-cyan-500"
        />
      </label>
    </>
  );
}
