"use client";

import { useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";

const ESCALA_MIN = 1;
const ESCALA_MAX = 4;

function distanciaEntreDedos(t1: React.Touch, t2: React.Touch) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Visor de foto a pantalla completa con zoom por pellizco (pinch), calculado
// a mano con la distancia entre los dos dedos en cada touchmove (sin
// librería extra, ya que solo se necesita este único gesto). Con un dedo,
// si ya está ampliada, se puede arrastrar (pan) para recorrer la imagen.
export function VisorFotoMensaje({ url, onCerrar }: { url: string; onCerrar: () => void }) {
  const [escala, setEscala] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const distanciaInicialRef = useRef(0);
  const escalaInicialRef = useRef(1);
  const offsetInicialRef = useRef({ x: 0, y: 0 });
  const puntoInicialRef = useRef({ x: 0, y: 0 });

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      distanciaInicialRef.current = distanciaEntreDedos(e.touches[0], e.touches[1]);
      escalaInicialRef.current = escala;
    } else if (e.touches.length === 1 && escala > 1) {
      puntoInicialRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      offsetInicialRef.current = offset;
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const actual = distanciaEntreDedos(e.touches[0], e.touches[1]);
      const factor = actual / distanciaInicialRef.current;
      setEscala(Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, escalaInicialRef.current * factor)));
    } else if (e.touches.length === 1 && escala > 1) {
      const dx = e.touches[0].clientX - puntoInicialRef.current.x;
      const dy = e.touches[0].clientY - puntoInicialRef.current.y;
      setOffset({ x: offsetInicialRef.current.x + dx, y: offsetInicialRef.current.y + dy });
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    // Al soltar y quedar en 1x (sin zoom), se limpia cualquier arrastre
    // residual para que la próxima vez que se amplíe parta centrada.
    if (e.touches.length === 0 && escala <= 1) {
      setOffset({ x: 0, y: 0 });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-no-swipe>
      <div className="flex justify-end p-3">
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-white">
          <IconX size={24} />
        </button>
      </div>
      <div
        className="flex flex-1 items-center justify-center overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Foto"
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${escala})`,
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
          }}
        />
      </div>
    </div>
  );
}
