"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { IconShare, IconUpload, IconCube3dSphere, IconX } from "@tabler/icons-react";
import { apiUpload, apiPost, ApiError } from "@/lib/api";
import { generarTarjetaRecorrido, generarVideoRecorrido, type DatosTarjetaRecorrido } from "@/lib/tarjetaRecorrido";
import {
  solicitarFlyover,
  estadoFlyoverPorRecorrido,
  estadoFlyoverPorId,
  type EstadoFlyover,
  type EstiloFlyover,
} from "@/lib/flyover";
import { useNoAutofill } from "@/lib/useNoAutofill";
import { compartirArchivoNativo } from "@/lib/compartirNativo";

type Estado = "editando" | "publicando";
type Tab = "imagen" | "video" | "video3d";

export function CompartirRecorridoModal({
  datos,
  recorridoId,
  token,
  onClose,
  onPublicado,
}: {
  datos: DatosTarjetaRecorrido;
  recorridoId: number;
  token: string | null;
  onClose: () => void;
  onPublicado?: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [comentario, setComentario] = useState("");
  const noAutofillTitulo = useNoAutofill();
  const noAutofillComentario = useNoAutofill();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [estado, setEstado] = useState<Estado>("editando");
  const [error, setError] = useState("");
  // Solo importa para "video3d": ese caso hace un fetch() del mp4 (puede
  // pesar varios MB) antes de poder compartirlo -- sin este estado, el botón
  // no daba ninguna señal mientras tanto y parecía que "no hacía nada".
  const [compartiendo, setCompartiendo] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const generacionIdRef = useRef(0);
  const primeraVezRef = useRef(true);

  // Video para redes sociales: es una pieza aparte (no depende de
  // título/comentario, que no se dibujan en la tarjeta), se genera una sola
  // vez bajo demanda al entrar a la pestaña "Video" — a diferencia de la
  // imagen no se regenera solo, porque tarda varios segundos reales.
  const [tab, setTab] = useState<Tab>("imagen");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
  const [generandoVideo, setGenerandoVideo] = useState(false);
  const [progresoVideo, setProgresoVideo] = useState(0);
  const [errorVideo, setErrorVideo] = useState("");
  const videoBlobUrlRef = useRef<string | null>(null);

  // Video 3D (flyover): a diferencia del video de arriba, se renderiza en el
  // servidor (navegador headless + MapLibre) porque muchos celulares no
  // soportan WebGL/GPU -- tarda 1-3 min, así que en vez de una barra de
  // progreso bloqueante se dispara el pedido y se hace polling del estado,
  // permitiendo que el usuario cierre el modal mientras tanto (el aviso de
  // "listo" llega igual por push).
  const [estadoFlyover, setEstadoFlyover] = useState<EstadoFlyover | null>(null);
  const [cargandoFlyover, setCargandoFlyover] = useState(false);
  const [errorFlyover, setErrorFlyover] = useState("");
  const [estiloFlyover, setEstiloFlyover] = useState<EstiloFlyover>("edificios");
  const pollingFlyoverRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Genera la tarjeta apenas se abre el modal (sin espera), y la vuelve a
  // generar cuando el usuario cambia el título/comentario, pero con un
  // pequeño debounce (600ms sin escribir) — regenerar en cada tecla hacía
  // parpadear toda la vista previa a cada carácter. Mientras se regenera,
  // la imagen anterior se mantiene visible; recién se reemplaza cuando la
  // nueva está lista, así nunca queda en blanco.
  useEffect(() => {
    const demora = primeraVezRef.current ? 0 : 600;
    primeraVezRef.current = false;

    const timeoutId = setTimeout(() => {
      const idGeneracion = ++generacionIdRef.current;
      generarTarjetaRecorrido({ ...datos, titulo: titulo || undefined, comentario: comentario || undefined })
        .then((nuevoBlob) => {
          if (generacionIdRef.current !== idGeneracion) return; // ya hay una más nueva en curso
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
          const url = URL.createObjectURL(nuevoBlob);
          blobUrlRef.current = url;
          setBlob(nuevoBlob);
          setPreviewUrl(url);
        })
        .catch(() => {
          if (generacionIdRef.current === idGeneracion) {
            setError("No se pudo generar la tarjeta del recorrido.");
          }
        })
        .finally(() => {
          if (generacionIdRef.current === idGeneracion) setCargandoInicial(false);
        });
    }, demora);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulo, comentario]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
      detenerPollingFlyover();
    };
  }, []);

  function detenerPollingFlyover() {
    if (pollingFlyoverRef.current) {
      clearInterval(pollingFlyoverRef.current);
      pollingFlyoverRef.current = null;
    }
  }

  function iniciarPollingFlyover(id: number) {
    detenerPollingFlyover();
    pollingFlyoverRef.current = setInterval(async () => {
      if (!token) return;
      try {
        const estado = await estadoFlyoverPorId(id, token);
        setEstadoFlyover(estado);
        if (estado.estado === "listo" || estado.estado === "error") {
          detenerPollingFlyover();
        }
      } catch {
        detenerPollingFlyover();
      }
    }, 4000);
  }

  async function consultarEstadoFlyoverInicial() {
    if (!token) return;
    setCargandoFlyover(true);
    try {
      const estado = await estadoFlyoverPorRecorrido(recorridoId, token);
      setEstadoFlyover(estado);
      if (estado && (estado.estado === "pendiente" || estado.estado === "procesando")) {
        iniciarPollingFlyover(estado.id);
      }
    } catch {
      // Sin video previo (o error de red) -- se deja en null, el usuario puede generar uno nuevo.
    } finally {
      setCargandoFlyover(false);
    }
  }

  async function generarFlyover() {
    if (!token || cargandoFlyover) return;
    setCargandoFlyover(true);
    setErrorFlyover("");
    try {
      const estado = await solicitarFlyover(recorridoId, token, estiloFlyover);
      setEstadoFlyover(estado);
      if (estado.estado === "pendiente" || estado.estado === "procesando") {
        iniciarPollingFlyover(estado.id);
      }
    } catch (err) {
      setErrorFlyover(
        err instanceof ApiError ? err.message : "No se pudo iniciar la generación del video 3D.",
      );
    } finally {
      setCargandoFlyover(false);
    }
  }

  async function generarVideo() {
    if (videoBlob || generandoVideo) return;
    setGenerandoVideo(true);
    setErrorVideo("");
    setProgresoVideo(0);
    try {
      const nuevoBlob = await generarVideoRecorrido(datos, { onProgreso: setProgresoVideo });
      if (videoBlobUrlRef.current) URL.revokeObjectURL(videoBlobUrlRef.current);
      const url = URL.createObjectURL(nuevoBlob);
      videoBlobUrlRef.current = url;
      setVideoBlob(nuevoBlob);
      setVideoUrl(url);
    } catch {
      setErrorVideo("No se pudo generar el video en este navegador. Probá desde el celular.");
    } finally {
      setGenerandoVideo(false);
    }
  }

  function elegirTab(nuevoTab: Tab) {
    setTab(nuevoTab);
    if (nuevoTab === "video" && !videoBlob && !generandoVideo) generarVideo();
    if (nuevoTab === "video3d" && estadoFlyover === null && !cargandoFlyover) {
      consultarEstadoFlyoverInicial();
    }
  }

  async function publicarEnPost() {
    if (!token || !blob) return;
    setEstado("publicando");
    setError("");
    try {
      const subida = await apiUpload<{ url: string }>("/uploads", blob, token, "recorrido.png");
      await apiPost(
        "/posts",
        {
          titulo: titulo.trim() || "Mi recorrido en Legión Roller",
          resena: comentario.trim() || "¡Otro recorrido completado! 🛼",
          ubicacion: datos.sector,
          fotos: [subida.url],
        },
        token,
      );
      onPublicado?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar el recorrido.");
      setEstado("editando");
    }
  }

  async function compartirEnRedes() {
    setError("");
    setCompartiendo(true);
    try {
      await compartirEnRedesInterno();
    } finally {
      setCompartiendo(false);
    }
  }

  async function compartirEnRedesInterno() {
    let blobActivo: Blob | null;
    let nombreArchivo: string;
    let tipoArchivo: string;

    if (tab === "video3d") {
      if (!estadoFlyover?.videoUrl) return;
      try {
        const controlador = new AbortController();
        const idTimeout = setTimeout(() => controlador.abort(), 20000);
        try {
          const res = await fetch(estadoFlyover.videoUrl, { signal: controlador.signal });
          if (!res.ok) throw new Error("respuesta no OK");
          blobActivo = await res.blob();
        } finally {
          clearTimeout(idTimeout);
        }
      } catch {
        setError("No se pudo descargar el video 3D para compartir. Probá de nuevo.");
        return;
      }
      nombreArchivo = "recorrido-3d-legion-roller.mp4";
      tipoArchivo = "video/mp4";
    } else {
      const esVideo = tab === "video";
      blobActivo = esVideo ? videoBlob : blob;
      nombreArchivo = esVideo ? "recorrido-legion-roller.webm" : "recorrido-legion-roller.png";
      tipoArchivo = esVideo ? "video/webm" : "image/png";
    }
    if (!blobActivo) return;

    const archivo = new File([blobActivo], nombreArchivo, { type: tipoArchivo });
    const textoCompartir = [titulo.trim(), comentario.trim()].filter(Boolean).join("\n");

    // En la app nativa (Capacitor), la Web Share API y el fallback de
    // descarga de más abajo fallan en silencio -- ver compartirNativo.ts.
    if (Capacitor.isNativePlatform()) {
      try {
        await compartirArchivoNativo(archivo, { titulo: titulo || "Mi recorrido", texto: textoCompartir });
      } catch {
        setError("No se pudo compartir el archivo. Probá de nuevo.");
      }
      return;
    }

    try {
      if (
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [archivo] })
      ) {
        await navigator.share({ files: [archivo], title: titulo || "Mi recorrido", text: textoCompartir });
        return;
      }
    } catch {
      // el usuario canceló el panel de compartir, o el navegador lo rechazó: seguimos con la descarga
    }

    // Si no hay soporte para compartir archivos (navegador de escritorio, etc.),
    // descargamos el archivo para que el usuario lo comparta a mano.
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blobActivo);
    enlace.download = nombreArchivo;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6"
      onClick={onClose}
    >
      <div
        className="card flex w-full max-w-xs flex-col gap-3 p-5"
        style={{ maxHeight: "88vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-accent">Compartir recorrido</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-text-secondary">
            <IconX size={18} />
          </button>
        </div>

        <div className="flex gap-1.5 rounded-app bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => elegirTab("imagen")}
            className={`flex-1 rounded-app py-1.5 text-xs font-semibold ${
              tab === "imagen" ? "bg-fill-primary text-on-primary" : "text-text-secondary"
            }`}
          >
            Imagen
          </button>
          <button
            type="button"
            onClick={() => elegirTab("video")}
            className={`flex-1 rounded-app py-1.5 text-xs font-semibold ${
              tab === "video" ? "bg-fill-primary text-on-primary" : "text-text-secondary"
            }`}
          >
            Video
          </button>
          <button
            type="button"
            onClick={() => elegirTab("video3d")}
            className={`flex flex-1 items-center justify-center gap-1 rounded-app py-1.5 text-xs font-semibold ${
              tab === "video3d" ? "bg-fill-primary text-on-primary" : "text-text-secondary"
            }`}
          >
            <IconCube3dSphere size={13} />
            3D
          </button>
        </div>

        <div className="flex items-center justify-center overflow-hidden rounded-app bg-surface-2" style={{ height: 320 }}>
          {tab === "imagen" && (
            <>
              {!previewUrl && <p className="text-xs text-text-secondary">Generando tarjeta...</p>}
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Vista previa del recorrido" className="h-full w-full object-contain" />
              )}
            </>
          )}
          {tab === "video" && (
            <>
              {generandoVideo && (
                <p className="px-6 text-center text-xs text-text-secondary">
                  Generando video... {Math.round(progresoVideo * 100)}%
                </p>
              )}
              {!generandoVideo && errorVideo && (
                <p className="px-6 text-center text-xs text-fill-warning">{errorVideo}</p>
              )}
              {!generandoVideo && !errorVideo && videoUrl && (
                <video
                  src={videoUrl}
                  className="h-full w-full object-contain"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              )}
            </>
          )}
          {tab === "video3d" && (
            <>
              {cargandoFlyover && (
                <p className="px-6 text-center text-xs text-text-secondary">Un momento...</p>
              )}
              {!cargandoFlyover && !estadoFlyover && !errorFlyover && (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                  <p className="text-xs text-text-secondary">
                    Se genera en el servidor -- funciona en cualquier celular, sin importar si
                    soporta 3D. Tarda 1-3 min; podés cerrar esta ventana y te avisamos cuando esté.
                  </p>
                  <div className="flex gap-1.5 rounded-app bg-surface-2 p-1">
                    <button
                      type="button"
                      onClick={() => setEstiloFlyover("edificios")}
                      className={`rounded-app px-3 py-1.5 text-xs font-semibold ${
                        estiloFlyover === "edificios"
                          ? "bg-fill-primary text-on-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      Edificios 3D
                    </button>
                    <button
                      type="button"
                      onClick={() => setEstiloFlyover("satelital")}
                      className={`rounded-app px-3 py-1.5 text-xs font-semibold ${
                        estiloFlyover === "satelital"
                          ? "bg-fill-primary text-on-primary"
                          : "text-text-secondary"
                      }`}
                    >
                      Satelital
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={generarFlyover}
                    className="btn-hero rounded-app px-4 py-1.5 text-xs"
                  >
                    Generar video 3D
                  </button>
                </div>
              )}
              {!cargandoFlyover && errorFlyover && (
                <div className="flex flex-col items-center gap-2.5 px-6 text-center">
                  <p className="text-xs text-fill-warning">{errorFlyover}</p>
                  <button
                    type="button"
                    onClick={generarFlyover}
                    className="rounded-app border border-border-accent px-4 py-1.5 text-xs text-text-accent"
                  >
                    Reintentar
                  </button>
                </div>
              )}
              {!cargandoFlyover &&
                estadoFlyover &&
                (estadoFlyover.estado === "pendiente" || estadoFlyover.estado === "procesando") && (
                  <p className="px-6 text-center text-xs text-text-secondary">
                    Generando tu video 3D... puede tardar 1-3 min. Podés cerrar esta ventana, te
                    avisamos cuando esté listo.
                  </p>
                )}
              {!cargandoFlyover && estadoFlyover?.estado === "listo" && estadoFlyover.videoUrl && (
                <video
                  src={estadoFlyover.videoUrl}
                  className="h-full w-full object-contain"
                  autoPlay
                  loop
                  muted
                  playsInline
                />
              )}
              {!cargandoFlyover && estadoFlyover?.estado === "error" && (
                <div className="flex flex-col items-center gap-2.5 px-6 text-center">
                  <p className="text-xs text-fill-warning">No se pudo generar el video 3D.</p>
                  {estadoFlyover.errorMsg && (
                    // Errores de ffmpeg/Puppeteer llegan acá como texto técnico
                    // larguísimo (ver flyover-render.service.ts) -- antes se
                    // mostraba entero y tapaba toda la ventana; ahora queda
                    // contenido en una caja chica con scroll, útil para
                    // diagnosticar sin volver a inundar la pantalla.
                    <pre className="max-h-24 w-full overflow-y-auto whitespace-pre-wrap break-words rounded-app bg-surface-2 p-2 text-left text-[10px] text-text-muted">
                      {estadoFlyover.errorMsg.slice(0, 500)}
                    </pre>
                  )}
                  <button
                    type="button"
                    onClick={generarFlyover}
                    className="rounded-app border border-border-accent px-4 py-1.5 text-xs text-text-accent"
                  >
                    Reintentar
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <input
          type="text"
          autoComplete="off"
          {...noAutofillTitulo}
          placeholder="Título (opcional)"
          value={titulo}
          maxLength={60}
          onChange={(e) => setTitulo(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
        />
        <textarea
          autoComplete="off"
          {...noAutofillComentario}
          placeholder="Un breve comentario (opcional)"
          value={comentario}
          maxLength={140}
          rows={2}
          onChange={(e) => setComentario(e.target.value)}
          className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
        />

        {error && <p className="text-xs text-fill-warning">{error}</p>}

        {tab === "imagen" && (
          <button
            type="button"
            disabled={cargandoInicial || estado === "publicando" || !blob}
            onClick={publicarEnPost}
            className="btn-hero flex items-center justify-center gap-1.5 rounded-app px-4 py-2 text-sm disabled:opacity-50"
          >
            <IconUpload size={16} />
            {estado === "publicando" ? "Publicando..." : "Publicar en Post"}
          </button>
        )}
        <button
          type="button"
          disabled={
            compartiendo ||
            (tab === "imagen"
              ? cargandoInicial || !blob
              : tab === "video"
                ? generandoVideo || !videoBlob
                : estadoFlyover?.estado !== "listo" || !estadoFlyover.videoUrl)
          }
          onClick={compartirEnRedes}
          className="flex items-center justify-center gap-1.5 rounded-app border border-border-accent px-4 py-2 text-sm text-text-accent disabled:opacity-50"
        >
          <IconShare size={16} />
          {compartiendo ? "Preparando..." : "Compartir en redes sociales"}
        </button>

        <button type="button" onClick={onClose} className="text-xs text-text-secondary underline">
          {tab === "video3d" && (estadoFlyover?.estado === "pendiente" || estadoFlyover?.estado === "procesando")
            ? "Cerrar (el video se sigue generando)"
            : "Cancelar"}
        </button>
      </div>
    </div>
  );
}
