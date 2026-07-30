"use client";

import { useEffect, useRef, useState } from "react";
import { IconMicrophone } from "@tabler/icons-react";

const MS_MAX_NOTA_VOZ = 120_000; // 2 minutos, tope duro
const TIPOS_AUDIO_CANDIDATOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export function soportaGrabarAudio(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

function formatearReloj(segundos: number): string {
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}

// Botón de mantener presionado para grabar una nota de voz (máx 2 minutos),
// mismo patrón getUserMedia+MediaRecorder ya usado en CamaraHistoria.tsx
// (fallback de mimeType vía isTypeSupported, corte automático por duración),
// adaptado a solo-audio. Soltar en cualquier parte de la pantalla termina la
// grabación — no solo soltar encima del botón — porque el dedo puede
// desplazarse mientras se mantiene presionado.
export function GrabadorNotaVoz({
  onGrabada,
  onError,
}: {
  onGrabada: (archivo: File, duracionSeg: number) => void;
  onError: (mensaje: string) => void;
}) {
  const [grabando, setGrabando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const streamRef = useRef<MediaStream | null>(null);
  const grabadoraRef = useRef<MediaRecorder | null>(null);
  const fragmentosRef = useRef<Blob[]>([]);
  const inicioRef = useRef(0);
  const idIntervaloRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idLimiteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canceladaRef = useRef(false);

  function limpiar() {
    if (idIntervaloRef.current) clearInterval(idIntervaloRef.current);
    if (idLimiteRef.current) clearTimeout(idLimiteRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    idIntervaloRef.current = null;
    idLimiteRef.current = null;
  }

  function detener() {
    if (!grabadoraRef.current || grabadoraRef.current.state === "inactive") return;
    grabadoraRef.current.stop();
  }

  // Soltar en cualquier lugar de la pantalla (no solo sobre el botón) termina
  // la grabación — el dedo puede desplazarse mientras se mantiene presionado.
  useEffect(() => {
    if (!grabando) return;
    window.addEventListener("pointerup", detener);
    window.addEventListener("pointercancel", detener);
    return () => {
      window.removeEventListener("pointerup", detener);
      window.removeEventListener("pointercancel", detener);
    };
  }, [grabando]);

  async function iniciar() {
    if (grabando) return;
    canceladaRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType =
        TIPOS_AUDIO_CANDIDATOS.find((t) => MediaRecorder.isTypeSupported(t)) ?? "audio/webm";
      const grabadora = new MediaRecorder(stream, { mimeType });
      fragmentosRef.current = [];
      grabadora.ondataavailable = (e) => {
        if (e.data.size > 0) fragmentosRef.current.push(e.data);
      };
      grabadora.onstop = () => {
        const duracionSeg = Math.round((Date.now() - inicioRef.current) / 1000);
        limpiar();
        setGrabando(false);
        setSegundos(0);
        // Menos de 1s: seguramente un toque accidental, se descarta en silencio.
        if (canceladaRef.current || duracionSeg < 1) return;
        // El Blob final se declara "audio/webm" liso (sin ";codecs=...") —
        // mismo motivo que VideoTrimmer.tsx: el mimeType con coma rompe el
        // parseo de Content-Type en multer/busboy al subir.
        const blob = new Blob(fragmentosRef.current, { type: "audio/webm" });
        const archivo = new File([blob], "nota-voz.webm", { type: "audio/webm" });
        onGrabada(archivo, duracionSeg);
      };
      grabadoraRef.current = grabadora;
      inicioRef.current = Date.now();
      grabadora.start();
      setGrabando(true);
      setSegundos(0);
      idIntervaloRef.current = setInterval(() => {
        setSegundos(Math.round((Date.now() - inicioRef.current) / 1000));
      }, 200);
      idLimiteRef.current = setTimeout(detener, MS_MAX_NOTA_VOZ);
    } catch (err) {
      const nombre = err instanceof Error ? err.name : "";
      onError(
        nombre === "NotAllowedError" || nombre === "SecurityError"
          ? "Activa el permiso de micrófono para grabar notas de voz."
          : "No se pudo acceder al micrófono.",
      );
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {grabando && (
        <span className="flex items-center gap-1 text-xs text-fill-warning">
          <span className="h-2 w-2 rounded-full bg-fill-warning" />
          {formatearReloj(segundos)}
        </span>
      )}
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          iniciar();
        }}
        aria-label={
          grabando
            ? "Grabando nota de voz, soltar para enviar"
            : "Mantener presionado para grabar una nota de voz"
        }
        className={`rounded-app border px-3 py-2 ${
          grabando ? "border-fill-warning text-fill-warning" : "border-border text-text-secondary"
        }`}
      >
        <IconMicrophone size={18} />
      </button>
    </div>
  );
}
