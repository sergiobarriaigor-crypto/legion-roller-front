"use client";

import { useEffect, useRef, useState } from "react";
import { apiUpload, ApiError } from "@/lib/api";
import { RATIO_MIN, RATIO_MAX } from "@/components/CarruselFotos";

const ANCHO_LIENZO = 320;
const ANCHO_SALIDA = 1080;
const ZOOM_MAXIMO = 3;

// Paso opcional de "encuadre" para una foto ya subida: el recorte automático
// (object-cover, ver CarruselFotos.tsx) a veces deja afuera lo importante de
// la foto — este componente deja arrastrar/hacer zoom dentro del mismo marco
// (misma relación de aspecto RATIO_MIN-RATIO_MAX) y sube el resultado como
// una foto nueva, reemplazando la anterior. Mismo gesto de pan/zoom que
// ImageUploadCrop.tsx, pero con marco rectangular variable en vez de
// cuadrado/circular fijo.
export function AjustarEncuadreFoto({
  url,
  token,
  onAjustado,
  onCerrar,
}: {
  url: string;
  token: string | null;
  onAjustado: (nuevaUrl: string) => void;
  onCerrar: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagenRef = useRef<HTMLImageElement | null>(null);
  const arrastrandoRef = useRef(false);
  const ultimaPosRef = useRef({ x: 0, y: 0 });
  const panRef = useRef({ x: 0, y: 0 });

  const [altoLienzo, setAltoLienzo] = useState(ANCHO_LIENZO);
  const [zoom, setZoom] = useState(1);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const ratio = Math.min(RATIO_MAX, Math.max(RATIO_MIN, img.naturalWidth / img.naturalHeight));
      imagenRef.current = img;
      setAltoLienzo(Math.round(ANCHO_LIENZO / ratio));
      setListo(true);
    };
    img.onerror = () => setError("No se pudo cargar la foto.");
    img.src = url;
  }, [url]);

  useEffect(() => {
    if (!listo) return;
    panRef.current = { x: 0, y: 0 };
    requestAnimationFrame(() => dibujar(1, panRef.current));
  }, [listo, altoLienzo]);

  function dibujar(zoomActual: number, panActual: { x: number; y: number }) {
    const canvas = canvasRef.current;
    const img = imagenRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const baseScale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const anchoDibujo = img.naturalWidth * baseScale * zoomActual;
    const altoDibujo = img.naturalHeight * baseScale * zoomActual;
    const x = (canvas.width - anchoDibujo) / 2 + panActual.x;
    const y = (canvas.height - altoDibujo) / 2 + panActual.y;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, x, y, anchoDibujo, altoDibujo);
  }

  function limitarPan(zoomActual: number, panDeseado: { x: number; y: number }) {
    const canvas = canvasRef.current;
    const img = imagenRef.current;
    if (!canvas || !img) return panDeseado;
    const baseScale = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
    const anchoDibujo = img.naturalWidth * baseScale * zoomActual;
    const altoDibujo = img.naturalHeight * baseScale * zoomActual;
    const maxX = Math.max(0, (anchoDibujo - canvas.width) / 2);
    const maxY = Math.max(0, (altoDibujo - canvas.height) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, panDeseado.x)),
      y: Math.min(maxY, Math.max(-maxY, panDeseado.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    arrastrandoRef.current = true;
    ultimaPosRef.current = { x: e.clientX, y: e.clientY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!arrastrandoRef.current) return;
    const dx = e.clientX - ultimaPosRef.current.x;
    const dy = e.clientY - ultimaPosRef.current.y;
    ultimaPosRef.current = { x: e.clientX, y: e.clientY };
    const nuevo = limitarPan(zoom, { x: panRef.current.x + dx, y: panRef.current.y + dy });
    panRef.current = nuevo;
    dibujar(zoom, nuevo);
  }

  function detenerArrastre() {
    arrastrandoRef.current = false;
  }

  function cambiarZoom(nuevoZoom: number) {
    setZoom(nuevoZoom);
    const nuevo = limitarPan(nuevoZoom, panRef.current);
    panRef.current = nuevo;
    dibujar(nuevoZoom, nuevo);
  }

  // El lienzo de interacción (arriba) se mantiene chico a propósito para que
  // arrastrar/hacer zoom sea liviano — pero exportar ese mismo lienzo directo
  // producía una foto de solo 320px de ancho (pixelada al mostrarla a tamaño
  // real). Acá se vuelve a dibujar el mismo encuadre (mismo pan/zoom, escalado
  // proporcionalmente) sobre un lienzo aparte a resolución de salida, usando
  // siempre los píxeles originales de la foto (`img`), antes de subirla.
  async function usarEncuadre() {
    const img = imagenRef.current;
    if (!img || !token) return;
    setSubiendo(true);
    setError("");

    const factor = ANCHO_SALIDA / ANCHO_LIENZO;
    const salida = document.createElement("canvas");
    salida.width = ANCHO_SALIDA;
    salida.height = Math.round(altoLienzo * factor);
    const ctx = salida.getContext("2d");
    if (!ctx) {
      setError("No se pudo generar el encuadre.");
      setSubiendo(false);
      return;
    }

    const baseScale = Math.max(salida.width / img.naturalWidth, salida.height / img.naturalHeight);
    const anchoDibujo = img.naturalWidth * baseScale * zoom;
    const altoDibujo = img.naturalHeight * baseScale * zoom;
    const x = (salida.width - anchoDibujo) / 2 + panRef.current.x * factor;
    const y = (salida.height - altoDibujo) / 2 + panRef.current.y * factor;
    ctx.drawImage(img, x, y, anchoDibujo, altoDibujo);

    salida.toBlob(
      async (blob) => {
        if (!blob) {
          setError("No se pudo generar el encuadre.");
          setSubiendo(false);
          return;
        }
        try {
          const res = await apiUpload<{ url: string }>("/uploads", blob, token, "foto.jpg");
          onAjustado(res.url);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "No se pudo guardar el encuadre.");
          setSubiendo(false);
        }
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" data-no-swipe>
      <div className="card flex w-full max-w-xs flex-col items-center gap-2 p-3">
        <p className="text-sm font-semibold text-text-primary">Ajustar encuadre</p>
        {listo ? (
          <canvas
            ref={canvasRef}
            width={ANCHO_LIENZO}
            height={altoLienzo}
            className="touch-none rounded-app"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={detenerArrastre}
            onPointerLeave={detenerArrastre}
          />
        ) : (
          <div
            style={{ width: ANCHO_LIENZO, height: altoLienzo }}
            className="animate-pulse rounded-app bg-surface-2"
          />
        )}
        <input
          type="range"
          min={1}
          max={ZOOM_MAXIMO}
          step={0.05}
          value={zoom}
          onChange={(e) => cambiarZoom(Number(e.target.value))}
          className="w-full"
          disabled={!listo}
        />
        <p className="text-xs text-text-muted">Arrastra para mover, desliza para hacer zoom</p>
        {error && <p className="text-xs text-fill-warning">{error}</p>}
        <div className="flex w-full gap-2">
          <button
            type="button"
            disabled={!listo || subiendo}
            onClick={usarEncuadre}
            className="btn-hero flex-1 rounded-app px-4 py-2 text-sm disabled:opacity-60"
          >
            {subiendo ? "Guardando..." : "Usar este encuadre"}
          </button>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
