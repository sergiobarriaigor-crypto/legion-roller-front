"use client";

import { useEffect, useRef, useState } from "react";
import { IconShare, IconUpload } from "@tabler/icons-react";
import { apiUpload, apiPost, ApiError } from "@/lib/api";
import { generarTarjetaRecorrido, type DatosTarjetaRecorrido } from "@/lib/tarjetaRecorrido";

type Estado = "editando" | "publicando" | "publicado";

export function CompartirRecorridoModal({
  datos,
  token,
  onClose,
}: {
  datos: DatosTarjetaRecorrido;
  token: string | null;
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [comentario, setComentario] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [estado, setEstado] = useState<Estado>("editando");
  const [error, setError] = useState("");
  const blobUrlRef = useRef<string | null>(null);
  const generacionIdRef = useRef(0);
  const primeraVezRef = useRef(true);

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
    };
  }, []);

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
      setEstado("publicado");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar el recorrido.");
      setEstado("editando");
    }
  }

  async function compartirEnRedes() {
    if (!blob) return;
    setError("");
    const archivo = new File([blob], "recorrido-legion-roller.png", { type: "image/png" });
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
    // descargamos la imagen para que el usuario la comparta a mano.
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(blob);
    enlace.download = "recorrido-legion-roller.png";
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

        <div className="flex items-center justify-center overflow-hidden rounded-app bg-surface-2" style={{ height: 220 }}>
          {!previewUrl && <p className="text-xs text-text-secondary">Generando tarjeta...</p>}
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Vista previa del recorrido" className="h-full w-full object-contain" />
          )}
        </div>

        {estado === "publicado" ? (
          <p className="text-sm text-green-500">¡Recorrido publicado en Post! 🎉</p>
        ) : (
          <>
            <input
              type="text"
              placeholder="Título (opcional)"
              value={titulo}
              maxLength={60}
              onChange={(e) => setTitulo(e.target.value)}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
            />
            <textarea
              placeholder="Un breve comentario (opcional)"
              value={comentario}
              maxLength={140}
              rows={2}
              onChange={(e) => setComentario(e.target.value)}
              className="rounded-app border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary outline-none"
            />

            {error && <p className="text-xs text-fill-warning">{error}</p>}

            <button
              type="button"
              disabled={cargandoInicial || estado === "publicando" || !blob}
              onClick={publicarEnPost}
              className="btn-hero flex items-center justify-center gap-1.5 rounded-app px-4 py-2 text-sm disabled:opacity-50"
            >
              <IconUpload size={16} />
              {estado === "publicando" ? "Publicando..." : "Publicar en Post"}
            </button>
            <button
              type="button"
              disabled={cargandoInicial || !blob}
              onClick={compartirEnRedes}
              className="flex items-center justify-center gap-1.5 rounded-app border border-border-accent px-4 py-2 text-sm text-text-accent disabled:opacity-50"
            >
              <IconShare size={16} />
              Compartir en redes sociales
            </button>
          </>
        )}

        <button type="button" onClick={onClose} className="text-xs text-text-secondary underline">
          {estado === "publicado" ? "Cerrar" : "Cancelar"}
        </button>
      </div>
    </div>
  );
}
