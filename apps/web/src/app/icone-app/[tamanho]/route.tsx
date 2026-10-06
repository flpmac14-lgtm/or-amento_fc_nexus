import { ImageResponse } from "next/og";
import { renderBrandIcon } from "../../brand-icon";

// Ícones do app instalável (app/manifest.ts): 192 e 512 px com o logo FC.
// ?maskable=1 = versão com margem segura (Android recorta em círculo/gota).
const TAMANHOS = new Set([192, 512]);

export async function GET(request: Request, { params }: { params: Promise<{ tamanho: string }> }) {
  const tamanho = Number((await params).tamanho);
  if (!TAMANHOS.has(tamanho)) return new Response("Tamanho inválido", { status: 404 });
  const maskable = new URL(request.url).searchParams.has("maskable");
  const interno = Math.round(tamanho * (maskable ? 0.72 : 1));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: maskable ? "#0b1626" : "transparent",
        }}
      >
        {renderBrandIcon(interno)}
      </div>
    ),
    { width: tamanho, height: tamanho, headers: { "Cache-Control": "public, max-age=86400" } },
  );
}
