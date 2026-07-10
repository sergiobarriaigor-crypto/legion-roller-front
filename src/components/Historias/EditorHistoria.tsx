"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconMapPin, IconPhoto, IconX } from "@tabler/icons-react";
import { apiUpload, ApiError } from "@/lib/api";
import { crearHistoria } from "@/lib/historias";
import { sectorMasCercano } from "@/lib/sectores";

const DURACION_MAXIMA_VIDEO_SEG = 30;

export function EditorHistoria({
  token,
  onClose,
  onPublicado,
}: {
  token: string | null;
  onClose: () => void;
  onPublicado: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"foto" | "video" | null>(null);
  const [texto, setTexto] = useState("");
  const [ubicacion, setUbicacion] = useState<string | undefined>(undefined);
  const [error, setError] = useState("");
  const [publicando, setPublicando] = useState(false);
  const [publicado, setPublicado] = useState(false);

  // Ubicación opcional: se autodetecta una vez al abrir el editor (mismo patrón
  // ya usado en "Patinadores activos"/"Mis rutas" — sin geocoding externo, solo
  // el sector conocido más cercano). El usuario puede quitarla si no la quiere.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUbicacion(sectorMasCercano(pos.coords.latitude, pos.coords.longitude)),
      () => {
        // sin permiso o sin GPS: simplemente no se sugiere ubicación
      },
      { timeout: 5000 },
    );
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const elegido = e.target.files?.[0];
    if (!elegido) return;
    setError("");
    const esVideo = elegido.type.startsWith("video/");
    const url = URL.createObjectURL(elegido);

    if (!esVideo) {
      setArchivo(elegido);
      setPreviewUrl(url);
      setTipo("foto");
      return;
    }

    // Video: se valida la duración en el cliente ANTES de subir, para no gastar
    // ancho de banda subiendo algo que de todas formas se va a rechazar.
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (video.duration > DURACION_MAXIMA_VIDEO_SEG) {
        setError(`El video no puede durar más de ${DURACION_MAXIMA_VIDEO_SEG} segundos.`);
        URL.revokeObjectURL(url);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      setArchivo(elegido);
      setPreviewUrl(url);
      setTipo("video");
    };
    video.src = url;
  }

  async function publicar() {
    if (!archivo || !tipo) return;
    setPublicando(true);
    setError("");
    try {
      const subida = await apiUpload<{ url: string }>("/uploads", archivo, token, archivo.name);
      await crearHistoria(
        { tipo, mediaUrl: subida.url, texto: texto.trim() || undefined, ubicacion },
        token,
      );
      // Sin modal de confirmación: solo una animación breve antes de cerrar.
      setPublicado(true);
      setTimeout(onPublicado, 700);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar la historia.");
      setPublicando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        onChange={elegirArchivo}
        className="hidden"
      />

      <div className="flex items-center justify-between p-3">
        <button type="button" onClick={onClose} className="text-text-secondary">
          <IconX size={22} />
        </button>
        <h2 className="text-sm font-semibold text-text-accent">Nueva historia</h2>
        <div className="w-[22px]" />
      </div>

      {publicado ? (
        <div className="animate-historia-exito flex flex-1 flex-col items-center justify-center gap-2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-fill-primary text-on-primary">
            <IconCheck size={32} />
          </div>
          <p className="text-sm text-text-secondary">Historia publicada</p>
        </div>
      ) : !previewUrl ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="btn-hero flex items-center gap-2 rounded-app px-5 py-3 text-sm"
          >
            <IconPhoto size={18} />
            Tomar foto, grabar video o elegir de la galería
          </button>
          {error && <p className="text-center text-xs text-fill-warning">{error}</p>}
        </div>
      ) : (
        <div className="relative flex flex-1 flex-col">
          <div className="relative flex-1 overflow-hidden">
            {tipo === "video" ? (
              <video
                src={previewUrl}
                className="h-full w-full object-contain"
                autoPlay
                muted
                loop
                playsInline
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="Vista previa de la historia" className="h-full w-full object-contain" />
            )}

            {ubicacion && (
              <div className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                <IconMapPin size={14} />
                {ubicacion}
                <button
                  type="button"
                  onClick={() => setUbicacion(undefined)}
                  className="ml-1 text-text-secondary underline"
                >
                  Quitar
                </button>
              </div>
            )}

            {texto && (
              <p className="absolute bottom-6 left-0 right-0 px-6 text-center text-lg font-semibold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)]">
                {texto}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 p-3">
            <input
              type="text"
              placeholder="Agregar texto (opcional)"
              value={texto}
              maxLength={200}
              onChange={(e) => setTexto(e.target.value)}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
            />
            {error && <p className="text-xs text-fill-warning">{error}</p>}
            <button
              type="button"
              disabled={publicando}
              onClick={publicar}
              className="btn-hero rounded-app px-4 py-3 text-sm disabled:opacity-60"
            >
              {publicando ? "Publicando..." : "Compartir"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
