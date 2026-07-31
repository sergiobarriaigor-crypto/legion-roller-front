"use client";

import { useRef, type CSSProperties, type RefObject } from "react";
import { IconX } from "@tabler/icons-react";

const ESCALA_MINIMA = 0.5;
const ESCALA_MAXIMA = 2.5;

// Tamaño base del marco Polaroid a escala=1 (foto cuadrada + margen inferior
// grueso, mismo criterio visual que una instantánea real).
const ANCHO_BASE = 132;
const ALTO_FOTO_BASE = 132;
const ALTO_BASE = 168;

export function estiloVisualFotoSticker(
  x: number,
  y: number,
  escala: number,
  rotacion: number,
): CSSProperties {
  return {
    position: "absolute",
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${ANCHO_BASE}px`,
    height: `${ALTO_BASE}px`,
    transform: `translate(-50%, -50%) rotate(${rotacion}deg) scale(${escala})`,
    transformOrigin: "center",
    userSelect: "none",
  };
}

function distanciaYAngulo(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return { distancia: Math.hypot(dx, dy), angulo: (Math.atan2(dy, dx) * 180) / Math.PI };
}

// Foto "Polaroid" arrastrable/pellizcable/girable sobre la imagen, estilo
// Instagram — mismo patrón de gestos que TextoSobreImagen (un dedo mueve,
// dos dedos escalan y rotan juntos).
export function FotoStickerSobreImagen({
  url,
  x,
  y,
  escala,
  rotacion,
  onCambiar,
  onQuitar,
  contenedorRef,
  interactivo = true,
}: {
  url: string;
  x: number;
  y: number;
  escala: number;
  rotacion: number;
  onCambiar?: (valores: { x: number; y: number; escala: number; rotacion: number }) => void;
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
    anguloInicial: number;
    escalaInicial: number;
    rotacionInicial: number;
  }>({
    modo: null,
    offsetX: 0,
    offsetY: 0,
    distanciaInicial: 0,
    anguloInicial: 0,
    escalaInicial: 1,
    rotacionInicial: 0,
  });

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
      const { distancia, angulo } = distanciaYAngulo(p1, p2);
      gestoRef.current.modo = "pellizcar";
      gestoRef.current.distanciaInicial = distancia;
      gestoRef.current.anguloInicial = angulo;
      gestoRef.current.escalaInicial = escala;
      gestoRef.current.rotacionInicial = rotacion;
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
      onCambiar({
        x: Math.min(1, Math.max(0, nuevoX)),
        y: Math.min(1, Math.max(0, nuevoY)),
        escala,
        rotacion,
      });
    } else if (gestoRef.current.modo === "pellizcar" && punterosRef.current.size === 2) {
      const [p1, p2] = [...punterosRef.current.values()];
      const { distancia, angulo } = distanciaYAngulo(p1, p2);
      const factorEscala = distancia / (gestoRef.current.distanciaInicial || 1);
      const nuevaEscala = Math.min(
        ESCALA_MAXIMA,
        Math.max(ESCALA_MINIMA, gestoRef.current.escalaInicial * factorEscala),
      );
      const nuevaRotacion = gestoRef.current.rotacionInicial + (angulo - gestoRef.current.anguloInicial);
      onCambiar({ x, y, escala: nuevaEscala, rotacion: nuevaRotacion });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    punterosRef.current.delete(e.pointerId);
    if (punterosRef.current.size === 0) {
      gestoRef.current.modo = null;
    } else if (punterosRef.current.size === 1) {
      // Queda un solo dedo tras soltar uno de los dos: retoma el arrastre
      // desde la posición actual, para que la foto no salte de golpe.
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
        ...estiloVisualFotoSticker(x, y, escala, rotacion),
        cursor: interactivo ? "grab" : undefined,
        touchAction: interactivo ? "none" : undefined,
      }}
      className="flex flex-col gap-2 rounded-[2px] bg-white p-2 pb-4 shadow-[0_10px_24px_rgba(0,0,0,0.45)]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        style={{ width: ANCHO_BASE - 16, height: ALTO_FOTO_BASE - 16 }}
        className="rounded-[1px] object-cover"
      />
      {interactivo && onQuitar && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuitar();
          }}
          aria-label="Quitar foto"
          className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}
