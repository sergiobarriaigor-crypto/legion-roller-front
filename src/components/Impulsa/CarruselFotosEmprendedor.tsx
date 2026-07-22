"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";

const ALTURA_FOTO = 260;

// Mismo criterio que CarruselFotos.tsx (scroll-snap nativo, sin librería
// externa), sin recortar la foto (object-contain dentro de un marco de alto
// fijo). Doble clic/doble toque sobre una foto abre un visor a pantalla
// completa que también permite deslizar entre las fotos restantes.
export function CarruselFotosEmprendedor({ fotos, alt }: { fotos: string[]; alt: string }) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const [indice, setIndice] = useState(0);
  const [pantallaCompleta, setPantallaCompleta] = useState<number | null>(null);

  function alDeslizar() {
    const el = contenedorRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndice(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (fotos.length === 0) return null;

  if (fotos.length === 1) {
    return (
      <>
        <div
          onDoubleClick={() => setPantallaCompleta(0)}
          className="flex items-center justify-center rounded-app bg-surface-2"
          style={{ height: ALTURA_FOTO }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fotos[0]} alt={alt} className="max-h-full max-w-full object-contain" />
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

  return (
    <>
      <div className="flex flex-col gap-2">
        <div
          ref={contenedorRef}
          onScroll={alDeslizar}
          data-no-swipe
          className="flex snap-x snap-mandatory overflow-x-auto rounded-app"
        >
          {fotos.map((url, i) => (
            <div
              key={url}
              onDoubleClick={() => setPantallaCompleta(i)}
              className="flex w-full shrink-0 snap-center items-center justify-center bg-surface-2"
              style={{ height: ALTURA_FOTO }}
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
