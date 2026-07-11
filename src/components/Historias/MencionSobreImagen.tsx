"use client";

import { useRef, type CSSProperties, type RefObject } from "react";

export function estiloVisualMencion(x: number, y: number): CSSProperties {
  return {
    position: "absolute",
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    transform: "translate(-50%, -50%)",
    userSelect: "none",
  };
}

// Pegatina de mención arrastrable sobre la imagen, estilo Instagram — a
// diferencia del texto, solo se puede mover (sin pellizcar/girar), igual
// dinámica de arrastre de un solo dedo que ya usa TextoSobreImagen.
export function MencionSobreImagen({
  nombre,
  x,
  y,
  onMover,
  contenedorRef,
  interactivo = true,
}: {
  nombre: string;
  x: number;
  y: number;
  onMover?: (x: number, y: number) => void;
  contenedorRef: RefObject<HTMLElement | null>;
  interactivo?: boolean;
}) {
  const offsetRef = useRef({ x: 0, y: 0 });

  function onPointerDown(e: React.PointerEvent) {
    if (!interactivo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = contenedorRef.current?.getBoundingClientRect();
    if (!rect) return;
    offsetRef.current = {
      x: (e.clientX - rect.left) / rect.width - x,
      y: (e.clientY - rect.top) / rect.height - y,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!interactivo || !onMover || e.buttons === 0) return;
    const rect = contenedorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const nuevoX = (e.clientX - rect.left) / rect.width - offsetRef.current.x;
    const nuevoY = (e.clientY - rect.top) / rect.height - offsetRef.current.y;
    onMover(Math.min(1, Math.max(0, nuevoX)), Math.min(1, Math.max(0, nuevoY)));
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      style={{
        ...estiloVisualMencion(x, y),
        cursor: interactivo ? "grab" : undefined,
        touchAction: interactivo ? "none" : undefined,
      }}
      className="flex items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white shadow"
    >
      <span className="text-text-accent">@</span>
      {nombre}
    </div>
  );
}
