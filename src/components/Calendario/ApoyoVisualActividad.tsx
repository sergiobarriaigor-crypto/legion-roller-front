"use client";

import { useRef, useState } from "react";
import { IconMusic, IconPhoto, IconX } from "@tabler/icons-react";
import { apiUpload } from "@/lib/api";
import { FILTROS_FOTO, FiltrosFoto, prepararFotoHistoria, type FiltroFoto } from "@/components/Historias/FiltrosFoto";
import { SelectorMusicaHistoria } from "@/components/Historias/SelectorMusicaHistoria";

// Duración "de referencia" que se le pasa al selector de música — acá no hay
// una historia con tiempo fijo (es solo la portada de la actividad), así que
// se usa un valor generoso para que el recorte de canciones largas casi
// nunca haga falta.
const DURACION_REFERENCIA_SEG = 30;

// Reutiliza el mismo editor de Historias (filtros + catálogo de música) para
// la portada opcional de una actividad del calendario — foto con filtro
// "horneado" + referencia a la canción elegida (musicaId), subida a
// /uploads igual que cualquier otra foto de la app.
export function ApoyoVisualActividad({
  token,
  onListo,
  onCerrar,
}: {
  token: string | null;
  onListo: (fotoUrl: string, musicaId: string | null) => void;
  onCerrar: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroFoto>(FILTROS_FOTO[0]);
  const [mostrarSelectorMusica, setMostrarSelectorMusica] = useState(false);
  const [musica, setMusica] = useState<{ id: string; nombre: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setPreviewUrl(URL.createObjectURL(archivo));
  }

  async function confirmar() {
    if (!previewUrl || !token) return;
    setSubiendo(true);
    setError("");
    try {
      const blob = await prepararFotoHistoria(previewUrl, filtro.css);
      const subida = await apiUpload<{ url: string }>("/uploads", blob, token, "actividad.jpg");
      onListo(subida.url, musica?.id ?? null);
    } catch {
      setError("No se pudo subir la foto. Probá de nuevo.");
      setSubiendo(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-no-swipe>
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold text-white">Apoyo visual (opcional)</h3>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-white">
          <IconX size={20} />
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Vista previa"
            className="h-full w-full object-contain"
            style={{ filter: filtro.css }}
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex flex-col items-center gap-2 text-white/70"
          >
            <IconPhoto size={40} />
            <span className="text-sm">Elegir una foto</span>
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={elegirArchivo}
        />

        {previewUrl && (
          <button
            type="button"
            onClick={() => setMostrarSelectorMusica(true)}
            aria-label="Elegir música"
            className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-white ${
              musica ? "bg-fill-primary" : "bg-black/50"
            }`}
          >
            <IconMusic size={18} />
          </button>
        )}

        {musica && (
          <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5">
            <p className="min-w-0 flex-1 truncate text-xs font-medium text-white">{musica.nombre}</p>
            <button type="button" onClick={() => setMusica(null)} className="text-white/70">
              <IconX size={14} />
            </button>
          </div>
        )}

        {mostrarSelectorMusica && (
          <SelectorMusicaHistoria
            duracionHistoriaSeg={DURACION_REFERENCIA_SEG}
            onCerrar={() => setMostrarSelectorMusica(false)}
            onSeleccionar={(c) => {
              setMusica({ id: c.id, nombre: c.nombre });
              setMostrarSelectorMusica(false);
            }}
          />
        )}
      </div>

      {previewUrl && (
        <div className="bg-black px-3 pb-2 pt-1">
          <FiltrosFoto previewUrl={previewUrl} filtroActual={filtro} onCambiar={setFiltro} />
        </div>
      )}

      {error && <p className="px-4 pb-2 text-xs text-fill-warning">{error}</p>}

      <div className="p-3">
        <button
          type="button"
          onClick={confirmar}
          disabled={!previewUrl || subiendo}
          className="btn-hero w-full rounded-app px-4 py-2 text-sm disabled:opacity-60"
        >
          {subiendo ? "Subiendo..." : "Usar esta foto"}
        </button>
      </div>
    </div>
  );
}
