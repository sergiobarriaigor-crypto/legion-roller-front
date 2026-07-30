"use client";

import { useEffect, useRef, useState } from "react";
import { IconPlayerPlay, IconPlayerPause } from "@tabler/icons-react";

function formatearReloj(segundos: number): string {
  const min = Math.floor(segundos / 60);
  const seg = segundos % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}

// Reproductor propio (botón play/pausa + barra de progreso + duración) en vez
// del <audio controls> nativo — mismo look que WhatsApp, y controlable con
// los mismos colores del tema en vez del widget del navegador.
export function ReproductorAudioMensaje({
  url,
  duracionSeg,
}: {
  url: string;
  duracionSeg: number | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [tiempoActual, setTiempoActual] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    function onTime() {
      if (!audio || !audio.duration) return;
      setProgreso(audio.currentTime / audio.duration);
      setTiempoActual(Math.floor(audio.currentTime));
    }
    function onTerminado() {
      setReproduciendo(false);
      setProgreso(0);
      setTiempoActual(0);
    }
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onTerminado);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onTerminado);
    };
  }, []);

  function alternar() {
    const audio = audioRef.current;
    if (!audio) return;
    if (reproduciendo) {
      audio.pause();
      setReproduciendo(false);
    } else {
      audio.play();
      setReproduciendo(true);
    }
  }

  function buscar(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraccion = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = fraccion * audio.duration;
    setProgreso(fraccion);
  }

  const segundosAMostrar = tiempoActual > 0 ? tiempoActual : (duracionSeg ?? 0);

  return (
    <div className="flex items-center gap-2 rounded-app bg-black/20 px-2.5 py-2">
      <audio ref={audioRef} src={url} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          alternar();
        }}
        aria-label={reproduciendo ? "Pausar" : "Reproducir"}
        className="shrink-0 text-text-accent"
      >
        {reproduciendo ? <IconPlayerPause size={22} /> : <IconPlayerPlay size={22} />}
      </button>
      <div onClick={buscar} className="relative h-1.5 flex-1 cursor-pointer rounded-full bg-white/20">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-text-accent"
          style={{ width: `${progreso * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular-nums opacity-70">
        {formatearReloj(segundosAMostrar)}
      </span>
    </div>
  );
}
