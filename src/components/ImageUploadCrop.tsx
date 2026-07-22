"use client";

import { useRef, useState } from "react";
import { apiUpload, ApiError } from "@/lib/api";

const TAMANO_LIENZO = 260;
const ZOOM_MAXIMO = 3;

interface Props {
  token: string | null;
  onSubido: (url: string) => void;
  etiqueta?: string;
  formaCircular?: boolean;
  permitirCamara?: boolean;
  ruta?: string;
}

export function ImageUploadCrop({
  token,
  onSubido,
  etiqueta = "Agregar foto",
  formaCircular = false,
  permitirCamara = false,
  ruta = "/uploads",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const camaraInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagenRef = useRef<HTMLImageElement | null>(null);
  const arrastrandoRef = useRef(false);
  const ultimaPosRef = useRef({ x: 0, y: 0 });

  const [editando, setEditando] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  function dibujar(zoomActual: number, panActual: { x: number; y: number }) {
    const canvas = canvasRef.current;
    const img = imagenRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const baseScale = TAMANO_LIENZO / Math.min(img.naturalWidth, img.naturalHeight);
    const anchoDibujo = img.naturalWidth * baseScale * zoomActual;
    const altoDibujo = img.naturalHeight * baseScale * zoomActual;
    const x = (TAMANO_LIENZO - anchoDibujo) / 2 + panActual.x;
    const y = (TAMANO_LIENZO - altoDibujo) / 2 + panActual.y;

    ctx.clearRect(0, 0, TAMANO_LIENZO, TAMANO_LIENZO);
    if (formaCircular) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(TAMANO_LIENZO / 2, TAMANO_LIENZO / 2, TAMANO_LIENZO / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }
    ctx.drawImage(img, x, y, anchoDibujo, altoDibujo);
    if (formaCircular) {
      ctx.restore();
    }
  }

  function limitarPan(zoomActual: number, panDeseado: { x: number; y: number }) {
    const img = imagenRef.current;
    if (!img) return panDeseado;
    const baseScale = TAMANO_LIENZO / Math.min(img.naturalWidth, img.naturalHeight);
    const anchoDibujo = img.naturalWidth * baseScale * zoomActual;
    const altoDibujo = img.naturalHeight * baseScale * zoomActual;
    const maxX = Math.max(0, (anchoDibujo - TAMANO_LIENZO) / 2);
    const maxY = Math.max(0, (altoDibujo - TAMANO_LIENZO) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, panDeseado.x)),
      y: Math.min(maxY, Math.max(-maxY, panDeseado.y)),
    };
  }

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError("");

    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      imagenRef.current = img;
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setEditando(true);
      requestAnimationFrame(() => dibujar(1, { x: 0, y: 0 }));
    };
    img.src = url;
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
    setPan((prev) => {
      const nuevo = limitarPan(zoom, { x: prev.x + dx, y: prev.y + dy });
      dibujar(zoom, nuevo);
      return nuevo;
    });
  }

  function detenerArrastre() {
    arrastrandoRef.current = false;
  }

  function cambiarZoom(nuevoZoom: number) {
    setZoom(nuevoZoom);
    setPan((prev) => {
      const nuevo = limitarPan(nuevoZoom, prev);
      dibujar(nuevoZoom, nuevo);
      return nuevo;
    });
  }

  async function usarFoto() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSubiendo(true);
    setError("");
    canvas.toBlob(async (blob) => {
      if (!blob) {
        setSubiendo(false);
        return;
      }
      try {
        const res = await apiUpload<{ url: string }>(
          ruta,
          blob,
          token,
          formaCircular ? "foto.webp" : "foto.jpg",
        );
        onSubido(res.url);
        cancelar();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo subir la foto.");
      } finally {
        setSubiendo(false);
      }
    }, formaCircular ? "image/webp" : "image/jpeg", formaCircular ? 0.85 : 0.9);
  }

  function cancelar() {
    setEditando(false);
    imagenRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={elegirArchivo}
        className="hidden"
      />
      {permitirCamara && (
        <input
          ref={camaraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={elegirArchivo}
          className="hidden"
        />
      )}

      {!editando ? (
        permitirCamara ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => camaraInputRef.current?.click()}
              className="flex-1 rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
            >
              Tomar foto
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex-1 rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
            >
              Elegir de galería
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
          >
            {etiqueta}
          </button>
        )
      ) : (
        <div className="card flex flex-col items-center gap-2 p-3" data-no-swipe>
          <canvas
            ref={canvasRef}
            width={TAMANO_LIENZO}
            height={TAMANO_LIENZO}
            className={`touch-none ${formaCircular ? "rounded-full" : "rounded-app"}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={detenerArrastre}
            onPointerLeave={detenerArrastre}
          />
          <input
            type="range"
            min={1}
            max={ZOOM_MAXIMO}
            step={0.05}
            value={zoom}
            onChange={(e) => cambiarZoom(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-text-muted">Arrastra para mover, desliza para hacer zoom</p>
          {error && <p className="text-xs text-fill-warning">{error}</p>}
          <div className="flex w-full gap-2">
            <button
              type="button"
              disabled={subiendo}
              onClick={usarFoto}
              className="btn-hero flex-1 rounded-app px-4 py-2 text-sm disabled:opacity-60"
            >
              {subiendo ? "Subiendo..." : "Usar esta foto"}
            </button>
            <button
              type="button"
              onClick={cancelar}
              className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
