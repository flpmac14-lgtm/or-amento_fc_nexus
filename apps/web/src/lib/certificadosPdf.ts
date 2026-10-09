// Certificados de matéria-prima (abas QUALIDADE e Backup Recebimento) — tipos e
// o pedido dos PDFs ao PC da fábrica, usados pela lista (components/Qualidade.tsx)
// e pela tela de montar data book (components/MontarDataBook.tsx).
// Os PDFs só existem no J:; sob demanda: /api/qualidade/pdf grava o pedido,
// services/calc_engine/scripts/servir_certificados.py sobe pro Storage e a rota
// devolve uma URL assinada de 1 h.

export interface Certificado {
  nri: string | null; // "26-5097"
  descricao: string;
  tipo: string | null;
  fornecedor: string | null;
  recebido: string | null; // AAAA-MM-DD (planilha do Recebimento)
  codigo: string | null; // código do material no ERP
  arquivo: string; // caminho relativo do PDF na pasta
  modificado: string;
  na_planilha: boolean;
  // Tipo de certificado pelo conteúdo do PDF (ultrassom, LP, material…);
  // null = ainda não analisado (classificar_certificados.py, aos poucos).
  certificado?: string[] | null;
}

// Pasta: a principal (aba QUALIDADE) ou o backup (aba Backup Recebimento).
export type FonteCertificados = "principal" | "backup";

export interface Progresso {
  total: number;
  salvos: number;
  erros: string[];
  fim?: string;
}

const URL_PDF = "/api/qualidade/pdf";
const ESPERA_MAX_MS = 90_000;

export function nomeDoArquivo(arquivo: string): string {
  return arquivo.split("/").pop() ?? arquivo;
}

// Pede os PDFs ao PC da fábrica e chama aoPronto(arquivo, url assinada) pra cada
// um que chegar; devolve o progresso final (salvos = quantos aoPronto deu certo).
export async function pedirPdfs(
  fonte: FonteCertificados,
  lista: Certificado[],
  aoAvancar: (p: Progresso) => void,
  aoPronto: (arquivo: string, url: string) => Promise<void>,
): Promise<{ p: Progresso; semResposta: number }> {
  const p: Progresso = { total: lista.length, salvos: 0, erros: [] };
  aoAvancar({ ...p });
  let corpo: { ids?: Record<string, number>; erro?: string } = {};
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(URL_PDF, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fonte, itens: lista.map((i) => ({ arquivo: i.arquivo, modificado: i.modificado })) }),
    });
    corpo = await r.json().catch(() => ({}));
    if (r.ok) break;
    // Erro passageiro do Supabase: mais uma tentativa (403 = sem acesso, não adianta).
    if (r.status === 403 || tentativa >= 2) throw new Error(corpo.erro ?? `Erro ${r.status}`);
    await new Promise((res) => setTimeout(res, 1500));
  }
  const faltam = new Map<number, string>(Object.entries(corpo.ids ?? {}).map(([a, id]) => [id, a]));
  const inicio = Date.now();
  while (faltam.size && Date.now() - inicio < ESPERA_MAX_MS) {
    const g = await fetch(`${URL_PDF}?ids=${[...faltam.keys()].join(",")}`, { cache: "no-store" });
    const st = (await g.json().catch(() => ({}))) as {
      pedidos?: { id: number; arquivo: string; status: string; erro: string | null; url: string | null }[];
    };
    for (const ped of st.pedidos ?? []) {
      if (ped.status === "erro") {
        p.erros.push(`${nomeDoArquivo(ped.arquivo)}: ${ped.erro ?? "erro"}`);
        faltam.delete(ped.id);
      } else if (ped.status === "pronto" && ped.url) {
        try {
          await aoPronto(ped.arquivo, ped.url);
          p.salvos++;
        } catch (e) {
          p.erros.push(`${nomeDoArquivo(ped.arquivo)}: ${e instanceof Error ? e.message : e}`);
        }
        faltam.delete(ped.id);
      }
      aoAvancar({ ...p, erros: [...p.erros] });
    }
    if (faltam.size) await new Promise((res) => setTimeout(res, 2000));
  }
  return { p, semResposta: faltam.size };
}

export function textoSemResposta(n: number): string {
  return n ? ` ${n} não chegaram: o PC da fábrica precisa estar ligado e com o J: (tente de novo em instantes).` : "";
}
