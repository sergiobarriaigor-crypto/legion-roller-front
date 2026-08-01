"use client";

import { useRef, type CSSProperties, type RefObject } from "react";
import { type MarcoFotoStickerId } from "@/lib/historias";
import { UMBRAL_TACHO_Y_FRACCION } from "@/components/Historias/ZonaEliminarArrastre";

const ESCALA_MINIMA = 0.5;
const ESCALA_MAXIMA = 2.5;

// Un toque se distingue de un arrastre por qué tan lejos se movió el dedo
// entre pointerDown y pointerUp — por debajo de este umbral (en píxeles de
// pantalla) se considera un tap, no un gesto.
const UMBRAL_TAP_PX = 8;

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

const SOMBRA_FOTO = "0 6px 18px rgba(0,0,0,0.5)";

// Dibuja la foto según el marco elegido — compartido entre el editor
// (FotoStickerSobreImagen, interactivo) y el visor (VisorHistorias, estático)
// para que se vea idéntico en ambos. Todas las variantes ocupan el mismo
// espacio (ANCHO_BASE x ALTO_BASE) para no afectar la posición/gestos.
export function ContenidoFotoSticker({ url, marco }: { url: string; marco: MarcoFotoStickerId }) {
  if (marco === "sinmarco") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        draggable={false}
        style={{ width: ANCHO_BASE, height: ALTO_BASE, boxShadow: SOMBRA_FOTO }}
        className="rounded-app object-cover"
      />
    );
  }
  if (marco === "circular") {
    const lado = ALTO_FOTO_BASE - 8;
    return (
      <div className="flex items-center justify-center" style={{ width: ANCHO_BASE, height: ALTO_BASE }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          draggable={false}
          style={{ width: lado, height: lado, boxShadow: SOMBRA_FOTO }}
          className="rounded-full border-4 border-white object-cover"
        />
      </div>
    );
  }
  if (marco === "redondeado") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        draggable={false}
        style={{ width: ANCHO_BASE, height: ALTO_BASE, boxShadow: SOMBRA_FOTO }}
        className="rounded-2xl border-2 border-white object-cover"
      />
    );
  }
  // "polaroid" (por defecto) — marco blanco con margen inferior grueso, mismo
  // criterio visual que una instantánea real.
  return (
    <div
      className="flex flex-col gap-2 rounded-[2px] bg-white p-2 pb-4"
      style={{ width: ANCHO_BASE, height: ALTO_BASE, boxShadow: "0 10px 24px rgba(0,0,0,0.45)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        draggable={false}
        style={{ width: ANCHO_BASE - 16, height: ALTO_FOTO_BASE - 16 }}
        className="rounded-[1px] object-cover"
      />
    </div>
  );
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
  marco,
  onCambiar,
  onQuitar,
  onTocar,
  onArrastreCambia,
  contenedorRef,
  interactivo = true,
}: {
  url: string;
  x: number;
  y: number;
  escala: number;
  rotacion: number;
  marco: MarcoFotoStickerId;
  onCambiar?: (valores: { x: number; y: number; escala: number; rotacion: number }) => void;
  onQuitar?: () => void;
  // Se dispara con un toque corto (sin arrastre ni pellizco) — el editor lo
  // usa para abrir el selector de marco, sin chocar con mover/escalar/girar.
  onTocar?: () => void;
  // Se dispara mientras se arrastra con un dedo (no durante el pellizco):
  // (activo, sobreTacho) — el editor lo usa para mostrar/resaltar el tacho de
  // basura. Al soltar sobre el tacho se llama a onQuitar en vez de mover.
  onArrastreCambia?: (activo: boolean, sobreTacho: boolean) => void;
  contenedorRef: RefObject<HTMLElement | null>;
  interactivo?: boolean;
}) {
  const punterosRef = useRef(new Map<number, { x: number; y: number }>());
  const tapRef = useRef<{ x: number; y: number; huboPellizco: boolean } | null>(null);
  const sobreTachoRef = useRef(false);
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
      tapRef.current = { x: e.clientX, y: e.clientY, huboPellizco: false };
    } else if (punterosRef.current.size === 2) {
      const [p1, p2] = [...punterosRef.current.values()];
      const { distancia, angulo } = distanciaYAngulo(p1, p2);
      gestoRef.current.modo = "pellizcar";
      gestoRef.current.distanciaInicial = distancia;
      gestoRef.current.anguloInicial = angulo;
      gestoRef.current.escalaInicial = escala;
      gestoRef.current.rotacionInicial = rotacion;
      if (tapRef.current) tapRef.current.huboPellizco = true;
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
      sobreTachoRef.current = nuevoY > UMBRAL_TACHO_Y_FRACCION;
      onArrastreCambia?.(true, sobreTachoRef.current);
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
      const fueArrastre = gestoRef.current.modo === "arrastrar";
      gestoRef.current.modo = null;
      const inicioTap = tapRef.current;
      tapRef.current = null;
      if (fueArrastre && sobreTachoRef.current) {
        sobreTachoRef.current = false;
        onArrastreCambia?.(false, false);
        onQuitar?.();
        return;
      }
      sobreTachoRef.current = false;
      onArrastreCambia?.(false, false);
      if (interactivo && onTocar && inicioTap && !inicioTap.huboPellizco) {
        const distancia = Math.hypot(e.clientX - inicioTap.x, e.clientY - inicioTap.y);
        if (distancia < UMBRAL_TAP_PX) onTocar();
      }
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
    >
      <ContenidoFotoSticker url={url} marco={marco} />
    </div>
  );
}
