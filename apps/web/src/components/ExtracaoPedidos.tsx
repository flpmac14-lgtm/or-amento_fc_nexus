"use client";

import { useState } from "react";
import PedidoAndritz from "@/components/PedidoAndritz";
import PedidoWeir from "@/components/PedidoWeir";

// Aba "Extração de Pedidos" — pedido explícito do usuário: cada cliente
// manda a Ordem de Compra num formato de PDF diferente, então a extração
// é específica por cliente (texto + regex, sem IA — nunca tenta adivinhar
// formato de um cliente a partir do parser de outro). ANDRITZ já
// funciona (ver PedidoAndritz.tsx); os demais entram aqui conforme forem
// implementados.
type ClientePedido = "andritz" | "weir";

const CLIENTES: { valor: ClientePedido; rotulo: string; disponivel: boolean }[] = [
  { valor: "andritz", rotulo: "ANDRITZ", disponivel: true },
  { valor: "weir", rotulo: "WEIR", disponivel: true },
];

export default function ExtracaoPedidos() {
  const [cliente, setCliente] = useState<ClientePedido>("andritz");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-stone-600 dark:text-slate-400">Cliente</span>
        <div className="flex gap-1 rounded-lg border border-stone-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-1 text-sm w-fit">
          {CLIENTES.map((c) => (
            <button
              key={c.valor}
              type="button"
              onClick={() => setCliente(c.valor)}
              title={c.disponivel ? undefined : "Extração ainda não implementada pra esse cliente"}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                cliente === c.valor
                  ? "bg-green-600 dark:bg-cyan-500 text-white dark:text-slate-950"
                  : "text-stone-600 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200"
              }`}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
      </div>

      {cliente === "andritz" && <PedidoAndritz />}

      {cliente === "weir" && <PedidoWeir />}
    </div>
  );
}
