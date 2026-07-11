"use client";

import { useRef, type CSSProperties, type RefObject } from "react";
import { IconX } from "@tabler/icons-react";

const ESCALA_MINIMA = 0.6;
const ESCALA_MAXIMA = 2.5;

export function estiloVisualMencion(x: number, y: number, escala: number = 1): CSSProperties {
  return {
    position: "absolute",
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    transform: `translate(-50%, -50%) scale(${escala})`,
    transformOrigin: "center",
    userSelect: "none",
  };
}

function distancia(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

// Pegatina de mención sobre la imagen, estilo Instagram — arrastrable con un
// dedo y pellizcable con dos (para agrandar/achicar), igual patrón de Pointer
// Events que TextoSobreImagen pero sin rotación (no hace falta para un "@nombre").
export function MencionSobreImagen({
  nombre,
  x,
  y,
  escala,
  onCambiar,
  onQuitar,
  contenedorRef,
  interactivo = true,
}: {
  nombre: string;
  x: number;
  y: number;
  escala: number;
  onCambiar?: (valores: { x: number; y: number; escala: number }) => void;
  onQuitar?: () => void;
  contenedorRef: RefObject<HTMLElement | null>;
  interactivo?: boolean;
}) {
  const punterosRef = useRef(new Map<number, { x: number; y: number }>());
  const gestoRef = useRef<{
    modo: "arrastrar" | "pellizcar" | null;
    offsetX: number;
    offsetY: number;
    distanciaInicial: number;
    escalaInicial: number;
  }>({ modo: null, offsetX: 0, offsetY: 0, distanciaInicial: 0, escalaInicial: 1 });

  function puntoDesdeEvento(e: React.PointerEvent) {
    const rect = contenedorRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function iniciarArrastreDesdePuntero(p: { x: number; y: number }) {
    const rect = contenedorRef.current?.getBoundingClientRect();
    if (!rect) return;
    gestoRef.current.modo = "arrastrar";
    gestoRef.current.offsetX = p.x / rect.width - x;
    gestoRef.current.offsetY = p.y / rect.height - y;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!interactivo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    punterosRef.current.set(e.pointerId, puntoDesdeEvento(e));

    if (punterosRef.current.size === 1) {
      iniciarArrastreDesdePuntero([...punterosRef.current.values()][0]);
    } else if (punterosRef.current.size === 2) {
      const [p1, p2] = [...punterosRef.current.values()];
      gestoRef.current.modo = "pellizcar";
      gestoRef.current.distanciaInicial = distancia(p1, p2);
      gestoRef.current.escalaInicial = escala;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!interactivo || !onCambiar || !punterosRef.current.has(e.pointerId)) return;
    punterosRef.current.set(e.pointerId, puntoDesdeEvento(e));
    const rect = contenedorRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (gestoRef.current.modo === "arrastrar" && punterosRef.current.size === 1) {
      const p = [...punterosRef.current.values()][0];
      const nuevoX = p.x / rect.width - gestoRef.current.offsetX;
      const nuevoY = p.y / rect.height - gestoRef.current.offsetY;
      onCambiar({ x: Math.min(1, Math.max(0, nuevoX)), y: Math.min(1, Math.max(0, nuevoY)), escala });
    } else if (gestoRef.current.modo === "pellizcar" && punterosRef.current.size === 2) {
      const [p1, p2] = [...punterosRef.current.values()];
      const factor = distancia(p1, p2) / (gestoRef.current.distanciaInicial || 1);
      const nuevaEscala = Math.min(
        ESCALA_MAXIMA,
        Math.max(ESCALA_MINIMA, gestoRef.current.escalaInicial * factor),
      );
      onCambiar({ x, y, escala: nuevaEscala });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    punterosRef.current.delete(e.pointerId);
    if (punterosRef.current.size === 0) {
      gestoRef.current.modo = null;
    } else if (punterosRef.current.size === 1) {
      // Queda un solo dedo tras soltar uno de los dos: retoma el arrastre
      // desde la posición actual, para que la pegatina no salte de golpe.
      iniciarArrastreDesdePuntero([...punterosRef.current.values()][0]);
    }
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        ...estiloVisualMencion(x, y, escala),
        cursor: interactivo ? "grab" : undefined,
        touchAction: interactivo ? "none" : undefined,
      }}
      className="flex items-center gap-1 whitespace-nowrap rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white shadow"
    >
      <span className="text-text-accent">@</span>
      {nombre}
      {interactivo && onQuitar && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuitar();
          }}
          aria-label={`Quitar mención a ${nombre}`}
          className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/20"
        >
          <IconX size={10} />
        </button>
      )}
    </div>
  );
}
