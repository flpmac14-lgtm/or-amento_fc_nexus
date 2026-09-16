import type { JSX } from "react";

const PROPS_TRACO = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

const DESENHOS: Record<string, JSX.Element> = {
  chapa_retangular: (
    <>
      <rect x="8" y="14" width="32" height="20" />
      <line x1="8" y1="10" x2="40" y2="10" strokeDasharray="2 2" opacity={0.5} />
      <line x1="4" y1="14" x2="4" y2="34" strokeDasharray="2 2" opacity={0.5} />
    </>
  ),
  chapa_circular: (
    <>
      <circle cx="24" cy="24" r="16" />
      <line x1="24" y1="8" x2="24" y2="40" strokeDasharray="2 2" opacity={0.5} />
    </>
  ),
  chapa_triangular: <polygon points="24,7 7,40 41,40" />,
  chapa_losango: <polygon points="24,6 41,24 24,42 7,24" />,
  chapa_trapezoidal: <polygon points="16,9 32,9 41,39 7,39" />,
  chapa_anel: (
    <>
      <circle cx="24" cy="24" r="16" />
      <circle cx="24" cy="24" r="7" />
    </>
  ),
  cilindro: (
    <>
      <ellipse cx="24" cy="12" rx="14" ry="5" />
      <line x1="10" y1="12" x2="10" y2="34" />
      <line x1="38" y1="12" x2="38" y2="34" />
      <path d="M10 34 A14 5 0 0 0 38 34" />
      <path d="M10 34 A14 5 0 0 1 38 34" strokeDasharray="2 2" opacity={0.5} />
    </>
  ),
  cone_altura: (
    <>
      <ellipse cx="24" cy="36" rx="14" ry="4" />
      <path d="M10 36 A14 4 0 0 0 38 36" strokeDasharray="2 2" opacity={0.5} />
      <line x1="10" y1="36" x2="24" y2="8" />
      <line x1="38" y1="36" x2="24" y2="8" />
    </>
  ),
  cone_angulo: (
    <>
      <ellipse cx="24" cy="36" rx="14" ry="4" />
      <path d="M10 36 A14 4 0 0 0 38 36" strokeDasharray="2 2" opacity={0.5} />
      <line x1="10" y1="36" x2="18" y2="10" />
      <line x1="38" y1="36" x2="30" y2="10" />
      <line x1="18" y1="10" x2="30" y2="10" opacity={0.5} />
      <path d="M20 15 A7 7 0 0 1 24 11" strokeWidth={1.2} opacity={0.7} />
    </>
  ),
  cantoneira: <path d="M12 8 H20 V32 H38 V40 H12 Z" />,
  barra_redonda: (
    <>
      <ellipse cx="13" cy="24" rx="5" ry="12" />
      <line x1="13" y1="12" x2="36" y2="12" />
      <line x1="13" y1="36" x2="36" y2="36" />
      <path d="M36 12 A5 12 0 0 1 36 36" />
    </>
  ),
  tubo_redondo: (
    <>
      <ellipse cx="13" cy="24" rx="5" ry="12" />
      <ellipse cx="13" cy="24" rx="2" ry="5" />
      <line x1="13" y1="12" x2="36" y2="12" />
      <line x1="13" y1="36" x2="36" y2="36" />
      <path d="M36 12 A5 12 0 0 1 36 36" />
    </>
  ),
  perfil: <path d="M10 10 H38 V16 H27 V32 H38 V38 H10 V32 H21 V16 H10 Z" />,
  peso_direto: (
    <>
      <path d="M18 14 A6 6 0 0 1 30 14" />
      <rect x="12" y="14" width="24" height="22" rx="7" />
    </>
  ),
};

export default function GeometriaIcone({ tipo, className }: { tipo: string; className?: string }) {
  const desenho = DESENHOS[tipo];
  if (!desenho) return null;
  return (
    <svg viewBox="0 0 48 48" className={className} {...PROPS_TRACO}>
      {desenho}
    </svg>
  );
}
