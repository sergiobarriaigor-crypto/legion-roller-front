"use client";

import { useEffect, useRef, useState } from "react";

const MS_MAX_NOTA_VOZ = 120_000; // 2 minutos, tope duro — corta y envía automático
const TIPOS_AUDIO_CANDIDATOS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const MENSAJE_PERMISO_DENEGADO =
  "Para enviar mensajes de audio, debes permitir el acceso al micrófono desde la configuración de tu dispositivo.";

export function soportaGrabarAudio(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}

// Botón inteligente estilo WhatsApp: a diferencia de la versión anterior
// (mantener presionado), acá se toca una vez para empezar a grabar y la
// grabación sigue en curso hasta que el usuario decide cancelarla (papelera)
// o enviarla (botón enviar) — mismo patrón getUserMedia+MediaRecorder ya
// usado en CamaraHistoria.tsx (fallback de mimeType vía isTypeSupported).
export function useGrabadorAudio({
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
        // Cancelada o menos de 1s (toque accidental): se descarta en silencio.
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
          ? MENSAJE_PERMISO_DENEGADO
          : "No se pudo acceder al micrófono.",
      );
    }
  }

  function cancelar() {
    if (!grabando) return;
    canceladaRef.current = true;
    detener();
  }

  function enviar() {
    if (!grabando) return;
    canceladaRef.current = false;
    detener();
  }

  // Si la pantalla se desmonta con la grabación en curso (el usuario navega a
  // otra conversación), se descarta en vez de quedar un MediaRecorder vivo.
  useEffect(() => {
    return () => {
      canceladaRef.current = true;
      detener();
      limpiar();
    };
     
  }, []);

  return { grabando, segundos, iniciar, cancelar, enviar };
}
