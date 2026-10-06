// Marca do ícone do app (favicon, apple-touch-icon e prévia de link) —
// gerado via next/og (ImageResponse) em vez de um arquivo de imagem
// estático, pra não depender de nenhuma ferramenta externa de conversão.
// Pedido do usuário: o mesmo logo "FC" futurista do menu
// (components/AppShell.tsx → MarcaNexus): monograma geométrico em neon
// ciano→verde, moldura octogonal chanfrada e o ponto de conexão ("rede").
// Os ids dos gradientes levam o tamanho pra não colidir quando a prévia de
// link desenha o ícone junto com outros elementos.
export function renderBrandIcon(sizePx: number) {
  const id = `fc${sizePx}`;
  return (
    <svg width={sizePx} height={sizePx} viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`${id}-fundo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0b1626" />
          <stop offset="1" stopColor="#0d2b3e" />
        </linearGradient>
        <linearGradient id={`${id}-neon`} x1="6" y1="8" x2="34" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#67e8f9" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#4ade80" />
        </linearGradient>
      </defs>
      <path d="M8 1.5H32L38.5 8V32L32 38.5H8L1.5 32V8Z" fill={`url(#${id}-fundo)`} stroke={`url(#${id}-neon)`} strokeWidth="1.4" />
      <g fill="none" stroke={`url(#${id}-neon)`} strokeWidth={sizePx <= 32 ? 3.4 : 2.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 29.5V13.5L11.5 11H19M9 20H17" />
        <path d="M31.5 11H25.5L22.5 14V26.5L25.5 29.5H31.5" />
      </g>
      <circle cx="31.5" cy="20.2" r={sizePx <= 32 ? 2.2 : 1.8} fill="#4ade80" />
    </svg>
  );
}
