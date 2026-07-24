"use client";

import { useRef, type CSSProperties, type RefObject } from "react";
import type { EstiloTextoHistoria } from "@/lib/historias";

const ESCALA_MINIMA = 0.4;
const ESCALA_MAXIMA = 3;

// Zona segura tipo Instagram (sobre un lienzo de referencia 1080x1920): no
// dejar arrastrar el texto tan arriba/abajo/a los lados que quede tapado por
// la barra superior (progreso, cerrar) o la de abajo ("Enviar mensaje"/
// "Escribir un eco"). ~250px de 1920 arriba/abajo, ~60px de 1080 a los lados.
const MARGEN_SUPERIOR = 250 / 1920;
const MARGEN_INFERIOR = 250 / 1920;
const MARGEN_LATERAL = 60 / 1080;

// Estilo visual (posición, tamaño, rotación, tipografía, color, alineación,
// fondo/sombra) — se usa igual en el editor (interactivo) y en el visor
// (solo lectura), así ambos se ven idénticos.
export function estiloVisualTexto(estilo: EstiloTextoHistoria): CSSProperties {
  const tieneFondo = estilo.fondo !== "ninguno";
  return {
    position: "absolute",
    left: `${estilo.x * 100}%`,
    top: `${estilo.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${estilo.rotacion}deg) scale(${estilo.escala})`,
    transformOrigin: "center",
    fontFamily: estilo.fuente,
    color: estilo.color,
    textAlign: estilo.alineacion,
    fontSize: "28px",
    fontWeight: 700,
    lineHeight: 1.3,
    padding: tieneFondo ? "6px 14px" : undefined,
    borderRadius: tieneFondo ? "10px" : undefined,
    background:
      estilo.fondo === "oscuro"
        ? "rgba(0,0,0,0.55)"
        : estilo.fondo === "claro"
          ? "rgba(255,255,255,0.85)"
          : undefined,
    textShadow: tieneFondo ? undefined : "0 1px 5px rgba(0,0,0,0.85)",
    whiteSpace: "pre-wrap",
    maxWidth: "82%",
    wordBreak: "break-word",
    userSelect: "none",
  };
}

function distanciaYAngulo(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return { distancia: Math.hypot(dx, dy), angulo: (Math.atan2(dy, dx) * 180) / Math.PI };
}

// Texto arrastrable/pellizcable/girable sobre la imagen, al estilo Instagram.
// Un dedo mueve la posición; dos dedos escalan (distancia entre ambos) y
// rotan (ángulo entre ambos) al mismo tiempo — se recalculan juntos en cada
// pointermove, no son gestos separados.
export function TextoSobreImagen({
  estilo,
  onChange,
  contenedorRef,
  interactivo = true,
}: {
  estilo: EstiloTextoHistoria;
  onChange?: (estilo: EstiloTextoHistoria) => void;
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
    gestoRef.current.offsetX = p.x / rect.width - estilo.x;
    gestoRef.current.offsetY = p.y / rect.height - estilo.y;
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
      gestoRef.current.escalaInicial = estilo.escala;
      gestoRef.current.rotacionInicial = estilo.rotacion;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!interactivo || !onChange || !punterosRef.current.has(e.pointerId)) return;
    punterosRef.current.set(e.pointerId, puntoDesdeEvento(e));
    const rect = contenedorRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (gestoRef.current.modo === "arrastrar" && punterosRef.current.size === 1) {
      const p = [...punterosRef.current.values()][0];
      const nuevoX = p.x / rect.width - gestoRef.current.offsetX;
      const nuevoY = p.y / rect.height - gestoRef.current.offsetY;
      onChange({
        ...estilo,
        x: Math.min(1 - MARGEN_LATERAL, Math.max(MARGEN_LATERAL, nuevoX)),
        y: Math.min(1 - MARGEN_INFERIOR, Math.max(MARGEN_SUPERIOR, nuevoY)),
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
      onChange({ ...estilo, escala: nuevaEscala, rotacion: nuevaRotacion });
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    punterosRef.current.delete(e.pointerId);
    if (punterosRef.current.size === 0) {
      gestoRef.current.modo = null;
    } else if (punterosRef.current.size === 1) {
      // Queda un solo dedo tras soltar uno de los dos: retoma el arrastre
      // desde la posición actual, para que el texto no salte de golpe.
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
        ...estiloVisualTexto(estilo),
        cursor: interactivo ? "grab" : undefined,
        touchAction: interactivo ? "none" : undefined,
      }}
    >
      {estilo.contenido}
    </div>
  );
}
