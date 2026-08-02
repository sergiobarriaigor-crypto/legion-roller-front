"use client";

import { useEffect, useRef, useState } from "react";
import { IconShare, IconUpload } from "@tabler/icons-react";
import { apiUpload, apiPost, ApiError } from "@/lib/api";
import { generarTarjetaRecorrido, generarVideoRecorrido, type DatosTarjetaRecorrido } from "@/lib/tarjetaRecorrido";
import { useNoAutofill } from "@/lib/useNoAutofill";

type Estado = "editando" | "publicando";
type Tab = "imagen" | "video";

export function CompartirRecorridoModal({
  datos,
  token,
  onClose,
  onPublicado,
}: {
  datos: DatosTarjetaRecorrido;
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
    };
  }, []);

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
          fotoUrl: subida.url,
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
    const esVideo = tab === "video";
    const blobActivo = esVideo ? videoBlob : blob;
    if (!blobActivo) return;
    setError("");
    const nombreArchivo = esVideo ? "recorrido-legion-roller.webm" : "recorrido-legion-roller.png";
    const archivo = new File([blobActivo], nombreArchivo, { type: esVideo ? "video/webm" : "image/png" });
    const textoCompartir = [titulo.trim(), comentario.trim()].filter(Boolean).join("\n");

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
        <h2 className="text-sm font-semibold text-text-accent">Compartir recorrido</h2>

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
          disabled={tab === "imagen" ? cargandoInicial || !blob : generandoVideo || !videoBlob}
          onClick={compartirEnRedes}
          className="flex items-center justify-center gap-1.5 rounded-app border border-border-accent px-4 py-2 text-sm text-text-accent disabled:opacity-50"
        >
          <IconShare size={16} />
          Compartir en redes sociales
        </button>

        <button type="button" onClick={onClose} className="text-xs text-text-secondary underline">
          Cancelar
        </button>
      </div>
    </div>
  );
}
