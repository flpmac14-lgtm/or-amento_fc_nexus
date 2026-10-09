"use client";

// Aba QUALIDADE — pedido do usuário (09/10/2026). Por enquanto só a aba;
// o conteúdo entra conforme ele definir. Visível só pro perfil "total".

export default function Qualidade() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 px-6 py-12 text-center dark:border-slate-700">
      <p className="text-2xl font-extrabold tracking-wide text-stone-900 dark:text-white">QUALIDADE</p>
      <p className="text-sm text-stone-600 dark:text-slate-400">Em construção.</p>
    </div>
  );
}
