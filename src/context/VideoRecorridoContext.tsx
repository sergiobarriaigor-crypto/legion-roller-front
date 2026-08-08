"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { generarVideoRecorrido, type DatosTarjetaRecorrido } from "@/lib/tarjetaRecorrido";

interface EstadoVideoRecorrido {
  recorridoId: number | null;
  generando: boolean;
  progreso: number;
  videoBlob: Blob | null;
  videoUrl: string | null;
  error: string | null;
}

const ESTADO_VACIO: EstadoVideoRecorrido = {
  recorridoId: null,
  generando: false,
  progreso: 0,
  videoBlob: null,
  videoUrl: null,
  error: null,
};

interface VideoRecorridoContextValor {
  estado: EstadoVideoRecorrido;
  iniciarGeneracion: (recorridoId: number, datos: DatosTarjetaRecorrido) => void;
  limpiar: () => void;
}

const VideoRecorridoContext = createContext<VideoRecorridoContextValor | null>(null);

// Vive en el layout de (app) (fuera de <SwipeNavigator>, que desmonta toda la
// pantalla en cada cambio de pestaña) para que la grabación en curso del
// video de "Compartir recorrido" sobreviva navegar a otra pestaña y volver --
// mismo criterio que BorradorPostContext.tsx. Solo en memoria a propósito: si
// recarga la página o cierra la app se pierde igual (MediaRecorder no puede
// seguir grabando sin la pestaña abierta, así que persistirlo no tendría
// sentido).
export function VideoRecorridoProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoVideoRecorrido>(ESTADO_VACIO);
  const videoUrlRef = useRef<string | null>(null);
  const generandoIdRef = useRef<number | null>(null);

  function limpiar() {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = null;
    generandoIdRef.current = null;
    setEstado(ESTADO_VACIO);
  }

  function iniciarGeneracion(recorridoId: number, datos: DatosTarjetaRecorrido) {
    // Ya hay un video (listo o en curso) para esta misma ruta -- no repetir.
    if (estado.recorridoId === recorridoId && (estado.generando || estado.videoBlob)) return;
    // Un video de OTRA ruta ya está en curso -- un solo MediaRecorder a la
    // vez, se ignora hasta que termine o se descarte con limpiar().
    if (estado.generando && estado.recorridoId !== recorridoId) return;

    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = null;
    generandoIdRef.current = recorridoId;

    setEstado({
      recorridoId,
      generando: true,
      progreso: 0,
      videoBlob: null,
      videoUrl: null,
      error: null,
    });

    generarVideoRecorrido(datos, {
      onProgreso: (fraccion) => {
        if (generandoIdRef.current !== recorridoId) return;
        setEstado((prev) => (prev.recorridoId === recorridoId ? { ...prev, progreso: fraccion } : prev));
      },
    })
      .then((nuevoBlob) => {
        if (generandoIdRef.current !== recorridoId) return; // se descartó o se reemplazó mientras tanto
        const url = URL.createObjectURL(nuevoBlob);
        videoUrlRef.current = url;
        setEstado({
          recorridoId,
          generando: false,
          progreso: 1,
          videoBlob: nuevoBlob,
          videoUrl: url,
          error: null,
        });
      })
      .catch(() => {
        if (generandoIdRef.current !== recorridoId) return;
        setEstado((prev) =>
          prev.recorridoId === recorridoId
            ? { ...prev, generando: false, error: "No se pudo generar el video en este navegador. Probá desde el celular." }
            : prev,
        );
      });
  }

  // Aviso 3: si el usuario intenta cerrar o recargar la pestaña de verdad
  // mientras se está grabando, el navegador muestra su confirmación nativa
  // ("¿Salir de esta página?") -- es la única red de seguridad real contra
  // perder el video, ya que MediaRecorder no sigue grabando sin la pestaña.
  useEffect(() => {
    function alIntentarCerrar(e: BeforeUnloadEvent) {
      if (!estado.generando) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", alIntentarCerrar);
    return () => window.removeEventListener("beforeunload", alIntentarCerrar);
  }, [estado.generando]);

  return (
    <VideoRecorridoContext.Provider value={{ estado, iniciarGeneracion, limpiar }}>
      {children}
    </VideoRecorridoContext.Provider>
  );
}

export function useVideoRecorrido() {
  const contexto = useContext(VideoRecorridoContext);
  if (!contexto) throw new Error("useVideoRecorrido debe usarse dentro de VideoRecorridoProvider");
  return contexto;
}
