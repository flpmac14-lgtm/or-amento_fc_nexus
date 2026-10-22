// Recarga automática das telas sem gastar tráfego com a aba escondida — a cota
// de 5 GB/mês do Render estourou em 10/2026 com abas abertas a noite toda
// relendo Croqui/Controle de obras (~550 KB cada vez).
// Roda `fn` a cada `ms` só com a aba visível; ao voltar pra aba, roda na hora
// se o intervalo já passou. Devolve a função que para tudo.
export function repetirComAbaVisivel(fn: () => void, ms: number): () => void {
  let ultima = Date.now();
  const rodar = () => {
    ultima = Date.now();
    fn();
  };
  const id = setInterval(() => {
    if (!document.hidden) rodar();
  }, ms);
  const aoMudar = () => {
    if (!document.hidden && Date.now() - ultima >= ms) rodar();
  };
  document.addEventListener("visibilitychange", aoMudar);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", aoMudar);
  };
}
