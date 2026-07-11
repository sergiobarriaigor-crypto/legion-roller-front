"use client";

import { useEffect, useRef, useState } from "react";
import { IconAt, IconCheck, IconMapPin, IconX } from "@tabler/icons-react";
import { apiUpload, ApiError } from "@/lib/api";
import {
  crearHistoria,
  serializarEstiloTexto,
  MAX_MENCIONES_POR_HISTORIA,
  type EstiloTextoHistoria,
} from "@/lib/historias";
import { sectorMasCercano } from "@/lib/sectores";
import { useSession } from "@/context/SessionContext";
import { TextoSobreImagen } from "@/components/Historias/TextoSobreImagen";
import { BarraTextoHistoria } from "@/components/Historias/BarraTextoHistoria";
import { FILTROS_FOTO, FiltrosFoto, aplicarFiltroABlob, type FiltroFoto } from "@/components/Historias/FiltrosFoto";
import { MencionSobreImagen } from "@/components/Historias/MencionSobreImagen";
import { SelectorMencion } from "@/components/Historias/SelectorMencion";

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
  const { sesion } = useSession();
  const contenedorMediaRef = useRef<HTMLDivElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"foto" | "video" | null>(null);
  const [estiloTexto, setEstiloTexto] = useState<EstiloTextoHistoria | null>(null);
  const [filtro, setFiltro] = useState<FiltroFoto>(FILTROS_FOTO[0]);
  const [menciones, setMenciones] = useState<
    { miembroId: number; nombre: string; x: number; y: number; escala: number }[]
  >([]);
  const [mostrarSelectorMencion, setMostrarSelectorMencion] = useState(false);
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
    setFiltro(FILTROS_FOTO[0]);
    setMenciones([]);
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
      const archivoASubir: Blob =
        tipo === "foto" && filtro.css !== "none" && previewUrl
          ? await aplicarFiltroABlob(previewUrl, filtro.css)
          : archivoInicial;
      const subida = await apiUpload<{ url: string }>(
        "/uploads",
        archivoASubir,
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
          menciones: menciones.length
            ? menciones.map((m) => ({ miembroId: m.miembroId, x: m.x, y: m.y, escala: m.escala }))
            : undefined,
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
              <img
                src={previewUrl}
                alt="Vista previa de la historia"
                className="h-full w-full object-contain"
                style={{ filter: filtro.css }}
              />
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

            {/* Botón "@": misma dinámica que "Aa" (un toque abre el selector,
                el resultado queda arrastrable/pellizcable sobre la imagen),
                ubicado justo debajo para que se lea como parte del mismo
                grupo de controles. Hasta MAX_MENCIONES_POR_HISTORIA personas. */}
            <button
              type="button"
              onClick={() => {
                if (menciones.length >= MAX_MENCIONES_POR_HISTORIA) {
                  setError(`Puedes mencionar hasta ${MAX_MENCIONES_POR_HISTORIA} personas por historia.`);
                  return;
                }
                setMostrarSelectorMencion(true);
              }}
              aria-label="Mencionar a alguien"
              className="absolute right-3 top-14 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
            >
              <IconAt size={18} />
            </button>

            {estiloTexto && (
              <TextoSobreImagen
                estilo={estiloTexto}
                onChange={setEstiloTexto}
                contenedorRef={contenedorMediaRef}
              />
            )}

            {menciones.map((m) => (
              <MencionSobreImagen
                key={m.miembroId}
                nombre={m.nombre}
                x={m.x}
                y={m.y}
                escala={m.escala}
                onCambiar={(valores) =>
                  setMenciones((prev) =>
                    prev.map((p) => (p.miembroId === m.miembroId ? { ...p, ...valores } : p)),
                  )
                }
                onQuitar={() =>
                  setMenciones((prev) => prev.filter((p) => p.miembroId !== m.miembroId))
                }
                contenedorRef={contenedorMediaRef}
              />
            ))}

            {mostrarSelectorMencion && (
              <SelectorMencion
                token={token}
                excluirIds={[sesion?.id, ...menciones.map((m) => m.miembroId)].filter(
                  (id): id is number => id != null,
                )}
                onCerrar={() => setMostrarSelectorMencion(false)}
                onSeleccionar={(m) => {
                  // Pequeño escalón vertical por cada mención nueva, para que
                  // no queden todas apiladas exactamente en el mismo punto.
                  const y = Math.min(0.85, 0.5 + menciones.length * 0.1);
                  setMenciones((prev) => [...prev, { miembroId: m.id, nombre: m.nombre, x: 0.5, y, escala: 1 }]);
                  setMostrarSelectorMencion(false);
                }}
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
            {tipo === "foto" && (
              <FiltrosFoto previewUrl={previewUrl} filtroActual={filtro} onCambiar={setFiltro} />
            )}
            {menciones.length > 0 && (
              <div className="flex flex-col gap-1 rounded-app bg-black/60 px-3 py-2 text-sm text-white">
                <span className="text-xs text-text-secondary">
                  Mencionaste a {menciones.length}/{MAX_MENCIONES_POR_HISTORIA}:
                </span>
                {menciones.map((m) => (
                  <div key={m.miembroId} className="flex items-center justify-between">
                    <span>@{m.nombre}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setMenciones((prev) => prev.filter((p) => p.miembroId !== m.miembroId))
                      }
                      className="text-fill-warning"
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
            )}
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
