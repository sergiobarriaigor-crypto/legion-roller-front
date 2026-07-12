"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconPlayerPlay, IconX } from "@tabler/icons-react";

const MIN_CLIP_SEG = 1;
const CANTIDAD_MINIATURAS = 8;

// captureStream() ya es estándar en Chrome/Edge/Firefox pero todavía no está
// en el lib.dom.d.ts de TypeScript — se extiende acá en vez de "any".
interface VideoConCaptureStream extends HTMLVideoElement {
  captureStream(): MediaStream;
}

function formatearTiempo(seg: number): string {
  const s = Math.max(0, seg);
  const min = Math.floor(s / 60);
  const resto = (s % 60).toFixed(1);
  return min > 0 ? `${min}:${resto.padStart(4, "0")}` : `${resto}s`;
}

// Recorta un video en el navegador cuando supera la duración máxima permitida
// (Historias: 30s, Post: 50s) — sin backend ni librerías nuevas. No hay forma
// de "cortar" un archivo arbitrario sin re-codificarlo, así que se reproduce
// el fragmento elegido en vivo y se graba con MediaRecorder (por eso confirmar
// tarda aproximadamente lo mismo que la duración del clip).
export function VideoTrimmer({
  archivo,
  duracionMaxima,
  onConfirmar,
  onCancelar,
}: {
  archivo: File;
  duracionMaxima: number;
  onConfirmar: (recorte: Blob, duracionSeg: number) => void;
  onCancelar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const arrastrandoRef = useRef<"inicio" | "fin" | null>(null);

  const [urlArchivo] = useState(() => URL.createObjectURL(archivo));
  const [duracionTotal, setDuracionTotal] = useState(0);
  const [inicio, setInicio] = useState(0);
  const [fin, setFin] = useState(0);
  const [miniaturas, setMiniaturas] = useState<string[] | null>(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [sinSoporte, setSinSoporte] = useState(false);

  useEffect(() => {
    return () => URL.revokeObjectURL(urlArchivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Metadatos + tira de miniaturas (mismo patrón de canvas que aplicarFiltroABlob
  // en FiltrosFoto.tsx, aplicado a fotogramas del video en vez de una imagen).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (typeof (video as VideoConCaptureStream).captureStream !== "function") {
      setSinSoporte(true);
    }

    async function generarMiniaturas(duracion: number) {
      if (!video) return;
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 80;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const resultado: string[] = [];
      for (let i = 0; i < CANTIDAD_MINIATURAS; i++) {
        const t = (duracion * i) / CANTIDAD_MINIATURAS;
        await new Promise<void>((resolve) => {
          const alBuscar = () => {
            video.removeEventListener("seeked", alBuscar);
            resolve();
          };
          video.addEventListener("seeked", alBuscar);
          video.currentTime = t;
        });
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        resultado.push(canvas.toDataURL("image/jpeg", 0.6));
      }
      setMiniaturas(resultado);
      video.currentTime = 0;
    }

    function alCargarMetadatos() {
      if (!video) return;
      setDuracionTotal(video.duration);
      setFin(Math.min(duracionMaxima, video.duration));
      generarMiniaturas(video.duration);
    }

    video.addEventListener("loadedmetadata", alCargarMetadatos);
    return () => video.removeEventListener("loadedmetadata", alCargarMetadatos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tiempoDesdeClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track || duracionTotal === 0) return 0;
    const rect = track.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return frac * duracionTotal;
  }

  function moverManija(clientX: number) {
    const video = videoRef.current;
    const cual = arrastrandoRef.current;
    if (!cual) return;
    const t = tiempoDesdeClientX(clientX);

    if (cual === "inicio") {
      const nuevoInicio = Math.max(0, Math.min(t, fin - MIN_CLIP_SEG));
      const acotado = Math.max(0, nuevoInicio, fin - duracionMaxima);
      setInicio(acotado);
      if (video) video.currentTime = acotado;
    } else {
      const nuevoFin = Math.min(duracionTotal, Math.max(t, inicio + MIN_CLIP_SEG));
      const acotado = Math.min(nuevoFin, inicio + duracionMaxima);
      setFin(acotado);
      if (video) video.currentTime = acotado;
    }
  }

  function onPointerDownManija(cual: "inicio" | "fin") {
    arrastrandoRef.current = cual;
  }

  function onPointerMoveTrack(e: React.PointerEvent) {
    if (arrastrandoRef.current) moverManija(e.clientX);
  }

  function detenerArrastre() {
    arrastrandoRef.current = null;
  }

  function reproducirFragmento() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = inicio;
    video.play();
    setReproduciendo(true);
  }

  function alReproducir() {
    const video = videoRef.current;
    if (!video || !reproduciendo) return;
    if (video.currentTime >= fin) {
      video.pause();
      setReproduciendo(false);
    }
  }

  async function confirmarRecorte() {
    const video = videoRef.current;
    if (!video || sinSoporte) return;
    setError("");
    setProcesando(true);
    try {
      const el = video as VideoConCaptureStream;
      el.currentTime = inicio;
      await new Promise<void>((resolve) => {
        const alBuscar = () => {
          el.removeEventListener("seeked", alBuscar);
          resolve();
        };
        el.addEventListener("seeked", alBuscar);
      });

      const stream = el.captureStream();
      const candidatos = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mimeType = candidatos.find((t) => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
      const grabadora = new MediaRecorder(stream, { mimeType });
      const partes: Blob[] = [];
      grabadora.ondataavailable = (ev) => {
        if (ev.data.size > 0) partes.push(ev.data);
      };

      // El Blob final se declara como "video/webm" liso (sin ";codecs=..."):
      // el valor que MediaRecorder necesita para elegir el codec (con una
      // coma sin comillas en "vp9,opus") rompe el parseo de Content-Type en
      // el backend (multer/busboy) al subirlo — el contenedor sigue siendo
      // el mismo webm, así que declarar el tipo simple no cambia nada real.
      const promesaBlob = new Promise<Blob>((resolve) => {
        grabadora.onstop = () => resolve(new Blob(partes, { type: "video/webm" }));
      });

      grabadora.start();
      await el.play();

      // requestAnimationFrame se puede frenar si la pestaña queda en segundo
      // plano (el navegador lo throttlea), lo que dejaría el video
      // reproduciendo de más — por eso se combina con el evento `timeupdate`
      // (sigue el reloj real del media, no el de renderizado) y un
      // setTimeout de respaldo con la duración exacta del clip, para
      // garantizar que el corte ocurra sí o sí cerca de `fin`.
      await new Promise<void>((resolve) => {
        let resuelto = false;
        function detener() {
          if (resuelto) return;
          resuelto = true;
          el.removeEventListener("timeupdate", alActualizarTiempo);
          clearTimeout(idRespaldo);
          resolve();
        }
        function alActualizarTiempo() {
          if (el.currentTime >= fin || el.paused || el.ended) detener();
        }
        el.addEventListener("timeupdate", alActualizarTiempo);
        const idRespaldo = setTimeout(detener, (fin - inicio) * 1000 + 500);
      });

      el.pause();
      grabadora.stop();
      const blob = await promesaBlob;
      onConfirmar(blob, fin - inicio);
    } catch {
      setError("No se pudo procesar el recorte. Probá de nuevo o recorta el video antes de subirlo.");
      setProcesando(false);
    }
  }

  const duracionClip = fin - inicio;
  const porcentajeInicio = duracionTotal > 0 ? (inicio / duracionTotal) * 100 : 0;
  const porcentajeFin = duracionTotal > 0 ? (fin / duracionTotal) * 100 : 100;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black" data-no-swipe>
      <div className="flex items-center justify-between p-3">
        <button type="button" onClick={onCancelar} className="text-white">
          <IconX size={22} />
        </button>
        <h2 className="text-sm font-semibold text-text-accent">Recortar video</h2>
        <div className="w-[22px]" />
      </div>

      <p className="px-4 text-center text-xs text-white/60">
        Este video dura más de {duracionMaxima}s — elegí el fragmento que querés publicar.
      </p>

      <div className="flex flex-1 items-center justify-center p-4">
        <video
          ref={videoRef}
          src={urlArchivo}
          onTimeUpdate={alReproducir}
          playsInline
          className="max-h-full max-w-full rounded-app"
        />
      </div>

      {sinSoporte ? (
        <div className="p-4 text-center text-sm text-white/70">
          Tu navegador no admite recortar video acá. Probá con Chrome o Edge, o recorta el video antes
          de subirlo.
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          {miniaturas === null ? (
            <p className="text-center text-xs text-white/60">Preparando video...</p>
          ) : (
            <>
              <div
                ref={trackRef}
                onPointerMove={onPointerMoveTrack}
                onPointerUp={detenerArrastre}
                onPointerLeave={detenerArrastre}
                className="relative h-14 touch-none overflow-hidden rounded-app"
              >
                <div className="absolute inset-0 flex">
                  {miniaturas.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={src} alt="" className="h-full flex-1 object-cover" />
                  ))}
                </div>
                <div
                  className="absolute inset-y-0 border-2 border-fill-primary bg-fill-primary/20"
                  style={{ left: `${porcentajeInicio}%`, right: `${100 - porcentajeFin}%` }}
                />
                <div
                  onPointerDown={() => onPointerDownManija("inicio")}
                  className="absolute inset-y-0 w-3 -translate-x-1/2 cursor-ew-resize rounded-full bg-fill-primary"
                  style={{ left: `${porcentajeInicio}%` }}
                />
                <div
                  onPointerDown={() => onPointerDownManija("fin")}
                  className="absolute inset-y-0 w-3 -translate-x-1/2 cursor-ew-resize rounded-full bg-fill-primary"
                  style={{ left: `${porcentajeFin}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-white/70">
                <span>
                  {formatearTiempo(inicio)} – {formatearTiempo(fin)}
                </span>
                <span>
                  {duracionClip.toFixed(1)}s / {duracionMaxima}s máx
                </span>
              </div>

              <button
                type="button"
                onClick={reproducirFragmento}
                disabled={reproduciendo}
                className="flex items-center justify-center gap-1 rounded-app border border-white/30 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                <IconPlayerPlay size={16} />
                Reproducir fragmento
              </button>
            </>
          )}

          {error && <p className="text-xs text-fill-warning">{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmarRecorte}
              disabled={miniaturas === null || procesando}
              className="btn-hero flex flex-1 items-center justify-center gap-1 rounded-app px-4 py-2 text-sm disabled:opacity-60"
            >
              <IconCheck size={16} />
              {procesando ? "Procesando recorte..." : "Usar este fragmento"}
            </button>
            <button
              type="button"
              onClick={onCancelar}
              disabled={procesando}
              className="rounded-app border border-white/30 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
