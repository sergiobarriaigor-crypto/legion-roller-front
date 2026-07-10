"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconMapPin, IconX } from "@tabler/icons-react";
import { apiUpload, ApiError } from "@/lib/api";
import {
  crearHistoria,
  serializarEstiloTexto,
  type EstiloTextoHistoria,
} from "@/lib/historias";
import { sectorMasCercano } from "@/lib/sectores";
import { TextoSobreImagen } from "@/components/Historias/TextoSobreImagen";
import { BarraTextoHistoria } from "@/components/Historias/BarraTextoHistoria";

const DURACION_MAXIMA_VIDEO_SEG = 30;

const ESTILO_TEXTO_DEFECTO: Omit<EstiloTextoHistoria, "contenido"> = {
  x: 0.5,
  y: 0.5,
  escala: 1,
  rotacion: 0,
  fuente: "Arial, sans-serif",
  color: "#ffffff",
  alineacion: "center",
  fondo: "ninguno",
};

// El archivo ya llega elegido (BarraHistorias dispara el selector nativo de
// cámara/galería directamente al tocar "+"); este editor solo se encarga de
// validar, previsualizar, agregar texto sobre la imagen y publicar.
export function EditorHistoria({
  archivoInicial,
  token,
  onClose,
  onPublicado,
}: {
  archivoInicial: File;
  token: string | null;
  onClose: () => void;
  onPublicado: () => void;
}) {
  const contenedorMediaRef = useRef<HTMLDivElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"foto" | "video" | null>(null);
  const [estiloTexto, setEstiloTexto] = useState<EstiloTextoHistoria | null>(null);
  const [mostrarInputTexto, setMostrarInputTexto] = useState(false);
  const [borradorTexto, setBorradorTexto] = useState("");
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

  // Valida (duración de video) y prepara la vista previa del archivo recibido.
  useEffect(() => {
    setError("");
    const url = URL.createObjectURL(archivoInicial);
    const esVideo = archivoInicial.type.startsWith("video/");

    if (!esVideo) {
      setPreviewUrl(url);
      setTipo("foto");
      return () => URL.revokeObjectURL(url);
    }

    // Video: se valida la duración en el cliente ANTES de subir, para no gastar
    // ancho de banda subiendo algo que de todas formas se va a rechazar.
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (video.duration > DURACION_MAXIMA_VIDEO_SEG) {
        setError(`El video no puede durar más de ${DURACION_MAXIMA_VIDEO_SEG} segundos.`);
        return;
      }
      setPreviewUrl(url);
      setTipo("video");
    };
    video.src = url;
    return () => URL.revokeObjectURL(url);
  }, [archivoInicial]);

  function abrirEdicionTexto() {
    setBorradorTexto(estiloTexto?.contenido ?? "");
    setMostrarInputTexto(true);
  }

  function confirmarTexto() {
    const contenido = borradorTexto.trim();
    if (!contenido) {
      setEstiloTexto(null);
    } else if (estiloTexto) {
      setEstiloTexto({ ...estiloTexto, contenido });
    } else {
      setEstiloTexto({ contenido, ...ESTILO_TEXTO_DEFECTO });
    }
    setMostrarInputTexto(false);
  }

  async function publicar() {
    if (!tipo) return;
    setPublicando(true);
    setError("");
    try {
      const subida = await apiUpload<{ url: string }>(
        "/uploads",
        archivoInicial,
        token,
        archivoInicial.name,
      );
      await crearHistoria(
        {
          tipo,
          mediaUrl: subida.url,
          texto: estiloTexto?.contenido || undefined,
          textoEstilo: estiloTexto ? serializarEstiloTexto(estiloTexto) : undefined,
          ubicacion,
        },
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
    <div className="fixed inset-0 z-50 flex flex-col bg-black" data-no-swipe>
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
      ) : error && !previewUrl ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
          <p className="text-center text-sm text-fill-warning">{error}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
          >
            Cerrar
          </button>
        </div>
      ) : !previewUrl ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-text-secondary">Cargando...</p>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={contenedorMediaRef} className="relative min-h-0 flex-1 overflow-hidden">
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

            {/* Botón "Aa": único punto de entrada para escribir o reescribir el
                texto, siempre visible sobre la imagen (esquina opuesta a la
                ubicación) — igual que el editor de historias de Instagram. */}
            <button
              type="button"
              onClick={abrirEdicionTexto}
              aria-label="Agregar texto"
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-base font-bold text-white"
            >
              Aa
            </button>

            {estiloTexto && (
              <TextoSobreImagen
                estilo={estiloTexto}
                onChange={setEstiloTexto}
                contenedorRef={contenedorMediaRef}
              />
            )}

            {mostrarInputTexto && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70 px-6">
                <textarea
                  autoFocus
                  value={borradorTexto}
                  onChange={(e) => setBorradorTexto(e.target.value.slice(0, 200))}
                  placeholder="Escribe algo..."
                  rows={3}
                  className="w-full max-w-xs resize-none rounded-app border border-white/30 bg-transparent px-3 py-2 text-center text-lg text-white outline-none placeholder:text-white/50"
                />
                <button
                  type="button"
                  onClick={confirmarTexto}
                  className="btn-hero rounded-app px-5 py-2 text-sm"
                >
                  Listo
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 p-3">
            {estiloTexto && (
              <BarraTextoHistoria
                estilo={estiloTexto}
                onChange={setEstiloTexto}
                onEditarContenido={abrirEdicionTexto}
                onQuitar={() => setEstiloTexto(null)}
              />
            )}
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
