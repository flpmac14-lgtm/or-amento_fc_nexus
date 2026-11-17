"use client";

// Scanner do "quadradinho" (DataMatrix) das latas de tinta — pedido do usuário
// (17/11/2026). Abre a câmera traseira e lê sozinho; sem IA, tudo no aparelho.
// Usa o leitor nativo do navegador quando ele lê DataMatrix (Chrome Android) e,
// senão, a biblioteca barcode-detector (ZXing em WebAssembly), que vale pro iPhone.
// Se a câmera ao vivo não focar, "Tirar foto" lê de uma foto parada (mais nítida).

import { useEffect, useRef, useState } from "react";
import { lerGs1, type EtiquetaGs1 } from "@/lib/gs1";

type Detector = { detect: (fonte: ImageBitmapSource) => Promise<{ rawValue: string; format: string }[]> };

const FORMATOS = ["data_matrix", "qr_code"];

async function criarDetector(): Promise<Detector> {
  const nativo = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } })
    .BarcodeDetector;
  if (nativo?.getSupportedFormats) {
    try {
      const suportados = await nativo.getSupportedFormats();
      if (suportados.includes("data_matrix")) return new nativo({ formats: FORMATOS });
    } catch {
      // segue pro ZXing
    }
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: ["data_matrix", "qr_code"] }) as unknown as Detector;
}

export default function EscanerEtiqueta({
  titulo,
  aoLer,
  aoFechar,
}: {
  titulo: string;
  aoLer: (e: EtiquetaGs1) => void;
  aoFechar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const foto = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [lanterna, setLanterna] = useState<{ ligada: boolean; trilha: MediaStreamTrack } | null>(null);
  const detectorRef = useRef<Promise<Detector> | null>(null);
  const lidoRef = useRef(false);

  function detector() {
    detectorRef.current ??= criarDetector();
    return detectorRef.current;
  }

  function entregar(textos: string[]): boolean {
    for (const t of textos) {
      const e = lerGs1(t);
      if (e && !lidoRef.current) {
        lidoRef.current = true;
        navigator.vibrate?.(120);
        aoLer(e);
        return true;
      }
    }
    if (textos.length) setAviso("Li um código, mas não é a etiqueta da tinta. Aponte pro quadradinho perto da validade.");
    return false;
  }

  useEffect(() => {
    let parar = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (parar) return;
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const trilha = stream.getVideoTracks()[0];
        const caps = (trilha.getCapabilities?.() ?? {}) as { torch?: boolean; focusMode?: string[] };
        if (caps.torch) setLanterna({ ligada: false, trilha });
        if (caps.focusMode?.includes("continuous"))
          trilha.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        const d = await detector();
        const ciclo = async () => {
          if (parar || lidoRef.current) return;
          try {
            if (v.readyState >= 2) {
              const achados = await d.detect(v);
              if (entregar(achados.map((a) => a.rawValue))) return;
            }
          } catch {
            // quadro ruim: tenta o próximo
          }
          timer = setTimeout(ciclo, 200);
        };
        ciclo();
      } catch (e) {
        const nome = (e as Error).name;
        setErro(
          nome === "NotAllowedError"
            ? "O navegador não deixou usar a câmera. Libere a câmera pro site (cadeado na barra de endereço) ou use “Tirar foto”."
            : "Não consegui abrir a câmera. Use “Tirar foto”.",
        );
      }
    })();
    return () => {
      parar = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lerFoto(arq: File | undefined) {
    if (!arq) return;
    setAviso("Lendo a foto…");
    try {
      const d = await detector();
      const bmp = await createImageBitmap(arq, { imageOrientation: "from-image" });
      const achados = await d.detect(bmp);
      bmp.close();
      if (!entregar(achados.map((a) => a.rawValue)) && !achados.length)
        setAviso("Não achei o quadradinho nessa foto. Chegue mais perto (uns 10–15 cm), com luz e sem tremer.");
    } catch (e) {
      setAviso(`Não consegui ler a foto: ${(e as Error).message}`);
    }
  }

  async function alternarLanterna() {
    if (!lanterna) return;
    const ligada = !lanterna.ligada;
    try {
      await lanterna.trilha.applyConstraints({ advanced: [{ torch: ligada } as MediaTrackConstraintSet] });
      setLanterna({ ...lanterna, ligada });
    } catch {
      // aparelho sem lanterna controlável
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold">{titulo}</p>
        <button type="button" onClick={aoFechar} className="rounded-md px-2 text-3xl leading-none text-white/80">
          ×
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        {/* Mira */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-56 w-56 rounded-2xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        <p className="absolute inset-x-0 bottom-4 px-6 text-center text-sm font-semibold drop-shadow">
          Aponte para o <b>quadradinho</b> da etiqueta (perto da validade), a uns 10–15 cm.
        </p>
      </div>
      {(erro || aviso) && <p className="bg-amber-500 px-4 py-2 text-center text-sm font-semibold text-amber-950">{erro ?? aviso}</p>}
      <div className="grid grid-cols-2 gap-2 p-3">
        <button
          type="button"
          onClick={() => foto.current?.click()}
          className="rounded-xl bg-white/15 py-3 text-base font-bold hover:bg-white/25"
        >
          📷 Tirar foto
        </button>
        <button
          type="button"
          onClick={alternarLanterna}
          disabled={!lanterna}
          className="rounded-xl bg-white/15 py-3 text-base font-bold hover:bg-white/25 disabled:opacity-40"
        >
          {lanterna?.ligada ? "🔦 Apagar luz" : "🔦 Lanterna"}
        </button>
        <input
          ref={foto}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            lerFoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
