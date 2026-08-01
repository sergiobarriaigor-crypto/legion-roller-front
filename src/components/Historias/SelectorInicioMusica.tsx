"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconPlayerPause, IconPlayerPlay, IconX } from "@tabler/icons-react";

function formatearTiempo(seg: number): string {
  const s = Math.max(0, Math.round(seg));
  const min = Math.floor(s / 60);
  const resto = String(s % 60).padStart(2, "0");
  return `${min}:${resto}`;
}

const CANTIDAD_BARRAS_ONDA = 80;

// Decodifica el archivo con Web Audio API y reduce las muestras a
// CANTIDAD_BARRAS_ONDA valores de amplitud (0..1, pico por bloque) — mismo
// criterio que las miniaturas de VideoTrimmer, pero para audio no hace falta
// ninguna librería nueva, el navegador ya sabe leer PCM crudo.
async function generarFormaOnda(url: string): Promise<number[]> {
  const respuesta = await fetch(url);
  const arrayBuffer = await respuesta.arrayBuffer();
  const contexto = new AudioContext();
  try {
    const audioBuffer = await contexto.decodeAudioData(arrayBuffer);
    const datos = audioBuffer.getChannelData(0);
    const tamanoBloque = Math.max(1, Math.floor(datos.length / CANTIDAD_BARRAS_ONDA));
    const barras: number[] = [];
    for (let i = 0; i < CANTIDAD_BARRAS_ONDA; i++) {
      let pico = 0;
      const inicioBloque = i * tamanoBloque;
      for (let j = 0; j < tamanoBloque; j++) {
        const valor = Math.abs(datos[inicioBloque + j] ?? 0);
        if (valor > pico) pico = valor;
      }
      barras.push(pico);
    }
    const picoGlobal = Math.max(...barras, 0.01);
    return barras.map((b) => b / picoGlobal);
  } finally {
    contexto.close();
  }
}

// Aparece cuando la canción elegida dura más que la historia — Instagram deja
// elegir qué fragmento suena; acá se resuelve igual pero con una barra lisa
// (sin forma de onda) en vez de recortar/subir nada nuevo: el audio ya es
// reproducible con currentTime, así que solo hace falta guardar desde qué
// segundo arrancar (ver musicaInicioSeg en lib/historias.ts).
export function SelectorInicioMusica({
  url,
  nombre,
  duracionTotal,
  duracionVentanaSeg,
  onConfirmar,
  onCancelar,
}: {
  url: string;
  nombre: string;
  duracionTotal: number;
  duracionVentanaSeg: number;
  onConfirmar: (inicioSeg: number) => void;
  onCancelar: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const arrastrandoRef = useRef(false);
  const inicioArrastreRef = useRef<{ clientX: number; inicio: number } | null>(null);

  const inicioMaximo = Math.max(0, duracionTotal - duracionVentanaSeg);
  const [inicio, setInicio] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  // Mejora progresiva: la ventana ya es arrastrable con la barra lisa desde
  // el primer render — la forma de onda solo se agrega encima apenas termina
  // de decodificarse (o nunca, si el navegador no puede leer este audio).
  const [forma, setForma] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    generarFormaOnda(url)
      .then((barras) => {
        if (!cancelado) setForma(barras);
      })
      .catch(() => {
        // Sin forma de onda: se queda la barra lisa, que ya es funcional.
      });
    return () => {
      cancelado = true;
    };
  }, [url]);

  function moverVentana(clientX: number) {
    const track = trackRef.current;
    const base = inicioArrastreRef.current;
    if (!track || !base) return;
    const rect = track.getBoundingClientRect();
    const deltaTiempo = ((clientX - base.clientX) / rect.width) * duracionTotal;
    setInicio(Math.min(inicioMaximo, Math.max(0, base.inicio + deltaTiempo)));
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastrandoRef.current = true;
    inicioArrastreRef.current = { clientX: e.clientX, inicio };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (arrastrandoRef.current) moverVentana(e.clientX);
  }

  function detenerArrastre() {
    arrastrandoRef.current = false;
    inicioArrastreRef.current = null;
  }

  function alternarReproduccion() {
    const audio = audioRef.current;
    if (!audio) return;
    if (reproduciendo) {
      audio.pause();
      setReproduciendo(false);
      return;
    }
    audio.currentTime = inicio;
    audio.play().catch(() => {});
    setReproduciendo(true);
  }

  function alActualizarTiempo() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime >= inicio + duracionVentanaSeg) {
      audio.pause();
      setReproduciendo(false);
    }
  }

  const porcentajeInicio = duracionTotal > 0 ? (inicio / duracionTotal) * 100 : 0;
  const porcentajeAncho = duracionTotal > 0 ? (duracionVentanaSeg / duracionTotal) * 100 : 100;

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/60" data-no-swipe>
      <audio ref={audioRef} src={url} onTimeUpdate={alActualizarTiempo} />
      <div className="flex flex-col gap-3 rounded-t-2xl bg-surface-1 p-4">
        <div className="flex items-center justify-between">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{nombre}</h3>
          <button type="button" onClick={onCancelar} aria-label="Cancelar" className="ml-2 text-text-secondary">
            <IconX size={20} />
          </button>
        </div>

        <p className="text-xs text-text-secondary">
          Esta canción dura más que la historia — elige desde qué momento suena.
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={alternarReproduccion}
            aria-label={reproduciendo ? "Pausar vista previa" : "Escuchar vista previa"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill-primary text-on-primary"
          >
            {reproduciendo ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
          </button>

          <div
            ref={trackRef}
            onPointerMove={onPointerMove}
            onPointerUp={detenerArrastre}
            onPointerLeave={detenerArrastre}
            className="relative h-10 flex-1 touch-none overflow-hidden rounded-app bg-bg-accent"
          >
            {forma && (
              <div className="absolute inset-0 flex items-center gap-px px-1">
                {forma.map((v, i) => (
                  <div
                    key={i}
                    className="min-h-[2px] flex-1 rounded-full bg-text-secondary/50"
                    style={{ height: `${Math.max(10, v * 100)}%` }}
                  />
                ))}
              </div>
            )}
            <div
              onPointerDown={onPointerDown}
              className="absolute inset-y-0 cursor-grab touch-none rounded-app border-2 border-fill-primary bg-fill-primary/30 active:cursor-grabbing"
              style={{ left: `${porcentajeInicio}%`, width: `${porcentajeAncho}%` }}
            />
          </div>
        </div>

        <p className="text-center text-xs text-text-secondary">
          {formatearTiempo(inicio)} – {formatearTiempo(inicio + duracionVentanaSeg)} de{" "}
          {formatearTiempo(duracionTotal)}
        </p>

        <button
          type="button"
          onClick={() => onConfirmar(inicio)}
          className="btn-hero flex items-center justify-center gap-1 rounded-app px-4 py-2 text-sm"
        >
          <IconCheck size={16} />
          Usar este fragmento
        </button>
      </div>
    </div>
  );
}
