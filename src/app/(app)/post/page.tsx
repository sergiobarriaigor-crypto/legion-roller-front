"use client";

import { useEffect, useRef, useState } from "react";
import { IconMapPin, IconShare, IconVideo } from "@tabler/icons-react";
import { useSession } from "@/context/SessionContext";
import { apiGet, apiPost, apiDelete, apiUpload, ApiError } from "@/lib/api";
import type { Post } from "@/lib/posts";
import { sectorMasCercano } from "@/lib/sectores";
import { ImageUploadCrop } from "@/components/ImageUploadCrop";
import { CarruselFotos } from "@/components/Posts/CarruselFotos";
import { Avatar } from "@/components/Avatar";
import { BarraHistorias } from "@/components/Historias/BarraHistorias";

const MAX_FOTOS_POR_POST = 3;
const DURACION_MAXIMA_VIDEO_SEG = 50;

function tiempoRelativo(fecha: string): string {
  const minutos = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas}h`;
  return `hace ${Math.round(horas / 24)}d`;
}

// Mismo mensaje para todos los que ven el feed, no solo el autor — la
// vigencia de 7 días es transparente, como cualquier otro contenido efímero
// de la app (ver DIAS_VIGENCIA_POST en posts.service.ts).
function mensajeVencimiento(diasRestantes: number): string {
  if (diasRestantes >= 2) return `Vence en ${diasRestantes} días`;
  if (diasRestantes === 1) return "Vence mañana";
  return "Vence hoy";
}

// Comparte 1-3 fotos o el video como archivos reales (no un link) con el
// selector nativo del sistema — mismo patrón que compartirHistoria() en
// VisorHistorias.tsx, extendido a múltiples archivos.
async function compartirPost(p: Post) {
  try {
    const urls = p.tipo === "video" && p.videoUrl ? [p.videoUrl] : p.fotos;
    if (urls.length === 0) {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: p.titulo, text: p.resena });
      }
      return;
    }
    const archivos = await Promise.all(
      urls.map(async (url, i) => {
        const blob = await (await fetch(url)).blob();
        const extension = p.tipo === "video" ? "mp4" : "jpg";
        return new File([blob], `post-legion-roller-${i + 1}.${extension}`, { type: blob.type });
      }),
    );

    if (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: archivos })
    ) {
      await navigator.share({ files: archivos, title: p.titulo, text: p.resena });
      return;
    }

    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(archivos[0]);
    enlace.download = archivos[0].name;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  } catch {
    // el usuario canceló el panel de compartir, o el navegador lo rechazó
  }
}

export default function PostPage() {
  const { sesion } = useSession();
  const token = sesion?.token ?? null;
  const puedeInteractuar = sesion?.rol === "usuario" || sesion?.rol === "admin";

  const [posts, setPosts] = useState<Post[]>([]);
  const [misReacciones, setMisReacciones] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const [mostrarCompose, setMostrarCompose] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [resena, setResena] = useState("");
  const [ubicacion, setUbicacion] = useState<string | undefined>(undefined);
  const [tipoMedia, setTipoMedia] = useState<"foto" | "video" | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [subiendoVideo, setSubiendoVideo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [comentarioAbierto, setComentarioAbierto] = useState<number | null>(null);
  const [textoComentario, setTextoComentario] = useState("");

  async function cargar() {
    try {
      const lista = await apiGet<Post[]>("/posts", null);
      setPosts(lista);
      if (token) {
        const mias = await apiGet<number[]>("/posts/mis-reacciones", token);
        setMisReacciones(mias);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el feed.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Ubicación opcional: se autodetecta una vez al abrir el compositor (mismo
  // patrón ya usado en el editor de Historias) — sin geocoding externo, solo
  // el sector conocido más cercano. El usuario puede quitarla antes de publicar.
  useEffect(() => {
    if (!mostrarCompose || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUbicacion(sectorMasCercano(pos.coords.latitude, pos.coords.longitude)),
      () => {
        // sin permiso o sin GPS: simplemente no se sugiere ubicación
      },
      { timeout: 5000 },
    );
  }, [mostrarCompose]);

  function limpiarCompose() {
    setTitulo("");
    setResena("");
    setUbicacion(undefined);
    setTipoMedia(null);
    setFotos([]);
    setVideoUrl("");
    setMostrarCompose(false);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  // Se valida la duración en el cliente ANTES de subir, para no gastar ancho
  // de banda subiendo un archivo que de todas formas se va a rechazar (mismo
  // criterio que EditorHistoria.tsx, con el límite propio de Post: 50s).
  function onVideoElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo || !token) return;
    setError("");

    const url = URL.createObjectURL(archivo);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = async () => {
      URL.revokeObjectURL(url);
      if (video.duration > DURACION_MAXIMA_VIDEO_SEG) {
        setError(`El video no puede durar más de ${DURACION_MAXIMA_VIDEO_SEG} segundos.`);
        if (videoInputRef.current) videoInputRef.current.value = "";
        return;
      }
      setSubiendoVideo(true);
      try {
        const subida = await apiUpload<{ url: string }>("/uploads", archivo, token, archivo.name);
        setVideoUrl(subida.url);
        setTipoMedia("video");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "No se pudo subir el video.");
      } finally {
        setSubiendoVideo(false);
      }
    };
    video.src = url;
  }

  function agregarFoto(url: string) {
    setFotos((prev) => [...prev, url]);
    setTipoMedia("foto");
  }

  function quitarFoto(i: number) {
    setFotos((prev) => {
      const nuevas = prev.filter((_, idx) => idx !== i);
      if (nuevas.length === 0) setTipoMedia(null);
      return nuevas;
    });
  }

  function quitarVideo() {
    setVideoUrl("");
    setTipoMedia(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !titulo || !resena) return;
    setEnviando(true);
    setError("");
    try {
      await apiPost(
        "/posts",
        {
          titulo,
          resena,
          ubicacion: ubicacion || undefined,
          tipo: tipoMedia ?? "foto",
          fotos: tipoMedia === "foto" && fotos.length > 0 ? fotos : undefined,
          videoUrl: tipoMedia === "video" ? videoUrl : undefined,
        },
        token,
      );
      limpiarCompose();
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo publicar.");
    } finally {
      setEnviando(false);
    }
  }

  async function reaccionar(postId: number) {
    if (!token) return;
    try {
      await apiPost(`/posts/${postId}/reaccion`, {}, token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo reaccionar.");
    }
  }

  async function comentar(postId: number) {
    if (!token || !textoComentario.trim()) return;
    try {
      await apiPost(`/posts/${postId}/comentarios`, { texto: textoComentario }, token);
      setTextoComentario("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo comentar.");
    }
  }

  async function eliminar(postId: number) {
    if (!token) return;
    try {
      await apiDelete(`/posts/${postId}`, token);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo eliminar.");
    }
  }

  if (cargando) {
    return <p className="text-sm text-text-secondary">Cargando...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <BarraHistorias />

      {puedeInteractuar && (
        <div className="card p-4">
          {!mostrarCompose ? (
            <button
              type="button"
              onClick={() => setMostrarCompose(true)}
              className="btn-hero w-full rounded-app px-4 py-3 text-sm"
            >
              Comparte tu experiencia
            </button>
          ) : (
            <form onSubmit={publicar} className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Título"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
              />
              <textarea
                placeholder="Cuéntanos tu experiencia..."
                value={resena}
                onChange={(e) => setResena(e.target.value)}
                rows={3}
                className="rounded-app border border-border bg-surface-2 px-3 py-2 text-text-primary outline-none"
              />

              {ubicacion && (
                <div className="flex w-fit items-center gap-1 rounded-full bg-surface-2 px-3 py-1 text-xs text-text-secondary">
                  <IconMapPin size={14} />
                  {ubicacion}
                  <button
                    type="button"
                    onClick={() => setUbicacion(undefined)}
                    className="ml-1 text-fill-warning underline"
                  >
                    Quitar
                  </button>
                </div>
              )}

              {tipoMedia === "video" ? (
                <div className="flex flex-col gap-1">
                  {subiendoVideo ? (
                    <p className="text-xs text-text-secondary">Subiendo video...</p>
                  ) : (
                    videoUrl && <video src={videoUrl} controls className="w-full rounded-app" />
                  )}
                  <button
                    type="button"
                    onClick={quitarVideo}
                    className="w-fit text-xs text-fill-warning underline"
                  >
                    Quitar video
                  </button>
                </div>
              ) : (
                <>
                  {fotos.length > 0 && (
                    <div className="flex gap-2">
                      {fotos.map((url, i) => (
                        <div key={url} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt="Foto elegida" className="h-16 w-16 rounded-app object-cover" />
                          <button
                            type="button"
                            onClick={() => quitarFoto(i)}
                            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-page-bg text-xs text-fill-warning"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    {fotos.length < MAX_FOTOS_POR_POST && (
                      <ImageUploadCrop
                        token={token}
                        onSubido={agregarFoto}
                        etiqueta={fotos.length === 0 ? "Agregar foto (opcional)" : "Agregar otra foto"}
                      />
                    )}
                    {fotos.length === 0 && (
                      <>
                        <input
                          ref={videoInputRef}
                          type="file"
                          accept="video/*"
                          onChange={onVideoElegido}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => videoInputRef.current?.click()}
                          className="flex items-center gap-1 text-xs text-text-secondary underline"
                        >
                          <IconVideo size={14} />
                          Agregar video en su lugar
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={enviando || subiendoVideo}
                  className="btn-hero flex-1 rounded-app px-4 py-2 text-sm disabled:opacity-60"
                >
                  {enviando ? "Publicando..." : "Publicar"}
                </button>
                <button
                  type="button"
                  onClick={limpiarCompose}
                  className="rounded-app border border-border px-4 py-2 text-sm text-text-secondary"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {error && <p className="text-xs text-fill-warning">{error}</p>}

      {posts.length === 0 && (
        <p className="text-sm text-text-secondary">Todavía no hay publicaciones.</p>
      )}

      {posts.map((p) => {
        const yaReaccione = misReacciones.includes(p.id);
        const puedeEliminar = sesion?.id === p.autorId || sesion?.rol === "admin";

        return (
          <div key={p.id} className="card flex flex-col gap-2 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Avatar fotoUrl={p.autorFotoUrl} nombre={p.autorNombre} tamano={40} />
                <div>
                  <p className="text-sm font-semibold text-text-primary">{p.autorNombre}</p>
                  <p className="text-xs text-text-muted">
                    {tiempoRelativo(p.createdAt)}
                    {p.ubicacion ? ` · ${p.ubicacion}` : ""} · {mensajeVencimiento(p.diasRestantes)}
                  </p>
                </div>
              </div>
              {puedeEliminar && (
                <button
                  type="button"
                  onClick={() => eliminar(p.id)}
                  className="text-xs text-fill-warning underline"
                >
                  Eliminar
                </button>
              )}
            </div>

            <h2 className="text-sm font-semibold text-text-accent">{p.titulo}</h2>
            <p className="text-sm text-text-secondary">{p.resena}</p>

            {p.tipo === "video" && p.videoUrl ? (
              <video src={p.videoUrl} controls className="w-full rounded-app" />
            ) : (
              <CarruselFotos fotos={p.fotos} alt={p.titulo} />
            )}

            <div className="flex items-center gap-4 border-t border-border pt-2 text-xs text-text-secondary">
              {puedeInteractuar ? (
                <button
                  type="button"
                  onClick={() => reaccionar(p.id)}
                  className={yaReaccione ? "text-text-accent" : ""}
                >
                  {yaReaccione ? "★ Me gusta" : "☆ Me gusta"} ({p.reaccionesCount})
                </button>
              ) : (
                <span>{p.reaccionesCount} me gusta</span>
              )}
              <button
                type="button"
                onClick={() => setComentarioAbierto(comentarioAbierto === p.id ? null : p.id)}
              >
                {p.comentarios.length} comentarios
              </button>
              <button
                type="button"
                onClick={() => compartirPost(p)}
                className="ml-auto flex items-center gap-1"
              >
                <IconShare size={14} />
                Compartir
              </button>
            </div>

            {comentarioAbierto === p.id && (
              <div className="flex flex-col gap-2">
                {p.comentarios.map((c) => (
                  <p key={c.id} className="text-xs text-text-secondary">
                    <span className="font-semibold text-text-primary">{c.autorNombre}:</span>{" "}
                    {c.texto}
                  </p>
                ))}
                {puedeInteractuar && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Escribe un comentario..."
                      value={textoComentario}
                      onChange={(e) => setTextoComentario(e.target.value)}
                      className="flex-1 rounded-app border border-border bg-surface-2 px-3 py-1 text-xs text-text-primary outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => comentar(p.id)}
                      className="rounded-app bg-fill-primary px-3 py-1 text-xs text-on-primary"
                    >
                      Enviar
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
