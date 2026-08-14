"use client";

import { useEffect, useRef, useState } from "react";

// Editor de encuadre (arrastrar para mover + zoom) para las fotos del video
// de recorrido -- mismo mecanismo que ImageUploadCrop.tsx (foto de perfil),
// pero: (1) admite proporción rectangular además de circular, (2) NO sube
// nada -- solo devuelve un data URL, ya que estas fotos son un insumo
// efímero para generarVideoRecorrido() (no un archivo persistente), y (3)
// exporta el recorte final a una resolución fija bastante mayor que el
// lienzo en pantalla, para que la nitidez del video no dependa de qué tan
// grande se vea la previsualización acá.
const ANCHO_LIENZO = 240;
const ZOOM_MAXIMO = 3;

// "vertical" = proporción real del video (ANCHO_VIDEO x ALTO_VIDEO en
// tarjetaRecorrido.ts, 9:16) para la foto de portada de cierre a pantalla
// completa; "circular" para el pin clavado sobre el mapa.
export type AspectoEncuadre = "vertical" | "circular";

const EXPORT_VERTICAL = { ancho: 720, alto: 1280 };
const EXPORT_CIRCULAR = { ancho: 480, alto: 480 };

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

interface Props {
  archivo: File;
  aspecto: AspectoEncuadre;
  onConfirmar: (dataUrl: string) => void;
  onCancelar: () => void;
}

export function EditorEncuadreFoto({ archivo, aspecto, onConfirmar, onCancelar }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagenRef = useRef<HTMLImageElement | null>(null);
  const arrastrandoRef = useRef(false);
  const ultimaPosRef = useRef({ x: 0, y: 0 });

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const altoLienzo = aspecto === "vertical" ? Math.round(ANCHO_LIENZO * (EXPORT_VERTICAL.alto / EXPORT_VERTICAL.ancho)) : ANCHO_LIENZO;

  // object-fit: cover del tamaño natural de la imagen dentro de un recuadro
  // anchoDestino x altoDestino -- generaliza la misma cuenta que ya usa
  // dibujarImagenCover() en tarjetaRecorrido.ts, acá reescrita para poder
  // aplicarla tanto al lienzo chico en pantalla como al canvas de
  // exportación en alta resolución con los mismos zoom/pan (solo cambia la
  // escala base).
  function calcularDibujo(anchoDestino: number, altoDestino: number, zoomActual: number, panActual: { x: number; y: number }) {
    const img = imagenRef.current!;
    const baseScale = Math.max(anchoDestino / img.naturalWidth, altoDestino / img.naturalHeight);
    const anchoDibujo = img.naturalWidth * baseScale * zoomActual;
    const altoDibujo = img.naturalHeight * baseScale * zoomActual;
    return {
      anchoDibujo,
      altoDibujo,
      x: (anchoDestino - anchoDibujo) / 2 + panActual.x,
      y: (altoDestino - altoDibujo) / 2 + panActual.y,
    };
  }

  function dibujarEnCanvas(
    ctx: CanvasRenderingContext2D,
    anchoDestino: number,
    altoDestino: number,
    zoomActual: number,
    panActual: { x: number; y: number },
  ) {
    const img = imagenRef.current;
    if (!img) return;
    const { anchoDibujo, altoDibujo, x, y } = calcularDibujo(anchoDestino, altoDestino, zoomActual, panActual);
    ctx.clearRect(0, 0, anchoDestino, altoDestino);
    if (aspecto === "circular") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(anchoDestino / 2, altoDestino / 2, Math.min(anchoDestino, altoDestino) / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    }
    ctx.drawImage(img, x, y, anchoDibujo, altoDibujo);
    if (aspecto === "circular") ctx.restore();
  }

  function dibujarPreview(zoomActual: number, panActual: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    dibujarEnCanvas(ctx, ANCHO_LIENZO, altoLienzo, zoomActual, panActual);
  }

  useEffect(() => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      imagenRef.current = img;
      requestAnimationFrame(() => dibujarPreview(1, { x: 0, y: 0 }));
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivo]);

  function limitarPan(zoomActual: number, panDeseado: { x: number; y: number }) {
    if (!imagenRef.current) return panDeseado;
    const { anchoDibujo, altoDibujo } = calcularDibujo(ANCHO_LIENZO, altoLienzo, zoomActual, { x: 0, y: 0 });
    const maxX = Math.max(0, (anchoDibujo - ANCHO_LIENZO) / 2);
    const maxY = Math.max(0, (altoDibujo - altoLienzo) / 2);
    return { x: clamp(panDeseado.x, -maxX, maxX), y: clamp(panDeseado.y, -maxY, maxY) };
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
      dibujarPreview(zoom, nuevo);
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
      dibujarPreview(nuevoZoom, nuevo);
      return nuevo;
    });
  }

  function confirmar() {
    if (!imagenRef.current) return;
    const destino = aspecto === "vertical" ? EXPORT_VERTICAL : EXPORT_CIRCULAR;
    const canvas = document.createElement("canvas");
    canvas.width = destino.ancho;
    canvas.height = destino.alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // El pan se eligió mirando el lienzo chico -- se escala al mismo factor
    // que crece el destino para que el encuadre final sea idéntico al que
    // se veía en la previsualización, solo que renderizado nítido.
    const factor = destino.ancho / ANCHO_LIENZO;
    dibujarEnCanvas(ctx, destino.ancho, destino.alto, zoom, { x: pan.x * factor, y: pan.y * factor });
    const tipo = aspecto === "circular" ? "image/webp" : "image/jpeg";
    onConfirmar(canvas.toDataURL(tipo, 0.9));
  }

  // Pantalla completa flotante (mismo wrapper que AjustarEncuadreFoto.tsx) --
  // así el lienzo, el zoom y los botones nunca dependen del alto/scroll del
  // panel de atrás (dentro de CompartirRecorridoModal.tsx, un editor
  // embebido ahí se cortaba y "Usar esta foto"/"Generar video" quedaban
  // inalcanzables).
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" data-no-swipe>
      <div className="card flex w-full max-w-xs flex-col items-center gap-2 p-3">
        <canvas
          ref={canvasRef}
          width={ANCHO_LIENZO}
          height={altoLienzo}
          className={`touch-none ${aspecto === "circular" ? "rounded-full" : "rounded-app"}`}
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
        <div className="flex w-full gap-2">
          <button type="button" onClick={confirmar} className="btn-hero flex-1 rounded-app px-4 py-2 text-sm">
            Usar esta foto
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
