"use client";

import { useRef, useState } from "react";

// Carrusel deslizable de hasta 3 fotos, sin librería externa: scroll-snap
// nativo (gesto de swipe real en móvil) + puntos indicadores calculados a
// partir de `scrollLeft`, mismo criterio simple ya usado en otras partes de
// la app (sin dependencias nuevas para algo que el navegador ya resuelve).
export function CarruselFotos({ fotos, alt }: { fotos: string[]; alt: string }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(0);

  function alDeslizar() {
    const el = contenedorRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndice(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (fotos.length === 0) return null;

  if (fotos.length === 1) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fotos[0]} alt={alt} className="w-full rounded-app object-cover" />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={contenedorRef}
        onScroll={alDeslizar}
        data-no-swipe
        className="flex snap-x snap-mandatory overflow-x-auto rounded-app"
      >
        {fotos.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={url}
            src={url}
            alt={`${alt} (${i + 1}/${fotos.length})`}
            className="aspect-square w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
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
    </div>
  );
}
