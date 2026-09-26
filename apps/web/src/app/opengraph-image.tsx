import { ImageResponse } from "next/og";
import { renderBrandIcon } from "./brand-icon";

// Card de preview ao compartilhar o link (WhatsApp, etc.) — sem isso, o
// WhatsApp caía no favicon pequeno como "figurinha" em vez de uma imagem
// de verdade. Reaproveita a mesma marca do favicon/apple-touch-icon (ver
// brand-icon.tsx) em tamanho maior, com o nome do app ao lado.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          gap: 36,
        }}
      >
        <div style={{ width: 180, height: 180, display: "flex" }}>{renderBrandIcon(180)}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, color: "#f8fafc", fontFamily: "Arial, sans-serif" }}>
            FC Nexus
          </div>
          <div style={{ display: "flex", fontSize: 32, color: "#67e8f9", fontFamily: "Arial, sans-serif" }}>
            Orçamento Industrial I.A.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
