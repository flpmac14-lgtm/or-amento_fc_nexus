import { ImageResponse } from "next/og";
import { renderBrandIcon } from "./brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(renderBrandIcon(size.width), { ...size });
}
