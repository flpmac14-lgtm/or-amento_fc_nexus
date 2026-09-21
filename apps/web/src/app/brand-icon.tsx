// Marca do ícone do app (favicon + apple-touch-icon) — gerado via
// next/og (ImageResponse) em vez de um arquivo de imagem estático, pra
// não depender de nenhuma ferramenta externa de conversão de imagem.
// Gradiente ciano→verde reaproveita as duas cores de destaque do app
// (cyan-500 no tema escuro, green-600 no tema claro — ver globals.css),
// unindo os dois num símbolo só. "N" de Nexus, com um nó/ponto de
// conexão no canto pra remeter a "rede"/IA sem virar poluição visual em
// tamanho pequeno (favicon 32x32).
export function renderBrandIcon(sizePx: number) {
  const fontSize = Math.round(sizePx * 0.62);
  const dot = Math.max(2, Math.round(sizePx * 0.14));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: "linear-gradient(135deg, #0e7490 0%, #0891b2 45%, #16a34a 100%)",
        borderRadius: Math.round(sizePx * 0.22),
      }}
    >
      <span
        style={{
          fontSize,
          fontWeight: 800,
          color: "#f8fafc",
          fontFamily: "Arial, sans-serif",
          lineHeight: 1,
        }}
      >
        N
      </span>
      <div
        style={{
          position: "absolute",
          top: Math.round(sizePx * 0.16),
          right: Math.round(sizePx * 0.16),
          width: dot,
          height: dot,
          borderRadius: "50%",
          background: "#f8fafc",
        }}
      />
    </div>
  );
}
