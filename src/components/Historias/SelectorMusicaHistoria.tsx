"use client";

import { useEffect, useRef, useState } from "react";
import { IconPlayerPause, IconPlayerPlay, IconX } from "@tabler/icons-react";
import { CANCIONES_HISTORIA, GENEROS_MUSICA, type CancionHistoria, type GeneroMusica } from "@/lib/musicaHistorias";
import { SelectorInicioMusica } from "@/components/Historias/SelectorInicioMusica";

// Margen para no disparar el paso de recorte por diferencias mínimas de
// redondeo entre la duración real del archivo y duracionHistoriaSeg.
const MARGEN_SEG = 0.25;

// Selector de música del catálogo propio de la app — chips de género +
// lista con vista previa (un solo audio compartido, se corta solo al
// elegir otra pista o cerrar). Elegir una fila selecciona esa canción y
// cierra, igual dinámica que el sticker de música de Instagram — salvo que,
// si la canción dura más que la historia, antes se pide elegir el fragmento
// (ver SelectorInicioMusica).
export function SelectorMusicaHistoria({
  duracionHistoriaSeg,
  onSeleccionar,
  onCerrar,
}: {
  duracionHistoriaSeg: number;
  onSeleccionar: (cancion: CancionHistoria, inicioSeg: number) => void;
  onCerrar: () => void;
}) {
  const [genero, setGenero] = useState<GeneroMusica>(GENEROS_MUSICA[0].id);
  const [sonando, setSonando] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [cancionParaRecortar, setCancionParaRecortar] = useState<{
    cancion: CancionHistoria;
    duracion: number;
  } | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  function alternarPrevia(cancion: CancionHistoria) {
    const audio = audioRef.current;
    if (!audio) return;
    if (sonando === cancion.id) {
      audio.pause();
      setSonando(null);
      return;
    }
    audio.src = cancion.archivo;
    audio.play().catch(() => {});
    setSonando(cancion.id);
  }

  function elegir(cancion: CancionHistoria) {
    audioRef.current?.pause();
    setSonando(null);
    const sonda = new Audio(cancion.archivo);
    sonda.preload = "metadata";
    sonda.addEventListener("loadedmetadata", () => {
      if (Number.isFinite(sonda.duration) && sonda.duration > duracionHistoriaSeg + MARGEN_SEG) {
        setCancionParaRecortar({ cancion, duracion: sonda.duration });
      } else {
        onSeleccionar(cancion, 0);
      }
    });
    sonda.addEventListener("error", () => onSeleccionar(cancion, 0));
  }

  if (cancionParaRecortar) {
    return (
      <SelectorInicioMusica
        url={cancionParaRecortar.cancion.archivo}
        nombre={cancionParaRecortar.cancion.nombre}
        duracionTotal={cancionParaRecortar.duracion}
        duracionVentanaSeg={duracionHistoriaSeg}
        onConfirmar={(inicioSeg) => onSeleccionar(cancionParaRecortar.cancion, inicioSeg)}
        onCancelar={() => setCancionParaRecortar(null)}
      />
    );
  }

  const cancionesDelGenero = CANCIONES_HISTORIA.filter((c) => c.genero === genero);

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end bg-black/40" data-no-swipe>
      <audio ref={audioRef} onEnded={() => setSonando(null)} />
      <div className="flex max-h-[70%] flex-col gap-3 rounded-t-2xl bg-surface-1 p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">Elige una canción</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={20} />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {GENEROS_MUSICA.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGenero(g.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                genero === g.id ? "bg-fill-primary text-on-primary" : "bg-bg-accent text-text-accent"
              }`}
            >
              {g.nombre}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {cancionesDelGenero.length === 0 && (
            <p className="py-6 text-center text-sm text-text-secondary">
              Todavía no hay canciones en este género.
            </p>
          )}
          {cancionesDelGenero.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 border-t border-border py-1.5 first:border-t-0"
            >
              <button
                type="button"
                onClick={() => alternarPrevia(c)}
                aria-label={sonando === c.id ? "Pausar vista previa" : "Escuchar vista previa"}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  sonando === c.id ? "bg-fill-primary text-on-primary" : "bg-bg-accent text-text-accent"
                }`}
              >
                {sonando === c.id ? <IconPlayerPause size={15} /> : <IconPlayerPlay size={15} />}
              </button>
              <button
                type="button"
                onClick={() => elegir(c)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-text-primary">{c.nombre}</p>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
