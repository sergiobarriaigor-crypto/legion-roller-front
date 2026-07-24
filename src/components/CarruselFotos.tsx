"use client";

import { useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { IconX } from "@tabler/icons-react";

// Relación de aspecto mínima/máxima permitida para el marco del carrusel —
// igual que Instagram: una foto vertical extrema o un panorama horizontal se
// recorta suavemente a este rango en vez de deformar el feed con una
// tarjeta demasiado alta o angosta. Una foto cuadrada (1:1) cae dentro del
// rango sin recorte. La proporción la define la PRIMERA foto; el resto del
// mismo carrusel comparte ese marco (con object-cover si su proporción real
// es distinta) para que el alto no salte al deslizar entre fotos.
export const RATIO_MIN = 4 / 5;
export const RATIO_MAX = 1.91;

// Carrusel deslizable de hasta 3 fotos, sin librería externa: scroll-snap
// nativo (gesto de swipe real en móvil) + puntos indicadores calculados a
// partir de `scrollLeft`. Componente único compartido por Post, Comunidad e
// Impulsa (antes había 3 versiones casi idénticas con distinto criterio de
// recorte cada una). Doble clic/doble toque sobre una foto abre un visor a
// pantalla completa sin recortar (object-contain).
export function CarruselFotos({ fotos, alt }: { fotos: string[]; alt: string }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(0);
  const [pantallaCompleta, setPantallaCompleta] = useState<number | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);

  function alDeslizar() {
    const el = contenedorRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndice(Math.round(el.scrollLeft / el.clientWidth));
  }

  function alCargarPortada(e: SyntheticEvent<HTMLImageElement>) {
    if (ratio !== null) return;
    const img = e.currentTarget;
    if (!img.naturalWidth || !img.naturalHeight) return;
    const real = img.naturalWidth / img.naturalHeight;
    setRatio(Math.min(RATIO_MAX, Math.max(RATIO_MIN, real)));
  }

  if (fotos.length === 0) return null;

  return (
    <>
      <div className="flex flex-col gap-2">
        <div
          ref={contenedorRef}
          onScroll={alDeslizar}
          data-no-swipe
          className="flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-app bg-surface-2"
          style={{ aspectRatio: ratio ?? 1 }}
        >
          {fotos.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt={fotos.length > 1 ? `${alt} (${i + 1}/${fotos.length})` : alt}
              onLoad={i === 0 ? alCargarPortada : undefined}
              onDoubleClick={() => setPantallaCompleta(i)}
              className="h-full w-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>
        {fotos.length > 1 && (
          <div className="flex justify-center gap-1.5">
            {fotos.map((url, i) => (
              <span
                key={url}
                className={`h-1.5 w-1.5 rounded-full transition ${
                  i === indice ? "bg-fill-primary" : "bg-border"
                }`}
              />
            ))}
          </div>
        )}
      </div>
      {pantallaCompleta !== null && (
        <VisorFotoCompleta
          fotos={fotos}
          alt={alt}
          indiceInicial={pantallaCompleta}
          onCerrar={() => setPantallaCompleta(null)}
        />
      )}
    </>
  );
}

function VisorFotoCompleta({
  fotos,
  alt,
  indiceInicial,
  onCerrar,
}: {
  fotos: string[];
  alt: string;
  indiceInicial: number;
  onCerrar: () => void;
}) {
  const contenedorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    el.scrollLeft = indiceInicial * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <button
        type="button"
        onClick={onCerrar}
        aria-label="Cerrar"
        className="absolute right-4 top-4 z-10 text-white"
      >
        <IconX size={28} />
      </button>
      <div
        ref={contenedorRef}
        data-no-swipe
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
      >
        {fotos.map((url, i) => (
          <div
            key={url}
            className="flex h-full w-full shrink-0 snap-center items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${alt} (${i + 1}/${fotos.length})`}
              className="max-h-full max-w-full object-contain"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
